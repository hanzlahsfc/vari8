# S1-F plan — workspace invitations and account recovery

**Plan only.** No schema change, no migration, no `lib/tokens.ts` service, no routes/UI, no
token or reset code, no email provider. (The separately-scoped S1-F0 crypto primitives —
`lib/tokens/crypto.ts`, generation + hashing only — exist but contain no invite/reset
behavior.) S1-F implementation is **no longer blocked**: founder answers landed in
`docs/product-decisions.md`, and S1-F0/F1/F2A/F2B are independently PASS.
S1-F2C invitation orchestration is implemented (review pending) —
`docs/tasks/s1-f2c-invitations.md`. This document remains the authority for
the underlying invite/recovery decisions.
Sources: `stage-1-plan.md` §6/§9, `data-ownership.md`, `authorization-model.md`,
`consent-audit.md`, `lib/auth/rbac.ts`, `lib/credentials.ts`, `lib/password.ts`, `auth.ts`,
`auth.config.ts`, `db/schema.prisma`, and the S1-A–S1-E review records.

Reviewed tree: `80caad0` (S1-E independently PASS at `9f02983`, review record `80caad0`).

## 1. Current reality the plan must fit

- Auth.js v5 credentials sign-in; **JWT sessions** (`auth.config.ts`, `session.strategy: "jwt"`).
  There is no server-side session store: **existing sessions cannot be revoked** without adding
  new infrastructure (e.g. a per-request DB check or session-version field). The founder has now
  required logout-on-reset (§2.9), so `User.sessionVersion` lands as schema foundation in
  S1-F1; the JWT embed/compare wiring is a later step bundled with reset consumption.
- `authorizeCredentials` rejects non-`ACTIVE` users at sign-in and returns indistinguishable
  `null` for unknown-email vs wrong-password (no existence oracle at login).
- Schema already has `UserStatus = ACTIVE | DEACTIVATED | INVITED` and
  `MemberStatus = INVITED | ACTIVE | SUSPENDED | REMOVED`; `WorkspaceMember.status` defaults to
  `INVITED`. The `INVITED → ACTIVE` transition target exists; nothing writes it today.
- RBAC (`rbac.ts`, `membersInvitations`): `WORKSPACE_OWNER` = workspace read+write;
  `PLATFORM_ADMIN` = platform read, write denied; every other role fully denied. Current matrix
  answer to "who may invite" is **owner only**; anything broader requires a matrix decision.
- `ClientProfile.userId` is nullable with `@@unique([workspaceId, userId])` — a client login
  links an existing `User` to a client profile inside one workspace.
- `AuditEvent` exists (S1-E); `AuditAction` already includes `INVITE` and `LOGIN`. But the
  audit plumbing has several gaps for S1-F, all in `lib/audit.ts`/schema:
  `AuditEvent.workspaceId` is **required** (password-reset is user-owned, not
  workspace-owned — see §4.2); `AUDIT_RESOURCE_TYPES` is a closed set
  (`consent`, `client_assignment`) with no membership/token/user type;
  `meta.role` accepts `PRIMARY|COACH` only and `meta.status` only `ACTIVE|REMOVED`
  (cannot express `INVITED`/`SUSPENDED` or `MemberRole`); and `buildAuditEvent`
  hardcodes `result:"ALLOW"`, `reason:null`, `ip:null` (DENY/login outcomes and IP
  capture need builder changes, not just schema).
- Password hashing: scrypt via `lib/password.ts` (N=16384, r=8, p=1) — the approved mechanism.
- No email provider, no rate limiting, no email verification, no registration anywhere in the
  code. `membersInvitations` has no implementation behind the matrix cell.
- `data-ownership.md` already designates `AccessToken` owners: `Workspace` (invites) /
  `User` (reset, verification).

## 2. Human decisions required (checklist)

> **Update 2026-09-30:** founder answers were relayed by Hanzlah and recorded in
> `docs/product-decisions.md` #13–19. Sections below are marked **ANSWERED**,
> **PARTIAL**, or still **OPEN**. Conservative engineering interpretations are
> labeled as such and are not founder decisions.

