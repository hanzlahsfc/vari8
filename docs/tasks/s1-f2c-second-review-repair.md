# S1-F2C second-review repair plan

**Plan only — committed before production edits.** Builder: SWE-2 High.
Independent DeepSeek re-review of `9a4d3b9` returned a second **FAIL** with two
remaining code/test findings plus documentation corrections. The
already-PASS areas (state-generation migration, causal freshness, issuer
guard, profile coherence, truthful audit, P2002 classification, list index,
token secrecy) are unchanged by this repair.

## Finding 1 — post-lock authorization race is wider than `workspace_member`

Current barrier: authorize → advisory lock → `FOR UPDATE` on the actor's
**membership row only** → re-authorize under the fixed Serializable snapshot.
A User DEACTIVATED/INVITED or Workspace SUSPENDED committed during the lock
wait touches no membership row, produces no serialization conflict, and stays
invisible — the invitation commits against revoked authority.

**Repair — three-row post-lock freshness barrier.** After acquiring the
advisory lock, take row locks in a single documented order:

1. `SELECT id FROM "users" WHERE id = $actor FOR UPDATE`
2. `SELECT id FROM "workspace" WHERE id = $ws FOR UPDATE`
3. `SELECT id FROM "workspace_member" WHERE workspace_id+user_id FOR UPDATE`

then re-run `authorize()` (same snapshot = visible-current state).

Why this is correct:

- Any status/role write to any of the three rows that committed after our
  snapshot forces `40001` (P2010 raw → bounded retry). Retry re-runs the
  whole body in a fresh transaction: fresh snapshot → authorize denies → no
  token, no audit, no delivery.
- An unchanged row returns our snapshot version — we proceed only when all
  three locks are held and the guard still grants.
- A concurrently deleted row cannot pass: `FOR UPDATE` either conflicts
  (40001 → retry) or returns no row → re-authorization fails
  (membership_missing / user_missing).
- Deterministic order `users → workspace → workspace_member` is the only
  multi-row locking order in the codebase; single-row writers cannot form a
  cycle (they wait on our row, we never wait on theirs except the row itself
  — bounded by their commit).
- Missing actor row → empty FOR UPDATE → authorize denies anyway.

## Finding 2 — pin role-based generation increments (tests only)

Migration is independently verified correct; only tests strengthen:

- status-only / role-only / simultaneous changes each bump `state_version`
  exactly once; unrelated writes don't; forge/reset attempts overridden;
- a role change after issuance makes the prior invite stale (invalid_token),
  a post-change invite captures the new generation and restores.

## Documentation corrections

- `acceptWorkspaceInvitation` signature includes required `workspaceId`;
- `SUSPENDED/REMEMBER` typo removed;
- P2002 wording reconciled (4 pinned races retry; others →
  `invitation_failed`; serialization exhaustion → `serialization_conflict`);
- three-row post-lock barrier described;
- second FAIL recorded; re-review stays pending.

## Mutation checks (this round)

user-row lock removed · workspace-row lock removed · member-row lock removed
· second `authorize` removed · user-status change ignored · workspace-status
change ignored · membership change ignored · trigger `OR role` dropped
(migration-level, live DB) · stale-after-role-change accepted · doc signature
loses workspaceId (doc lint/manual verify).

## Boundaries

Additive migration only if needed — none expected (Finding 1 is code-level;
Finding 2 is test-level). No S1-F2D, routes, UI, email, rate limiting,
ClientAssignment automation, PR, deploy, force-push. Prime Tracker untouched.
UI direction is documentation-only.
