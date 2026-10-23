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

## Fixes (current head `7603fdd`)

- `playwright.config.ts` — the canonical e2e env is a real,
  internally consistent https setup:
  - `PLAYWRIGHT_PORT_BASE` validated as a decimal integer; malformed,
    zero, negative, fractional and out-of-range values throw at config
    load, and the value must leave a usable `TLS_PORT + 1` backend port
    (65535 itself is rejected — the first validation missed that pair).
  - Two webServer processes: `next start` on a private http
    `BACKEND_PORT = TLS_PORT + 1` (production boot, all production
    assertions active) and `tests/e2e/tls-proxy.mjs` — a disposable
    local TLS terminator — on `TLS_PORT` (the lane port).
  - `use.baseURL` = `https://127.0.0.1:$TLS_PORT`; the backend binds
    loopback explicitly (`next start -- -p N -H 127.0.0.1` — the first
    candidate's wildcard `*:3846` bind was a defect, corrected).
    The webServer env
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
- `tests/e2e/tls-proxy.mjs` — ~100 lines of node `https`/`http`
  piping to the backend; exits non-zero on malformed env. The
  cert-dir cleanup is registered before the openssl spawn (the first
  candidate registered it after, leaking the dir on spawn failure)
  and fires immediately once the credentials are in memory — even
  Playwright's hard kill leaves nothing on disk.
- `tests/unit/e2e-config.test.ts` — 14 tests asserting the contract
  independently of the server: default port 3000, requested port
  agreement across browser origin / auth origins / server command
  (incl. the `-H 127.0.0.1` loopback bind) / proxy target, the
  65534/65535 pair boundary, all malformed ports rejected, no-reuse
  on both entries; plus two subprocess tests proving the proxy's
  openssl-failure path exits nonzero with its tmpdir removed and no
  key material logged, and that a running proxy leaves no temp dir
  on SIGTERM.
- `tests/unit/boot-checks.test.ts` — production matrix (APP_ENV
  unset/test/development/production: http origin, missing and short
  secret, alias conflict all refuse; valid https accepted; NEXT_PHASE
  exemption preserved).
- `tests/unit/system-index.test.ts` — the deterministic full-repo
  scan runs once in `beforeAll` (10s hook budget) instead of inside
  each 5s test. Assertions byte-identical.

## Results (Node v24.22.1, head `7603fdd`)

- `verify-local.sh` (canonical): `BASE_SHA=17eb756 LANE_DB=app_harness
LANE_PORT=3847 SKIP_PARITY=1` — **VERIFY-LOCAL PASS**: clean tree,
  schema guard, generator check, npm ci, prisma generate, frontend
  npm ci, format, typecheck, frontend typecheck, lint, frontend lint,
  **unit tests (21s)**, frontend tests, integration SKIP (net-zero
  diff under `db/`/`lib/`/`app/api/` — `server.ts` restored
  byte-identically), migrate deploy, build, frontend build, **e2e
  flow specs (31s)**.
- Canonical e2e detail: `PLAYWRIGHT_PORT_BASE=3847` — backend on
  3848 http loopback-only, TLS terminator + browser + configured
  origin on `https://127.0.0.1:3847`. **10 passed / 7 skipped /
  0 failed.** The 7 skips are mail-adapter-dependent reset specs
  ("mail delivery adapter not configured") — recorded as skips, not
  passes; they do not prove reset flows.
- **Socket evidence (live run):** `lsof -nP -iTCP -sTCP:LISTEN` —
  `TCP 127.0.0.1:3850 (LISTEN)` (TLS proxy) and `TCP 127.0.0.1:3851
(LISTEN)` (`next start -H`), no wildcard binds;
  `curl -k https://127.0.0.1:3850/` → **307** through the proxy.
- `npm run test` (standard, verbatim): **green, exit 0** — bounded
  single check, not a flake-elimination claim: the `buildSymbols`
  scan runs under a 10s `beforeAll` budget (~6s under this load);
  a contended host could still approach the budget. Two scans →
  one scan is the justified work reduction; timing risk reduced,
  documented, not waived. (Fresh counts: gate unit step PASS.)
- `npm run format:check` 0 · `npm run typecheck` 0 · `npm run lint`
  0 errors / 81 pre-existing warnings · `index:check` 0 ·
  `npm run build` 0 (inside the gate; standalone passes confirmed).

## Mutation evidence (byte-identical restores)

Pass 1 (head `698280f` era): re-added `APP_ENV` exemption → 2
boot-check failures; hardcoded port → **8 failures** (reviewer's
measurement — the report's earlier "1 failure" was wrong; the
hardcode breaks every origin/port assertion, corrected here).

This pass (head `7603fdd`):

- `-H 127.0.0.1` removed from the backend command → **1 failure**
  (loopback assertion).
- Pair check removed (`n > 65534` rejected) → **1 failure** (the
  `"65535"` case).
- Cert cleanup registration moved back after the openssl spawn →
  **1 failure** (openssl-failure subprocess test detects the leaked
  dir). Note: this mutation initially did NOT bite because the
  subprocess env lacked `TMPDIR`, so the child's `os.tmpdir()` fell
  back to `/tmp` outside the watched directory — the test itself was
  fixed to inherit `TMPDIR`; the mutation then bit correctly.

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
