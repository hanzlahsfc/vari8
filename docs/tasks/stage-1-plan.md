# Stage 1 plan — multi-tenant security foundation

**Plan only. No migration and no Stage 1 production code in this task.** Status: **independent
review PASS** (initial review FAILed with 14 findings; all repaired and re-checked). At the time
of this plan, Stage 1 implementation had **not started**. Sources: `TRACKER 2.0.md` §7 Stage 1,
locked
decisions (`docs/product-decisions.md`), the CRE8 input-flow overview (evidence only), and the
Prime State `aa59905` security structure (engineering patterns only).

Detailed designs: `docs/security/data-ownership.md`, `docs/security/authorization-model.md`,
`docs/security/consent-audit.md`.

## 1. Objective / non-goals

Build the identity, tenancy, ownership, and authorization foundation **before** any product
health persistence. Non-goals: no workspace/client CRUD UI beyond what is needed to test, no
Daily Tracker persistence, no workbook formulas, no PED/HRT feature, no product UI redesign,
no provider migration, no registration/password-reset implementation until policy is approved.

**i18n:** `TRACKER 2.0.md` Stage 1 lists "i18n-ready routing/message structure", but
`docs/open-questions.md` says not to add i18n now. Resolution: keep authorization/message
structure i18n-ready (no user-facing strings hard-coded in authorization), but **do not add
localization in Stage 1**; the conflict is recorded and locales remain `TODO(human)`.

## 2. Tenant and identity model

Prisma + PostgreSQL. Proposed models (fields indicative; final names reviewed before migration):

- `User` (extend existing minimal model): `id`, `email` (citext unique), `name`,
  `platformRole` (`PLATFORM_ADMIN | USER`, default `USER`), `status`
  (`ACTIVE | DEACTIVATED | INVITED`), `passwordHash?`, timestamps.
- `Workspace`: `id`, `name`, `slug` (unique), `status`, timestamps. Owner is expressed via a
  `WorkspaceMember` with role `WORKSPACE_OWNER` (not a single FK).
- `WorkspaceMember`: `id`, `workspaceId` (required), `userId` (required), `role`
  (`WORKSPACE_OWNER | COACH | ASSISTANT_COACH | SUPPORT | CLIENT`), `status`
  (`INVITED | ACTIVE | SUSPENDED | REMOVED`), `joinedAt`; `@@unique([workspaceId,userId])`.
- `CoachProfile`: `id`, `workspaceMemberId` (unique, required), `displayName`, timestamps.
- `ClientProfile`: `id`, `workspaceId` (required), `userId?` (client login, unique when set),
  `name`, `status`, timestamps.
- `ClientAssignment`: `id`, `workspaceId` (required; must equal the client's and coach's
  workspace), `clientProfileId` (required), `coachMemberId` (required, `WorkspaceMember` in the
  same workspace), `role` (`PRIMARY | COACH`), `status` (`ACTIVE | REMOVED`), `assignedAt`;
  `@@unique([clientProfileId, coachMemberId])`. Writes validate the same-workspace invariant.
  **Multiple assigned coaches supported; no single-coach assumption.** Managed by the workspace
  OWNER; a coach cannot self-assign; every change is audited (see `authorization-model.md`).

Ownership: see `data-ownership.md` — every client belongs to one workspace; every health record
belongs to one `ClientProfile`; coaches never own data; assignment (not a column) grants access.

## 3. Authorization

Default-deny guard + role/resource/action matrix with scopes `own | assigned | workspace |
platform | denied`. Full matrix and the required denial cases: `authorization-model.md`.
Enforced in **server code** at every boundary; list queries scope in the `where`; UI hiding is
never authorization. **Role/status are read from the database per request** (not trusted from
stale JWT claims); each request is scoped to exactly one workspace, whose `workspaceId` is
validated against an ACTIVE membership. Reuses Prime State's guard shape and RBAC-as-data,
replacing `coach_user_id` with a workspace-scoped assignment lookup.

## 4. Consent and health-data handling

Versioned, append-only consent records; operations that require consent; revoked/version
semantics; combination with role+assignment; PED/HRT gated. Full design + tests:
`consent-audit.md` §1.

## 5. Audit logging

Metadata-only `AuditEvent` (actor, workspace, action, resourceType/Id, subjectClientProfileId,
result, reason, at, ip, meta). Never health values/note bodies/credentials/tokens/file contents.
Audited set and access/retention: `consent-audit.md` §2.

## 6. Invitations and recovery

Purpose-scoped, **hashed**, expiring, single-use tokens: `WORKSPACE_INVITE`, `PASSWORD_RESET`,
`EMAIL_VERIFICATION` (later). Model `AccessToken`: `id`, `purpose`, `tokenHash` (store hash, not
raw), `targetEmail`, `workspaceId?`, `createdByUserId`, `expiresAt`, `consumedAt?`.
Single-use = consume by hash in one transaction; expired/used ⇒ reject. **Registration,
invitations, and password reset are not implemented until their product policy is approved**
(`TODO(human)`).