Remaining unapproved items are labeled as such and do not become decisions until
recorded by the stakeholder.

**Founder-facing subset (plain language)** — the minimum questions Marcel/Aleks need to
answer; the engineering-detail items further down are for reviewers, not founders:

| #   | Plain-language question                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Can anyone create an account, or only people an existing workspace owner invites?                                   |
| 2   | Who can send invitations — just the workspace owner?                                                                |
| 3   | Which kinds of member can be invited — coach, assistant coach, client? What about a second owner or support staff?  |
| 4   | If the invited person already has an account (e.g. belongs to another workspace), do they join with that account?   |
| 5   | For clients: does an invite always connect to a client record the owner already created?                            |
| 6   | How long should an invite link stay valid, and should sending a new one cancel the old one? Can owners cancel it?   |
| 7   | When someone accepts, do they set a password right then? Is clicking the invite link enough proof of their email?   |
| 8   | Who can use "forgot password" — only active accounts? Should the page always answer the same way either way?        |
| 9   | How long should a reset link work, should a new request cancel old links, and should a reset log out other devices? |
| 10  | Any password rules you want (minimum length, complexity)?                                                           |
| 11  | Which email service should send these emails, and from what address/domain?                                         |
| 12  | Do you want limits on how often invites/resets can be requested (abuse protection)?                                 |
| 13  | Should we keep an activity record of invite/reset/log-in events? How long do we keep old used/expired links?        |
| 14  | Is a separate "verify your email" step needed beyond the invite/reset links?                                        |

### 2.1 Registration model — ANSWERED

- **Decision (founder, 2026-09-30):** invite-only for the initial product. Coaches invite
  their clients; public self-registration may be considered later but does not exist now.
- Context: this is a coach-owned multi-tenant product where workspaces create their own members
  and clients; public self-registration mainly serves "a coach wants to create their own
  workspace."

### 2.2 Who may invite — ANSWERED (Aleks final, 2026-09-30)

- **Approved policy:** the technical `WORKSPACE_OWNER` role remains workspace
  admin/head coach; owner/admin may invite COACH, ASSISTANT_COACH, CLIENT;
  COACH may invite CLIENT only; ASSISTANT_COACH and CLIENT may not invite;
  OWNER/SUPPORT/platform-admin invitations remain denied. Workspace
  admin/head coach may revoke outstanding invitations.
- **Still open:** the product-facing name of `WORKSPACE_OWNER` (admin / head
  coach / gym owner).
- Context: matrix today denies invite-write to everyone except `WORKSPACE_OWNER`
  (`membersInvitations` owner `ws/ws`). The coach-invites-client extension
  requires changing `authorization-model.md` + `rbac.ts` with review — plan in
  `docs/tasks/s1-f2b-orchestration-plan.md` (prefer a distinct resource so staff
  invitation permission is not accidentally broadened).

### 2.3 Roles that may be invited — ANSWERED (Aleks final, 2026-09-30)

- **Approved:** intended roles COACH, ASSISTANT_COACH, CLIENT only; OWNER,
  SUPPORT, and platform-admin invitations stay blocked. The database boundary
  for `AccessToken.intended_role` already enforces exactly
  {COACH, ASSISTANT_COACH, CLIENT} for invites regardless of who may issue them.

### 2.4 Existing vs new users — ANSWERED (Aleks final, 2026-09-30)

- **Decisions:** users can work with multiple coaches — one `User` may hold
  memberships in multiple workspaces (schema already supports this:
  `@@unique([workspaceId, userId])`, `ClientProfile` unique per workspace+user).
  An **existing user must sign in using the exact invited email** to accept —
  link-forwarding alone is not acceptance.
- New users set a password during acceptance (§2.10 policy now decided).

### 2.5 Client invitations — ANSWERED (self-onboarding)

- **Decision (founder, 2026-09-30):** clients receive an invitation and enter their own
  information; coaches do not pre-create or fill in client details. Acceptance will
  create and link the client's `ClientProfile` inside the invited workspace — there is
  no pre-created profile to bind, so `AccessToken` carries **no `clientProfileId`**.
