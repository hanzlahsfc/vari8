# S1-F1 task record — AccessToken schema + session-version foundation

Slice **S1-F1** of Stage 1: the database foundation for S1-F token flows after the
founder's 2026-09-30 answers. Adds the `AccessToken` model, `User.sessionVersion`,
an additive migration with raw CHECK constraints, real-PostgreSQL regression tests,
and a fail-closed external-exposure boundary. **No token lifecycle service exists** —
no issuance, consumption, invitation, reset, email, or route code.

This slice resolves none of the still-open `TODO(human)` items
(`docs/open-questions.md` #21–27; `s1-f-invites-recovery-plan.md` §2.7/2.8/2.10–2.15,
§4.2). Founder answers are recorded in `docs/product-decisions.md` #13–19;
conservative engineering interpretations are recorded separately and marked as not
founder decisions.

## Decision reconciliation summary (Phase A)

Founder answers (relayed by Hanzlah, 2026-09-30):

1. Invite-only initial product; coaches invite clients; public registration later maybe.
2. Product roles: coach, optional assistant coach, client. Owner role's product-facing
   name/semantics open (may be a gym owner).
3. Clients self-onboard via invitation — enter own information; no coach pre-created
   profile. **Consequence: no `clientProfileId` on `AccessToken`.**
4. Users may work with multiple coaches / share plans across them.
5. Invite and reset links expire after **12 hours**; a replacement cancels previous
   matching links.
6. Successful password reset logs the user out on other devices → `User.sessionVersion`.
7. Password rules, email provider, sender identity, product domain: undecided pending
   the product name.

Conservative interpretations (not founder decisions): keep technical `WORKSPACE_OWNER`;
RBAC unchanged; intended future invite policy owner/admin→{COACH, ASSISTANT_COACH,
CLIENT}, coach→CLIENT only, others denied — recorded but unimplemented; one `User`
many workspaces; client rows single-workspace-owned; sharing = multiple
`ClientAssignment` rows in one workspace; no cross-workspace health-data copying —
true cross-workspace sharing is a separate future feature needing consent/authorization
design; issuance transaction revokes matching outstanding tokens; reset consumption
must atomically consume → password policy → rehash → `sessionVersion` increment →
sibling revocation → audit; no user-facing flow until password policy, delivery
config, audit ownership, throttling, and route review are complete.

## Schema (`db/schema.prisma` + additive migration)

`enum AccessTokenPurpose { WORKSPACE_INVITE, PASSWORD_RESET }` — `EMAIL_VERIFICATION`
intentionally not added (§2.15 open).

`model AccessToken` (`access_token`): `id` cuid PK; `purpose`; `tokenHash` TEXT
`@@unique`; `workspaceId` TEXT?; `userId` TEXT?; `targetEmail` TEXT?;
`intendedRole` `MemberRole`?; `createdByUserId` TEXT?; `expiresAt` timestamptz;
`consumedAt`/`revokedAt` timestamptz?; `createdAt` timestamptz default now.

`User.sessionVersion Int @default(0)` — column only; JWT embed/compare is a later
step bundled with reset consumption; no authentication behavior changes.

### Field rules enforced by named CHECK constraints (raw SQL; Prisma cannot express

purpose-dependent nullability)

- `access_token_invite_shape`: `purpose = 'WORKSPACE_INVITE'` ⇒ `workspace_id`,
  `target_email`, `intended_role`, `created_by_user_id` all NOT NULL; `intended_role`
  ∈ {COACH, ASSISTANT_COACH, CLIENT} (OWNER/SUPPORT/platform invites impossible at the
  DB boundary); `user_id` may be non-null **only once `consumed_at` is set** (null
  before acceptance; bound at consumption).
- `access_token_reset_shape`: `purpose = 'PASSWORD_RESET'` ⇒ `user_id` NOT NULL;
  `workspace_id`, `target_email`, `intended_role`, `created_by_user_id` all NULL.
- `access_token_expiry_after_creation`: `expires_at > created_at` — a token cannot be
  born already-expired. (The 12-hour duration is applied by the future service; the DB
  only enforces sanity.)

### Indexes (reviewed query support only)

- `access_token_token_hash_key` — unique lookup by digest.
- `access_token_invite_target_idx` on `(workspace_id, purpose, target_email,
intended_role)` — workspace-scoped; supports future replacement invalidation.
- `access_token_user_id_purpose_idx` on `(user_id, purpose)` — user-owned reset lookup.
- `access_token_expires_at_idx` on `(expires_at)` — future cleanup scans.

Deliberately absent: no standalone index on `target_email` (personal data — never
globally indexed by itself); no partial "one active token" unique index (active state
depends on expiry/revocation/consumption, so uniqueness of outstanding tokens is
enforced transactionally by the future service).

### Foreign keys / delete behavior

