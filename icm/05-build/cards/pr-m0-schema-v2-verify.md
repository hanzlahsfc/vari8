# PR-M0 verify: Schema v2: every canvas entity in one migration set

Card slug `pr-m0-schema-v2-verify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-m0-schema-v2-verify` (local branch `beta/pr-m0-schema-v2-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-M0/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/vari8 --head beta/pr-m0-schema-v2 --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-m0-schema-v2-verify && git fetch origin && git checkout --detach origin/beta/pr-m0-schema-v2`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-M0 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prm0 LANE_PORT=3732 CARD=PR-M0 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-M0/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3732 with a fresh `app_verify_prm0` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-M0/<role>-<width>.png`.
4. Parity (D32) on none: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-M0/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/vari8 --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-M0/verdict.md`, where the first line is `SHIP PR-M0 <head sha>` or `FIX PR-M0 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prm0`, leave the worktree clean.

## Acceptance to check

- `prisma migrate deploy` on a fresh and on a seeded database exits 0; `prisma validate` exits 0; the seed still runs.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-M0` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- V3-L1-Plan: S05 MISSING: Flat Plan entity has no backend model
- V3-L1-ClientPlans: S05 MISSING: ClientPlans aggregate has no backend equivalent
- V3-L1-IIFYM: S06 MISSING: IifymOption and IifymPlan have no backend equivalent
- V3-L1-ClientGoal: S07 MISSING: ClientGoal has no backend equivalent

## Production-readiness P0 rows this PR owns (`icm/05-build/audits/PRODREADY-BASELINE.md`)

- PR-001: Designed schema, not improvised tables (PARTIAL): baseline owner
- PR-015: Migrations run forward and roll back (PARTIAL): baseline owner
- PR-024: Timezones stored correctly (PARTIAL): baseline owner