- The earlier recommendation (owner selects a pre-existing unlinked `ClientProfile`)
  is **superseded** by the founder's answer.
- Open consequence: a "give an already-tracked client a login" path (invite bound to an
  existing profile) is not part of the confirmed flow; if needed later it is a separate
  decision.

### 2.6 Invitation lifetime and uniqueness — ANSWERED (duration/invalidation)

- **Decision (founder, 2026-09-30):** invitation links expire after **12 hours**; a
  replacement cancels previous matching links — the issuance transaction must revoke all
  unconsumed, unexpired matching tokens (same workspace + email + role) before creating
  the replacement.
- **Also answered (Aleks final):** the workspace admin/head coach may revoke an
  outstanding invite.
- Implementation note: "matching" is the `(workspaceId, purpose, targetEmail,
intendedRole)` tuple — covered by a workspace-scoped index; no partial "one active"
  unique index exists because active state depends on expiry/revocation/consumption, so
  replacement enforcement is transactional in the future service.

### 2.7 Invitation acceptance — ANSWERED (Aleks final, 2026-09-30)

- **Decisions:** new users set a password during acceptance (policy in §2.10);
  possession of the invitation counts as email verification — no separate
  verification step; SUSPENDED/REMOVED memberships are never silently restored —
  explicit re-invitation is required.
- **Engineering detail (not founder wording):** user+membership+profile creation
  and activation commit atomically in the acceptance transaction; an ACTIVE
  duplicate membership yields an idempotent structural outcome; a re-invite for
  a SUSPENDED/REMOVED membership is itself the explicit restoration — the fresh
  invite acceptance transitions the prior row to ACTIVE.
- Confirmed inputs: client acceptance creates+links the `ClientProfile` (§2.5);
  invitees may hold memberships in multiple workspaces (§2.4).

### 2.8 Password recovery eligibility — ANSWERED (Aleks final, 2026-09-30)

- **Decisions:** reset tokens are issued only for `ACTIVE` users; recovery is
  user-level (platform-owned `User`, not workspace-scoped).
- **Change from the earlier recommendation — accepted enumeration risk:** the
  public response deliberately **differs** depending on whether an account
  exists (vs the recommended always-generic response). Aleks was warned this
  permits account enumeration and explicitly accepted the tradeoff. Boundaries:
  the response reveals only existence — never status/role/workspace/client
  details — and routes still need rate limiting + abuse monitoring + minimized
  timing differences. Do not describe this as a secure best practice.

### 2.9 Reset-token lifetime and invalidation — ANSWERED

- **Decision (founder, 2026-09-30):** reset links expire after **12 hours**; a
  replacement request cancels previous matching links (same transactional revocation as
  invites); a successful reset must **log the user out on other devices**.
- **Session-revocation consequence (now required, still unimplemented):** Auth.js JWT
  sessions are not revocable, so the required all-device logout needs a session-version
  mechanism. The schema foundation (`User.sessionVersion`, default 0) lands in S1-F1;
  embedding/comparing the version in JWT validation is a later step that must atomically
  accompany reset consumption (consume token → password policy check → update hash →
  increment `sessionVersion` → revoke sibling tokens → audit).

### 2.10 Password policy — ANSWERED (Aleks final, 2026-09-30)

- **Decision — explicit change from the proposed default:** minimum length is
  **10** (the proposal was 15); long passphrases allowed; **no** uppercase,
  lowercase, number, or symbol composition requirement.
- **Recorded risk:** 10 is below the current 15-character recommendation for
  password-only authentication — an explicit accepted product decision, not
  silently overridden. No breach-password checking is approved.

### 2.11 Email delivery — OPEN

- **Explicitly undecided (founder, 2026-09-30):** email provider, sender identity, and
  product domain/base URL are undecided pending the product name.
- **Recommendation (unapproved):** build domain services with an injected "send" port;
  no real email until a provider + sender + URL are decided. Routes still cannot exist
  until S1-H.

