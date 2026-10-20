# PR-MEDIA report

Card `icm/05-build/cards/pr-media-storage.md`, issue #127, PR #128, branch
`beta/pr-media-storage` on `Vari8-Beta`. Lane DB `app_media` (native Postgres
127.0.0.1:5433), lane ports 3870-3874.

## What changed

- `lib/storage.ts` — extended the provider-neutral port (D8): `presignPut`
  alongside `presignGet`, `getObjectStorage()` env-selected factory
  (local/s3/none, fail-closed default in production), `parseClientObjectKey`,
  the D20 rules (`MAX_MEDIA_BYTES` = 20 MB mirroring the `media_object`
  CHECK, closed `MEDIA_CONTENT_TYPES` allowlist -> MediaKind,
  `assertMediaByteSize`, `presignTtlSeconds`, 3600 s TTL bound). Retired
  `assertObjectStorageExternallyExposable`: routes may now reach storage;
  census before deletion showed zero callers outside its own test.
- `lib/storage/local.ts` — dev/test disk adapter. Objects under
  `MEDIA_STORAGE_DIR` (default `var/media`, gitignored). Presigned URLs are
  `/api/v1/media/object?op=..&key=..&e=..&s=..` paths whose HMAC-SHA256
  signature binds operation + key + expiry (signed with
  `MEDIA_STORAGE_SIGNING_SECRET` or `BETTER_AUTH_SECRET`).
- `lib/storage/s3.ts` — S3-compatible adapter, no SDK: SigV4 query-string
  presign for GET/PUT (declared content type folded into SignedHeaders) and
  header-signed ListObjectsV2 + DeleteObjects for `deletePrefix`.
  Virtual-hosted style by default, `S3_FORCE_PATH_STYLE=1` for MinIO.
- `app/api/v1/media/service.ts` — the one decision point. `message.write`
  capability: staff (workspace scope) name a clientProfileId that must exist
  in the workspace; clients (own scope) get the profile linked to their
  user and are forbidden from anchoring to any other. Downloads mint a
  short-lived presigned GET for live rows whose storage key parses under
  the caller's prefix.
- `app/api/v1/media/[workspaceId]/route.ts` — POST upload intent
  (Zod body: fileName, contentType, byteSize <= 20 MB, optional
  clientProfileId).
- `app/api/v1/media/[workspaceId]/[mediaObjectId]/route.ts` — GET download
  mint (metadata + presigned URL).
- `app/api/v1/media/object/route.ts` — local adapter's signed-URL
  redemption. No session (the signature is the credential, same shape as
  S3 presign), key grammar enforced, media_object row must exist and be
  live, PUT bodies must match the declared byte size exactly. Answers 404
  unless the active backend is `local`.
- `components/canvas/coach/media-card.tsx` — real MediaCard on stored
  media (S02-24): same canvas `cd-*` markup, lucide icons and `Media`
  item shape (id = media_object id), real file size instead of "Local
  demo media" (D32 truth text). Exports `uploadWorkspaceMedia`, the
  two-step upload the S02-08 picker wiring reuses.
- `components/canvas/coach/demo-recorder.tsx` — the canvas recorder
  dialog (record -> preview -> discard/attach) on a real `MediaRecorder`
  stream via `getUserMedia` (S02-25): mic for voice notes, camera + mic
  for video feedback. Demo-only copy dropped per the D32 truth-text rule
  ("Record voice note", "Recording · Ns").
- `scripts/seed/40-media.seed.ts` — idempotent seed of one wav + one png
  media_object for the first canvas client through the local adapter.
- `.env.example` — storage contract (adapter, dir, signing secret, TTL,
  S3_* vars).
- Tests: `tests/unit/storage.test.ts` (extended: key parser, allowlist,
  size cap, TTL), `tests/unit/storage-local.test.ts` (signature
  verify/expiry/tamper, path safety, write/read/delete round-trip),
  `tests/unit/storage-s3.test.ts` (deterministic SigV4 shape, signed
  content type, path style, fail-closed config),
  `tests/integration/api-v1-media.test.ts` (7 tests: full coach + client
  flows on real PG, foreign workspace, foreign profile, type/size
  rejection, expired + tampered + wrong-size object requests, 401).

## Matrix rows

