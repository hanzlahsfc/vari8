# Voice e2e fixtures

`jfk.wav` — 352,078 bytes, 16 kHz mono PCM. Known spoken sample
("…ask not what your country can do for you…") used as transcript-content
evidence in `voice-messaging.spec.ts`.

- Source: whisper.cpp repository sample (`samples/jfk.wav`,
  github.com/ggerganov/whisper.cpp), derived from the JFK inaugural
  address — a United States government work, public domain; the file is
  redistributed under the whisper.cpp MIT terms.
- SHA-256: verify with `shasum -a 256 tests/e2e/fixtures/jfk.wav`.
- Distinct from synthetic capture: the spec's fake-mic takes are labeled
  synthetic; only this file is asserted for transcript text.
