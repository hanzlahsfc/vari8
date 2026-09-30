# S1-F2C — workspace invitation orchestration (implementation plan)

**Plan only — committed before production code.** Builder: SWE-2 High.
Basis: S1-F0/F1/F2A/F2B all independently PASS at `a69fa6f`. Aleks's invite
policy is recorded in `docs/product-decisions.md` and `docs/tasks/
s1-f-invites-recovery-plan.md` §2; the slice design is §3 of
`docs/tasks/s1-f2b-orchestration-plan.md`. Still unresolved (not decided here):
email provider/sender/domain, product-facing `WORKSPACE_OWNER` name, rate-limit
mechanism, coach→listing policy, proactive revocation of a removed issuer's
outstanding invites (`TODO(human)`).

## Stale / contradictory documentation found during planning

- `docs/tasks/s1-f-invites-recovery-plan.md` §2.12 recommends optional
  service-level invite caps — recommendation only, unapproved → not built.
- §3 invariants say "public reset request always returns a generic success" —
  superseded by the accepted enumeration-risk decision (F2D concern, not F2C).
- `AuditMeta.role` was closed to `PRIMARY|COACH` (assignment roles) — F2C adds
  a distinct `targetRole` key (COACH|ASSISTANT_COACH|CLIENT) instead of
  widening `role`, so consent/assignment meta validation is untouched.
- `lib/tokens/store.ts` header still says "no invite acceptance" — accurate for
  the store layer; orchestration lives in the new service.

## New surface — `lib/workspace/invitations.ts` (internal only)

```ts
createWorkspaceInvitation(session, { workspaceId, targetEmail, intendedRole })
  -> { invitationId, expiresAt, delivery }
revokeWorkspaceInvitation(session, { workspaceId, invitationId })
  -> { changed: boolean }
listWorkspaceInvitations(session, { workspaceId, limit?, cursor? })
  -> { items: InvitationSummary[]; nextCursor: string | null }
acceptWorkspaceInvitation(session, { rawToken, name?, password? })
  -> { outcome: "accepted" | "already_member", userId, membershipId, workspaceId }
```

`InvitationDeliveryPayload` = `{ kind: "workspace_invite", to, rawToken,
expiresAt, workspaceId }` — the ONLY place a raw token leaves the service, and
only after commit. No URL/domain/provider fields exist.

`InvitationSummary` = `{ id, targetEmail, intendedRole, expiresAt, status }`
where `status` is derived: consumed → revoked → expired → active precedence.
No token hash, bound user id, or issuer identity is returned.

`InvitationError` codes (structural only — never emails/ids/tokens/sql):
`invalid_input` · `invalid_token` · `identity_required` · `identity_mismatch` ·
`membership_conflict` · `serialization_conflict` · `invitation_failed`.
`AccessDeniedError` (RBAC) and `PasswordPolicyError`/`TokenError` propagate
unchanged — already structural.

## A. Authorization (rbac.ts + authorization-model.md)

New resource `clientInvitations`; `membersInvitations` unchanged:

| Principal       | membersInvitations (staff invites: create COACH/ASSISTANT_COACH; list; revoke) | clientInvitations (create CLIENT invite) |
| --------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| WORKSPACE_OWNER | read workspace / write workspace                                               | write workspace (read denied)            |
| COACH           | denied                                                                         | write workspace (read denied)            |
| ASSISTANT_COACH | denied                                                                         | denied                                   |
| SUPPORT         | denied                                                                         | denied                                   |
| CLIENT          | denied                                                                         | denied                                   |
| PLATFORM_ADMIN  | read platform / write denied (unchanged)                                       | denied                                   |

Resource selection: `intendedRole === "CLIENT" → clientInvitations`, else
`membersInvitations`. Listing/revocation always `membersInvitations` read/write
(owner-only cells). `INVITABLE_ROLES` in the store already blocks OWNER/
SUPPORT/admin as intended roles at the DB boundary.

## B. Create/replace — one Serializable transaction

1. Per-workspace serialization: `SELECT pg_advisory_xact_lock(
hashtextextended(<workspaceId|email|role>, 0))` inside the tx — concurrent
   replacements of the same tuple serialize deterministically instead of racing.
2. `authorize(session, {resource: derived, action: "write", workspaceId})`
   with `createPrismaAuthorizationRepo(tx)` — re-reads user/workspace/member
   state (inactive user/membership/workspace → deny).
3. Normalize email (shared `normalizeEmail`, ≤254) and validate role.
4. `revokeMatchingInviteTokens` — exact tuple only.
5. `issueWorkspaceInviteToken` — hash-only, 12 h.
6. `writeAuditEvent(tx, ctx, {action:"INVITE", resourceType:"access_token",
resourceId: tokenId, meta:{targetRole}})`.
7. Commit → only then return `delivery` containing `rawToken`.

