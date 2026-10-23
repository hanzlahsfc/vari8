# LOGGING — one redacted stdout logger (issue #168)

Branch: `beta/logging` → `Vari8-Beta`. Runtime: Node v24.22.1, Next 16.3.8,
Vitest 5.0.2.

## 1. Issue contract (verbatim acceptance)

- One logger with a redaction list; error reports drop bodies, cookies,
  query strings and email addresses but keep the request id.
- A 500 on any v1 route writes one line with request id, route and status,
  and no token, cookie or email (test asserts redaction).
- Logs go to stdout for the host to collect.
- Scope: request and error logs only; no audit trail.

## 2. What was built

**`lib/log.ts` (new).** The only logger: `log(level, event, fields)` /
`logError(event, fields)` write one JSON object per line to
`process.stdout` — `{ level, event, ts, ...fields }`. Per-event field
allowlists:

| event                   | fields                                  |
| ----------------------- | --------------------------------------- |
| `api_v1_request_failed` | requestId, method, route, status, error |
| `boot_refused`          | error                                   |

`error` serializes `name`, `code` (when string), `message`, `stack`, and a
depth-capped `cause` chain — all scrubbed.

**Redaction contract** (applied to every value at any depth; a sensitive
key name at top level or nested is replaced outright):

- keys matching `authorization|cookie|set-cookie|password|passwd|secret|
token|session|bearer|credential|api[-_]?key|private[-_]?key|signature|
x-amz` → `[redacted]`;
- strings: emails → `[email]`; `Bearer <x>` → `Bearer [redacted]`;
  `Cookie:`/`Authorization:` header payloads → `Name: [redacted]`;
  any `scheme://` URI → scheme+host+path only (userinfo, query — signed-URL
  params like `X-Amz-Signature`, credentials in the query — and fragment
  dropped); `<sensitive-name>=<value>` params → `name=[redacted]`; long
  unbroken urlsafe/hex runs (32+) → `[redacted]` (bare UUIDs exempt — ids,
  not secrets);
- structure: depth cap 4 (`[depth-capped]`), array cap 20, string cap 2000,
  circularity guard; logging itself can never throw.

**`lib/api/v1.ts`.** The `defineApiV1Route` funnel produces every v1 500
for the session-bound routes (the signature-bound `media/object` route was
missed here and is covered in Fix pass 1 below). It now mints a request id per request — an inbound
`x-request-id` is honored only when it matches `^[A-Za-z0-9-]{1,64}$`
(caller-controlled ids must not forge log lines; anything else mints a
UUID) — and on the unhandled-error branch writes one
`api_v1_request_failed` line: `{ requestId, method, route (pathname only —
query never logged), status: 500, error }`, then returns the unchanged
`{ error: { code: "internal" } }` body plus an `x-request-id` response
header so a client can report the correlation id. Typed `ApiError`/`ZodError`
(400/401/403) responses are expected traffic — no line, no duplicate
reporting.

**`instrumentation.ts`.** The only pre-existing log call
(`console.error(error)` in the production refusal path) now goes through
`logError("boot_refused", { error })`. Exit-1 behavior is unchanged; the
non-production branch still rethrows to Next unchanged.

## 3. Verification (all under Node v24.22.1, commands verbatim)

- `npx vitest run tests/unit/logging.test.ts` — **exit 0, 12/12**
  - one parseable JSON line per event; sensitive keys redacted at depth;
    `redactString` scrubs email/Bearer/Cookie/Authorization/URL-credentials/
    `name=` params/32+ token runs and preserves UUIDs; Error serialization
    keeps name/code/redacted message/stack and a scrubbed nested `cause`;
    non-Error throws, circular refs, depth cap all safe;
  - through the real `defineApiV1Route` boundary (mocked viewer + member):
    a thrown error → 500 `{error:{code:"internal"}}` + exactly one stdout
    line with uuid requestId, method, `/api/v1/workspaces/ws-1/session`
    (no `?invite=`), status 500 — and the line contains none of the
    sentinel cookie, bearer, email or `db://u:hunter2@…` credential;
    inbound well-formed `x-request-id` honored, hostile id replaced;
    403/400 traffic writes nothing;
  - `register()` production refusal → one `boot_refused` line then
    `process.exit(1)` (stubbed); the sentinel `BETTER_AUTH_SECRET` value
    never appears.