### 2.12 Abuse protection — PARTIALLY OPEN

- The existence-oracle question is decided: the reset response deliberately
  differs by account existence — an **accepted enumeration risk**, not a best
  practice. Per-IP and per-identifier rate limiting is **still required** at the
  route layer; the precise HTTP mechanism remains `TODO(human)` (no rate-limit
  infra exists).
- **Recommendation (unapproved):** minimal per-actor + per-target counters even
  at service level (e.g. max N outstanding invites per workspace/email), with
  real HTTP-level throttling deferred to the routing slice where requests exist.

### 2.13 Auditing — PARTIALLY ANSWERED

- **Decision (Aleks final):** password-reset activity belongs in an
  account-level security log, not a workspace log — needs the §4.2(a) scope
  design since `AuditEvent.workspaceId` is required today. Invite
  create/revoke/accept events remain workspace-owned.
- Audit `meta` never contains raw tokens, passwords, email bodies, secret URLs,
  or token hashes (a hash is a lookup capability).
- Still open: DENY-event volume/abuse policy (S1-E scope decision).

### 2.14 Token retention and cleanup — ANSWERED (Aleks final, 2026-09-30)

- **Decision:** consumed and expired/revoked token records may be deleted after
  **30 days**. Engineering detail (not founder wording): bounded batches with a
  stable cursor; active tokens are never deleted; cleanup is retryable and safe
  under concurrency; opportunistic vs scheduled placement is an implementation
  choice — design in the S1-F2B plan.

### 2.15 Email verification scope — ANSWERED (Aleks final, 2026-09-30)

- **Decision:** possession of the invitation counts as email verification;
  standalone `EMAIL_VERIFICATION` tokens are deferred (consistent with
  `stage-1-plan.md` §6 "(later)").

## 3. Proposed engineering invariants (safe regardless of the decisions above)

**Engineering proposals — unapproved until this plan is reviewed.** None of these conflicts with
existing authority documents:

- Raw tokens are returned exactly once (for delivery) and **never stored**; only a
  cryptographic hash persists (`tokenHash`, e.g. SHA-256 of the raw token — tokens are
  high-entropy so no password-KDF needed).
- Token material = CSPRNG bytes (`crypto.randomBytes(32)`+); sufficient entropy.
- Purpose-scoped (`WORKSPACE_INVITE` / `PASSWORD_RESET`; `EMAIL_VERIFICATION` reserved).
- Expiring and single-use; consumption is **atomic** (consume-by-hash inside one transaction,
  conditioned on `consumedAt IS NULL AND revokedAt IS NULL AND expiresAt > now`).
- Validation re-checks at consumption: purpose, expiry, consumed/revoked, intended
  user/email/workspace, and **current** user/member/account state (fresh DB reads — inviter may
  have lost authorization since creation).
- Invite tokens never cross workspace boundaries; reset tokens are user-owned.
- Token values never appear in logs, audit meta, error messages, stored URLs, committed
  fixtures, or analytics.
- Public reset request always returns a generic success (no existence oracle); timing
  differences minimized at the service boundary where feasible.
- Password hashing stays on `lib/password.ts` scrypt; no new hashing mechanisms.
- Errors exposed outward are structural codes only (`token_invalid`, `token_expired`,
  `member_not_eligible`, …) — no enumeration.
- Fail closed when required config is absent (no base URL/provider ⇒ no sends, no dead ends).
- Only one concurrent consumption can succeed (atomic conditional update / unique consume).

## 4. Proposed data model — **implemented in S1-F1 (schema only, no services)**

### 4.1 `AccessToken` (one purpose-scoped table — as implemented in S1-F1)

`data-ownership.md` already reserves this model name. One table with a `purpose`
discriminator was chosen over separate tables because the lifecycle invariants
(hash-only storage, expiry, single-use, atomic consume) are identical. **Implemented
schema and constraints: see `docs/tasks/s1-f1-token-schema.md` and the migration.**
Founder answers changed two fields vs the original proposal: `clientProfileId` was
dropped (client self-onboarding, §2.5) and `targetEmail` is stored as normalized
plaintext (no approved HMAC secret exists; an unsalted hash would be enumerable, so
hashing was rejected rather than presented as anonymization — see the S1-F1 record).

