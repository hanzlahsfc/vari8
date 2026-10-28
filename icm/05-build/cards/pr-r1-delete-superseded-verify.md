# PR-R1 verify: Delete what the canvas replaced

Card slug `pr-r1-delete-superseded-verify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-r1-delete-superseded-verify` (local branch `beta/pr-r1-delete-superseded-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-R1/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/vari8 --head beta/pr-r1-delete-superseded --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-r1-delete-superseded-verify && git fetch origin && git checkout --detach origin/beta/pr-r1-delete-superseded`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-R1 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prr1 LANE_PORT=3813 CARD=PR-R1 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-R1/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3813 with a fresh `app_verify_prr1` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-R1/<role>-<width>.png`.
4. Parity (D32) on `s01-roster.png`, `s01-profile-overview.png`, `s01-profile-plans.png`, `s01-profile-checkins.png`, `s01-profile-notes.png`, `s01-profile-onboarding.png`, `s02-messages.png`, `s02-thread.png`, `s02-thread-attachments.png`, `s02-notes-todos.png`, `s03-checkins-board.png`, `s03-add-extra.png`, `s03-checkin-review.png`, `s04-habit-editor.png`, `s04-template-habits.png`, `s05-templates.png`, `s05-template-editor.png`, `s05-tracker-setup.png`, `s05-client-setup.png`, `s06-mealplan-editor.png`, `s06-template-nutrition.png`, `s07-training-editor.png`, `s07-exercise-library.png`, `s08-builder.webp`, `s08-widget-gallery.png`, `s08-template-dashboard.png`, `s09-tracker-today.png`, `s09-tracker-week.png`, `s09-tracker-trends.png`, `s09-tracker-config.png`, `s10-appearance.png`, `s10-clients-studio.png`, `s10-mealplan-studio.png`, `s11-preferences.png`, `s11-client-preview.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-R1/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/vari8 --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-R1/verdict.md`, where the first line is `SHIP PR-R1 <head sha>` or `FIX PR-R1 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prr1`, leave the worktree clean.

## Acceptance to check

- Full local gate green; parity green on all 35 screens; the line count drop is reported per directory.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-R1` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-13: S01 MISSING: Whole-state persistence: localStorage key coach-desktop-mockup-v1, isCoachState validation, migrate+normalize on hydrate

## Backend orphans this PR owns (delete or keep as each line says)

- S12-08: Raw workbook sheet index (dev tool). Evidence: `app/sheets/page.tsx:12`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-09: Raw workbook sheet detail (dev tool). Evidence: `app/sheets/[slug]/page.tsx:20`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-10: Workspace list (workspace picker). Evidence: `app/workspace/page.tsx:15`. (old UI page, delete after the canvas screen is wired (D33))
- S12-11: Owner-only workspace admin area. Evidence: `app/workspace/[workspaceId]/admin/page.tsx:12`. (old UI page, delete after the canvas screen is wired (D33))
- S12-12: Client coach-assignment panel + actions. Evidence: `app/workspace/[workspaceId]/clients/[clientProfileId]/coac (old UI page, delete after the canvas screen is wired (D33))
- S12-45: Extraction cross-sheet pass. Evidence: `lib/extraction/crosssheet.ts:1`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-50: Extraction redaction. Evidence: `lib/extraction/redact.ts:1`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-51: Extraction source loader. Evidence: `lib/extraction/source.ts:1`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-52: Extraction summaries. Evidence: `lib/extraction/summaries.ts:1`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-53: Extraction theme. Evidence: `lib/extraction/theme.ts:1`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- R3-16: Template-version upgrade, rollback, discovery, review and execute. Evidence: `lib/coaching/client-setup-transi (census then delete or keep (D33, BACKEND-REDUCTION F4, F6))
- R3-18: Client-task title and date editing, and cancellation. Evidence: `lib/tasks/service.ts:311,391`, `app/workspace (census then delete or keep (D33, BACKEND-REDUCTION F4, F6))
- R3-20: Dead duplicate sheetDisplayName helper. Evidence: `lib/catalog.ts:172-174`, live duplicate `lib/spec-artifacts (census then delete or keep (D33, BACKEND-REDUCTION F4, F6))
- R3-21: Public synthetic fixture library pages, not canvas catalog editors. Evidence: `app/library/foods/page.tsx:1-26 (census then delete or keep (D33, BACKEND-REDUCTION F4, F6))
- R3-22: Uncalled versionForWeek helper. Evidence: `lib/trainingprogram/weeks.ts:185-211`, no production caller (search (census then delete or keep (D33, BACKEND-REDUCTION F4, F6))
