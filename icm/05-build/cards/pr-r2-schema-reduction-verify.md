# PR-R2 verify: Drop database models left without a reader

Card slug `pr-r2-schema-reduction-verify`. Independent verifier on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-r2-schema-reduction-verify` (local branch `beta/pr-r2-schema-reduction-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-R2/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-r2-schema-reduction --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-r2-schema-reduction-verify && git fetch origin && git checkout --detach origin/beta/pr-r2-schema-reduction`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-R2 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prr2 LANE_PORT=3816 CARD=PR-R2 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-R2/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3816 with a fresh `app_verify_prr2` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-R2/<role>-<width>.png`.
4. Parity (D32) on none: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-R2/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-R2/verdict.md`, where the first line is `SHIP PR-R2 <head sha>` or `FIX PR-R2 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prr2`, leave the worktree clean.

## Acceptance to check

- Migration applies to a fresh and to a seeded database; the app and the seed run.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-R2` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Backend orphans this PR owns (delete or keep as each line says)

- S12-17: User model (platform identity). Evidence: `db/schema.prisma:124`. (model census: keep if read, drop if not (D33, D34))
- S12-18: Workspace model (tenant boundary). Evidence: `db/schema.prisma:160`. (model census: keep if read, drop if not (D33, D34))
- S12-19: WorkspaceMember model. Evidence: `db/schema.prisma:203`. (model census: keep if read, drop if not (D33, D34))
- S12-20: CoachProfile model. Evidence: `db/schema.prisma:278`. (model census: keep if read, drop if not (D33, D34))
- S12-21: ClientAssignment model (coach-client link). Evidence: `db/schema.prisma:332`. (model census: keep if read, drop if not (D33, D34))
- S12-23: AuditEvent model. Evidence: `db/schema.prisma:375`. (model census: keep if read, drop if not (D33, D34))
- S12-24: AccessToken model (invite/reset tokens). Evidence: `db/schema.prisma:420`. (model census: keep if read, drop if not (D33, D34))
- S12-25: NutritionImportRun model. Evidence: `db/schema.prisma:501`. (model census: keep if read, drop if not (D33, D34))
- S12-26: NutritionImportRowOutcome model. Evidence: `db/schema.prisma:527`. (model census: keep if read, drop if not (D33, D34))
- S12-27: ExerciseImportRun model. Evidence: `db/schema.prisma:581`. (model census: keep if read, drop if not (D33, D34))
- S12-28: ExerciseImportRowOutcome model. Evidence: `db/schema.prisma:607`. (model census: keep if read, drop if not (D33, D34))
- S12-29: OnboardingForm model. Evidence: `db/schema.prisma:632`. (model census: keep if read, drop if not (D33, D34))
- S12-30: OnboardingFormVersion model. Evidence: `db/schema.prisma:660`. (model census: keep if read, drop if not (D33, D34))
- S12-31: OnboardingFormAssignment model. Evidence: `db/schema.prisma:695`. (model census: keep if read, drop if not (D33, D34))
- S12-32: OnboardingSubmissionReview model. Evidence: `db/schema.prisma:1165`. (model census: keep if read, drop if not (D33, D34))
