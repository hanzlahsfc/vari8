# S1-F2B task record — account-security foundation

Slice **S1-F2B** of Stage 1 (per `docs/tasks/s1-f2b-orchestration-plan.md` §2).
Implements the four foundations future orchestration needs — **no invitation or
password-reset service, no routes, no email.** Basis: S1-F0/F1/F2A all
independently PASS at `fb0713b`; plan commit `9902214`.

## Implementation plan

### Part A — account-scoped audit

- `db/schema.prisma`: `AuditScope` enum (`WORKSPACE`|`ACCOUNT`);
  `AuditEvent.scope` (required, default `WORKSPACE`); `workspaceId` nullable;
  `subjectUserId` nullable → `User` `Restrict`; `@@index([subjectUserId, at])`;
  `AuditAction` += `PASSWORD_RESET`.
- Migration `20260930170000_stage1_account_security` (additive): create enum,
  add `scope` default/backfill `WORKSPACE`, add `subject_user_id`, drop
  `workspace_id` NOT NULL, subject FK `Restrict`, index, two named CHECKs —
  `audit_event_workspace_scope_shape` (`scope<>'WORKSPACE' OR (workspace_id NOT
NULL AND subject_user_id IS NULL)`) and `audit_event_account_scope_shape`
  (`scope<>'ACCOUNT' OR (subject_user_id NOT NULL AND workspace_id IS NULL)`).
  No row drops/recreates; existing rows verified equivalent + `WORKSPACE`.
- `lib/audit.ts`: `scope:"WORKSPACE"` in `buildAuditEvent` (S1-E callers
  unchanged); `AUDIT_ACTIONS`/`AUDIT_RESOURCE_TYPES` extended (`PASSWORD_RESET`,
  `access_token`, `user`) — closed sets stay closed; `listAuditEvents` adds
  `scope:"WORKSPACE"` predicate. New `writeAccountAuditEvent(tx, …)` —
  tx-client only, requires `subjectUserId`, nullable actor, accepts only
  `PASSWORD_RESET` action over `user`/`access_token` resources, same meta
  allowlist. New `listAccountAuditEvents` — internal primitive (no route),
  exact `subjectUserId` + `scope:"ACCOUNT"`, default 25 / max 100 via
  `normalizeLimit`, id-cursor, minimal fields.

### Part B — password policy (`lib/password-policy.ts`)

`validatePasswordPolicy(candidate) → string`: NFC normalize, count code points
(iteration, not `String.length`), 10–128, structural `password_too_short` /
`password_too_long`, returns the normalized string. No trimming/folding/
composition rules/NFKC. `lib/password.ts`: `hashPassword`/`verifyPassword`
normalize to NFC internally so both boundaries canonicalize identically.
Non-NFC pre-existing dev hashes may stop verifying — dev-only, recreate the
user; no hash migration.

### Part C — `sessionVersion` → JWT

`auth.ts` callbacks wrap `authConfig.callbacks`: `jwt` embeds `token.sv =
user.sessionVersion` (integer ≥0); `session` delegates then gates through a
fresh indexed PK read (`id`,`status`,`sessionVersion`) — rejects (null
session, indistinguishable from expired) on missing user, non-ACTIVE status,
missing/malformed/non-integer/negative `sv`, or `sv` mismatch. Legacy JWTs
without `sv` reject. `auth.config.ts` stays Prisma-free; the DB gate lives in
Node-side auth only. `authorizeCredentials`/`CredentialRecord`/
`AuthorizedUser` gain `sessionVersion`. Type augmentations for `JWT.sv` and
`User.sessionVersion`.

### Part D — 30-day cleanup

`cleanupTerminalAccessTokens(db, {now?})` in `lib/tokens/store.ts`: CTE
`SELECT id … ORDER BY id LIMIT 1000` + `DELETE … RETURNING`. Victim predicate:
consumed+revoked → `GREATEST(consumed_at, revoked_at)`; consumed-only →
`consumed_at`; revoked-only → `revoked_at`; neither → `expires_at` — each must
be older than `now − 30d`. Active rows are structurally un-selectable.
Retryable, concurrent-safe, no unbounded `deleteMany`, structural non-secret
errors, accepts client or tx (no hidden global).

### Part E — exposure

