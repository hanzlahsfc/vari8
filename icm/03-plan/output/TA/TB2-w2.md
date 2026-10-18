# TB2-w2 describe-level audit

Worktree: /home/nexuslink/.hermes/cache/scratch/vari8-tb/TB2-w2 @ 58eb6ed. DB: app_tb_tb2_w2.
Baselines (INTEGRATION_DATABASE_URL exported, `npx vitest run --config vitest.integration.config.ts`, all pass):
- tests/integration/training-i1a.test.ts: 20 passed
- tests/integration/p013-onboarding-assignments.test.ts: 30 passed
- tests/integration/checkin-feedback-i1.test.ts: 21 passed
- tests/integration/p025d2-checkin-calendar.test.ts: 14 passed
- tests/integration/p008-onboarding-actions.test.ts: 12 passed

Structure note: in every file the outer `describe.skipIf(!enabled)` is an env gate, so the audited top-level blocks are the describes it wraps (files with only the gate + flat `it`s count as one block). p013 has 9 real nested blocks; p025d2 has two sibling top-level describes; the other three files are one block each.

Summary: 14 blocks, 97 tests, 4430 block lines. KEEP 14 blocks / 97 tests / 4430 lines. CUT 0. CUT share: 0% of tests, 0% of lines.

| file | block | lines | tests | target | verdict | reason or mutation | failed tests |
|---|---|---|---|---|---|---|---|
| tests/integration/training-i1a.test.ts | TRAINING-I1A (real PG) | 1348 | 20 | lib/trainingprogram/service.ts saveTrainingProgramDraft / publishTrainingProgramVersion + guard | KEEP | service.ts:796 `if (program.draft_revision !== input.expectedRevision)` -> `if (false)` (save-path stale_revision CAS dropped) -> FAIL (1) | "assigned coach + assigned owner author; CAS save bumps and audits {changed}" (stale-retry rejects.toMatchObject stale_revision) |
| tests/integration/p013-onboarding-assignments.test.ts | schema constraints | 104 | 3 | db/migrations/20261006180000_p013_onboarding_assignments/migration.sql (partial unique + composite FKs + provenance CHECK) | KEEP | migration.sql:94-96 dropped `CREATE UNIQUE INDEX onboarding_assignment_one_active_key`, applied via `prisma migrate reset`, then file restored and DB re-reset -> FAIL (1) | "permits one ACTIVE row per (workspace, client, form) only" |
| tests/integration/p013-onboarding-assignments.test.ts | authorization | 194 | 7 | lib/onboarding/assignments.ts assignmentWhere + authorize/authorizeCollection | KEEP | assignments.ts:135 `ctx.grantedScope === "workspace"` -> `=== "assigned"` -> FAIL (4) | own block: "owner sees all assignments; coach sees only assigned clients'", "paginates with the opaque id cursor and never repeats rows", "assignment revocation takes effect immediately"; also P3-assistant block test |
| tests/integration/p013-onboarding-assignments.test.ts | eligibility | 50 | 2 | lib/onboarding/assignments.ts listAssignableForms + ELIGIBLE_CLIENT_PREDICATE | KEEP | assignments.ts:326 `versions: { some: {} }` -> `{ none: {} }` -> FAIL (2) | own block: "lists only ACTIVE forms with a published version"; also P2-3 block test (ownerForms empty) |
| tests/integration/p013-onboarding-assignments.test.ts | create / replace / cancel lifecycle | 372 | 12 | lib/onboarding/assignments.ts createOnboardingAssignment / replace / cancel + requireAssignableForm | KEEP | assignments.ts:228 requireAssignableForm `versionSeq: "desc"` -> `"asc"` (pins earliest published version) -> FAIL (2) | "creates an ACTIVE row pinned to the latest published version + ASSIGN audit", "replace supersedes atomically and pins the latest version" |
| tests/integration/p013-onboarding-assignments.test.ts | authorization order and non-disclosure (P2-1) | 185 | 2 | lib/onboarding/assignments.ts authorizeAssignmentTarget | KEEP | assignments.ts:489-493 removed the AccessDeniedError -> assignment_not_accessible remap (rethrow raw) -> FAIL (2) | own block: "denied callers get identical not_accessible for missing/active/terminal/foreign"; also authorization block's "assignment revocation takes effect immediately" |
| tests/integration/p013-onboarding-assignments.test.ts | form-picker authorization (P2-3) | 51 | 1 | lib/onboarding/assignments.ts listAssignableForms authorizeCollection | KEEP | assignments.ts:316 `resource: "onboardingFormTemplates"` -> `"onboardingAssignments"` (assistant then authorized) -> FAIL (1) | "listAssignableForms requires form-template read - assistant is denied" |
| tests/integration/p013-onboarding-assignments.test.ts | platform-admin dual role (P3) | 20 | 1 | lib/auth/guard.ts PLATFORM_ADMIN_DENIED_RESOURCES | KEEP | guard.ts:134 removed `"onboardingAssignments"` from the deny-set -> FAIL (1) | "a PLATFORM_ADMIN with an ACTIVE workspace membership stays denied" |
| tests/integration/p013-onboarding-assignments.test.ts | assistant assigned read scope (P3) | 39 | 1 | lib/onboarding/assignments.ts assignmentWhere assigned-scope filter | KEEP | assignments.ts:143 assigned-scope `status: "ACTIVE"` -> `"REMOVED"` (ACTIVE ClientAssignment no longer counts) -> FAIL (3) | own block: "assistant sees rows only for clients under its ACTIVE ClientAssignment"; also authorization block's owner/coach-scope and revocation tests |
| tests/integration/p013-onboarding-assignments.test.ts | feature gate | 26 | 1 | lib/onboarding/assignments-boundary.ts gated() -> isOnboardingAssignmentsEnabled | KEEP | assignments-boundary.ts gated() body -> `return true` (flag-off calls proceed) -> FAIL (1) | "flag-off boundary call produces zero mutations and zero audits" |
| tests/integration/checkin-feedback-i1.test.ts | CHECK-IN-FEEDBACK-I1 (real PG) | 1011 | 21 | lib/checkin/instances.ts sendCheckInFeedback / resolveCheckInFeedbackSend / listCheckInFeedback / listOwnCheckInFeedback / readCheckInSubmissionDetail | KEEP | instances.ts:2705 send-path `ctx.grantedScope !== "assigned"` -> `!== "workspace"` (all writes denied) -> FAIL (18) | 18 of 21: send idempotency, replay, nonce scope, concurrency, consent-withdrawal, detail canSend gating, keyset pagination, recovery resolver, revocation, audit atomicity, 2000-char bound, own-list |
| tests/integration/p025d2-checkin-calendar.test.ts | P-025-D2 calendar list (real PG) | 498 | 10 | lib/checkin/instances.ts listCheckInInstancesForClient range filter + presentation/late + deny | KEEP | instances.ts:1080 dropped the `dueAt: { gte: range.from, lt: range.to }` range predicate -> FAIL (5) | own block: "owner workspace scope returns the bounded range in dueAt order - out-of-range absent", "assigned coach and assistant both read the same bounded range", "an empty range window returns zero items"; also 2 truncation-block tests (unfiltered rows overflow 200) |
| tests/integration/p025d2-checkin-calendar.test.ts | P-025-D2 R2 truncation signal (real PG) | 221 | 4 | lib/checkin/instances.ts take: listMax + extra-row overflow detection | KEEP | instances.ts:1105 `take: CHECKIN_INSTANCE_LIMITS.listMax + (range !== null ? 1 : 0)` -> `take: CHECKIN_INSTANCE_LIMITS.listMax` -> FAIL (1) | "201 eligible -> first 200 items, truncated true; range and scope rows do not count" |
| tests/integration/p008-onboarding-actions.test.ts | P-008 onboarding actions (real PG) | 311 | 12 | app/workspace/[workspaceId]/onboarding/actions.ts -> forms-boundary.ts -> lib/onboarding/forms.ts | KEEP | forms.ts:585 publish `versionSeq = (max._max.versionSeq ?? 0) + 1` -> `+ 2` -> FAIL (2) | "owner runs the full action lifecycle", "active COACH runs the full action lifecycle" (both assert literal versionSeq: 1) |

