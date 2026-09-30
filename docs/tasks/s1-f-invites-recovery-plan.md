# S1-F plan — workspace invitations and account recovery

**Plan only.** No schema change, no migration, no `lib/tokens.ts` service, no routes/UI, no
token or reset code, no email provider. (The separately-scoped S1-F0 crypto primitives —
`lib/tokens/crypto.ts`, generation + hashing only — exist but contain no invite/reset
behavior.) S1-F implementation is **blocked** on the human decisions in §2.
Sources: `stage-1-plan.md` §6/§9, `data-ownership.md`, `authorization-model.md`,
`consent-audit.md`, `lib/auth/rbac.ts`, `lib/credentials.ts`, `lib/password.ts`, `auth.ts`,
`auth.config.ts`, `db/schema.prisma`, and the S1-A–S1-E review records.

Reviewed tree: `80caad0` (S1-E independently PASS at `9f02983`, review record `80caad0`).

## 1. Current reality the plan must fit

- Auth.js v5 credentials sign-in; **JWT sessions** (`auth.config.ts`, `session.strategy: "jwt"`).
  There is no server-side session store: **existing sessions cannot be revoked** without adding
  new infrastructure (e.g. a per-request DB check or session-version field). Any requirement to
  revoke sessions after password reset is therefore an infra change, not a policy toggle.
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

Everything below is **unapproved**. Recommendations are labeled as such and do not become
decisions until recorded by the stakeholder.

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

### 2.1 Registration model

- **Options:** (a) invite-only; (b) public self-registration; (c) both.
- Context: this is a coach-owned multi-tenant product where workspaces create their own members
  and clients; public self-registration mainly serves "a coach wants to create their own
  workspace."
- **Recommendation (unapproved):** invite-only for members/clients now; revisit a "create
  workspace" path separately if needed — keeps the tenant boundary fully owner-controlled.

### 2.2 Who may invite

- **Options:** (a) `WORKSPACE_OWNER` only — matches the current `membersInvitations` matrix
  cell; (b) owner + COACH; (c) platform-admin involvement.
- Context: matrix today denies invite-write to COACH/ASSISTANT_COACH/SUPPORT/CLIENT and denies
  platform-admin writes. Option (b)/(c) require changing `authorization-model.md` + `rbac.ts`
  with review.
- **Recommendation (unapproved):** owner only — zero matrix change, least privilege.

### 2.3 Roles that may be invited

- **Options per role:** OWNER (dangerous — a second owner can invite/demote others; co-owner
  invites need an explicit policy decision); COACH; ASSISTANT_COACH; CLIENT (interacts with the
  client-profile link question, §2.5); SUPPORT (dangerous — support access itself is unresolved
  `TODO(human)`).
- **Recommendation (unapproved):** COACH / ASSISTANT_COACH / CLIENT only; OWNER and SUPPORT
  invites stay blocked pending separate decisions.

### 2.4 Existing vs new users

- Does inviting an email that already belongs to a `User` add a membership to the existing
  account (one user, many workspaces) or reject?
- Does invite acceptance require the recipient to be signed in as the matching email account,
  or may anyone holding the link accept?
- Schema already supports one user in many workspaces (`@@unique([workspaceId, userId])`,
  `ClientProfile` unique per workspace+user).
- **Recommendation (unapproved):** existing user may accept into another workspace; acceptance
  requires signing in as the invited email (prevents link-forwarding hijack); new users set a
  password during acceptance.

### 2.5 Client invitations