`assertTokenFlowsExternallyExposable` +
`assertTokenPrimitivesExternallyExposable` stay closed; new
`assertAccountAuditExternallyExposable` in `lib/audit.ts` and a comment refresh
documenting that orchestration/provider/rate-limit/routes/UI-review are still
missing. No `app/`/route import of any new surface.

## RED plan

- Integration: `s1-f2b-account-audit.test.ts` fails on missing scope/CHECKs/
  writer/reader; `s1-f2b-session.test.ts` fails on missing `sv` behavior;
  `s1-f2b-token-cleanup.test.ts` fails on missing function.
- Unit: `password-policy.test.ts`, `session-version.test.ts` fail on absent
  modules.

## Rollback strategy

All changes additive; `workspace_id` NOT NULL removal is the only relaxation —
a revert restores the prior migration chain. No row is destroyed or rewritten
except the `scope` column addition backfilled `WORKSPACE`.

## Gates

Full suite on disposable PG (`s1f2b_*`): diff-check, `npm ci`, prisma
format/validate/generate, migrate deploy+status, format:check, typecheck,
lint, `npm run test`, `test:integration`, build, `test:e2e`; `npm audit`
inspect-only. Disposable DBs dropped after.

## Review requirement

Independent **different-model** review of the whole S1-F2B diff is mandatory
before S1-F2C/2D or any route work. Builder (SWE-2 High) does not approve.

---

## Implementation record (2026-09-30, builder: SWE-2 High)

**Commits:** `540c4e2` plan · `3db9e6d` audit schema/service · `4bdf118`
password/session/cleanup · test-strengthening + docs commits after mutation
review.

### Files/schema changed

- `db/schema.prisma`: `AuditScope` enum; `AuditEvent.scope` (+`WORKSPACE`
  default), `workspaceId`→nullable, `subjectUserId`→`User` (`Restrict`),
  `@@index([subjectUserId, at])`; `AuditAction` += `PASSWORD_RESET`.
- `db/migrations/20260930170000_stage1_account_security/migration.sql` —
  additive; named CHECKs `audit_event_workspace_scope_shape` /
  `audit_event_account_scope_shape`; index `audit_event_subject_user_id_at_idx`.
- `lib/audit.ts`: `AUDIT_ACTIONS`/`AUDIT_RESOURCE_TYPES` extended;
  `ACCOUNT_AUDIT_ACTIONS`/`ACCOUNT_AUDIT_RESOURCES`; `buildAccountAuditEvent`,
  `writeAccountAuditEvent` (tx-only, P2034 pass-through);
  `listAccountAuditEvents` (internal, subject+ACCOUNT locked, 25/100 bounded,
  minimal fields); workspace writer emits `scope:"WORKSPACE"`; `listAuditEvents`
  hard-filters `scope:"WORKSPACE"`.
- `lib/password-policy.ts` (new): `validatePasswordPolicy` → NFC-normalized
  string; 10–128 code points; structural `password_too_short`/`password_too_long`.
- `lib/password.ts`: NFC at both hash and verify boundaries.
- `lib/credentials.ts`: `sessionVersion` on `CredentialRecord`/`AuthorizedUser`.
- `lib/auth/session.ts` (new): `isValidSessionVersionClaim`,
  `sessionVersionAllowed` (fresh PK read, fail-closed),
  `prismaSessionUserLookup`, `createSessionCallbacks`, `authNodeCallbacks`
  (the object wired into `auth.ts`); `JWT.sv`/`User.sessionVersion` module
  augmentations.
- `auth.ts`: credentials select += `sessionVersion`; `callbacks:
authNodeCallbacks` (base callbacks delegated, `auth.config.ts` still
  Prisma-free).
- `lib/tokens/store.ts`: `ACCESS_TOKEN_TERMINAL_RETENTION_MS` (30d),
  `ACCESS_TOKEN_CLEANUP_BATCH_LIMIT` (1000), `cleanupTerminalAccessTokens`
  (CTE + DELETE…RETURNING).
- `lib/tokens.ts`: `assertAccountSecurityExternallyExposable` + updated
  boundary comment.

### RED evidence

- `s1-f2b-account-audit.test.ts` on a DB deployed **without** the new
  migration: **6 failed / 10** (missing scope column, CHECKs, writer/reader
  functions), then 10/10 on the deployed schema.
- Unit files (`password-policy`, `session-version`, `audit` account-reader
  tests, `token-exposure` assertion) exercised RED via absent modules at
  authoring time; cleanup file failed before implementation (module function
  absent).