## Per-file verdicts

- tests/integration/training-i1a.test.ts: KEEP-ALL. Baseline 20 passed.
- tests/integration/p013-onboarding-assignments.test.ts: KEEP-ALL. Baseline 30 passed.
- tests/integration/checkin-feedback-i1.test.ts: KEEP-ALL. Baseline 21 passed.
- tests/integration/p025d2-checkin-calendar.test.ts: KEEP-ALL. Baseline 14 passed.
- tests/integration/p008-onboarding-actions.test.ts: KEEP-ALL. Baseline 12 passed.

Every block exercises the real DB path and asserts literal results; nothing was shape-only, mock-only, or a framework re-test, so nothing was CUT on sight and every block got a bite check that failed at least one of its own tests.

## Could not check

Nothing. All 5 files ran; all 14 blocks were judged.

## Self-check

PASS.
(a) All 5 assigned files audited; block counts: training-i1a 1, p013 9, checkin-feedback-i1 1, p025d2 2, p008 1 = 14 blocks, all listed above with line ranges and test counts matching verbose baselines (97 tests total).
(b) Every KEEP block (14) has a recorded mutation that failed at least one of its own tests; failed-test names are quoted per row. Cross-block failures are noted where they occurred.
(d) Nothing written outside this report file in the main repo: `git status --short` in the worktree shows only `?? tb-mutate.sh` (the provided lever, untracked, pre-existing); HEAD still 58eb6ed; every mutation restored via the lever (each log ends `MUTATION-RUN ... (file restored)`); the schema mutation's DB side was restored with a second `prisma migrate reset` (RESTORE_RESET_EXIT=0) and `onboarding_assignment_one_active_key` verified present via psql. Scratch /tmp files and logs are outside any repo.