- Must a client invite reference an existing unlinked `ClientProfile` (invite flow = "give this
  already-tracked client a login"), or may acceptance create a new `ClientProfile`?
- Who selects the profile — the owner at invite-creation time, or the acceptor?
- Wrong-link prevention: the chosen profile must be in the same workspace and currently
  unlinked (`userId` null); the token should carry the intended `clientProfileId` so acceptance
  cannot bind to a different client.
- **Recommendation (unapproved):** owner selects an existing unlinked profile at creation; token
  binds to that profile; acceptance links `userId` — no acceptor-chosen profile.

### 2.6 Invitation lifetime and uniqueness

- Expiry duration (e.g. 24h / 7d — duration is a decision, not invented here).
- Does resend invalidate earlier outstanding invites for the same workspace+email+role?
- May multiple active invites exist for the same target?
- May an owner revoke an outstanding invite?
- **Recommendation (unapproved):** resend revokes prior outstanding invite(s) for the same
  (workspace, email, role, clientProfile); at most one active invite per tuple; owner revocation
  supported.

### 2.7 Invitation acceptance

- Does a new user set a password during acceptance (recommended, required for credentials
  sign-in) vs a separate verification step?
- Is email verification implicit in possession of the invite link?
- Membership transition `INVITED → ACTIVE`; user creation as `INVITED`→`ACTIVE` or directly
  `ACTIVE`?
- Behavior when a membership row already exists in `INVITED`/`SUSPENDED`/`REMOVED` state
  (re-invite vs reject vs revive)?
- **Recommendation (unapproved):** password set during acceptance; invite possession counts as
  that address's verification; acceptance activates both `User` and `WorkspaceMember`
  atomically; `SUSPENDED`/`REMOVED` memberships require a new invite, never silent revival.

### 2.8 Password recovery eligibility

- ACTIVE users only? What happens for `INVITED` or `DEACTIVATED` users?
- Public response must remain generic regardless ("if an account exists…").
- Is recovery user-level across all workspaces (it is — `User` is platform-owned)?
- **Recommendation (unapproved):** issue reset tokens for ACTIVE users only, respond generically
  for everything else; recovery is user-level.

### 2.9 Reset-token lifetime and invalidation

- Expiry duration (decision).
- Does requesting a new reset invalidate previous outstanding reset tokens for that user?
- Does a successful reset invalidate every outstanding reset token?
- **Must existing sessions be revoked after a password reset?** — note: current Auth.js JWT
  sessions are **not revocable**; answering "yes" requires a session-version/DB-check change,
  which is additional schema + auth-config work beyond tokens.
- **Recommendation (unapproved):** new request revokes prior outstanding resets; success revokes
  all; session revocation deferred with the JWT caveat stated above.

### 2.10 Password policy

- Minimum length; complexity rules; breached-password checking; reuse prevention.
- **Do not invent a policy.** Only a minimum-length check is needed to consume a token;
  everything else is a decision.
- **Recommendation (unapproved):** minimum length 12, no complexity rules, no breach check
  initially, record whether reuse-checking is wanted.

### 2.11 Email delivery

- No provider approved; sender identity and application base URL unresolved.
- Should S1-F build domain services only (token lifecycle + an outbound-email seam) and leave
  delivery unimplemented?
- **Recommendation (unapproved):** yes — services take an injected "send" port; no real email is
  sent until a provider + sender + URL are decided. Routes still cannot exist until S1-H.

### 2.12 Abuse protection

- Rate limits for invite creation/resend/reset-request/consume; lockouts; CAPTCHA; cooldowns.
- All public-facing token requests must not leak account existence.
- There is **no rate-limit infrastructure** today — any answer "yes" also requires picking a
  mechanism.
- **Recommendation (unapproved):** minimal per-actor + per-target counters even at service level
  (e.g. max N outstanding invites per workspace/email; cooldown between reset requests), with
  real HTTP-level throttling deferred to S1-H where requests exist.

### 2.13 Auditing

- Which outcomes get `AuditEvent`s: invite create/revoke/accept (`INVITE`), reset request,
  reset consume, plus the deferred S1-E **login-outcome** requirement (`LOGIN` allow/deny).
- DENY-row volume/abuse policy remains `TODO(human)` (S1-E scope decision).
- Audit `meta` never contains raw tokens, passwords, email bodies, or secret URLs; token hash
  itself should not be in meta either (it is a lookup capability).
- `AuditEvent.workspaceId` is required — decide how user-owned reset/login events are stored
  (see §4.2).
- **Recommendation (unapproved):** audit `INVITE` create/revoke/accept inside the mutation
  transaction (workspace-owned — fits the current schema); for user-owned reset/login events,
  prefer the nullable-`workspaceId` + scope-discriminator path from §4.2(a) — do **not**
  fabricate a workspace for user-scoped rows.

### 2.14 Token retention and cleanup

- How long consumed/expired token rows persist; cleanup mechanism (scheduled job, manual, or
  opportunistic during token operations).
- Relates to the unresolved general retention `TODO(human)`.
- **Recommendation (unapproved):** opportunistic cleanup during token operations plus a bounded
  retention `TODO(human)` — no invented duration.

### 2.15 Email verification scope

- Are standalone `EMAIL_VERIFICATION` tokens part of S1-F, or does invite possession count as
  verification and standalone verification defer?
- `stage-1-plan.md` §6 already lists `EMAIL_VERIFICATION` as "(later)".
- **Recommendation (unapproved):** defer standalone verification; invite possession counts.

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

## 4. Proposed data model — **plan only, do not implement**

### 4.1 `AccessToken` (recommended: **one purpose-scoped table**)

`data-ownership.md` already reserves this model name. One table with a `purpose` discriminator
is recommended over separate tables because the lifecycle invariants (hash-only storage, expiry,
single-use, atomic consume) are identical; invite-specific columns stay nullable. Separate
tables would duplicate the consume-path security code — the riskiest part — for no benefit.
Left unapproved pending review.

| Field             | Owner         | Nullable                                               | Personal data               | Indexes / uniqueness                                                                                                                | Tenant role                                                      | Delete behavior                |
| ----------------- | ------------- | ------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| `id`              | platform      | no                                                     | no                          | PK (cuid)                                                                                                                           | none                                                             | row cleanup per §2.14          |
| `purpose`         | platform      | no                                                     | no                          | enum `WORKSPACE_INVITE / PASSWORD_RESET / EMAIL_VERIFICATION`                                                                       | none                                                             | —                              |
| `tokenHash`       | platform      | no                                                     | **no** (hash)               | `@@unique` (lookup is by hash)                                                                                                      | none                                                             | —                              |
| `workspaceId`     | Workspace     | invites: no; reset/verify: null                        | no                          | composite FK → `workspace.id`; index `(workspaceId, purpose)`                                                                       | tenant boundary for invites — all invite queries constrain on it | Restrict or Cascade (decision) |
| `userId`          | User          | reset/verify: no; invites: null until acceptance binds | no                          | FK → `users.id`; index `(userId, purpose)`                                                                                          | none (user-owned rows are cross-workspace)                       | SetNull or Restrict (decision) |
| `targetEmailHash` | platform      | invites: no                                            | **yes** (derivative of PII) | deterministic hash (HMAC) of normalized email; index `(workspaceId, targetEmailHash)` for resend-invalidation                       | scoped by workspaceId on the same row                            | nulled on cleanup (decision)   |
| `targetEmail`     | platform      | invites: maybe                                         | **yes**                     | none — decide whether storing plaintext is needed for resend UX vs hash-only                                                        | same                                                             | nulled on cleanup (decision)   |
| `intendedRole`    | Workspace     | invites: no                                            | no                          | none                                                                                                                                | checked against workspaceId                                      | —                              |
| `clientProfileId` | ClientProfile | only for client invites                                | no (link)                   | FK → `client_profile.id`; composite `clientProfileId+workspaceId` FK for the same-workspace invariant (mirrors S1-A raw-FK pattern) | must equal row's workspaceId                                     | SetNull (decision)             |
| `expiresAt`       | platform      | no                                                     | no                          | index for cleanup                                                                                                                   | none                                                             | —                              |
| `consumedAt`      | platform      | yes                                                    | no                          | part of atomic-consume `WHERE`                                                                                                      | none                                                             | —                              |
| `revokedAt`       | platform      | yes                                                    | no                          | part of atomic-consume `WHERE`                                                                                                      | none                                                             | —                              |
| `createdByUserId` | User          | yes                                                    | yes                         | FK → `users.id`                                                                                                                     | none                                                             | SetNull                        |
| `createdAt`       | platform      | no                                                     | no                          | —                                                                                                                                   | —                                                                | —                              |

Disputed fields pending §2 decisions: plaintext `targetEmail` vs hash-only (resend UX vs
data-minimization); `userId` on invites at creation vs only after acceptance; whether
`membershipId`/`clientProfileId` binding is carried on the token or derived at acceptance.

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

| Operation               | Actor / authz                                             | Owner scope | Inputs                                     | Output (structural)                              | Audit                              | Tx boundary                                                                     | Denial cases                                                               | Concurrency                                  | Rate-limit dep     | Blocked by     |
| ----------------------- | --------------------------------------------------------- | ----------- | ------------------------------------------ | ------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- | ------------------ | -------------- |
| `createWorkspaceInvite` | OWNER (`membersInvitations` write, workspace)             | Workspace   | workspaceId, email, role, clientProfileId? | `{ inviteId }` (+ raw token via send port only)  | `INVITE` ALLOW in-tx               | Serializable: authz → dedupe/revoke-prior → insert                              | non-owner; ineligible role; cross-workspace clientProfile; suspended ws    | resend-invalidates-prior under unique tuple  | per-workspace cap  | §2.2–2.6       |
| `revokeWorkspaceInvite` | OWNER                                                     | Workspace   | workspaceId, inviteId                      | `{ revoked: boolean }`                           | `INVITE` (or `REVOKE`) ALLOW in-tx | Serializable: authz → conditional revoke                                        | non-owner; cross-workspace invite; already consumed                        | idempotent `revoked:false` on second call    | low                | §2.6           |
| `acceptInvitation`      | holder of token; must sign in as invited email (per §2.4) | Workspace   | raw token, password (new user)             | `{ membershipId }` or structural error           | `INVITE` ALLOW in-tx               | Serializable: atomic consume → create/activate user+member → link clientProfile | expired/used/revoked token; email mismatch; cross-ws profile; suspended ws | two accepts of same token → exactly one wins | consume attempts   | §2.4–2.7       |
| `requestPasswordReset`  | unauthenticated (public)                                  | User        | email                                      | **generic success always**                       | per §4.2 decision                  | read user → insert token (user-scoped)                                          | none observable; internally skips non-ACTIVE                               | multiple requests → per §2.9 invalidation    | per-email cooldown | §2.8–2.9, 2.12 |
| `consumePasswordReset`  | holder of token (public)                                  | User        | raw token, newPassword                     | `{ changed: boolean }`                           | per §4.2 decision                  | Serializable: atomic consume → rehash password → invalidate siblings            | expired/used/revoked; wrong purpose; non-ACTIVE user                       | two consumes → exactly one wins              | consume attempts   | §2.8–2.10      |
| `inspectInvitation`     | holder of token (public, minimal reveal)                  | Workspace   | raw token                                  | `{ valid: boolean, expiresAt? }` — no email leak | none                               | read-only                                                                       | invalid/expired → `valid:false`                                            | —                                            | low                | §2.7           |
| `cleanupExpiredTokens`  | internal (opportunistic or job)                           | platform    | —                                          | `{ removed: number }`                            | none                               | bounded delete                                                                  | —                                                                          | safe concurrent (delete by predicate)        | —                  | §2.14          |

Notes: invite acceptance for a **client** additionally links `ClientProfile.userId` inside the
same transaction, guarded by the token's `clientProfileId`+`workspaceId` binding. `LOGIN`
outcome auditing (deferred S1-E item) lives in `auth.ts` `authorize` — blocked on §4.2 and on
the DENY-volume decision.

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

**Nothing in §2 or §4.2 may be coded as an unrecorded default** — every decision above
blocks its own feature area until a stakeholder answer is recorded. The useful
distinction is _which parts of the codebase each decision unblocks_:

- **Blocks the invite flow's shape:** 2.1, 2.4, 2.5, 2.6, 2.7.
- **Blocks the reset flow's shape:** 2.8, 2.9, 2.10 (even a minimum length is a choice —
  do not invent it).