### Backfill/migration evidence

- `migrate deploy` applies the migration cleanly over existing rows: existing
  events keep `workspace_id` and get `scope=WORKSPACE` by column default;
  verified by the S1-E regression suite (14 tests) staying green and by the
  deployed-schema tests (scope+shape rows present/absent as required).
- Wrong ownership shapes all rejected at the DB (4/4 shape tests).

### Session invalidation evidence (real)

On disposable migrated PostgreSQL, through the actual `createSessionCallbacks`
composition: sign-in JWT embedded `sv=0` and yielded a session; `UPDATE users
SET session_version = session_version + 1` made the same JWT return `null`
(indistinguishable from expired); a fresh sign-in embedded `sv=1` and
succeeded. `DEACTIVATED`/`INVITED` users rejected even with matching `sv`;
missing/malformed/non-integer/negative `sv` rejected; invalid credentials stay
generically null. Browser-level flow evidence lands with the routing slice —
no protected route exists yet to observe through UI.

### Cleanup evidence

Four terminal shapes verified (consumed / revoked / consumed+revoked GREATEST /
expired-only) deleted only past 30 days; consumed+revoked retained until 30
days after the LATER timestamp; active and <30d rows untouched; 1007 seeded
rows → exactly 1000 then 7 then 0; 3 concurrent calls → exactly 50 total
deletions, no double-delete; broken client → `token_store_failed`, no SQL/conn
text in the error.

### Mutation evidence (14 — all caught, all restored byte-for-byte)

| #   | Mutation                                                       | Detection                                                                    |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | `audit_event_account_scope_shape` dropped in DB                | 1 integration fail                                                           |
| 2   | `scope:"WORKSPACE"` removed from `listAuditEvents`             | 1 unit fail (new spy test — the workspace_id predicate alone was masking it) |
| 3   | `subjectUserId` removed from account listing where             | 1 unit + 2 integration fails                                                 |
| 4   | metadata allowlist bypass                                      | 35 unit fails                                                                |
| 5   | code-point → UTF-16 `length`                                   | 1 unit fail                                                                  |
| 6   | NFC removed in `hashPassword`                                  | initially masked (policy+verify normalize); direct-call test added → 1 fail  |
| 7   | password embedded in error message                             | 2 unit fails                                                                 |
| 8   | `sessionVersion === sv` → `true`                               | 2 unit + 1 integration fails                                                 |
| 9   | gate returns `true` on missing `sv`                            | 2 unit fails                                                                 |
| 10  | status re-read removed                                         | 1 unit + 1 integration fails                                                 |
| 11  | session callback bypasses gate (`if (false)`)                  | 1 unit + 4 integration fails                                                 |
| 12  | cleanup `LIMIT 1000` removed                                   | 1 integration fail (1007 deleted in one call)                                |
| 13  | `GREATEST(consumed,revoked)` → `consumed_at`                   | 3 integration fails                                                          |
| 14  | `expires_at < cutoff` removed from the never-terminated branch | 3 integration fails (active rows deleted)                                    |

All files `shasum`-verified restored after each mutation.

### Gates (fresh disposable `s1f2b_*`, real PG)

`git diff --check` 0 · `npm ci` 0 (audit: 1 mod + 4 high — unchanged posture,
no `--force`, no upgrades) · `prisma format`/`validate`/`generate` 0 ·
`migrate deploy` 0 (8 migrations; also applied to `app_dev`) ·
`migrate status` 0 · `format:check` 0 · `typecheck` 0 · `lint` 0 ·
`npm run test` 0 (**308**/30 files) · `test:integration` 0 (**122**/10 files)
· `build` 0 · `test:e2e` 0 (**21**). No `app/`/route file imports the new
surface.

### Scope confirmations

No invitation orchestration/acceptance, no reset request/consume service, no
password-change service, no membership/profile transitions, no coach-invite
RBAC change, no email delivery, no routes/API/actions/UI, no rate limiting, no
existence responses, no cross-workspace sharing. No S1-F2C/D, S1-G, S1-H.

### Review status

**Builder: SWE-2 High. Independent different-model review: PENDING — required
before S1-F2C or any orchestration work.**

---

## Independent review + repair record (2026-09-30)

