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