- **Blocks invite writes/roles beyond the matrix default:** 2.2, 2.3 (the current matrix
  answer is "owner only" — implementation _may_ encode exactly that if recorded).
- **Blocks user-scoped audit rows (reset/login):** §4.2 (schema decision, reviewed
  separately) + 2.13 DENY-volume policy.
- **Blocks token cleanup cadence:** 2.14 (opportunistic cleanup is safe to build; the
  retention duration itself is the decision).
- **Blocks delivery but not the code:** 2.11 (provider/sender/base URL), 2.12 (HTTP-level
  throttling lands in S1-H where requests exist), 2.15 (standalone verification can
  defer without blocking invites/resets).

Founder-facing minimum to unblock core implementation: items 1–10 in the §2 summary
table (plus 11 before any real email is sent).

## 9. Status

**Plan written; no S1-F token service, schema change, or migration exists.** Implementation
remains blocked on §2/§4.2 decisions. The policy-neutral prerequisite **S1-F0** has since
landed: `lib/tokens/crypto.ts` (generation/hashing/validation only — no `AccessToken` model,
no token lifecycle, nothing in §2 or §4.2 resolved). See `docs/tasks/s1-f0-token-crypto.md`.
Next step: collect Marcel/Aleks's answers, record them in
`docs/product-decisions.md` / `open-questions.md`, then write the S1-F implementation prompt.
