# HARNESS-E2E — shared verification blockers (issue #197, #198)

Branch `beta/harness-e2e` off `origin/Vari8-Beta` @ `17eb756`.
Worktree `/Users/apple/Devin/vari8-worktrees/harness-e2e`.
Runtime Node v24.22.1. Tasks: PROMPT 350, repair pass PROMPT 352.

## Root causes

1. **E2E startup (issue #197).** `verify-local.sh` passes
   `PLAYWRIGHT_PORT_BASE=$LANE_PORT` and exports
   `AUTH_URL=http://127.0.0.1:$LANE_PORT`, but `playwright.config.ts`
   hardcoded port 3000 and never consumed the variable — the
   configured auth origin pointed at a different port than the server
   under test, and `http:` tripped the merged #194 production boot
   refusal (`next start` is NODE_ENV=production).
2. **Compiler-test timeout (issue #198).** `system-index.test.ts`
   called `buildSymbols()` — a full TypeScript-program scan (~2-6.7s)
   — inside two `it()` blocks; under the standard suite's parallel
   load each call exceeded the 5s testTimeout. Isolated the same
   assertions pass in ~2.5-3s.
3. **Reviewed defect in the first candidate.** Pass 1 keyed the
   production refusal on `classifyRuntime()`, letting `APP_ENV=test`
   disable the auth-secret, alias-conflict and http-origin checks —
   an unapproved weakening of the #194 contract. Reverted;
   `lib/auth/server.ts` is byte-identical to `Vari8-Beta` at
   `17eb756` (net-zero product diff — confirmed by `git diff`).

## Fixes (current head `5345780`)

- `playwright.config.ts` — the canonical e2e env is a real,
  internally consistent https setup:
  - `PLAYWRIGHT_PORT_BASE` validated as a decimal integer in
    1-65535 (`lanePort`); malformed, zero, negative, fractional and
    out-of-range values throw a configuration error at config load.
  - Two webServer processes: `next start` on a private http
    `BACKEND_PORT = TLS_PORT + 1` (production boot, all production
    assertions active) and `tests/e2e/tls-proxy.mjs` — a disposable
    local TLS terminator — on `TLS_PORT` (the lane port).
  - `use.baseURL` = `https://127.0.0.1:$TLS_PORT`; the webServer env
    pins `BETTER_AUTH_URL`/`AUTH_URL` to the same https origin
    (equal — the pair-conflict contract). Browser URL, configured
    auth origin and served port are one value; the configured-origin
    contract is exercised, not bypassed. Secure cookies stay Secure.
  - `ignoreHTTPSErrors: true` for the self-signed cert; the cert is
    generated per run into `os.tmpdir()` by openssl, deleted on
    exit — disposable, local-only, uncommitted.
  - `reuseExistingServer: false` on both entries: an occupied port
    fails rather than silently attaching to another process.
  - `verify-local.sh` unchanged: its `PLAYWRIGHT_PORT_BASE=$LANE_PORT`
    path now activates; the flock serialization branch remains the
    fallback.
- `tests/e2e/tls-proxy.mjs` — ~90 lines of node `https`/`http`
  piping to the backend; exits non-zero on malformed env.
- `tests/unit/e2e-config.test.ts` — 10 tests asserting the contract
  independently of the server: default port 3000, requested port
  agreement across browser origin / auth origins / server command /
  proxy target, all malformed ports rejected, no-reuse on both
  entries.
- `tests/unit/boot-checks.test.ts` — production matrix: `APP_ENV`
  unset/test/development/production with http origin all refuse;
  secret-length and alias-conflict refusals under `APP_ENV=test`;
  valid https config accepted; the NEXT_PHASE build exemption
  unchanged.
- `tests/unit/system-index.test.ts` — the deterministic full-repo
  scan runs once in `beforeAll` (10s hook budget) instead of inside
  each 5s test. Assertions byte-identical.

## Results (Node v24.22.1, head `5345780`)

- `verify-local.sh` (canonical): `BASE_SHA=17eb756 LANE_DB=app_harness
LANE_PORT=3833 SKIP_PARITY=1` — **VERIFY-LOCAL PASS**: clean tree,
  schema guard, generator check, npm ci, prisma generate, frontend
  npm ci, format, typecheck, frontend typecheck, lint, frontend lint,
  **unit tests (21s)**, frontend tests, integration SKIP (net-zero
  diff under `db/`/`lib/`/`app/api/` — `server.ts` restored
  byte-identically), migrate deploy, build, frontend build, **e2e
  flow specs (31s)**.
- Canonical e2e detail: `PLAYWRIGHT_PORT_BASE=3833` — backend on
  3834 http, TLS terminator + browser + configured origin on
  `https://127.0.0.1:3833`. **10 passed / 7 skipped / 0 failed.**
  The 7 skips are mail-adapter-dependent reset specs ("mail delivery
  adapter not configured") — recorded as skips, not passes; they do
  not prove reset flows.
- `npm run test` (standard, verbatim): **1182/1182 across 101 files,
  exit 0** — a bounded single check, not a flake-elimination claim:
  the `buildSymbols` scan now runs under a 10s `beforeAll` budget;
  under this run's load it took ~6s, so a heavily contended host
  could still approach the budget. Two scans → one scan is the
  justified work reduction; timing risk is reduced, documented, not
  waived.
- `npm run format:check` 0 · `npm run typecheck` 0 · `npm run lint`
  0 errors / 81 pre-existing warnings · `index:check` 0 ·
  `npm run build` 0.
- Standalone live probes: `next start` + https origin config boots
  and serves through the proxy; the earlier http-origin refusal
  probe remains demonstrated by the mutation evidence below.

## Mutation evidence (byte-identical restores)

- Re-added an `APP_ENV === "test"` exemption to
  `assertAuthSecretConfigured` → **2 failures** (http-refusal and
  secret/alias-refusal non-exemption cases).
- Hardcoded the e2e port to 3000 while `PLAYWRIGHT_PORT_BASE=3833`
  requested → **1 failure** (the lane-port agreement test — the
  stale-server/hardcode regression is detected, not moved).

## E2E shutdown noise

`[WebServer] ⨯ Error: The destination stream closed early` appeared in
the first-candidate run's server log while tests continued and all
non-skipped tests passed. In the repaired https run it did not
recur. Assessed as Next server-side client-disconnect noise during
aborted streaming navigations, not an application failure — no
correlated test failure or nonzero exit. Recorded, not fixed (no
demonstrated harness defect).

## Boundaries / leftovers

- `assertAuthSecretConfigured` restored to the base implementation
  byte-for-byte — zero product-code diff on this lane.
- `assertMediaStorageConfigured` unchanged (not part of the defect).
- Mail-adapter skips are pre-existing spec conditions.
- Supplements PR #162 untouched at `866b6b2`; its own open items
  (assigned-write wording, #158/#164 order coordination, archived
  item-row assertion) remain separate.
- Parity step skipped per the no-screens convention; the flock e2e
  branch remains as a fallback path.
