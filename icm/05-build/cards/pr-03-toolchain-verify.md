# PR-03 verify: Adopt Biome, TypeScript 7 and Turbopack

Card slug `pr-03-toolchain-verify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-03-toolchain-verify` (local branch `beta/pr-03-toolchain-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-03/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/vari8 --head beta/pr-03-toolchain --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-03-toolchain-verify && git fetch origin && git checkout --detach origin/beta/pr-03-toolchain`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-03 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_pr03 LANE_PORT=3723 CARD=PR-03 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-03/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3723 with a fresh `app_verify_pr03` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-03/<role>-<width>.png`.
4. Parity (D32) on `s01-roster.png`, `s01-profile-overview.png`, `s01-profile-plans.png`, `s01-profile-checkins.png`, `s01-profile-notes.png`, `s01-profile-onboarding.png`, `s02-messages.png`, `s02-thread.png`, `s02-thread-attachments.png`, `s02-notes-todos.png`, `s03-checkins-board.png`, `s03-add-extra.png`, `s03-checkin-review.png`, `s04-habit-editor.png`, `s04-template-habits.png`, `s05-templates.png`, `s05-template-editor.png`, `s05-tracker-setup.png`, `s05-client-setup.png`, `s06-mealplan-editor.png`, `s06-template-nutrition.png`, `s07-training-editor.png`, `s07-exercise-library.png`, `s08-builder.webp`, `s08-widget-gallery.png`, `s08-template-dashboard.png`, `s09-tracker-today.png`, `s09-tracker-week.png`, `s09-tracker-trends.png`, `s09-tracker-config.png`, `s10-appearance.png`, `s10-clients-studio.png`, `s10-mealplan-studio.png`, `s11-preferences.png`, `s11-client-preview.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-03/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/vari8 --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-03/verdict.md`, where the first line is `SHIP PR-03 <head sha>` or `FIX PR-03 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_pr03`, leave the worktree clean.

## Acceptance to check

- One lint and format command passes, `tsc` exits 0, no `--webpack` anywhere, the parity check stays green on all 35 screens.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-03` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Production-readiness P0 rows this PR owns (`icm/05-build/audits/PRODREADY-BASELINE.md`)

- PR-036: Secrets out of code, repo and chat history (PARTIAL): secret scan of the tree and full history in the local gate, plus a pre-commit secret hook
- PR-038: Every installed package exists and is the intended one (PARTIAL): package provenance review next to the dependency scan (PR-039)
- PR-039: Dependency scanning (MISSING): baseline owner
- PR-062: Deploy pipeline runs the tests (PARTIAL): baseline owner