Any failure (authz, audit, issue) rolls back the revocation too — the previous
matching invite survives. P2002 → `invitation_failed`; P2034 → bounded retry
(max 2 attempts) then `serialization_conflict` — never unbounded.

## D. List — owner-only

`authorizeCollection(..., membersInvitations read ...)` → scope must resolve
`workspace` (owner-only cell — coach/other read cells are denied).
Where: `{workspaceId, purpose:"WORKSPACE_INVITE"}` (+ `id > cursor`), order
`id asc`, take `normalizeLimit(limit)+1` (25/100). Minimal select only.

## E. Revoke — owner-only

`membersInvitations` write inside a Serializable tx → `updateMany` conditioned
on `{id, workspaceId, purpose: WORKSPACE_INVITE, consumedAt: null,
revokedAt: null, expiresAt: gt now}` → `count===0` ⇒ `{changed:false}` (missing,
foreign, consumed, expired, revoked are indistinguishable) else audit
`REVOKE/access_token/id` + `{changed:true}`. Audit failure rolls back.

## F. Accept — `acceptWorkspaceInvitation`

One Serializable transaction; bounded retry (≤2 attempts) on P2034/P2002.

1. `claimAccessToken(tx, {rawToken, purpose: WORKSPACE_INVITE,
workspaceId: input.workspaceId})` — every malformed/missing/wrong-purpose/
   wrong-workspace/expired/revoked/consumed input → `invalid_token` (losing a
   concurrent claim is identical).
2. Re-read workspace (ACTIVE required) and issuer membership in that workspace:
   CLIENT invite ⇒ issuer must be ACTIVE `WORKSPACE_OWNER|COACH`; staff invite
   ⇒ ACTIVE `WORKSPACE_OWNER`. Failure → `invalid_token` + rollback.
3. `userByEmail = tx.user.findUnique(normalizeEmail(token.targetEmail))`.
4. Existing user → require session; re-read session user in tx; require
   `sessionUser.id === userByEmail.id` and `sessionUser.status === "ACTIVE"`;
   else `identity_required`/`identity_mismatch`. No password accepted.
5. New user → if a session user resolves to a different existing user,
   `identity_mismatch`; else require `name` (validateName) + `password`
   (validatePasswordPolicy → hashPassword — NFC-consistent); create User
   (ACTIVE — invite = email verification).
6. Membership state machine on `(workspaceId, userId)`:

   | Current member                                                               | Outcome                                                                                          |
   | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
   | none                                                                         | create ACTIVE member with `intendedRole`                                                         |
   | INVITED                                                                      | → ACTIVE with `intendedRole`                                                                     |
   | ACTIVE same role                                                             | `already_member` idempotent — no writes, no dup profile                                          |
   | ACTIVE other role                                                            | `membership_conflict` — closed, no silent role change                                            |
   | SUSPENDED/REMOVED + **fresh** invite (`token.createdAt > member.updatedAt`)  | → ACTIVE with `intendedRole` (the fresh invite IS the explicit restoration + role authorization) |
   | SUSPENDED/REMOVED + **stale** invite (`token.createdAt <= member.updatedAt`) | `invalid_token` — an invite issued before the state change cannot restore                        |

   Freshness is proven by `token.createdAt > member.updatedAt`: any write to
   the membership row (including suspension/removal) makes every invite issued
   before it stale.

7. Profiles: CLIENT → `ClientProfile.create({workspaceId, userId, name})`
   (name from invitee input for new users; existing user's `name` for existing
   — never overwritten on idempotent accept); COACH/ASSISTANT_COACH →
   `CoachProfile.create({workspaceMemberId, displayName})`. Exactly one
   profile type per invite; concurrent create → P2002 → bounded retry sees the
   row → idempotent/conflict.
8. Bind `token.userId = acceptedUserId` (S1-F1 CHECK permits it only on
   consumed rows).
9. `writeAuditEvent` — `CREATE`/`user`/`resourceId=userId`,
   `meta:{targetRole, status:"ACTIVE"}` — inside the same tx.
10. Commit. Any failure leaves no partial user/member/profile/token/audit row.

Automatic `ClientAssignment` is **not** created — no reviewed document
authorizes it (§2.5's "connect to a coach-created client record" was
superseded by self-onboarding). Recorded limitation.

## Tests

- Unit: exact matrix incl. `clientInvitations`; role mapping; limit/cursor;
  error leak-scan; exposure assertion.
- Integration (real PG): the full Part-H list — RBAC denies, replacement tuple
  scoping, audit rollback, owner-only list/revoke, new-user client+coach
  acceptance, existing-user identity binding, multi-workspace joins, state
  machine incl. stale-vs-fresh restoration, issuer re-authorization, atomic
  claim single-winner, conflict mapping, no leaks.