| Field             | Owner     | Nullable                                         | Personal data | Indexes / uniqueness                                                                     | Tenant role                                                      | Delete behavior                                          |
| ----------------- | --------- | ------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| `id`              | platform  | no                                               | no            | PK (cuid)                                                                                | none                                                             | row cleanup per §2.14 (duration undecided)               |
| `purpose`         | platform  | no                                               | no            | enum `WORKSPACE_INVITE / PASSWORD_RESET` (`EMAIL_VERIFICATION` reserved, not added)      | none                                                             | —                                                        |
| `tokenHash`       | platform  | no                                               | **no** (hash) | `@@unique` (lookup is by hash)                                                           | none                                                             | —                                                        |
| `workspaceId`     | Workspace | invites: no; reset: null                         | no            | FK → `workspace.id`; composite index `(workspaceId, purpose, targetEmail, intendedRole)` | tenant boundary for invites — all invite queries constrain on it | Restrict                                                 |
| `userId`          | User      | reset: no; invites: null until consumption binds | no            | FK → `users.id`; index `(userId, purpose)`                                               | none (user-owned rows are cross-workspace)                       | Cascade (ephemeral user-owned records die with the user) |
| `targetEmail`     | platform  | invites: no; reset: null                         | **yes**       | none standalone — only inside the workspace-scoped composite                             | scoped by workspaceId on the same row                            | —                                                        |
| `intendedRole`    | Workspace | invites: no; reset: null                         | no            | in the workspace composite                                                               | checked against workspaceId                                      | —                                                        |
| `expiresAt`       | platform  | no                                               | no            | index for cleanup                                                                        | none                                                             | —                                                        |
| `consumedAt`      | platform  | yes                                              | no            | part of future atomic-consume `WHERE`                                                    | none                                                             | —                                                        |
| `revokedAt`       | platform  | yes                                              | no            | part of future atomic-consume `WHERE`                                                    | none                                                             | —                                                        |
| `createdByUserId` | User      | invites: no; reset: null                         | yes           | FK → `users.id`                                                                          | none                                                             | Restrict (issuer deletion must not silently sever rows)  |
| `createdAt`       | platform  | no                                               | no            | —                                                                                        | none                                                             | —                                                        |

Resolved former disputes: `targetEmail` plaintext (documented PII, no standalone index);
`userId` on invites is null until consumption (DB CHECK enforces `user_id` may only be
non-null once `consumed_at` is set); `clientProfileId` binding removed entirely.

### 4.2 Audit row ownership for user-scoped events — open design point

`AuditEvent.workspaceId` is `NOT NULL`. Invite events are workspace-owned and fit. Reset
request/consume and login-outcome events are **user-owned** with no natural workspace. Options
(unapproved): (a) make `workspaceId` nullable + `scope`/`ownerKind` discriminator (migration
change); (b) write reset/login audit rows under each of the user's ACTIVE-workspaces (wrong —
fabricates tenancy); (c) defer user-scoped audit rows to S1-H where a request context exists —
but then reset flows go unaudited. **Recommendation (unapproved):** (a), nullable workspaceId
with a `scope` discriminator, reviewed as part of this plan.

Note: option (a) modifies the already-reviewed S1-E `AuditEvent` model — it expands S1-F beyond
the `stage-1-plan.md` §9 cell (`lib/tokens.ts` + `AccessToken`) and requires its own reviewed,
additive migration. The slice table is indicative; the discrepancy is recorded here rather than
silently widening scope. The alternative — deferring user-scoped audit to S1-H — leaves reset
flows unaudited; founders should know unaudited password reset is the fallback.

## 5. Proposed services — plan only

A `lib/tokens.ts` domain service (token lifecycle) plus thin orchestration where membership/user
mutation is required. All mutations Serializable; audit writes coupled in-transaction for
mutating operations (S1-E pattern); errors structural.

