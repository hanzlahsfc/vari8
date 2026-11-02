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
  if (busy) throw new Error("transcribe_busy");
  busy = true;
  try {
    onProgress?.({ stage: "audio", label: "Preparing audio…" });
    const pcm = await blobToMono16k(blob);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // Bounded lifecycle: one worker per tab session, one run at a time —
    // a second request waits its turn rather than stacking 85 MB models.
    const w = (worker ??= new Worker(
      new URL("./voice-transcript-worker.ts", import.meta.url),
    ));
    return await new Promise<string>((resolve, reject) => {
      const finish = (fn: (v: never) => void, v: unknown) => {
        signal?.removeEventListener("abort", onAbort);
        fn(v as never);
      };
      // Cancel = terminate: real, but the model must reload next time.
      // Decode/inference themselves are NOT cancellable mid-flight —
      // a terminated result is simply discarded, never applied.
      const onAbort = () => {
        releaseWorker();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      w.onmessage = (
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
        else if (data.type === "done") finish(resolve, data.text ?? "");
        else if (data.type === "error") {
          // A failed worker (model load/inference) is poisoned for
          // retry — terminate so the next attempt rebuilds cleanly.
          releaseWorker();
          finish(reject, new Error(data.message || "transcribe_failed"));
        }
      };
      w.onerror = () => {
        releaseWorker();
        finish(reject, new Error("transcribe_failed"));
      };
      onProgress?.({ stage: "inference", label: "Transcribing…" });
      w.postMessage({ id: 1, pcm }, [pcm.buffer]);
    });
  } finally {
    busy = false;
  }
}

// The worker holds the loaded model; keep it for the session so a second
// take reuses it instead of re-fetching ~85 MB. `busy` bounds concurrent
// work — no overlapping inference is ever scheduled.
let worker: Worker | null = null;
let busy = false;

function releaseWorker(): void {
  const w = worker;
  worker = null;
  w?.terminate();
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
/** Bump when the model/revision changes — stale versions never read. */
const CACHE_VERSION = "w1";

const cacheKey = (scope: string, id: string) =>
  `${CACHE_PREFIX}${CACHE_VERSION}:${scope}:${id}`;

export function readCachedTranscript(
  scope: string,
  id: string,
): string | null {
  try {
    return sessionStorage.getItem(cacheKey(scope, id));
  } catch {
    return null;
  }
}

export function writeCachedTranscript(
  scope: string,
  id: string,
  text: string,
): void {
  try {
    sessionStorage.setItem(cacheKey(scope, id), text);
  } catch {
    // Storage can be unavailable (private mode) — caching is best-effort;
    // the transcript still renders for this viewing.
  }
}

/**
 * Drop temporary transcript entries. With `scope`, only that actor's
 * keys are removed — one consumer can never wipe another panel's cache.
 */
export function clearVoiceTranscriptCache(scope?: string): void {
  try {
    const prefix = scope ? `${CACHE_PREFIX}${CACHE_VERSION}:${scope}:` : CACHE_PREFIX;
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {
    // best-effort
  }
}

/**
 * Identity/session teardown for ONE actor scope: clears only that
 * scope's cached transcripts and terminates the shared worker (a real
 * account switch must not keep a model loaded for another identity).
 */
export function releaseVoiceTranscriber(scope?: string): void {
  releaseWorker();
  clearVoiceTranscriptCache(scope);
}
