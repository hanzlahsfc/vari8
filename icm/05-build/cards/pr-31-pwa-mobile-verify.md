# PR-31 verify: PWA install and the Capacitor 8 scope

Card slug `pr-31-pwa-mobile-verify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-31-pwa-mobile-verify` (local branch `beta/pr-31-pwa-mobile-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-31/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-31-pwa-mobile --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-31-pwa-mobile-verify && git fetch origin && git checkout --detach origin/beta/pr-31-pwa-mobile`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-31 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_pr31 LANE_PORT=3831 CARD=PR-31 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-31/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3831 with a fresh `app_verify_pr31` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-31/<role>-<width>.png`.
4. Parity (D32) on none: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-31/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-31/verdict.md`, where the first line is `SHIP PR-31 <head sha>` or `FIX PR-31 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_pr31`, leave the worktree clean.

## Acceptance to check

- Chrome reports the app installable at 390 width; the scope document names native scope and gates and promises no release.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-31` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)
