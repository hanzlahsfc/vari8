# SEED-FIX report

Issue #125, PR #126. Brief:
`/home/nexuslink/vari8-worktrees/_evidence/WAVE-B/seed-fix-brief.md`.
Lane DB `app_seed`, LANE_PORT `3900`, worktree
`/home/nexuslink/vari8-worktrees/seed-fix`, branch `beta/seed-fix`.

## What changed and why

Since PR-05 (Better Auth), credential sign-in reads the `accounts` table,
but the development seed only wrote `users.passwordHash` (read-dead; the
schema comment marks the column for PR-R2 removal). A freshly seeded lane
database had no sign-in credential for anyone, which blocked every wave
lane's live check.

Changed paths (one commit):

- `scripts/seed/00-workspace.seed.ts` — every seeded sign-in user now gets
  an `accounts` row upserted with the exact shape `lib/auth/signup.ts`
  writes (`providerId="credential"`, `accountId=user.id`,
  `password=hashPassword(...)` from `lib/password.ts`; reused, not
  reimplemented). The `passwordHash` writes are removed (no live reader:
  the only `verifyPassword` consumer is Better Auth's
  `account.password` check in `lib/auth/server.ts:175`; remaining
  `passwordHash` writers — `lib/auth/signup.ts:95`,
  `lib/workspace/invitations.ts:559`,
  `icm/05-build/tools/dev-user.ts:20` — write the legacy mirror only).
  Two seeded roles added: a sign-in client (`SEED_CLIENT_*`, CLIENT
  membership in `canvas-demo`, `ClientProfile` linked to the first canvas
  demo client "Emma Anders") and a second-workspace staff user
  (`SEED_STAFF2_*`, COACH membership in the new `seed-second-workspace`).
  All writes are idempotent upserts; `seed:dev` stays safe to re-run.
- `scripts/db-fresh.ts` — header comment now documents the eight required
  `SEED_*` variables (env contract changed).
- `tests/integration/seed-credentials.test.ts` — new guard test. Runs the
  seed through the real `npm run seed:dev` entrypoint
  (`tsx scripts/seed/index.ts`) against the lane DB and asserts each
  stored credential is accepted by `verifyPassword`, the memberships and
  the client-profile link exist, and `users.passwordHash` stays empty.
- `icm/05-build/reports/SEED-FIX.md` — this file.

## Decisions

- `SEED_CLIENT_*` and `SEED_STAFF2_*` are required like `SEED_OWNER_*` /
  `SEED_COACH_*` (same `requiredEnv` convention): a partial seed would
  re-break the lanes this card unblocks.
- Staff2 role is COACH (not SUPPORT): D15 leaves the SUPPORT enum value
  unused, so a COACH is the meaningful second-workspace staff proof.
- The seeded client signs in as the first canvas demo client profile so
  the roster keeps exactly the 15 canvas rows and the client lands on a
  profile the canvas already shows.

## Commands and exit codes

| Command                                                                                                                                                                | Exit                                 | Evidence                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund` (root + `frontend/`), `npx prisma generate`                                                                                              | 0                                    | install logs on this machine                                                    |
| `npx prettier --check <changed files>`                                                                                                                                 | 0 (after `--write` on the test file) | —                                                                               |
| `npx tsc --noEmit`                                                                                                                                                     | 0                                    | —                                                                               |
| `npx eslint <changed files>`                                                                                                                                           | 0                                    | —                                                                               |
| `INTEGRATION_DATABASE_URL=…/app_seed npx vitest run --config vitest.integration.config.ts tests/integration/seed-credentials.test.ts`                                  | 0 (2 passed)                         | console run                                                                     |
| Mutation check: `accounts` upsert commented out, fresh `app_seed`, same vitest command                                                                                 | 1 (2 failed, expected)               | `_evidence/SEED-FIX/build/mutation-fail.log`                                    |
| Same vitest command after restore                                                                                                                                      | 0 (2 passed)                         | console run                                                                     |
| `npm run index` / `npm run index:check`                                                                                                                                | 0 / 0                                | `index:check OK`                                                                |
| `NODE_ENV=development DB_FRESH_SKIP_CATALOGS=1 SEED_* x8 npm run db:fresh` on `app_seed`                                                                               | 0                                    | `_evidence/SEED-FIX/build/db-fresh.log`                                         |
| HTTP `POST /api/auth/sign-in/email` x4 (owner, coach, client, staff2) on `:3900`                                                                                       | all HTTP 200 + `set-auth-token`      | `_evidence/SEED-FIX/build/http-signin.txt`                                      |
| Playwright chromium: real `/login` form sign-in per role at 1440x900 and 390x844, session verified via `/api/auth/get-session`, PNG per role+width + `/workspace` PNGs | 0                                    | `_evidence/SEED-FIX/build/browser-proof.txt`, `signin-*.png`, `workspace-*.png` |
| `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_seed LANE_PORT=3900 CARD=SEED-FIX icm/05-build/tools/verify-local.sh`                                   | see below                            | `/home/nexuslink/vari8-worktrees/seed-fix.check.log`                            |

Gate: run 1 on head `458634d` (see `seed-fix.check.log`); the gate was
re-run on the final head containing this report and the summary block is
posted on PR #126.

## Live proof summary

- `db:fresh` on `app_seed`: seed prints `owner+coach+client ready, 14
client profile(s) created, 15 total; second workspace
seed-second-workspace: staff ready` (db-fresh.log).
- HTTP sign-in: all four seeded credentials return 200 with a session
  token and the right user name (http-signin.txt).
- Browser: real form sign-in for each role lands on `/` with a matching
  `/api/auth/get-session` identity at both widths; `/workspace` lists
  `Liliana Mansfeld Coaching WORKSPACE_OWNER` for owner, `COACH` for
  coach, `Seed Second Workspace COACH` for staff2, and (correctly) no
  staff workspaces for the client role (browser-proof.txt + 16 PNGs).

## Open items

- None against the brief. Note for the wave: lanes that run `db:fresh`
  must now export all eight `SEED_*` variables (documented in the
  `db-fresh.ts` header). `icm/05-build/tools/dev-user.ts` is a pre-PR-04
  leftover that still writes only the dead `passwordHash` column — out of
  this card's file scope; flagged, not fixed.
