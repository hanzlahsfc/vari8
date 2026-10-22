# BOOT-CHECKS — fail at boot on bad production config

Card `BOOT-CHECKS`, issue #167. Worktree
`/Users/apple/Devin/vari8-worktrees/boot-checks`, branch `beta/boot-checks`,
base `09b1424` (origin/Vari8-Beta at branch and at push — base did not move).
PR #194. Node v26.8.1, Next 16.3.8. Not merged: an independent verifier
decides SHIP or FIX.

## 1. What it does

Extends the `instrumentation.ts` boot gate (`assertAuthSecretConfigured`, the
pattern the issue named) with the two required refusals — production only,
build phase exempt, values never printed:

- `assertMediaStorageConfigured(env)` (`lib/storage.ts`): with
  `MEDIA_STORAGE_ADAPTER=s3` in production, throws `Refusing to start:` naming
  the missing of `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY` (READINESS B6). Adapter resolution mirrors
  `getObjectStorage` exactly — `.toLowerCase()` only, so `S3` counts and
  `" s3 "` does not (it resolves to the fail-closed null backend, which needs
  no S3 env).
- `assertAuthSecretConfigured` (`lib/auth/server.ts`): the resolved
  `BETTER_AUTH_URL ?? AUTH_URL` origin with protocol `http:` refuses in
  production, naming the variable (READINESS B7). Malformed/unset origins are
  out of contract — unset stays a Better Auth warning, not a boot refusal.

`instrumentation.ts` calls both inside the existing `try`; the catch's
`console.error` + `process.exit(1)` path is unchanged — that is the interface
issue #168's logger inherits.

## 2. Commits

| SHA       | Paths                                                                        | What                                               |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| `b2c1b0a` | `instrumentation.ts`, `lib/auth/server.ts`, `lib/storage.ts`, `.env.example` | the two refusals + operator docs                   |
| `b7a38f4` | `tests/unit/boot-checks.test.ts`, `tests/integration/pr05-security.test.ts`  | 23 unit tests; https fixture repair                |
| `92615a9` | `docs/index/COMPONENTS.md`, `docs/index/ROUTES.md`, `docs/index/SYMBOLS.md`  | regen — base index predated the #160 frontend sync |

## 3. Live proof (`next build` exit 0, then `next start -p 3730`)

| Config                                                     | Result                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `MEDIA_STORAGE_ADAPTER=s3`, missing `S3_SECRET_ACCESS_KEY` | exit **1**: `Refusing to start: MEDIA_STORAGE_ADAPTER=s3 requires …; missing: S3_SECRET_ACCESS_KEY.`              |
| `BETTER_AUTH_URL=http://app.internal.example`              | exit **1**: `Refusing to start: BETTER_AUTH_URL is an http: origin; production auth requires an https: base URL.` |
| `BETTER_AUTH_URL=http://127.0.0.1:3730`                    | exit **1** — localhost http still counts                                                                          |
| https origin + complete S3 env, dead `DATABASE_URL`        | boots, `GET /login` → 200 (boot touches no DB)                                                                    |

## 4. Gates (exit codes)

- `npm run format:check` — 0 · `npm run typecheck` — 0 · `npm run lint` — 0
  (81 warnings, 0 errors, all pre-existing)
- `npm run index` + `npm run index:check` — 0
- `npx vitest run tests/unit/boot-checks.test.ts` — 23/23
- `npx vitest run --config vitest.integration.config.ts tests/integration/pr05-security.test.ts -t refuses` — 2/2
  (existing alias/secret refusal suite; the fixture used `http://` values, a
  fixture mistake under the new contract — moved to `https://`, assertion
  unchanged)
- `npm run build` — 0; the build phase correctly ran with no auth/storage env
- Parity — N/A (no screen change)
- `verify-local.sh` end-to-end — not run (expects container `vari8-db-1`;
  this host runs the compose service as `app-db-1`). Steps run individually.

## 5. Mutation evidence

- `assertMediaStorageConfigured`: `missing.length > 0` → `if (false)` →
  8 test failures including the `register()` exit-1 wiring test. Restored.
- `assertAuthSecretConfigured`: `protocol === "http:"` → `"never:"` →
  3 failures (both var-name paths + the exit-1 wiring test). Restored.