| Operation               | Actor / authz                                             | Owner scope | Inputs                         | Output (structural)                              | Audit                              | Tx boundary                                                                            | Denial cases                                             | Concurrency                                  | Rate-limit dep     | Blocked by     |
| ----------------------- | --------------------------------------------------------- | ----------- | ------------------------------ | ------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------- | ------------------ | -------------- |
| `createWorkspaceInvite` | OWNER (`membersInvitations` write, workspace)             | Workspace   | workspaceId, email, role       | `{ inviteId }` (+ raw token via send port only)  | `INVITE` ALLOW in-tx               | Serializable: authz → revoke-prior-matching → insert                                   | non-owner; ineligible role; suspended ws                 | replacement revokes matching outstanding     | per-workspace cap  | §2.2–2.7       |
| `revokeWorkspaceInvite` | OWNER                                                     | Workspace   | workspaceId, inviteId          | `{ revoked: boolean }`                           | `INVITE` (or `REVOKE`) ALLOW in-tx | Serializable: authz → conditional revoke                                               | non-owner; cross-workspace invite; already consumed      | idempotent `revoked:false` on second call    | low                | §2.6           |
| `acceptInvitation`      | holder of token; must sign in as invited email (per §2.4) | Workspace   | raw token, password (new user) | `{ membershipId }` or structural error           | `INVITE` ALLOW in-tx               | Serializable: atomic consume → create/activate user+member → create+link clientProfile | expired/used/revoked token; email mismatch; suspended ws | two accepts of same token → exactly one wins | consume attempts   | §2.4–2.7       |
| `requestPasswordReset`  | unauthenticated (public)                                  | User        | email                          | **generic success always**                       | per §4.2 decision                  | read user → insert token (user-scoped)                                                 | none observable; internally skips non-ACTIVE             | multiple requests → per §2.9 invalidation    | per-email cooldown | §2.8–2.9, 2.12 |
| `consumePasswordReset`  | holder of token (public)                                  | User        | raw token, newPassword         | `{ changed: boolean }`                           | per §4.2 decision                  | Serializable: atomic consume → rehash password → invalidate siblings                   | expired/used/revoked; wrong purpose; non-ACTIVE user     | two consumes → exactly one wins              | consume attempts   | §2.8–2.10      |
| `inspectInvitation`     | holder of token (public, minimal reveal)                  | Workspace   | raw token                      | `{ valid: boolean, expiresAt? }` — no email leak | none                               | read-only                                                                              | invalid/expired → `valid:false`                          | —                                            | low                | §2.7           |
| `cleanupExpiredTokens`  | internal (opportunistic or job)                           | platform    | —                              | `{ removed: number }`                            | none                               | bounded delete                                                                         | —                                                        | safe concurrent (delete by predicate)        | —                  | §2.14          |

Notes: invite acceptance for a **client** additionally creates and links `ClientProfile.userId`
inside the same transaction (self-onboarding per §2.5 — there is no `clientProfileId` binding
on the token). `LOGIN` outcome auditing (deferred S1-E item) lives in `auth.ts` `authorize` —
blocked on §4.2 and on the DENY-volume decision.

## 6. Test plan — RED scenarios for implementation (not written yet)

**Unit** (pure, no DB): token generation entropy/format; hash determinism; email normalization
reuse (`normalizeEmail`); expiry/used/revoked predicate logic; password-policy validation per
approved decision; structural error codes.

**Real PostgreSQL integration** (disposable DB, `vitest.integration.config.ts`):

- DB stores only `tokenHash` — a `SELECT` of the row contains no substring of the raw token;
  raw token appears exactly once in the service return.
- Correct token consumes once; second use fails structurally; expired fails; revoked fails;
  wrong purpose / wrong workspace / wrong email / wrong user all fail without side effects.
- Invite accepted only while inviter's authorization is still valid (revoked-owner case).
- Resend invalidation behavior per approved §2.6 decision.
- Two concurrent consume calls on the same token → exactly one succeeds (Serializable or
  atomic conditional update; the loser gets a structural conflict/invalid error).