| FK                | On delete | Rationale                                                                                                                                                 |
| ----------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceId`     | Restrict  | Tenant boundary (matches `AuditEvent`, `WorkspaceMember`): a workspace cannot vanish with outstanding invite rows.                                        |
| `userId`          | Cascade   | Reset tokens are ephemeral user-owned records; deleting the user makes them meaningless, so they die with the user (SetNull would violate `reset_shape`). |
| `createdByUserId` | Restrict  | Issuer deletion must not silently erase or sever issued invite rows; erasure flows (S1-G) must revoke/delete them first.                                  |

Token rows are ephemeral security records, **not** audit records; no audit semantics
attach to their lifetime.

### `target_email` as plaintext PII

Normalized plaintext because: the platform already stores user emails; delivery and
acceptance need the address; no approved HMAC/lookup secret exists; an unsalted email
hash is enumerable and must not be presented as anonymization. Documented as personal
data; never indexed standalone; cleanup/retention duration stays `TODO(human)` (§2.14).

### `session_version`

`Int @default(0)` — existing users safely receive 0 (additive default, no rewrite).
Future reset consumption must, inside one Serializable transaction: consume the token
atomically → apply the (still-undecided) password policy → update `password_hash` →
increment `session_version` → revoke sibling reset tokens → write the approved audit
record. JWT embed/compare is deferred with that consumption step.

## Fail-closed exposure boundary

`lib/tokens.ts` contains only `assertTokenFlowsExternallyExposable(): never`, which
throws `TokenFlowNotExposableError("token_flows_not_exposable")`. External token flows
are not exposable because all of these remain incomplete: issuance/consumption
services, password policy, email provider/sender/base URL, session-version JWT
validation, recovery audit ownership (§4.2 open), rate limiting, and route/action
security review. No fake providers or no-op defaults exist.

## RED evidence

`tests/integration/s1-f1-token-schema.test.ts` written before `schema.prisma` changed;
run against a disposable PostgreSQL: exit 1 — `access_token` table absent (relation
does not exist), `session_version` column absent. Unit RED:
`tests/unit/token-exposure.test.ts` → exit 1 (`lib/tokens.ts` absent).

## Test list (real PostgreSQL + unit)

Integration (`tests/integration/s1-f1-token-schema.test.ts`, disposable DB via
`INTEGRATION_DATABASE_URL`):

- migrations deploy on a fresh database (incl. this one) and `migrate status` is clean;
- `access_token` table exists with expected columns; S1-A table-set assertion updated;
- valid invite-shaped row inserts; valid reset-shaped row inserts;
- a stored row contains no substring of the synthetic raw-token canary (hash-only);
- duplicate `token_hash` rejected;
- invite without `workspace_id` / `target_email` / `intended_role` / `created_by` rejected;
- invite with `WORKSPACE_OWNER` / `SUPPORT` / platform-shaped role rejected;
- invite carrying `user_id` while unconsumed rejected;
- reset without `user_id` rejected; reset carrying `workspace_id` / `target_email` /
  `intended_role` / `created_by` rejected;
- `expires_at <= created_at` rejected;
- unknown purpose (`EMAIL_VERIFICATION` / garbage) rejected by the enum;
- invite `workspace_id` must reference a real workspace (FK — cannot fabricate tenancy);
- `users.session_version` defaults to 0 for new and pre-existing rows; atomic
  `+1` increment works;
- delete behavior: workspace delete with invite → Restrict fails; user delete cascades
  that user's reset rows; issuer delete with issued invite → Restrict fails;
- prior raw constraints still present: S1-A composite FKs, both partial unique indexes,
  S1-E audit indexes/CHECK-free shape, `access_token` CHECKs by name.

Unit (`tests/unit/token-exposure.test.ts`): `assertTokenFlowsExternallyExposable`
throws `TokenFlowNotExposableError` with the structural code and no parameters.

Synthetic fixtures only: fixed canary hashes (e.g. `"a".repeat(64)`-style hex), never
realistic tokens.

## Mutation evidence

Each temporary, restored byte-for-byte:

| Mutation                  | Result |
| ------------------------- | ------ |
| (recorded post-run below) |        |

## Gates

Recorded in `docs/STATUS.md` / `TRACKER 2.0.md` for the committed tree: `git diff
--check`, `npm ci`, `prisma format/validate/generate`, `migrate deploy` + `migrate
status` on a fresh disposable DB, `format:check`, `typecheck`, `lint`, `npm run test`,
`test:integration` (real PG), `build`, `test:e2e`; `npm audit` inspected only.

`prisma migrate dev`/`migrate diff` will propose dropping the raw CHECK constraints
(not representable in the datamodel) — `migrate deploy` remains the required apply
path, same caveat as S1-A's composite FKs and partial indexes.

## Status

**S1-F Phase 1 schema/session foundation implemented; no token lifecycle or external
flow; independent review pending.** Full S1-F remains blocked on the open
`TODO(human)` items (acceptance details, reset eligibility, password policy, email
delivery, abuse protection, audit ownership/retention, standalone verification).
