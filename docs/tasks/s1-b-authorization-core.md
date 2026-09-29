# S1-B task record — authorization core (RBAC matrix + default-deny guard)

Slice S1-B of Stage 1. **Authorization only.** No client-management services, assignment
mutations, consent, audit persistence, invitations, GDPR, routes, UI, schema, or health/product
persistence.

## Scope / exact paths

- `lib/auth/rbac.ts` — closed unions (Action, Scope, WorkspaceRole, Resource) and the reviewed
  `RBAC_MATRIX` (parity with `docs/security/authorization-model.md`; PED/HRT all denied; support
  denied client data; assistant writes denied; cycle/bloodwork owner+assistant denied; client
  coach-notes denied; platform-admin health/exports denied).
- `lib/auth/guard.ts` — typed `authorize(session, request, repo?)`, `AccessDeniedError`
  (status 403, structural reason, resource/action, no sensitive values), `AuthorizationContext`.
- `lib/workspace/access.ts` — Prisma adapter with narrow selects and workspace-constrained
  queries (no unscoped collections).
- `lib/credentials.ts` / `auth.ts` — deny INACTIVE (DEACTIVATED/INVITED) login with the same
  generic failure; session still carries only the user id.
- Tests: `tests/unit/rbac.test.ts`, `tests/unit/guard.test.ts`,
  `tests/integration/s1-b-authorization.test.ts`.

## Rules

- Session supplies identity only (`session.user.id`); every call re-reads DB state (user status,
  platform role, workspace, membership, role, client ownership, active assignment).
- `own`/`assigned` never find a client globally: the client query includes the workspace.
- Matrix-denied permissions perform **no** client/assignment lookup.
- Status/role/assignment changes take effect on the very next call (no session refresh).
- Unknown resource/action/role/cell fails closed at runtime.

## RED tests

Unit: matrix completeness/parity + runtime fail-closed; guard cases 1–15 (session/user/status/
workspace/membership/denial-before-lookup/own/assigned/removed/cross-workspace/platform/
unknown/safe errors). Integration (real migrated PostgreSQL, synthetic fixtures): owner/coach/
unassigned/assistant/support/client own/other-client/cross-workspace/removed-suspended/
deactivated/assignment-removal/role-change/platform-admin-health/PED/unscoped-queries.

## Commands

`git diff --check`; `npm ci`; `prisma validate/generate/migrate deploy/status`; focused unit +
integration; `format:check`; `typecheck`; `lint`; `test`; `test:integration`; `build`;
`test:e2e`; `git diff eb33a4d -- db/` (must be empty).

## Rollback

Revert the new `lib/auth/*`, `lib/workspace/*`, credentials/auth edits, and tests. No schema or
data change, so no migration rollback needed.

## Exclusions

No routes/UI/403, consent/audit/invitations/GDPR/storage/health/product/schema/RLS/Supabase/i18n.
Integration uses a dedicated disposable DB (`INTEGRATION_DATABASE_URL`), never the app/E2E DB.
