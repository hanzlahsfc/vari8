# PR-02 verify: Upgrade root to Next 16.3 and React 19.3

Card slug `pr-02-next16-verify`. Independent verifier on a different model than the builder (devin/swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-02-next16-verify` (local branch `beta/pr-02-next16-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-02/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-02-next16 --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-02-next16-verify && git fetch origin && git checkout --detach origin/beta/pr-02-next16`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-02 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_pr02 LANE_PORT=3702 CARD=PR-02 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-02/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3702 with a fresh `app_verify_pr02` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-02/<role>-<width>.png`.
4. Parity (D32) on none: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-02/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-02/verdict.md`, where the first line is `SHIP PR-02 <head sha>` or `FIX PR-02 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_pr02`, leave the worktree clean.

## Acceptance to check

- Root typecheck, lint, build and unit tests exit 0 on Next 16.3 and React 19.3; `frontend/` still builds; sign-in page answers 200.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-02` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)
