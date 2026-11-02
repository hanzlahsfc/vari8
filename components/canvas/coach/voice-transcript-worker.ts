/**
 * P688 voice transcription worker (Marcel's decisions): the approved
 * on-device ASR path — `@huggingface/transformers` (pinned 4.3.1)
 * `automatic-speech-recognition` pipeline over the vendored
 * `onnx-community/whisper-tiny` q8 ONNX weights, served by the app under
 * `/models/`. Remote model fetching and the bundled CDN wasm fallback are
 * both disabled: every byte the worker loads is same-origin.
 *
 * Protocol (one request at a time; cancel = terminate):
 *   in : { id, pcm: Float32Array }   — mono 16 kHz samples (main thread
 *                                     decodes + resamples via
 *                                     OfflineAudioContext)
 *   out: { id, type: "progress", label }
 *        { id, type: "done", text }
 *        { id, type: "error", message }
 */
import { env, pipeline } from "@huggingface/transformers";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";

// The runtime's built-in fallback points at jsdelivr — override it to the
// vendored pair. ORT 1.31 splits wasmPaths into {mjs, wasm}; the asyncify
// build is the default, the non-asyncify pair is kept for Safari <26
// without WebGPU (mirroring the runtime's own selection rule).
const ua =
  typeof navigator !== "undefined" ? navigator.userAgent : "";
const isOldSafari =
  /Version\/(\d+)\.[\d.]+\s+Safari/.test(ua) &&
  Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0) < 26;
const suffix = isOldSafari && !("gpu" in navigator) ? "" : ".asyncify";
const wasm = env.backends.onnx.wasm;
if (wasm)
  wasm.wasmPaths = {
    mjs: `/models/ort/ort-wasm-simd-threaded${suffix}.mjs`,
    wasm: `/models/ort/ort-wasm-simd-threaded${suffix}.wasm`,
  };

// The pipeline promise is held for the worker's lifetime — a second take
// reuses the loaded model rather than paying ~40 MB of decode again.
type Transcriber = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text: string } | Array<{ text: string }>>;
let transcriber: Promise<Transcriber> | null = null;

function getTranscriber(): Promise<Transcriber> {
  if (!transcriber)
    transcriber = pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny",
      {
        dtype: "q8",
        progress_callback: (event: {
          status?: string;
          file?: string;
          progress?: number;
        }) => {
          if (event?.status === "progress" && event.file)
            worker.postMessage({
              type: "progress",
              label: `Downloading ${event.file} — ${Math.floor(event.progress ?? 0)}%`,
            });
        },
      },
    ) as unknown as Promise<Transcriber>;
  return transcriber;
}

worker.onmessage = async (event: MessageEvent) => {
  const { id, pcm } = event.data as { id: number; pcm: Float32Array };
  try {
    const run = await getTranscriber();
    const out = await run(pcm, { chunk_length_s: 30, stride_length_s: 5 });
    const text = Array.isArray(out)
      ? out.map((part) => part.text).join(" ")
      : out.text;
    worker.postMessage({ id, type: "done", text: (text ?? "").trim() });
  } catch (error) {
    worker.postMessage({
      id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
