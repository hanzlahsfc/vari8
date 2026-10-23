# HARNESS-E2E — shared verification blockers (issue #197, #198)

Branch `beta/harness-e2e` off `origin/Vari8-Beta` @ `17eb756`.
Worktree `/Users/apple/Devin/vari8-worktrees/harness-e2e`.
Runtime Node v24.22.1. Task: PROMPT 350.

## Root causes

1. **E2E startup (issue #197).** Two mismatches, both real:
   - `assertAuthSecretConfigured` keyed the production refusal on raw
     `NODE_ENV`, ignoring the repo's own sanctioned runtime
     classification (`lib/runtime.ts` `classifyRuntime` — "a disposable
     test/proof server must set `APP_ENV=test`"). The Playwright
     `webServer` runs `next start` (NODE_ENV=production) with
     `APP_ENV=test` already set, but the assertion could not see it.
   - `verify-local.sh` passes `PLAYWRIGHT_PORT_BASE=$LANE_PORT` and
     exports `AUTH_URL=http://127.0.0.1:$LANE_PORT`, but
     `playwright.config.ts` hardcoded port 3000 and never consumed the
     variable — the configured auth origin pointed at a different port
     than the server under test.

2. **Compiler-test timeout (issue #198).** `system-index.test.ts`
   called `buildSymbols()` — a full TypeScript-program scan (~2-6.7s
   each) — inside two `it()` blocks; under the standard suite's
   parallel load each call blew the 5s testTimeout. Isolated the same
   assertions pass in ~2.5-3s; documented as an inherited flake in
   reviews of #194/#195/#162.

## Fixes (head `ac7cf96`, +report commit)

- `lib/auth/server.ts` — the production gate now keys on
  `classifyRuntime() !== "production"`. APP_ENV unset → production
  contract unchanged (http origin, conflicting names, weak secret all
  still refuse). `APP_ENV=test` (the explicit, reviewed marker) → the
  disposable test server is not a production deployment. The refusal
  is NOT weakened: `APP_ENV=production` explicitly or a real `next
start` still refuse.
- `playwright.config.ts` — `PORT = PLAYWRIGHT_PORT_BASE || 3000`;
  `baseURL`, the `webServer` url/command (`next start -p PORT`) and
  the pinned `BETTER_AUTH_URL`/`AUTH_URL` env all derive from the one
  `ORIGIN` value. Configured auth origin = browser URL = served port,
  both auth names equal (the pair-conflict contract), in the approved
  `APP_ENV=test` classification.
- `verify-local.sh` — unchanged: the `PLAYWRIGHT_PORT_BASE=$LANE_PORT`
  invocation path now activates (grep match), lanes get unique ports,
  the flock serialization branch remains as the fallback.
- `tests/unit/system-index.test.ts` — the deterministic full-repo scan
  runs once in `beforeAll` (10s hook budget) instead of per-test (5s
  budget). Every assertion is byte-identical; mutation sensitivity
  unchanged.
- `tests/unit/boot-checks.test.ts` — `APP_ENV` added to the stubbed
  key set; two regression cases: `APP_ENV=test` + http origin is
  accepted (the webServer contract), `APP_ENV=production` + http
  refuses.

## Results (Node v24.22.1, exact head)

- `verify-local.sh` (canonical): `BASE_SHA=17eb756 LANE_DB=app_harness
LANE_PORT=3833 SKIP_PARITY=1` (harness lane, no screens) —
  **VERIFY-LOCAL PASS, every step**: clean tree, schema guard,
  generator check, npm ci, prisma generate, frontend npm ci, format,
  typecheck, frontend typecheck, lint, frontend lint, **unit tests
  (20s)**, frontend tests, integration (245s), migrate deploy, build,
  frontend build, **e2e flow specs (35s)**.
- Canonical e2e detail: `PLAYWRIGHT_PORT_BASE=3833` branch — server,
  configured origin and browser all on 3833. **10 passed / 7 skipped /
  0 failed.** The 7 skips are the mail-adapter-dependent reset specs
  ("mail delivery adapter not configured") — recorded as skips, not
  passes.
- `npm run test` (standard, verbatim): **1170/1170, exit 0** — the
  compiler-timeout flake is gone (single cached scan).
- `npm run format:check` 0 · `npm run typecheck` 0 · `npm run lint`
  0 errors / 81 pre-existing warnings · `npm run index`/`index:check` 0
  · `npm run build` 0.

## Mutation evidence (byte-identical restores, sha-verified)

- Reverted `classifyRuntime()` → `NODE_ENV` check:
  - `tests/unit/boot-checks.test.ts` → 1 failure ("accepts an http:
    origin under the sanctioned APP_ENV=test server").
  - Rebuilt + `next start` with the exact webServer env (APP_ENV=test,
    http origin on :3833) → `boot_refused` line + refused boot — the
    original defect reproduced live.
- The compiler-timeout repair removes redundant work rather than
  adding a behavioral guard; the assertions it protects are literal
  and unchanged, so no separate mutation applies — the proof is the
  standard suite green under the same 100-worker load that flaked on
  every prior run.

## Boundaries / leftovers

- `assertMediaStorageConfigured` unchanged: under `APP_ENV=test` +
  unset adapter it resolves `none` and stays a no-op; only the auth
  assertion was the reported defect.
- The serialized `flock` branch in verify-local is untouched as the
  fallback path.
- Mail-adapter skips are pre-existing spec conditions, not masked
  failures.
- Supplements PR #162 untouched (stays at `866b6b2`): open items it
  still carries — issue #161 "workspace-scope save" wording vs the
  assigned-write matrix (documented disposition in PR-SUPP.md);
  #158/#164 migration-order coordination; an item-row preservation
  assertion to add to the archived-save test on its next update.
