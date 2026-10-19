# PR-03B verify: Fix the react-hooks v6 findings

Card slug `pr-03-react-hooks-verify`. Independent verifier on a different model than the builder (devin/swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-03-react-hooks-verify` (local branch `beta/pr-03-react-hooks-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-03B/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-03-react-hooks --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-03-react-hooks-verify && git fetch origin && git checkout --detach origin/beta/pr-03-react-hooks`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-03B && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_pr03b LANE_PORT=3711 CARD=PR-03B icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-03B/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3711 with a fresh `app_verify_pr03b` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-03B/<role>-<width>.png`.
4. Parity (D32) on none: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-03B/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-03B/verdict.md`, where the first line is `SHIP PR-03B <head sha>` or `FIX PR-03B <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_pr03b`, leave the worktree clean.

## Acceptance to check

- Lint exits 0 with the four rules at `error`; before and after screenshots at 1440 and 390 show no visual change on every touched screen.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-03B` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)