## Mutations (≥14, byte-exact restore)

authz bypass · coach-invites-staff · resource-mapping swap · workspace
predicate drop · replacement tuple widened · audit write removed · raw token
persisted/audited · issuer re-auth removed · session-email match removed ·
claim conditions weakened · freshness check inverted · profile workspace
predicate dropped · claim non-atomic (unconditional) · list LIMIT removed.

## Rollback / exposure boundary

Pure `git revert` — no migration needed (no schema change planned; if a list
index proves necessary it lands additive in its own migration).
`assertTokenFlowsExternallyExposable` and
`assertAccountSecurityExternallyExposable` stay fail-closed; a new
`assertInvitationOrchestrationExternallyExposable` joins them. No `app/`/route
file may import the service — enforced by a static import-scan test.

## Gates

Full required set on fresh disposable PostgreSQL; docs + tracker updated;
scoped commits; normal push; **independent different-model review pending**
(builder never self-approves).

---

## Implementation record (2026-09-30)

**Status: implemented — gates green — independent different-model review
PENDING.** Builder: SWE-2 High (builder only, no self-approval).

### Delivered surface

- `lib/workspace/invitations.ts`: `createWorkspaceInvitation`,
  `revokeWorkspaceInvitation`, `listWorkspaceInvitations`,
  `acceptWorkspaceInvitation`, `assertInvitationOrchestrationExternallyExposable`
  (fail-closed). Structural `InvitationError` codes only.
- `lib/auth/rbac.ts`: new `clientInvitations` resource; `membersInvitations`
  unchanged (owner-only staff invites/list/revoke).
- `lib/audit.ts`: closed `targetRole` meta key (invitable roles only).
- `lib/tokens/store.ts`: `claimAccessToken` record now also selects
  `createdByUserId` + `createdAt` (issuer re-authorization + freshness).
- No migration needed — the F2B index set already serves every query; the
  owner list uses `access_token_invite_target_idx`
  (workspaceId, purpose, …) for filtering + bounded id ordering.
- `authorization-model.md` updated (new matrix row + rules).

### Key semantics proven on real PostgreSQL (21 integration tests)

- Owner invites COACH/ASSISTANT_COACH/CLIENT; coach CLIENT-only; all other
  roles + platform admin denied; inactive user/membership/workspace denied.
- Replacement revokes exactly the active (workspace, email, role) tuple;
  `pg_advisory_xact_lock` serializes same-tuple creates — concurrent
  replacement leaves exactly one active row.
- Forced audit failure (DB trigger) rolls the whole create back — previous
  invite survives, no partial token/audit rows.
- Listing: owner-only, 25/100 bound, id cursor, tenant-locked, minimal fields
  with derived `active|consumed|revoked|expired` status (no hash/user id).
- Revocation: owner-only, conditional update only for live rows, idempotent
  `{changed:false}` for terminal/foreign/missing, audit only on change.
- Acceptance: atomic claim (one winner under `Promise.all` race); issuer
  re-authorization (client=owner-or-coach, staff=owner); new-user path creates
  ACTIVE user + member + exactly one profile type (policy-validated,
  scrypt-hashed password verified); existing-user path requires session for
  the exact invited email and never touches the password; same user joins
  multiple workspaces with no data crossing; INVITED→ACTIVE; ACTIVE same-role
  idempotent; ACTIVE other-role closed; SUSPENDED/REMEMBER-restoration gated
  on `token.createdAt > member.updatedAt` (fresh-invite invariant).

### RED → GREEN

Tests written first; initial failures fixed were test-shape issues (fixture
names, role-filtered counting, expiry CHECK). Service behavior verified
against the spec throughout.

### Mutation evidence (14, all caught, restored byte-exact)

authz bypass (20 fails) · resource-mapping collapse→coach invites staff (1+1)
· assistant grant (1+2) · list workspace predicate drop (1) · replacement
tuple widened (2) · audit write removed (2) · raw token in audit (1) · issuer
re-auth removed (1) · session/email match removed (1) · claim revokedAt
dropped (1) · freshness check removed (1) · profile workspace predicate (1) ·
unconditional claim (2) · list bound removed (1 — caught only after both
`take`+`slice` dropped; documented).

### Gates

diff-check 0 · ci 0 · format/validate/generate 0 · deploy 0 · status 0 ·
format:check 0 · typecheck 0 · lint 0 · unit 315 · integration 152/12 files ·
build 0 · e2e 21 · audit: 1 mod + 4 high (unchanged, no --force).

### Boundaries kept

No routes/UI/actions, no email provider/URL/domain, no rate limiting, no
ClientAssignment auto-creation (unapproved), no cross-workspace copying, no
S1-F2D work. `assertTokenFlowsExternallyExposable` +
`assertInvitationOrchestrationExternallyExposable` fail closed.
