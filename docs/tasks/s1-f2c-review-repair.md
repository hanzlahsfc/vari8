# S1-F2C review repair plan

**Plan only — committed before production edits.** Builder: SWE-2 High.
Independent DeepSeek review of `13af151` returned **FAIL**. Findings, chosen
repairs, and acceptance criteria below. S1-F2C stays internal-only.

## Finding 1 — freshness used incompatible clocks → causal generation design

`token.createdAt > member.updatedAt` compared a DB clock (`now()`) against a
Prisma-written app-clock timestamp; ±5 s skew flips the security decision.

**Repair — membership state generation, no clocks:**

- `WorkspaceMember.stateVersion Int @default(0)` (additive column).
- `BEFORE INSERT OR UPDATE` trigger `workspace_member_state_version_guard`:
  `state_version := 0` on insert; on update `:= OLD.state_version + 1` iff
  `status`/`role` changed, else `:= OLD.state_version` — the value is always
  derived, never caller-supplied; direct SQL changes preserve the invariant.
- `AccessToken.targetMemberStateVersion Int?` (additive) + CHECK:
  `PASSWORD_RESET` rows must keep it NULL; `WORKSPACE_INVITE` rows may carry
  NULL (no member existed at issuance) or a non-negative generation.
- Issuance snapshots the generation: inside the same Serializable transaction,
  look up `targetEmail` → member `(workspaceId, userId)` → stamp
  `member.stateVersion` or `null`.
- Acceptance requires `token.targetMemberStateVersion === member.stateVersion`
  whenever the member row exists, and `=== null` when it does not. Applies to
  every existing-member branch (INVITED, ACTIVE idempotent, SUSPENDED/REMOVED
  restore) — a stale invite is `invalid_token` regardless of the state it
  would have reached.
- Causality: a state change bumps the generation in the _same_ DB write as
  the status/role change, so "invite issued before suspension" means stamped
  generation ≠ current generation — ordering by value, never by timestamps;
  application/DB clock skew is irrelevant. Concurrent issuance vs. transition:
  Serializable isolation either serializes the reads (fresh stamp) or aborts
  one writer (bounded retry re-snapshots); a never-seen generation can never
  be stamped.
- Existing pre-migration invites carry `NULL` snapshots → fail closed against
  any existing member (invalid_token); still valid where no member exists.

## Finding 2 — hand-written issuer role list → guard-based reauthorization

Replace `issuerRolesFor` + hand-rolled membership lookup with the reviewed
guard: `authorize({user:{id: createdByUserId}}, {resource:
invitationResource(intendedRole), action:"write", workspaceId},
txRepo)` inside the acceptance transaction — AccessDeniedError (or any
failure) maps to `invalid_token`. This covers issuer DEACTIVATED/INVITED/
deleted, membership REMOVED/SUSPENDED, owner→coach demotion on staff invites,
and suspended workspace; matrix mutations now affect acceptance identically
to issuance. PLATFORM_ADMIN issuer without an ACTIVE membership still denies
(guard requires membership for workspace scope) — the reviewer's
platform-admin-plus-membership observation is recorded only; the global S1-B
precedence is unchanged.

## Finding 3 — cross-role profile incoherence → fail-closed coherence gate

Before any membership mutation on an existing member: opposite-class profile
state is checked — CLIENT invite + existing CoachProfile (on this member) →
`membership_conflict`; COACH/ASSISTANT_COACH invite + existing ClientProfile
(this workspace+user) → `membership_conflict`. Same-class profile → reused,
never overwritten. No profile deletion/rewrite. Consumption rolls back on
conflict. Role-class change permitted only when no opposite profile exists
(documented policy).

## Finding 4 — truthful acceptance audit

Acceptance writes `INVITE`/`access_token`/`resourceId=token.id` with
`meta:{targetRole, acceptedAs}` where `acceptedAs ∈ {NEW_USER, JOINED,
ALREADY_MEMBER, ACTIVATED, RESTORED}` — new closed `AuditMeta` key. Actor is
the accepted user (DB-derived), role = intendedRole. The trigger-based audit
failure test is extended to acceptance (full rollback proof).

## Finding 5 — lock ordering

Transaction order becomes: authorize → `pg_advisory_xact_lock` → re-authorize
→ revoke → issue → audit → commit. Reauthorization after the wait detects
authorization revoked during the wait; unauthorized callers never touch the
lock (no lock-hold DoS by outsiders).

## Finding 6 — P2002 classification

`isRetryableConflict` → P2034 only. P2002 retries only when `meta.modelName` +
`meta.target` exactly match an expected race:

| modelName       | target                     | meaning                |
| --------------- | -------------------------- | ---------------------- |
| User            | ["email"]                  | concurrent user create |
| WorkspaceMember | ["workspace_id","user_id"] | concurrent member      |
| ClientProfile   | ["workspace_id","user_id"] | concurrent profile     |
| CoachProfile    | ["workspace_member_id"]    | concurrent profile     |

Everything else (incl. `access_token` `token_hash`, unknown/missing meta) →
`invitation_failed`. Retry re-runs the whole transaction body (fresh
claim + authorization + reads); exhaustion → `serialization_conflict`
(P2034) or `invitation_failed` (P2002). Tests pin observed P2002 metadata.

## Finding 7 — list index

Additive migration + schema: `@@index([workspaceId, purpose, id],
map: "access_token_ws_invite_list_idx")`. EXPLAIN (ANALYZE, BUFFERS) on a
~10k-row interleaved analyzed fixture must use it with no Sort node.

## Finding 8 — test strengthenings

- Replacement test asserts the same-email **different-role** invite survives.
- `take` bound proven by spying the `findMany` args (wrapped client).
- Both profiles/invariants pinned per Finding 3.

## Repair mutations to run (all restored byte-exact)

generation check removed · trigger removed (migration-level — drop trigger on
test DB) · stale-snapshot accepted · issuer user-status removed · issuer via
hand-written list · opposite-profile check removed · audit action/resource/
outcome changed · acceptance audit failure swallowed · authorize after lock ·
role dropped from replacement tuple · P2002 target check removed · list `take`
removed · index dropped/reordered · workspace predicate removed · claim
condition removed.

## Gates

Full required set incl. **upgrade deploy** (deploy ≤`20260930180000` then the
new migration on a second DB). Rollback = `git revert` + additive-only
migration (column additions are non-destructive; rollback of the code leaves
inert columns).

---

## Second DeepSeek review (FAIL → repaired)

`docs/tasks/s1-f2c-second-review-repair.md` — the post-lock freshness barrier
was extended from the membership row to all three authorization rows
(users → workspace → workspace_member FOR UPDATE) after the advisory-lock
wait, with six real-PG mid-wait race proofs; role-generation behavior is now
pinned by dedicated tests (migration unchanged).

---

## Third DeepSeek review (FAIL — documentation only, repaired 2026-10-01)

All implementation areas independently verified PASS. Remaining blocker was
docs: `TRACKER 2.0.md` §3 and Stage 3 still carried the superseded
"faithful sheet layout" requirement, and the changelog falsely claimed §3
was corrected. Fixed in the documentation-only repair; final doc re-review
pending.