## 7. GDPR / privacy boundaries

- **Export:** client-own export resolved from the actor (no client-id parameter); section
  allowlist + counts manifest; audited once.
- **Deletion vs anonymization:** two explicit paths; child-before-parent FK cascade; private
  objects removed **before** the DB transaction; anonymize an in-place shell (no hard-delete of
  the workspace).
- **Retention hooks:** policy represented as data with `TODO(human)` durations; no invented
  durations and no automatic deletion job yet.
- **Workspace departure:** removing a `WorkspaceMember`/`ClientAssignment` revokes access; data
  stays workspace-owned unless exported/erased.
- **User-account deletion:** separate from client data; audit `actorUserId` nulled, structural
  audit rows retained.
- **Object storage:** private bucket, no ACL, server-generated presigned GET (short TTL), keys
  prefixed by workspace + client.

## 8. Database/provider boundary

Prisma + PostgreSQL remain the approved architecture. Supabase may later host PostgreSQL, but
**no Supabase Auth, Storage, RLS, or vendor-specific APIs** without an explicit decision and
migration plan. Authorization is enforced in application/server code even if DB-level
protections (e.g. RLS) are added later.

## 9. Migration and implementation sequence

Each slice is independently reviewable and reversible. No slice is started in this task.

| Slice                                   | Schema/code paths                                                  | RED tests                                                                 | Focused verify                        | Full gates                       | Browser behavior                    | Rollback                            |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------- | -------------------------------- | ----------------------------------- | ----------------------------------- |
| **S1-A** Identity & tenancy             | `db/schema.prisma`, `db/migrations/*_stage1_identity_tenancy`      | schema tests: required FKs, `@@unique` pairs, no client without workspace | `npx prisma validate`, focused vitest | format/typecheck/lint/test/build | n/a                                 | migration down / revert branch      |
| **S1-B** Authorization core             | `lib/auth/rbac.ts`, `lib/auth/guard.ts`, `lib/workspace/access.ts` | matrix unit tests; deny-by-default cases                                  | focused vitest                        | full gates                       | n/a                                 | revert files                        |
| **S1-C** Client ownership & assignments | `lib/workspace/clients.ts`, `ClientAssignment` tests               | cross-workspace, unassigned, client-A/B denials                           | integration vitest                    | full gates                       | 403 on guessed route                | revert                              |
| **S1-D** Consent                        | `lib/consent.ts`, `db/schema.prisma` (`ConsentRecord`)             | consent gate, revoke, version bump                                        | focused vitest                        | full gates                       | consent-required flows fail closed  | revert                              |
| **S1-E** Audit                          | `lib/audit.ts`, `lib/log.ts` redaction, `AuditEvent`               | deny rows, metadata no-leak canary                                        | focused vitest                        | full gates                       | deny events recorded                | revert                              |
| **S1-F** Invites/recovery               | `lib/tokens.ts`, `AccessToken`                                     | hashed storage, single-use, expiry                                        | focused vitest                        | full gates                       | invite accept flow                  | **BLOCKED** on `TODO(human)` policy |
| **S1-G** GDPR + storage                 | `lib/gdpr/{export,erasure,retention}.ts`, `lib/storage.ts`         | export allowlist; delete vs anonymize; retention is TODO-only             | integration vitest                    | full gates                       | own export/erasure endpoints        | revert                              |
| **S1-H** Workspace shell + 403          | `app/**` route groups, guard wiring, `app/403.tsx`                 | route-level guard tests                                                   | focused vitest                        | full gates + e2e                 | signed-in workspace shell; 403 page | revert                              |

Independent review is required after each slice; a slice is not merged until its own gates pass
on the current tree.

## 10. Acceptance criteria

- Every sensitive record has exactly one explicit owner (`data-ownership.md`).
- Every role/action combination has a defined scope or denial (`authorization-model.md`).
- No permission depends only on navigation/UI hiding.
- Cross-workspace and cross-client denial scenarios are enumerated and testable.
- Consent and audit behavior are concrete enough to test.
- Unresolved policy choices are marked `TODO(human)`.
- No Prime State product assumptions copied.
- No migration or application behavior implemented in this task.

## 11. TODO(human)

Final product name/brand; final role matrix and whether a client may have multiple coaches
(design supports it); owner oversight of cycle/bloodwork; assistant write scope; support access
policy; invite/registration/password-reset policy; PED/HRT access/consent/legal policy;
retention/deletion/anonymization durations; whether platform admins may ever read health data;
consent kinds granularity and offline coach-attested consent; audit retention period; locales.
PRGRSS 2.0 formulas remain blocked on the PRGRSS scripts and/or the missing `.xlsx`.