**Independent review (opencode-go / deepseek-v4.1-flash) at `ac9857e`:
FAIL.** Findings and repairs (repair plan: `docs/tasks/s1-f2b-repair-plan.md`):

1. **P0 — `auth()` bypass.** The session callback returned
   `null as unknown as Session`, but `next-auth/lib/index.js` `getSession()`
   coalesces a nullish session-callback result to the token-derived DEFAULT
   session (`?? { ...args[0].session, expires }`) — `auth()` stayed
   authenticated on every rejection. Verified in installed
   next-auth@5.0.0-beta.32 / @auth/core@0.41.3. **Repair:** the gate moved to
   the `jwt` callback — its return type is `Awaitable<JWT | null>` and
   `actions.session` treats `null` as invalidation (null body +
   `sessionStore.clean()` cookie clearing) on BOTH the `/api/auth/session`
   route and the `auth()`/`getSession` path. The `session` callback is pure
   base delegation; a null token never reaches it. New runtime test
   `tests/integration/s1-f2b-session-runtime.test.ts` drives the real exported
   `auth()` + `handlers.GET/POST` (vitest stubs only `next/headers` +
   `next/server`, inlined `next-auth`) with real signed JWT cookies: valid
   session authenticates; version bump → `auth()` null AND endpoint null +
   expired-cookie `Set-Cookie`; missing/malformed/non-integer/negative `sv`,
   INVITED/DEACTIVATED/unknown users, malformed `sub`, and DB failure all →
   null; update-trigger payloads cannot inject `sv` (CSRF-guarded at the route
   AND ignored in the callback). **RED:** 6/7 runtime tests failed on the old
   implementation — the bypass reproduced end-to-end.
2. **P2 — account-reader index mismatch.** Reader paginates by `id`; added
   additive `(subject_user_id, id)` index
   (`audit_event_subject_user_id_id_idx`) and kept the id cursor. EXPLAIN on a
   6000-row ANALYZEd fixture uses the index (no seqscan); the planner may still
   choose otherwise on small tables — documented, not exaggerated.
3. **P3 — cleanup query/index.** Added `access_token_terminal_cleanup_idx`, an
   expression index on (effective-terminal-ts, id); `CLEANUP_VICTIMS_SQL`
   rewritten to the same expression, `ORDER BY expr, id LIMIT 1000` — the index
   serves WHERE+ORDER+LIMIT. Semantics identical: later of consumed/revoked,
   else expires_at; active rows never selectable. EXPLAIN on a 6000-row
   ANALYZEd fixture shows the index scan, no seqscan.
4. **P3 — deliberate composition.** `createSessionCallbacks` spreads base
   callbacks (`authorized`, future keys survive) and overrides only
   `jwt`/`session`. `null as unknown as Session` removed; base-null jwt
   propagates null.

**Migration:** `20260930180000_stage1_f2b_review_indexes` — additive, two
`CREATE INDEX` only; `20260930170000` untouched; all prior constraints/indexes
verified live.

**Repair mutations (8, all caught, restored byte-exact):** jwt gate bypassed
(6 runtime fails) · missing-sv accepted (1 runtime) · status/version/DB-error
checks bypassed (5 runtime) · update payload writes `sv` (1 unit; route-level
POST is CSRF-blocked upstream) · composition spread removed (1 unit) · audit
index dropped (2 integration) · cleanup GREATEST→LEAST (1 integration) ·
cleanup LIMIT removed (1 integration).

**Gates (fresh `s1f2b_verify`):** diff-check 0 · format/validate/generate 0 ·
deploy 0 (9 migrations) · status 0 · format:check 0 · typecheck 0 · lint 0 ·
unit **309** · integration **131**/11 files · build 0 · e2e **21**.

**Remaining risks:** `auth()` path does not surface the cleared cookie header
to clients (the token itself is dead — cookie cleanup lands on the next
`/api/auth/session` or sign-in attempt); planner freedom on small tables is
documented, not guaranteed.

**Review status: REPAIRED — independent DeepSeek re-review PENDING.**
S1-F2B is not approved.

---

## Independent re-review of the repair — PASS (2026-09-30)

**Reviewer:** `opencode-go/deepseek-v4.1-flash` (a different model from the
builder, SWE-2 High — independence holds). Repair range `ac9857e..ae7c6d5`,
full S1-F2B range `87a6e85..ae7c6d5`, HEAD
`ae7c6d5a00d2eb63f387de681c7ef2c182fd1d07`. Read-only: no production code,
test, schema, or migration was edited by the reviewer.