- Client invite cannot link a `ClientProfile` from another workspace (composite-FK + check).
- `requestPasswordReset` returns identical generic output for existing/nonexisting/
  deactivated emails; no token row for non-ACTIVE users (or per approved policy).
- Token bytes and new password never appear in any `audit_event` row (`meta::text` canary).
- Forced audit failure inside a mutating token op rolls back the token/membership change.
- Bounded status listing (`inspectInvitation` / owner invite list) — no unbounded reads.
- Migration regression: all S1-A composite FKs and partial unique indexes still present.

**Mutation checks** (implementation-time): raw-token persistence; hash lookup bypass;
consume-without-atomicity; missing workspace predicate; missing purpose check; missing expiry
check; audit-write removed from a mutation; existence leak in reset response.

**E2E** (only if/when routes exist — S1-H; S1-F adds none): invite accept flow at
desktop+mobile; generic reset response indistinguishable.

## 7. Explicitly outside S1-F

- Routes, API handlers, server actions, pages, UI (S1-H).
- Email provider integration, sender identity, base URL config.
- Rate-limit/lockout/CAPTCHA infrastructure (mechanism selection is a decision anyway).
- `EMAIL_VERIFICATION` standalone flow (unless §2.15 decides otherwise).
- Session revocation (requires JWT→session-version infra change).
- GDPR export/erasure of token rows (S1-G, though retention cleanup is designed-in via §2.14).
- Platform-admin invite paths.
- Any consent/assignment mutation exposure.

## 8. Dependencies between decisions (what truly blocks implementation)

**Nothing open in §2 or §4.2 may be coded as an unrecorded default** — every open
item blocks its own feature area until a stakeholder answer is recorded. After the
2026-09-30 founder answers, the remaining blockers are:

- **Invite flow shape:** 2.2/2.3 (invite permission policy is an unapproved
  interpretation — current matrix stays owner-only until changed with review), 2.4
  (signed-in-as-invited-email acceptance), 2.7 (acceptance details: password-at-
  acceptance, verification semantics, INVITED→ACTIVE, SUSPENDED/REMOVED rows).
- **Reset flow shape:** 2.8 (eligibility), 2.10 (password policy — even a minimum
  length is a choice; do not invent it).
- **User-scoped audit rows (reset/login):** §4.2 (schema decision, reviewed
  separately) + 2.13 DENY-volume policy.
- **Token cleanup cadence:** 2.14 (retention duration undecided; opportunistic
  cleanup is safe to build).
- **Delivery but not the code:** 2.11 (provider/sender/base URL), 2.12 (HTTP-level
  throttling lands in S1-H where requests exist), 2.15 (standalone verification can
  defer without blocking invites/resets).
- **Session revocation wiring:** §2.9 is answered (logout-on-reset required) but the
  JWT `sessionVersion` comparison infrastructure is still to be built alongside
  reset consumption.

No longer blocking: registration model (invite-only), client self-onboarding,
multi-workspace membership, 12-hour expiry, replacement-cancels-matching,
logout-other-devices.

## 9. Status

**Aleks's final S1-F policy answers are recorded (2026-09-30); all blocking
policy questions are now answered except email provider/sender/domain, the
product-facing owner name, the rate-limit mechanism, DENY-event volume, and
true cross-workspace sharing.** **S1-F0** (`lib/tokens/crypto.ts`) and **S1-F1**
(schema/session foundation incl. the `token_hash` canonical-format CHECK) are
independently PASS. **S1-F2A** (internal transaction-bound store primitives,
`lib/tokens/store.ts`) is independently PASS — see
`docs/tasks/s1-f2a-token-primitives.md`. The implementation-ready orchestration
plan is `docs/tasks/s1-f2b-orchestration-plan.md` (S1-F2B account-security
foundation → S1-F2C invitations → S1-F2D password reset → routing slice). No
product flow exists; each slice needs its own independent different-model
review.
