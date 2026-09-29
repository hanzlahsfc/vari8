# S1-C task record — guarded client ownership & assignment services

Slice S1-C of Stage 1. **Server-side services only.** No routes, UI, health records, consent,
audit persistence, invitations, GDPR, storage, schema, or workbook logic.

## Scope / paths

- `lib/workspace/clients.ts` — client-profile and assignment services.
- `lib/auth/guard.ts` — add `authorizeCollection` (read/list only); preserve S1-B behavior.
- `lib/workspace/access.ts` — widen the adapter client type to accept a transaction client.
- Tests: `tests/unit/clients-service.test.ts`, `tests/integration/s1-c-client-assignments.test.ts`.

## Service contracts (minimal, structural)

Client profiles:

- `listAccessibleClientProfiles(session, { workspaceId, limit?, cursor? })` → `{ items, nextCursor }`
- `readClientProfile(session, { workspaceId, clientProfileId })` → profile summary
- `createClientProfile(session, { workspaceId, name })` → profile summary
- `updateClientProfileName(session, { workspaceId, clientProfileId, name })` → profile summary

Profile summary = `{ id, workspaceId, name, createdAt, updatedAt }` (no `userId`).

Assignments (OWNER only):

- `listClientAssignments(session, { workspaceId, clientProfileId, limit?, cursor? })` → `{ items, nextCursor }`
- `assignCoach(session, { workspaceId, clientProfileId, coachMemberId, role? })` → structural result
- `setPrimaryCoach(session, { workspaceId, clientProfileId, coachMemberId })` → structural result
- `removeClientAssignment(session, { workspaceId, clientProfileId, coachMemberId })` → structural result

Assignment structural result = `{ clientProfileId, coachMemberId, role, status, changed }` (no names/emails).

## Security rules

- Every operation calls the S1-B guard first; authorization happens before any read/mutation.
- `authorizeCollection(session, { resource, action: "read", workspaceId })` re-reads DB state,
  resolves the matrix, returns only `workspace | assigned | own` scope (denies platform/write/
  unknown), and never returns profile data.
- Query filters are built from the resolved scope and always include `workspaceId`:
  - workspace → `{ workspaceId }`
  - assigned → `{ workspaceId, assignments: { some: { workspaceId, coachMemberId, status: "ACTIVE" } } }`
  - own → `{ workspaceId, userId: actorUserId }`
- `readClientProfile`/`updateClientProfileName` additionally call `authorize` with the
  `clientProfileId` and query with `{ id, workspaceId }` — OWNER workspace scope never validates
  an arbitrary id by itself.
- Lists: default limit 25, clamped to 1..100 (documented contract), stable `orderBy id asc`
  cursor pagination, no unbounded `findMany`.
- No mass assignment: updates take only `name`; `workspaceId`/`userId`/`id`/timestamps/
  assignments/roles are never writable; create accepts no `userId`.
- No delete operation.

## Assignment invariants

Target eligibility: ACTIVE WorkspaceMember in the same workspace + ACTIVE User + coach-capable
role. `COACH` → PRIMARY or COACH; `ASSISTANT_COACH` → **COACH only** (never PRIMARY);
`WORKSPACE_OWNER`/`SUPPORT`/`CLIENT` → not eligible. Coach cannot self-assign (only OWNER calls
assignment mutations).

Behavior: `assignCoach` creates, reactivates REMOVED, or updates role; idempotent no-change when
ACTIVE with same role; primary changes enforce the DB partial unique index. `setPrimaryCoach`
demotes the current different ACTIVE PRIMARY (to COACH) and promotes the target in one
Serializable transaction. `removeClientAssignment` sets status REMOVED (row preserved).

## Transaction / TOCTOU

Writes run inside `prisma.$transaction(..., { isolationLevel: "Serializable" })` using a
**transaction-bound** authorization repo, so revocation between check and write cannot slip
through. Unique/serialization conflicts map to structural errors; no unbounded retries.

## Audit sequencing boundary

`AuditEvent` persistence is S1-E. S1-C adds no audit model/table and no no-op logger. Assignment
mutations return a structural result S1-E can convert into an audit event, and
`assertAssignmentMutationsExternallyExposable()` throws `audit_not_wired_for_external_use` so no
route/action may expose these mutations before S1-E couples audit writing transactionally.

## Errors

`WorkspaceServiceError` with codes: `invalid_input`, `client_not_accessible`,
`member_not_eligible`, `assignment_not_accessible`, `assignment_conflict`,
`serialization_conflict`, `audit_not_wired_for_external_use`. Unauthorized callers get the S1-B
`AccessDeniedError`. Errors never carry names, emails, or other personal values; a foreign client
is indistinguishable from a non-existent one.

## RED tests

Unit: scope→filter mapping; collection auth rejects write/unknown; limit default/clamp; cursor
order; blank name; mass-assignment; target role rules; assistant-primary denial; idempotent
result; structural errors carry no PII; unauthorized performs no mutation; S1-B guard unchanged.
Integration (real PostgreSQL + production guard/services): the 34 listed read/write/assignment
cases.

## Commands

`git diff --check`; `npm ci`; `prisma validate/generate/migrate deploy/status`; focused unit +
integration; `format:check`; `typecheck`; `lint`; `test`; `test:integration`; `build`; `test:e2e`;
`git diff 3adb56f -- db/` (empty).

## Rollback / exclusions

Revert `lib/workspace/clients.ts`, the guard/collection addition, and tests; no schema/data change.
Excluded: routes/actions/UI, login linking/invitations, delete/erasure, health/Daily Tracker,
consent, audit persistence, GDPR, storage, food/exercise models, PED/HRT, workbook logic, RLS,
Supabase, migrations, i18n.
