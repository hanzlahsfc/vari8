# S1-A task record — identity and multi-tenant database structure

Slice S1-A of Stage 1 (`docs/tasks/stage-1-plan.md`). **Schema only.** No guards, consent, audit,
tokens, GDPR, health records, or product UI.

## Acceptance (from the task brief)

Add `User` platform fields, `Workspace`, `WorkspaceMember`, `CoachProfile`, `ClientProfile`,
`ClientAssignment`, enums/indexes/relations, one forward migration, and constraint tests that run
against the real migrated PostgreSQL schema. Preserve existing credentials auth and `User` data.
Do not make `passwordHash` nullable.

## Decisions

- **No `citext` in S1-A.** Email stays `String @unique` (as at `20260929000000_init`) and login
  keeps lowercasing in `lib/credentials.ts`. Introducing case-insensitive DB uniqueness would
  change existing authentication semantics; deferred (documented) until reviewed separately.
- **`passwordHash` stays required.** Invitations are not implemented; no nullable change.
- **`ClientProfile` has no lifecycle `status`** in S1-A: the reviewed plan does not define client
  program lifecycle states, so none are invented.
- **`User.status`**: `ACTIVE | DEACTIVATED | INVITED` (per plan), default `ACTIVE`.
  **`User.platformRole`**: `USER | PLATFORM_ADMIN`, default `USER`.
- **`WorkspaceStatus`**: `ACTIVE | SUSPENDED` (no invented archive state), default `ACTIVE`.
  Ownership is a `WorkspaceMember` with role `WORKSPACE_OWNER` (no owner FK).
- **`MemberRole`**: `WORKSPACE_OWNER | COACH | ASSISTANT_COACH | SUPPORT | CLIENT`.
  **`MemberStatus`**: `INVITED | ACTIVE | SUSPENDED | REMOVED`, default `INVITED` (fail-closed).
- **`ClientProfile`**: `workspaceId` required; optional `userId`; workspace-scoped uniqueness
  `@@unique([workspaceId, userId])` (the same identity may be a client in different workspaces).
- **`ClientAssignment`**: required `workspaceId`, `clientProfileId`, `coachMemberId`; role
  `PRIMARY | COACH`; status `ACTIVE | REMOVED`; `@@unique([clientProfileId, coachMemberId])`.
  Multiple coaches supported.
- **Same-workspace invariant enforced in the database** with composite foreign keys
  `(clientProfileId, workspaceId) → ClientProfile(id, workspaceId)` and
  `(coachMemberId, workspaceId) → WorkspaceMember(id, workspaceId)`, backed by composite unique
  keys. Prisma cannot express two relations sharing the `workspaceId` scalar, so these composite
  FKs (and the partial unique index) are added as raw SQL in the migration. **DB-level, not only
  application validation.**
- **At most one ACTIVE PRIMARY assignment per client** enforced by a reviewed partial unique
  index: `CREATE UNIQUE INDEX ... ON client_assignment(client_profile_id) WHERE status='ACTIVE'
AND role='PRIMARY'`. Multiple ACTIVE non-primary coaches remain valid.
- **Deletion safety**: FKs use `Restrict` where deleting a `User`, `Workspace`, or membership
  could delete tenant/client records; `CoachProfile → WorkspaceMember` is `Cascade` (a narrow
  1:1 child); optional `ClientProfile.user → SetNull` (client retained). Full client-erasure
  cascade is deferred to the GDPR slice.
- **Application invariants not provable in the DB** (recorded for later slices): `CoachProfile`'s
  member must have a coach-capable role (S1-B/S1-C); `ClientAssignment.coachMemberId` must be a
  coach-capable member (S1-C).

## Out of scope (must not appear)

ConsentRecord, AuditEvent, AccessToken, RBAC/guard code, invitations/reset, workspace/client CRUD
UI, health/Daily Tracker, food/exercise DB models, PED/HRT, Supabase APIs/Auth/Storage/RLS,
formulas, localization, seed accounts, real personal data.

## Test-first plan

RED tests (`tests/integration/s1-a-identity.test.ts`) against a disposable migrated PostgreSQL DB:
migration applies on top of init; existing `User`/hash survives; credentials still authorize;
duplicate membership rejected; client without workspace impossible; same client `User` linkable in
two workspaces; cross-workspace assignment rejected; multiple same-workspace coaches accepted;
duplicate assignment rejected; >1 ACTIVE PRIMARY rejected; assignment removal keeps the client;
no health/consent/audit/token/product tables exist. Then the schema + migration to pass them.

## Verification (real exit codes)

`git diff --check`, `npm ci`, `npx prisma validate`, `npx prisma generate`, `npx prisma migrate
deploy`, `npx prisma migrate status`, focused S1-A integration tests, `npm run format:check`,
`typecheck`, `lint`, `test`, `build`, `test:e2e`. Behavioral gate = real PostgreSQL migration +
constraint suite (no UI behavior; no browser evidence fabricated).