- `npm run build` — **exit 0**.
- Live `next start` (built app): missing `BETTER_AUTH_SECRET` → **exit 1**
  after exactly one stdout line:
  `{"level":"error","event":"boot_refused",…,"error":{"message":"Refusing
to start: BETTER_AUTH_SECRET must be set…"}}`; valid secret → serves
  `/login` 200 with a dead `DATABASE_URL` (startup-config checks ≠ database
  readiness) and an unauthenticated v1 call → 401 with **no** log line.
- `INTEGRATION_DATABASE_URL=…app_plogging_it npx vitest run --config
vitest.integration.config.ts tests/integration/pr05-security.test.ts` —
  **exit 0, 16/16** on real PG.
- `npm run format:check` 0 · `npm run typecheck` 0 · `npm run lint` 0
  (81 pre-existing warnings) · `npm run index` + `index:check` OK.
- `npm run test` (verbatim, full unit) — **exit 1**: 1125 pass, 2 fail,
  both inherited/environmental, neither in the logging path:
  1. `pass 2: a layout's imports…` — the known stale `MotionProvider`
     expectation at base; fixed by PR #194's repair commit (`e4e6bb9`),
     not duplicated here (same lines — would conflict).
  2. `prints one-line signatures…` — 5.8s vs the 5s timeout under
     99-worker parallel load on this host (same environmental flake
     recorded in BOOT-CHECKS.md; passes isolated in ~2.5s and in the
     timeout-extended full run on that branch).

## 4. Mutation evidence

- Removed the `logError` call in the 500 branch → 2 v1 tests fail
  ("one line", "honors/rejects inbound id"). Restored byte-identically.
- Bypassed `redact` in `log()` (pass raw values) → 5 tests fail (nested-key
  redaction, nested-cause scrub, circular/depth, the 500-line sentinel
  assertions, the boot line). Restored byte-identically; suite back to
  12/12.

## 5. Merge-overlap notes

- **PR #194 (`beta/boot-checks`, SHIP, unmerged):** adds its storage
  assertion inside the same `instrumentation.ts` `try` and its index regen
  already contains this same stale-base frontend catch-up
  (`/dev/design-system`, `vari8-theme` symbols) plus the stale
  `system-index.test.ts` expectation fix. Whichever lands second: keep both
  assertions in `register()`'s try, keep the `logError` refusal call, and
  re-run `npm run index` (generated docs will textually conflict).
- **PR #156 (MAIL-ADAPTER):** adds its mail gate inside the same
  `register()` try — same three-way adjacent-line merge; its
  `.env.example`/`SYMBOLS.md` changes coexist fine.
- **#166 (Marcel container):** no file overlap; this logger is exactly the
  stdout sink the container collects — no config change needed.