**P0 — real-pipeline revocation independently reproduced.** The reviewer drove
the installed `next-auth@5.0.0-beta.32` pipeline itself, independent of the
builder's tests:

- `auth({req,res})` (the `getSession` path used by route handlers/
  `getServerSideProps`; RSC `auth()` uses the same wrapper) now returns `null`
  for: legacy token without `sv`; stale `sv` after a DB bump; malformed
  `sv` (`"0"`); malformed `sub` (`42`); DEACTIVATED; INVITED; unknown user;
  deleted user; and a forced DB failure (table renamed). A valid ACTIVE token
  (`sv` matches) authenticates; after a DB bump a fresh `sv=1` authenticates
  again.
- `/api/auth/session` returns `200` with body `null` and a cookie-clearing
  `Set-Cookie` (`Max-Age=0`) for a stale token; returns the user for a valid one.
- A real credentials sign-in through `handlers` issued `sv` equal to the row's
  current `sessionVersion` (`sv=0`, `sub` correct).
- Update-path injection: with a valid CSRF token, a client `{data:{sv:999}}`
  update on a valid session re-issued the token with `sv` unchanged; the same
  injection on a stale session produced `null` body and stayed unauthenticated.
  The old defect (server `auth()` still authenticated after bump/inactive/
  unknown/deleted/DB-failure) is gone; the `null as unknown as Session` cast is
  removed and the gate is on the type-supported `Awaitable<JWT | null>` return.

**P2/P3 — indexes and semantics independently verified on fresh PostgreSQL.**
On an independently seeded + `ANALYZE`d fixture (6,000+ account rows per
subject; 11,008 access-token rows): `EXPLAIN` shows `Index Scan using
audit_event_subject_user_id_id_idx` (no sort) for the reader, and `Index Scan
using access_token_terminal_cleanup_idx` (no sort, `LIMIT 1000`) for cleanup.
The rewritten effective-terminal-timestamp predicate was compared to the
original four-branch predicate across all 11,008 rows, including boundary
shapes (consumed-only, revoked-only, expired-only, consumed+revoked with the
later timestamp recent, exact-30-day, active): **0 disagreements**.

**P4 — composition.** `createSessionCallbacks` spreads the base callbacks and
overrides only `jwt`/`session`; a runtime/unit check confirms base keys survive
and a null/invalid token cannot be resurrected by a later callback.

**Migration safety.** `20260930180000_stage1_f2b_review_indexes` is additive
(two `CREATE INDEX` only); the published `20260930170000` is byte-untouched;
all prior `audit_event`/`access_token` CHECKs, FKs, and indexes remain live.

**Independent mutation checks (temporary, restored byte-exact).** Reviewer
reproduced and confirmed tests bite for: jwt gate bypassed (6 runtime
failures); status/version/DB-error checks bypassed (4 runtime); update payload
writes `sv` (1 unit); `...base` composition removed (1 unit); audit index
dropped (2 integration); cleanup `GREATEST`→`LEAST` (1 integration); cleanup
`LIMIT` removed (1 integration). All files restored to baseline `shasum`; no
mutation markers remain.

**Gates (fresh disposable PG, reviewer-run):** `git diff --check` 0 · `npm ci`
0 · prisma format (no diff)/validate/generate 0 · migrate deploy 0 (9) ·
migrate status 0 · `format:check` 0 · `typecheck` 0 · `lint` 0 · unit **309** ·
integration **131**/11 files · build 0 · e2e **21** · `npm audit` 1 moderate +
4 high (unchanged; no `--force`).

**Remaining risks / observations (non-blocking):** the `auth()` RSC path does
not surface the cleared cookie header (token is dead; cookie cleanup lands on
the next `/api/auth/session` or sign-in); planner index choice is not guaranteed
on tiny tables (documented, proven on an analyzed fixture); no protected route
exists yet, so browser-level enforcement is covered by the runtime harness, not
E2E; the duplicate `## 12` heading pattern in `TRACKER 2.0.md` pre-dates this
repair.

**Independent re-review verdict: PASS.** S1-F2B is independently reviewed.
S1-F2C/S1-F2D remain blocked only on their own future reviews, not on S1-F2B.
