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

- **PR #156 (MAIL-ADAPTER, open):** adds its mail gate inside the same
  `register()` `try` — adjacent-line merge for whichever lands second.
- **Issue #166 (Marcel):** no file overlap; `next start` in the container
  inherits these checks via `register()`.
- **Issue #168 (mine, next):** interface preserved — refusals still flow
  through `console.error(error)` → `process.exit(1)`.
- Not done: no auto-migration/seed, no health endpoint, no new logger, no
  secrets or connection strings printed, no production contact.

Head: `92615a9` plus this report's commit.
