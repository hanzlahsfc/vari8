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

**`lib/api/v1.ts`.** The `defineApiV1Route` funnel is the one place every
v1 500 is produced. It now mints a request id per request — an inbound
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