- **`docs/index/*` regen in this branch** carries the stale-base frontend
  catch-up (same as #194) plus the new `lib/log.ts` exports — expected.

## 6. Limitations

- Full `npm run test` verbatim stays red on this host for the two reasons
  above; the logging file itself is 12/12 and the v1-boundary integration
  suite is green.
- Request ids are minted per request (no middleware chain to carry a
  platform id); honoring sanitized inbound `x-request-id` covers upstream
  proxies.
- Absolute stack paths collapse under the long-token scrub
  (`[redacted].next/…`) — file names and line numbers survive; absolute
  prefixes are not operationally needed and the safe side won.

Head: `04861b6` (plus this report's head line update). PR #195. Not
merged, not approved — ready for independent review.

---

## Fix pass 1 — independent review (head `b618599`, verdict FIX)

Review: PR #195 issuecomment-6352146690. Confirmed defects and repairs,
all re-verified on Node v24.22.1:

### Repaired findings

1. **Request-id correlation (finding 1).** `requestId` now flows through
   `trustedId()` — a marker for the shape-validated id
   (`^[A-Za-z0-9-]{1,64}$`) that skips the long-token scrub _for that field
   only_. The logged id and the `x-request-id` response header are
   identical by construction for every accepted input — verified through
   the real funnel for `proxy-req-001`, a UUID, 32-char and 64-char tokens
   (previously scrubbed to `[redacted]` in the line while echoed raw in
   the header), plus 65-char and unsafe-shape inputs (both mint a UUID and
   stay consistent). General token redaction is unchanged — a bare 32+
   urlsafe string in any other field still redacts.
2. **Logger never throws (finding 2).** Both the primary and the fallback
   `process.stdout.write` calls are now guarded; a dead sink (EPIPE,
   destroyed stream) loses the line silently. Proven: mocked-throwing
   `write` — `logError` returns normally, the funnel still returns the
   500 response, and the boot path still reaches `process.exit(1)`. No
   global handlers; unrelated failures are not concealed.
3. **media/object coverage (finding 3) — acknowledged.** The route
   redeems an HMAC signature, not a session, so it cannot go through
   `defineApiV1Route`; its unhandled GET/PUT faults went straight to Next
   with an unstructured stderr stack. Both handlers now wrap their bodies
   and report through the shared `reportV1Failure` (same event fields:
   `trustedId` request id, method, pathname-only route, status, redacted
   error) plus the standard `{error:{code:"internal"}}` body +
   `x-request-id` header. Signature validation, 404/403/400 responses,
   streaming and headers are unchanged. Live proof at the repaired head:
   `next start` with `MEDIA_STORAGE_ADAPTER=local` + dead `DATABASE_URL`,
   a real minted signature → **500 + exactly one** `api_v1_request_failed`
   JSON line carrying the 32-char inbound `x-request-id` verbatim (the
   exact reviewer probe); a bad signature → 403 `invalid_signature` and
   no line; stderr carries no application-stack output.
4. **error.name/error.code scrubbed (finding 4)** — both now pass
   `redactString`; a `LeakError admin@x.test`/`tok_zzz…` sentinel test
   proves it.
5. **Bounds (finding 5).** Objects cap at 64 keys (`__keys_omitted`
   marker); the serialized line caps at 32 KiB by degrading `error.stack`
   → `error.cause` → a minimal `{truncated}` event — always valid JSON,
   never a mid-line cut.

INFO items recorded, not code: per-event field lists are a documented
convention at the two call sites, not enforced in the type; regex
redaction is not semantic — callers must not route request-derived free
text into error fields (none currently do); the UUID exemption assumes
ids, not secrets, are UUID-shaped (reset/invite tokens are 43-char
base64url, session ids 64-hex — both redact).

### Corrected record

- The earlier report's "the one place every v1 500 is produced" was wrong:
  `media/object` bypassed the funnel entirely. After this pass every
  `/api/v1/*` handler reports through one path — funnel: workspaces
  session GET + clients GET, media `[workspaceId]` POST +
  `[mediaObjectId]` GET; direct `reportV1Failure` wrap: media/object
  GET+PUT. No other v1 route file exists.
- "One stdout line" for boot means **one JSON `boot_refused` event**;
  Next's own startup banner/Ready text is separate process output.
- Mutation-count correction: the original `redact` bypass produced **6**
  failures, not 5. This pass's mutations (all restored byte-identically):
  `trustedId` unwrap removed → 9 fail; media/object catch reporting
  removed → 1 fail; name/code unredacted → 1 fail; unguarded fallback
  write → 1 fail.
- Finding 3's scope note confirmed: with the `s3`/`none` adapter the
  route 404s before the DB; the fault path is reachable on `local` or any
  throw after the gate — both proven.

### Fresh results (repaired candidate)

- `npx vitest run tests/unit/logging.test.ts` — **exit 0, 23/23**.
- `npm run test` (verbatim, standard command, no override) — **exit 1,
  1136/1138**: the inherited stale `MotionProvider` expectation
  (base `09b1424`; repair lives on unmerged #194 `e4e6bb9`, not
  duplicated here) + `prints one-line signatures…` at 5.84s vs the 5s
  default under 99-worker load on this host (pre-existing environmental;
  passes isolated at ~2.5s). Logging file: 23/23 in this same run.
- `INTEGRATION_DATABASE_URL=…app_plogging_it vitest run --config
vitest.integration.config.ts tests/integration/pr05-security.test.ts` —
  **exit 0, 16/16** real PG.
- `npm run build` 0 · `npm run typecheck` 0 · `npm run format:check` 0 ·
  `npm run lint` 0 errors (81 pre-existing warnings) · `npm run index` +
  `index:check` OK.
- Live `next start`: media/object probe as above; boot refusal still one
  JSON `boot_refused` line + exit 1.

### Remaining gate

- **#194 merge is the outstanding integration gate** (still OPEN at
  `e4e6bb9`, SHIP-reviewed). Required order per review: land #194 →
  rebase `beta/logging` (keep auth + storage assertions and
  `logError("boot_refused")`; a mail assertion joins if #156 lands first)
  → `npm run index` → re-run the standard suite, where the stale
  MotionProvider failure resolves via #194's repair. The 5s compiler-test
  flake is pre-existing; a timeout/worker change would be a separate
  tracked decision.

Head: this pass's commits on `beta/logging` — ready for re-review.

---

## Fix pass 2 — re-review (head `284bb99`, verdict FIX for merge readiness)

Re-review: PR #195 issuecomment-6352585429. Findings 1-4 closed by the
previous pass; two items remained and are repaired:

### Repaired findings

1. **Large-error truncation dropped correlation (finding 5 remainder).**
   `formatError` now byte-bounds every serialized error field —
   name/code at 256 B, message at 4 KiB, stack at 8 KiB — via a UTF-8-aware
   `truncateText` that never splits a surrogate pair and marks the cut
   (`…[truncated]`). The total line bound is enforced in BYTES
   (`Buffer.byteLength`, 32 KiB). The minimal fallback now retains the
   safe correlation fields (`requestId`, `method`, `route`, `status`)
   when present; boot events simply omit them and stay valid. Redaction
   still runs before output — truncation cannot reintroduce a secret
   (scrubbed values are what get bounded), and `trustedId` survives the
   minimal fallback verbatim.
2. **Fallback-path test isolation (finding 2 remainder — test-evidence
   gap, not a code defect).** New test: a throwing field getter plus a
   dead stdout sink — `logError` must not throw; it fails when the
   fallback write guard is removed. The API 500 response and boot
   `exit(1)` under a dead sink were already proven last pass.
3. **reportV1Failure input hardening (reviewer INFO).** It now
   re-validates the `requestId` argument against the shape grammar and
   mints a UUID otherwise — the `trustedId` marker can no longer carry an
   unvalidated string into a line if a future call site bypasses
   `requestIdFor`.

### Correction to the fix-pass-1 mutation record

The pass-1 line "unguarded fallback write → 1 fail" was imprecise, as the
reviewer noted: that mutation removed the primary-write inner guard AND
unguarded the fallback together, and the committed dead-sink test only
exercises the primary path (its inner catch swallows the throw before the
fallback is reached). The new throwing-getter test isolates the outer-catch
fallback path — removing the fallback guard alone now produces exactly
1 failure there. Original run history preserved above; this note is the
prospective correction.

### New/updated tests (23 → 29)

- request-id matrix through the real funnel (short/uuid/32/64/65/hostile)
- oversized error (60 KB message) → valid JSON, ≤ 32 KiB bytes, truncated
  message, requestId/method/route/status retained
- multibyte (emoji) text → byte-bounded, no split surrogate in output
- nested giant cause → bounded, correlation kept
- minimal fallback on a >32 KiB field set → `truncated` marker +
  correlation fields retained
- throwing getter + dead sink → `logError` does not throw (isolates the
  fallback guard)
- `reportV1Failure` re-validation → hostile arg mints a UUID
- media/object GET+PUT fault lines, silent 403/404 (pass 1)

### Mutations (each restored byte-identically)

| Break                                          | Result                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| formatError field caps removed                 | 6 failures (oversize/multibyte/nested + 3 existing scrub/funnel) |
| minimal-fallback correlation retention removed | 1 failure                                                        |
| fallback write unguarded                       | 1 failure (getter + dead-sink test)                              |
| reportV1Failure re-validation removed          | 1 failure                                                        |

### Fresh results (this head, Node v24.22.1)

- `npx vitest run tests/unit/logging.test.ts` — **exit 0, 29/29**.
- `npm run test` verbatim — **exit 1, 1142/1144**: stale `MotionProvider`
  expectation (inherited; #194 repair unmerged — not duplicated) and the
  ~5.9s compiler-API timeout under 99-worker load (pre-existing
  environmental; logging file 29/29 inside the same run).
- Integration on disposable `app_plogging_it`:
  `pr05-security` 16/16, `api-v1-media` 7/7, `api-v1-session` 4/4,
  `api-v1-clients` 5/5 — **32/32**.
- `npm run build` 0 · `npm run typecheck` 0 · `npm run format:check` 0 ·
  `npm run lint` 0 errors (81 pre-existing warnings) · `npm run index` +
  `index:check` OK.
- Live probes re-run at this head: boot refusal → one JSON `boot_refused`
  line + exit 1; media/object signed GET + dead DB → 500 + one
  `api_v1_request_failed` line, 32-char inbound `x-request-id` preserved
  in both line and response header; bad signature → 403, no line.

### Remaining gate

- **#194 merge** remains the outstanding integration gate — still OPEN at
  `e4e6bb9` (SHIP). Order once it lands: rebase `beta/logging` → keep
  auth + storage assertions (+ mail if #156 lands first) +
  `logError("boot_refused")` → `npm run index` → re-run the standard
  suite; the MotionProvider failure resolves via #194's repair. The 5s
  compiler flake needs a separate tracked timeout/worker decision.
- Residual (documented, by design): regex redaction is not semantic —
  callers must not route request-derived free text into error fields;
  the UUID exemption assumes ids not secrets are UUID-shaped.