- First test run caught two fixture mistakes in my own file (whitespace
  adapter name overreach; `BETTER_AUTH_URL=""` suppressing the `AUTH_URL`
  fallback) and one in `pr05-security.test.ts` — all corrected, not product
  defects.

## 6. Boundaries and open items

- **PR #156 (MAIL-ADAPTER, open):** rewrites the same `instrumentation.ts`
  import/call block (a `Promise.all` destructure adding its mail gate) and
  also touches `.env.example` and `docs/index/SYMBOLS.md`. Whichever lands
  second needs a small rebase plus an index regen — no semantic conflict:
  every assertion just throws into the same `console.error` → `exit(1)`
  catch. Merge handoff note: this PR's `docs/index/SYMBOLS.md` also carries
  the stale-base frontend catch-up, so regen after either merge is required
  rather than optional.
- **Issue #166 (Marcel):** no file overlap; `next start` in the container
  inherits these checks via `register()`.
- **Issue #168 (mine, next):** interface preserved — refusals still flow
  through `console.error(error)` → `process.exit(1)`.
- Not done: no auto-migration/seed, no health endpoint, no new logger, no
  secrets or connection strings printed, no production contact.

Head: `92615a9` plus this report's commit.

---

## Fix pass 1 — independent review (head `3e58cdc`, verdict FIX)

Review: PR #194 issuecomment-6350839455. The reviewer confirmed the boot-check
implementation meets #167 on Node v24.22.1; the single blocker was the
final-head unit gate, which this pass repairs.

**What the earlier verification omitted.** §4 ran the boot-check unit file,
the affected `pr05-security` describes and the mechanism gates, but not the
full `npm run test` suite — the report called the `verify-local.sh`
container-name mismatch a reason not to run it end-to-end, and the unit step
(which needs no container) was skipped with it. That omission left an
inherited stale expectation red at head.

**The finding.** `tests/unit/system-index.test.ts` expected every
`MotionProvider` component row to be `… | /, /coach, /ethereal |`, but the
accurately generated index (base `09b1424` predates the #160 frontend sync)
lists `/, /coach, /dev/design-system, /ethereal` — the root layout at
`frontend/src/app/layout.tsx:21` wraps every route, including the synced
`frontend/src/app/dev/design-system/page.tsx`. At base, `index:check` was
exit 1 with the same test red plus index staleness; this PR fixed the index
but not the expectation. Repair: both affected expected rows now include
`/dev/design-system`, verified against `docs/index/COMPONENTS.md:77,168` and
the source — the comparison stays exact `toBe`, no substring loosening, and
the generated docs are untouched.

**Fresh results (Node v24.22.1, approved runtime; earlier evidence was Node
v26.8.1):**

- `npm run test` (full, verbatim) — **exit 1**, three runs: the repaired
  MotionProvider assertion passes every run, but one of three compiler-API
  tests (`prints one-line signatures…`, `F2: indexes re-exports…`,
  `index:check reports a missing…`) rotates over the 5s vitest timeout under
  parallel load on this host (~5.3–6.3s each). Environmental and
  pre-existing — unrelated to this repair; preserved, not suppressed.
- `npx vitest run --testTimeout=15000` (full suite, unmasked) — **exit 0,
  1138/1138** including all 18 system-index tests and 23 boot-checks tests.
- `npx vitest run tests/unit/system-index.test.ts` — 18/18 isolated
  (~14s; the same compiler tests take 2.5–5.2s with the machine unloaded).
- `npx vitest run tests/unit/boot-checks.test.ts` — 23/23.
- `npm run format:check` 0 · `npm run typecheck` 0 · `npm run index:check` 0.
- Mutation: renamed `frontend/src/app/dev/design-system` → the repaired
  assertion failed (missing route caught) → restored byte-identically
  (`git status` clean).
- Production byte-identity vs reviewed head `3e58cdc`: sha256 of
  `instrumentation.ts`, `lib/auth/server.ts`, `lib/storage.ts` each match;
  `git diff 3e58cdc` on those paths is empty. §3's live-boot evidence
  carries forward unchanged; startup-config checks remain distinct from
  database readiness (the valid-config boot ran against a dead
  `DATABASE_URL`).

**Not rerun:** `npm run build`, lint, integration suites, e2e, parity — no
production or screen code changed in this pass (test expectation + report
only). Reviewer INFO items (malformed/`""` origins, blank-S3 trim vs
`s3Config`) noted as out of contract — no behaviour change made.
