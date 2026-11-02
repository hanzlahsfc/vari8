"use client";

/**
 * P688 — on-device voice transcription entry points. The heavy work runs
 * in `voice-transcript-worker.ts` (transformers.js + vendored whisper-tiny
 * under `/models/`); this module only decodes the take to 16 kHz mono PCM,
 * spawns the worker and maps its messages onto a promise. A missing or
 * unsupported path rejects — callers treat that as "transcript
 * unavailable", never as a send/playback blocker.
 */

export type TranscriptProgress = {
  stage: "audio" | "model" | "inference";
  label: string;
};

/** Feature gate — a browser without these cannot run the pipeline. */
export function transcriptionSupported(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof WebAssembly !== "undefined" &&
    typeof fetch !== "undefined" &&
    typeof (globalThis.OfflineAudioContext ??
      (globalThis as { webkitOfflineAudioContext?: unknown })
        .webkitOfflineAudioContext) !== "undefined"
  );
}

/** Decode any recorded blob to mono 16 kHz PCM via OfflineAudioContext. */
async function blobToMono16k(blob: Blob): Promise<Float32Array> {
  const Decode =
    globalThis.OfflineAudioContext ??
    (
      globalThis as {
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      }
    ).webkitOfflineAudioContext;
  if (!Decode) throw new Error("unsupported");
  const bytes = await blob.arrayBuffer();
  const probe = new Decode(1, 1, 44_100);
  const source = await probe.decodeAudioData(bytes);
  const context = new Decode(
    1,
    Math.max(1, Math.ceil(source.duration * 16_000)),
    16_000,
  );
  const node = context.createBufferSource();
  node.buffer = source;
  node.connect(context.destination);
  node.start();
  const rendered = await context.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Transcribe `blob` fully on-device. Rejects with `AbortError` when
 * `signal` aborts (the worker is terminated, so cancellation is real) and
 * with `Error("transcribe_failed")`-style failures for model/decode
 * problems — every failure is the caller's to present.
 */
export async function transcribeAudio(
  blob: Blob,
  options: {
    signal?: AbortSignal;
    onProgress?: (event: TranscriptProgress) => void;
  } = {},
): Promise<string> {
  const { signal, onProgress } = options;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  onProgress?.({ stage: "audio", label: "Preparing audio…" });
  const pcm = await blobToMono16k(blob);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const worker = new Worker(
    new URL("./voice-transcript-worker.ts", import.meta.url),
  );
  try {
    return await new Promise<string>((resolve, reject) => {
      const onAbort = () => {
        worker.terminate();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      worker.onmessage = (
        event: MessageEvent<{
          id: number;
          type: string;
          text?: string;
          label?: string;
          message?: string;
        }>,
      ) => {
        const data = event.data;
        if (data.type === "progress" && data.label)
          onProgress?.({ stage: "model", label: data.label });
        else if (data.type === "done") resolve(data.text ?? "");
        else if (data.type === "error")
          reject(new Error(data.message || "transcribe_failed"));
      };
      worker.onerror = () =>
        reject(new Error("transcribe_failed"));
      onProgress?.({ stage: "inference", label: "Transcribing…" });
      worker.postMessage({ id: 1, pcm }, [pcm.buffer]);
    });
  } finally {
    worker.terminate();
  }
}

/**
 * Temporary transcript cache (Marcel: transcripts are temporary, never a
 * permanent message field). sessionStorage — one tab-session lifetime;
 * the key is the exact media identity (`media_object` id, or the staged
 * chip id pre-upload), so a transcript can never land on different audio.
 * Account isolation: an entry only ever fills for the media_object the
 * signed-in account was authorized to fetch in this tab; a different
 * account cannot mint that object's URL, and a same-URL object maps to
 * the same audio. Entries are overwritten on re-transcribe and die with
 * the tab — no invalidation API is needed beyond per-write replace.
 */
const CACHE_PREFIX = "vt1:";

export function readCachedTranscript(key: string): string | null {
  try {
    return sessionStorage.getItem(CACHE_PREFIX + key);
  } catch {
    return null;
  }
}

export function writeCachedTranscript(key: string, text: string): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, text);
  } catch {
    // Storage can be unavailable (private mode) — caching is best-effort;
    // the transcript still renders for this viewing.
  }
}
