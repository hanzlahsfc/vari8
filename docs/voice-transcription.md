# Voice transcription — on-device assets, cache and limits (P688)

Owner decisions (Marcel): embed the local model/runtime in the app;
transcripts are temporary, never message-body replacements; one recording
per voice message; transcription never blocks sending; five-minute cap
stops recording and prepares the message; "View transcript" approved.

## Runtime + model (vendored, pinned, same-origin only)

- Runtime: `@huggingface/transformers` **4.3.1** (Apache-2.0) with its
  pinned `onnxruntime-web` **1.31.0-dev.20260914-8d85527a0** (MIT).
- Model: `onnx-community/whisper-tiny` (MIT weights, OpenAI Whisper),
  revision `ff4177021cc41f7db950912b73ea4fdf7d01d8e7`, dtype q8 — the
  official transformers.js ASR pipeline.
- Assets live under `public/models/` and are served same-origin by the
  app: `onnx-community/whisper-tiny/` (configs, tokenizer, quantized
  ONNX encoder/decoder) and `ort/ort-wasm-simd-threaded[.asyncify].*`
  (the worker overrides the runtime's CDN wasmPath default;
  `.asyncify` for modern browsers, plain pair for Safari <26 without
  WebGPU). `env.allowRemoteModels=false` — no runtime CDN or cloud
  inference. Verified offline: `allowRemoteModels=false` +
  `localModelPath=public/models` transcribed the known jfk.wav sample to
  the expected text (`_evidence/probe-whisper.mjs`, not committed).
- SHA-256 hashes (manifest, `shasum -a 256`):
  - `onnx/encoder_model_quantized.onnx` 2af4a414ca47aa30f61246017e5fe82b0a8d229281d1255ba666a2a7f6b84d19
  - `onnx/decoder_model_merged_quantized.onnx` 25e807a962b6349356d0ea5d0dfe530b7e5bf0e2a484aeca0359d03143faddd3
  - `ort/ort-wasm-simd-threaded.asyncify.wasm` 49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082
  - `ort/ort-wasm-simd-threaded.wasm` 06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3
  - (`*.mjs`/json sidecar hashes recorded in the PR evidence comment.)
- Licenses retained: Apache-2.0 (transformers.js), MIT (onnxruntime-web),
  MIT (whisper-tiny weights).

## Temporary transcript cache (no schema change)

`components/canvas/coach/voice-transcript.ts` — `sessionStorage` key
`vt1:<mediaObjectId-or-chip-id>` → raw text.

- **Lifetime:** the browser tab session; entries die on tab close.
- **Identity:** the exact media id, so a transcript cannot attach to
  different audio; re-transcribing overwrites.
- **Account isolation:** an entry only fills for media the signed-in
  account could fetch this session; a different account cannot mint the
  same object's URL.
- **Invalidation:** tab close; no server copy exists to invalidate. No
  `media_object.transcript` column or message-body field is introduced —
  server persistence was not needed for on-demand, best-effort display.

## Limits (explicit, not hidden)

- Transcription is on-demand only ("View transcript"); failure,
  unsupported devices (no Worker/WASM/OfflineAudioContext) or missing
  assets never gate recording, sending or playback. The panel hides on
  unsupported devices; failures show a retry, results are labeled
  "Auto-transcript — may contain errors."
- `MediaRecorder`-produced formats decode via `OfflineAudioContext` —
  Chromium `audio/webm`+`audio/mp4` verified; Safari/Firefox untested.
- The UI flow is covered by jsdom tests with the engine mocked; the real
  pipeline was verified against a known file in Node (same vendored
  assets), not yet through a headed browser on the served page.
- Voice upload still rides the existing presigned-PUT path; server-side
  duration enforcement remains absent (the client completed-file guard
  is the attach boundary); recorded media still requires the session +
  mint, CORS work is tracked separately (#177).