- S02-08 (20 MB picker cap + allowlist on the server path), S02-24
  (MediaCard on stored media), S02-25 (real recorder, same dialog),
  V1-X2 (dev-only demo preview is a canvas control; the real upload path
  replaces it), V3-L1-Media (media_object rows now carry real uploaded
  bytes; PR-M0's model is used end to end).

## Commands and exit codes

verify-local.sh cannot run on this machine (Linux paths in paths.sh,
`docker exec vari8-db-1`, `flock`); every check it performs was run by
hand, in order, against lane DB `app_media`:

- `git merge origin/Vari8-Beta` (twice: f00d37b, then post-PR-01 head
  9fb49cc + PR-01 merge) — conflicts only in generated docs, resolved by
  `npm run index` — exit 0
- `python3 icm/05-build/tools/generate.py --root . --check` — exit 0
  (154 files match)
- schema guard: `git diff --name-only BASE HEAD -- db/` — empty (db/
  untouched, D34)
- `npm ci` (root, post-merge) — exit 0; `npm --prefix frontend ci` —
  exit 0
- `npm run format:check` / `npx prettier --check .` — exit 0
- `npm run typecheck` — exit 0
- `npm run lint` — exit 0 (3 pre-existing warnings, none mine)
- `npm run test` — exit 0 (93 files / 1066 tests; +63 storage unit tests
  mine)
- `INTEGRATION_DATABASE_URL=...app_media npm run test:integration` —
  exit 0 (60 files / 861 tests; api-v1-media 7/7)
- `npx prisma migrate deploy` on app_media — exit 0
- `nice -n 10 npm run build` (root) — exit 0; media routes listed
- `cd frontend && nice -n 10 npm run build` — exit 0
- `npm run index` + `npm run index:check` — exit 0
- seed: `npm run seed:dev` on app_media — exit 0 (2 media objects seeded)

## Live receipt (real browser + real API on app_media, port 3870)

Seeded `canvas-demo` workspace; seeded accounts owner/coach/client plus
`staff2` in `seed-second-workspace`.

- Coach (Sofia Miller) uploaded `live-voice.wav` (16 044 B) through POST
  intent -> PUT signed URL -> GET mint -> GET object: HTTP 200 each,
  downloaded bytes byte-identical (`cmp` clean).
- Client uploaded `live-photo.png` (70 B) with no clientProfileId: own
  profile inferred, storage key anchored under it; playback 200, bytes
  identical.
- Foreign staff (staff2, seed-second-workspace): POST intent to
  canvas-demo -> 403, GET mint for canvas-demo media -> 403.
- Signed object URLs opened in Chrome at 1440x900 and 390x844 render the
  seeded image and the audio player. Screenshots:
  `scratch/pr-media-storage/seed-{voice-note,progress-photo}-{1440,390}.png`.
- Keyboard pass: the recorder dialog keeps the canvas tab order
  (Record -> Stop & preview -> Discard -> Attach); every control has the
  canvas's accessible name (`aria-label` on the media players, native
  buttons).

## Parity (D32)

`npm run parity` — exit 1 on THIS machine, not a regression in this card.
All 35 screens at both widths capture fine; every comparison reports
`text=0` and zero added/removed elements; failures are moved geometry
(tens of elements shifted by >0.5 px) plus the resulting pixel diffs —
the signature of font-metric/rasterization differences between the
committed baseline (captured on the Linux driver box, PR-P1) and macOS
Chromium headless shell. `s02-thread-attachments` is in the same
environmental failure set at both widths. The canvas tree itself is
untouched by this card.

## Could not do

- e2e flow specs: `playwright.config.ts` pins port 3000 and defaults
  `DATABASE_URL` to `app_dev`, both outside this lane's allocation
  (3870-3874, `app_media` only). Not run; the specs cover auth flows this
  card does not touch.
- `verify-local.sh` itself: Linux-only (docker exec, flock, driver paths).
  Steps run by hand instead, all exit codes above.
- Parity: environment-bound as described; needs the Linux driver box or a
  macOS-recaptured baseline to go green.
- The S3 adapter's presign is unit-tested deterministically; its
  `deletePrefix` REST calls are not exercised live (no bucket in this
  lane).
- Demo-only controls ("Load demo audio preview") stay in the canvas
  components for PR-MSG/PR-W6 to gate by `APP_ENV` when the screens wire.

## Head

`git rev-parse HEAD` at report time recorded in the PR body.
