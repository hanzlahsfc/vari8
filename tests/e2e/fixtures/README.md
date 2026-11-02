# Voice e2e fixtures

`jfk.wav` — 352,078 bytes, 16 kHz mono PCM. Known spoken sample
("…ask not what your country can do for you…") used as transcript-content
evidence in `voice-messaging.spec.ts`.

- Source: whisper.cpp repository sample (`samples/jfk.wav`,
  github.com/ggerganov/whisper.cpp), derived from the JFK inaugural
  address — a United States government work, public domain; the file is
  redistributed under the whisper.cpp MIT terms.
- SHA-256: `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e` (asserted in the spec's `beforeAll`).
- Distinct from synthetic capture: the spec's fake-mic takes are labeled
  synthetic; only this file is asserted for transcript text.
