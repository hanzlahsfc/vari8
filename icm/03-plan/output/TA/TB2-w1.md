# TB2-w1 describe-level audit

Worker 1 of 4, lane TB2. Worktree /home/nexuslink/.hermes/cache/scratch/vari8-tb/TB2-w1
at 58eb6ed. Database app_tb_tb2_w1 only. Method: baseline run per file, then one
meaningful mutation per non-trivial block via ./tb-mutate.sh (or a direct SQL
drop when the block's target is a deployed DB constraint), --reporter=verbose for
attribution, restore verified after each run.

Baselines (all green, npx vitest run --config vitest.integration.config.ts <file>):
solo-coach-i1 6, p010-client-roster 9, s1-a-identity 13, s1-d-consent 13,
p025d6-checkin-tracker-context 35, p016-client-setup 42. Total 118 tests.

## Summary

11 top-level blocks audited across 6 files (118 tests, ~4183 block lines).
KEEP 11 blocks / 118 tests / 4183 lines. CUT 0 blocks / 0 tests / 0 lines.
CUT share: 0% of tests, 0% of lines.
p016's five nested describes were split into blocks because each targets
different code (DB constraints, authorization gate, eligibility reads,
create/cancel service, positional-selection boundary). s1-a has two top-level
describes; the other four files have one each.

## Table

| file | block | lines | tests | target | verdict | reason or mutation | failed tests |
|---|---|---|---|---|---|---|---|
| solo-coach-i1.test.ts | SOLO-COACH-I1 owner-as-coach (real PG) | 28-299 (272) | 6 | lib/workspace/clients.ts: assignCoach, setPrimaryCoach, removeClientAssignment, listClientAssignments, listAssignableCoachMembers | KEEP | clients.ts: `if (targetRole === "WORKSPACE_OWNER") return true;` -> `return false;` | owner self-assigns as PRIMARY through the service; owner member is eligible as COACH + set-primary promotes the owner row; removing an assignment leaves the workspace membership untouched (3 of 6) |
| p010-client-roster.test.ts | P-010 client roster (real PG) | 33-359 (327) | 9 | lib/workspace/clients.ts: listAccessibleClientProfiles + buildClientProfileWhere; lib/workspace/roster-query.ts: parse/next/prev | KEEP | clients.ts buildClientProfileWhere assigned-scope clause `status: "ACTIVE"` -> `status: "REMOVED"` | coach and assistant see only ACTIVE assigned clients; removed/unassigned invisible (1 of 9) |
| s1-a-identity.test.ts | S1-A identity & tenancy (real PostgreSQL) | 38-391 (354) | 11 | deployed schema from db/migrations/20260929120000_stage1_identity_tenancy: member unique pair, composite same-workspace FKs, active-primary partial index | KEEP | DB mutation: DROP INDEX client_assignment_one_active_primary_key (target is the deployed constraint, only reachable in the DB; index recreated with identical indexdef after run) | has the composite same-workspace FKs and the active-primary partial index; allows only one ACTIVE PRIMARY assignment per client (2 of 11) |
| s1-a-identity.test.ts | S1-A migration preserves existing User and authentication | 393-493 (101) | 2 | db/migrations/20260929120000_stage1_identity_tenancy/migration.sql (applied via prisma db execute to a scratch DB) + lib/credentials.ts: authorizeCredentials | KEEP | migration.sql `ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE'` -> `DEFAULT 'DEACTIVATED'`; run with `-t preserves` to isolate the block | keeps the existing User row and password hash, with safe defaults; still authorizes the existing credentials (2 of 2) |
| s1-d-consent.test.ts | S1-D versioned consent | 38-680 (643) | 13 | lib/consent.ts: grantOwnConsent, revokeOwnConsent, readOwnConsentStatus, authorizeHealthOperation; lib/auth/rbac.ts consent cell | KEEP | rbac.ts consent row `WORKSPACE_OWNER: D` -> `WORKSPACE_OWNER: c("workspace", "workspace")` | owner/coach/assistant/support/platform cannot grant or revoke (1 of 13). Only the enforcement wiring is the keep reason per D12; see trim notes below |
| p025d6-checkin-tracker-context.test.ts | P-025-D6 tracker context (real PG) | 55-1106 (1052) | 35 | lib/checkin/tracker-context.ts: readCheckInReviewTrackerContext, reconcileTrackerContextScopes, checkConsentIntersection | KEEP | tracker-context.ts `if (!member || member.status !== "ACTIVE")` -> `member.status === "ACTIVE"` | 12 of 35: owner reveals latest revision with one audit; assigned coach succeeds at scope assigned; assigned assistant succeeds; owner without assignment succeeds; returns only latest committed revision for exact date; one committed reveal writes exactly one structural READ audit; concurrent reveal vs revision write; D6 reveal vs concurrent Check-In mark; acquires csetup advisory BEFORE member; P-022 leads coherently; D6 leads coherently; crossed barrier completes |
| p016-client-setup.test.ts | schema constraints | 172-351 (180) | 3 | deployed schema from db/migrations/20261007170000_p016_client_setup_assignments: unique setup per (workspace,client), composite FKs, provenance CHECK, (setup,seq) unique, one-ACTIVE-pin partial index | KEEP | DB mutation: DROP INDEX client_setup_pin_one_active_key (index recreated with identical indexdef; duplicate ACTIVE pin row left by the run deleted first) | permits one setup per (workspace, client) and one ACTIVE pin per setup (1 of 3). Note the Serializable+advisory protocol still held: the concurrent-create lifecycle test passed without the index |
| p016-client-setup.test.ts | authorization | 353-543 (191) | 7 | lib/coaching/client-setup.ts services through lib/auth/rbac.ts clientSetups cell | KEEP | rbac.ts clientSetups `COACH: c("assigned", "assigned")` -> `COACH: D` | 3 of 7 own tests: owner sees all pins/coach sees only assigned; coach revocation fails closed mid-flight; a second ACTIVE assigned coach may cancel. Also failed 4 cross-block tests that drive coach actors (eligibility listEligibleClients; lifecycle coach-denied; R2 revoked-scope-stale, tampered cancel index) |
| p016-client-setup.test.ts | eligibility | 545-592 (48) | 2 | lib/coaching/client-setup.ts: listAssignableTemplates, listAssignableSetupClients | KEEP | client-setup.ts listAssignableTemplates `status: "ACTIVE"` -> `status: "ARCHIVED"` | lists only ACTIVE templates with a published version (1 of 2 own). Also failed 2 R2 tests that resolve against the template list (resolveAssignSelection maps valid index+fingerprint; full boundary contract) |
| p016-client-setup.test.ts | create / cancel lifecycle | 594-1106 (513) | 17 | lib/coaching/client-setup.ts: createClientSetupAssignment, cancelClientSetupAssignment, lockOrCreateSetup, authorizePinTarget | KEEP | client-setup.ts `if (existing) throw new ClientSetupError("assignment_conflict")` -> `if (!existing) ...` | 12 of 17 own: creates stable setup + seq-1 pin; rejects second current assignment; cancel transitions exactly once; reassignment after cancellation; cancel needs no eligibility; later published version never moves pin; cancel on foreign/missing/cross-workspace pins; concurrent creates one ACTIVE pin; concurrent cancels one transition; no C1 path writes SUPERSEDED; owner cancellation after client user deactivated; forced audit failure rolls back. Plus 3 authorization-block and 5 R2-block tests that call create/cancel |
| p016-client-setup.test.ts | P-016-R2 positional selection + fingerprint resolution | 1108-1609 (502) | 13 | lib/coaching/client-setup.ts: resolveAssignSelection, resolveCancelSelection, listClientSetupPinIds, fingerprintMismatch; lib/coaching/selection-fingerprint.ts; lib/coaching/client-setup-boundary.ts | KEEP | client-setup.ts fingerprintMismatch `return fingerprint !== expected;` -> `return false;` | 7 of 13 own: client-list change fails stale; template archived fails stale; client ineligible fails stale; coach revoked scope stale; fingerprint from another workspace cannot resolve; resolveCancelSelection changed row list fails stale; boundary surfaces safe message for stale form |

## Per-file verdict

- solo-coach-i1.test.ts: KEEP-ALL
- p010-client-roster.test.ts: KEEP-ALL
- s1-a-identity.test.ts: KEEP-ALL
- s1-d-consent.test.ts: KEEP-ALL (block kept for generic enforcement wiring only; see trim notes)
- p025d6-checkin-tracker-context.test.ts: KEEP-ALL
- p016-client-setup.test.ts: KEEP-ALL

## Trim notes inside kept blocks (test-level, for the lead)

Blocks are the unit here, but these individual tests look like constant pins
or parked consent mechanics per D11/D12 and are worth a pass-3 look:

- s1-a-identity.test.ts "S1-A identity & tenancy":
  - "applied both migrations" (l.77): asserts migration-name strings in
    _prisma_migrations; constant pin.
  - "has the composite same-workspace FKs and the active-primary partial index"
    (l.161): asserts constraint/index NAMES. It did fail under the index-drop
    mutation, so it bites on absence, but name equality is still a pin; the
    same protection is covered behaviorally by the insert-rejection tests.
  - "introduces no health/audit/token/product tables" (l.273): asserts a full
    literal table-name list; constant pin that fails on any new approved table.
- s1-d-consent.test.ts "S1-D versioned consent": under D12 the pure
  consent-mechanics tests are not a keep reason. That covers self-grant +
  readOwnConsentStatus (l.104), idempotent/concurrent grants (l.134),
  pagination (l.188), raw P2002 metadata pin (l.263, restates index column
  names), concurrent duplicate grant (l.290), revoke/re-grant history
  (l.392). The keep reasons are the enforcement tests: role-deny (l.463),
  workspace isolation + fail-closed missing clientProfileId (l.499),
  unassigned-coach denial (l.543), inactive fail-closed (l.598), deletion
  restriction + SetNull actor (l.631), partial unique index (l.661, name pin
  plus a real duplicate-reject half).

## Could not check

Nothing. All 6 files ran to completion in baseline and every KEEP verdict has a
mutation that failed at least one of the block's own tests.

## Self-check

PASS.

(a) File/block coverage: 6 assigned files, 11 blocks listed. Block counts:
solo-coach-i1 1, p010-client-roster 1, s1-a-identity 2, s1-d-consent 1,
p025d6 1, p016-client-setup 5 (nested describes split by target code).
Verified by grepping describe/it per file and by baseline test totals
(6+9+13+13+35+42 = 118) matching per-block sums (6+9+11+2+13+35+3+7+2+17+13).

(b) Every KEEP block has a recorded mutation that failed >= 1 of its own tests:
solo (3), p010 (1), s1-a block1 (2), s1-a block2 (2), s1-d (1), p025d6 (12),
p016 schema (1), p016 authz (3), p016 eligibility (1), p016 lifecycle (12),
p016 R2 (7).

(d) Writes outside the report file: none. `git status --short` in the worktree
shows only the untracked tb-mutate.sh lever (provided, not mine). All lever runs
ended with "MUTATION-RUN ... (file restored)"; the two SQL mutations were
restored by recreating the dropped indexes with byte-identical indexdef output.
No commits made. Scratch worktree and database left in place for the lead.
