# AUTH-ROTATE report

Card: `HERMES-LEAD/cards/AUTH-ROTATE.md` (issue #157, PR #158, branch `beta/auth-rotate` off `Vari8-Beta` 69c74c358).
Lane worktree: `NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/auth-rotate`.

## Environment (measured, this run)

| item        | value                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `node -v`   | `v26.12.1`                                                                                         |
| database    | `app_authrot` on `127.0.0.1:3956` (`DATABASE_URL` from `Vari8-evidence/scratch/pg/authrot/env.sh`) |
| app port    | 3957 only (no server was started for any gate)                                                     |
| auth engine | better-auth 1.7.10 (read from `node_modules/better-auth/package.json`)                             |
| psql        | `psql "${DATABASE_URL%%\?*}" -c 'select 1'` works; the `?schema=public` parameter is stripped      |

## What changed

Backend only. No screen, no component, no style, no visible copy was touched: the diff is
`app/api`, `lib/auth`, `db`, `docs/mobile`, `.env.example` and one integration test. Nothing in
`frontend/` changed, so no before/after capture applies.

| file                                                                     | change                                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `app/api/v1/auth/refresh/route.ts`                                        | new. `POST /api/v1/auth/refresh`, bearer only.                                            |
| `db/schema.prisma`                                                        | `Session.familyId` (nullable, indexed) and the `SpentRefreshToken` model.                  |
| `db/migrations/20261022090000_auth_rotate/migration.sql`                   | the column, the index and the `spent_refresh_tokens` table.                                |
| `lib/auth/server.ts`                                                      | reset link now also requires an ACTIVE CLIENT membership in an ACTIVE workspace.           |
| `.env.example`                                                            | `AUTH_TRUSTED_IP_HEADER` also documents the IP recorded on a refreshed app session.        |
| `docs/mobile/PWA-CAPACITOR-SCOPE.md`                                      | rotation exists: the contract the shell must follow.                                      |
| `tests/integration/auth-rotate.test.ts`                                    | nine cases, one per acceptance bullet a click cannot prove.                                |

### The nine build items

1. **Route, spend before issue.** `POST /api/v1/auth/refresh` deletes the presented session row
   (`deleteMany`, one statement) and requires `count === 1`; then writes the tombstone, then
   creates the replacement. Any other outcome returns 401 and mints nothing. The whole handler is
   wrapped: a store error is a 401, never a 500, so the client takes its sign-out path instead of
   retrying a request that may already have spent its token.
2. **Account re-checked in the handler.** This route is not a Better Auth endpoint, so
   `hooks.before` (and its ACTIVE gate, `lib/auth/server.ts` session-bound block) never runs for
   it. The handler resolves the credential through `getViewerFromHeaders` (HMAC verified by the
   bearer plugin, user must be ACTIVE) and then requires an ACTIVE membership in an ACTIVE
   workspace.
3. **Replay detection.** `spent_refresh_tokens` holds one row per rotated-out token: `token_hash`
   (sha256 hex, unique), `family_id`, `expires_at`, `created_at`. The family of a sign-in session
   is its own session id; every minted successor carries the same `family_id`. A refresh
   presenting a token with no session row but a ledger row deletes every session in that family
   (newest included) and returns 401. Only digests are stored.
4. **Rate limit.** The existing limiter (`lib/auth/rate-limit.ts`), two buckets:
   `tok:refresh:<sha256>` and `userLimitKey("refresh", userId)`, both 20 per 600 s. The token
   bucket is consumed before any session read, so a garbage token cannot drive DB lookups. A trip
   is 429 `rate_limited` and spends nothing.
5. **Lifetimes, decided against the code.** Today `lib/auth/server.ts` sets `expiresIn` 7 days with
   `updateAge` 1 day, which is rolling: a web session that keeps being used never expires. The
   Haze report's "30 days, rotate at 7" would lengthen that, so it was not copied. A minted app
   token gets 7 days from issue and the response carries `rotateAt` at 80 percent of that life
   (5.6 days); the shell rotates on or shortly after `rotateAt` with jitter. A stolen token is
   therefore dead at most 5.6 days after the last rotation, and immediately on the first replay.
   The row's `expires_at` can still be extended by Better Auth's `updateAge` rolling while the app
   keeps sending requests; the client's rotation schedule is what bounds the token's useful life,
   and the 7-day expiry is the backstop for an app that stops calling refresh. Web cookie sessions
   are untouched by all of this.
6. **No token in any log.** The route logs nothing. A test captures every console call made while
   rotating and replaying and fails if any minted token appears in it; the grep in the acceptance
   section is the second check.
7. **Trusted IP header path.** `resolveTrustedClientIp` (already in `lib/auth/rate-limit.ts`, until
   now unused) is the single source for `ip_address` on a refreshed session: it reads only the
   header named by `AUTH_TRUSTED_IP_HEADER`, requires exactly one well-formed address, and returns
   null otherwise, so no forwarded header is trusted or recorded when the variable is unset.
   `.env.example` documents that.
8. **AUTH-CLIENT fix.** The reset-link choice in `lib/auth/server.ts` now queries the client profile
   with `workspace: { status: ACTIVE, members: { some: { userId, role: CLIENT, status: ACTIVE } }
   }`. A profile alone no longer routes a staff member or a removed member to `/me`.
9. **Docs.** `docs/mobile/PWA-CAPACITOR-SCOPE.md`: the "no rotation exists" paragraph is replaced
   with the contract (rotate on schedule, 401 means sign out and never retry, 429 means back off, a
   replayed token revokes the family, a cookie session is never accepted here).

## Gates

All run from the worktree on node v26.12.1.

| gate                          | command                                                          | exit |
| ----------------------------- | ---------------------------------------------------------------- | ---- |
| install (root)                | `npm ci`                                                         | 0    |
| install (frontend)            | `cd frontend && npm ci`                                          | 0    |
| index generate                | `npm run index`                                                  | 0    |
| index verify                  | `npm run index:check`                                            | 0    |
| format                        | `npx prettier --check .`                                         | 0    |
| types                         | `npm run typecheck`                                              | 0    |
| lint                          | `npm run lint`                                                   | 0    |
| unit                          | `npm run test`                                                   | 0    |
| integration                   | `INTEGRATION_DATABASE_URL=$DATABASE_URL npm run test:integration` | 0    |
| build (root, `NODE_ENV` unset) | `unset NODE_ENV; npm run build`                                  | 0    |
| build (frontend)              | `cd frontend && npm run build`                                   | 0    |

## Bite and restore

Each guard was removed, the covering test run alone, and the guard restored (the tree was verified
clean against the commit between steps). Command:
`npx vitest run --config vitest.integration.config.ts tests/integration/auth-rotate.test.ts -t "<case>"`.

**1. Spend before issue** (case: two concurrent refreshes).
Bite: mint the replacement and delete the old row afterwards, dropping the ledger write.
Output: `AssertionError: expected [ 200, 200 ] to deeply equal [ 200, 401 ]` (`Tests 1 failed`).
Also measured, worth recording: weakening only `if (spent.count !== 1)` to `count > 1` leaves the
case green, because the loser is then refused by the unique index on
`spent_refresh_tokens.token_hash`. Two independent layers, the atomic delete being the cheap one.

**2. Family revocation on replay** (case: replaying a rotated-out token kills the whole family).
Bite: remove the `session.deleteMany` from the replay branch.
Output: `AssertionError: expected 1 to be +0` at the "newest token is gone" assertion (`Tests 1
failed`).

**3. Membership gate** (case: workspace membership gone).
Bite: remove `if (!membership) return unauthenticated()`.
Output: `AssertionError: expected 200 to be 401` (`Tests 1 failed`).

**4. Deactivated account** (case: refuses a deactivated account).
Bite, first attempt: remove the route's viewer check only. Output: `Tests 1 passed`. The case
stayed green because Better Auth's ACTIVE hook deletes the sessions during the `getSession` call
the route makes, so the spend then finds no row. The property has three layers (the hook, the
`lib/auth/viewer.ts` ACTIVE check, the route check). Bite, second attempt: remove all three.
Output: `AssertionError: expected 200 to be 401` (`Tests 1 failed`). Restored, green.

**5. Account throttle** (case: trips at 20 refreshes per 10 minutes).
Bite: remove the account bucket consume and its 429 branch.
Output: `AssertionError: expected 200 to be 429` (`Tests 1 failed`).

**6. No token in logs** (case: writes no token into any log line).
Bite: add `console.log("refresh for token", token, "hash", hashToken(token))` to the handler.
Output: `AssertionError: expected 'refresh for token HODO<redacted>...' not to contain
'HODO<redacted>'` (`Tests 1 failed`). The full line stays in the scratch log, not here: it is a
token, which is the point. Restored, green.

**7. Reset-link membership rule** (case: `/me` reset link only for an ACTIVE CLIENT member).
Bite: drop the `workspace.members` clause, keeping the unarchived-profile condition.
Output: `AssertionError: expected '/me/reset' to be '/reset'` (`Tests 1 failed`).

**8. Bearer only** (case: never accepts a cookie credential).
Bite: let the handler read the session cookie as a fallback credential.
Output: `AssertionError: expected 200 to be 401` (`Tests 1 failed`).

## Acceptance

| bullet                                                              | proven by                                                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| rotate returns a new token, the old one dead server side (401)       | `mints a new token and kills the old one server side`                                                       |
| two concurrent refreshes: exactly one succeeds                       | `lets exactly one of two concurrent refreshes with the same token win`                                      |
| replaying a rotated-out token kills the family, newest included      | `replaying a rotated-out token kills the whole family`                                                      |
| deactivated account or removed membership cannot refresh             | `refuses a deactivated account`, `refuses when the workspace membership is gone`                            |
| rate limit trips at the threshold                                    | `trips the account throttle at 20 refreshes per 10 minutes`                                                 |
| web cookie session unaffected                                        | `never accepts a cookie credential and never touches another session`                                       |
| no token string in any log line                                      | `writes no token into any log line` plus the log grep below                                                 |
| `/me` reset link only for CLIENT members                             | `picks the /me reset link only for an ACTIVE CLIENT member`                                                 |
| all gates 0                                                          | the gate table above                                                                                        |

Log grep: the test writes the raw tokens it minted to `AUTH_ROTATE_TOKEN_FILE` (outside the test
log on purpose), then `grep -F -f <that file> <vitest log>` finds nothing.

## Not done / residual

- The fail-closed catch (a store error becomes 401, never 500) has no test: proving it needs fault
  injection into Prisma mid-request. It is a plain `try`/`catch` around the whole handler, but it is
  not bite-proven.
- Deletion of expired `spent_refresh_tokens` rows is not implemented. The table grows by one row
  per rotation (roughly one per device per 5.6 days), which is small but unbounded. Upgrade path:
  a `deleteMany({ where: { expiresAt: { lt: now } } })` on refresh, or a cron.
- A client that fires two refreshes with the same token concurrently and loses the race can be
  logged out of its family if the loser arrives after the winner's ledger write. That is the
  intended replay behaviour, and the shell contract tells clients to serialise refresh.
