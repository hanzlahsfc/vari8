# PR-01 verify: Take over the whole canvas into the root app

Card slug `pr-01-canvas-takeover-verify`. Independent verifier on a different model than the builder (devin/swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-01-canvas-takeover-verify` (local branch `beta/pr-01-canvas-takeover-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-01/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-01-canvas-takeover --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-01-canvas-takeover-verify && git fetch origin && git checkout --detach origin/beta/pr-01-canvas-takeover`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-01 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_pr01 LANE_PORT=3717 CARD=PR-01 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-01/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3717 with a fresh `app_verify_pr01` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-01/<role>-<width>.png`.
4. Parity (D32) on `s01-roster.png`, `s01-profile-overview.png`, `s01-profile-plans.png`, `s01-profile-checkins.png`, `s01-profile-notes.png`, `s01-profile-onboarding.png`, `s02-messages.png`, `s02-thread.png`, `s02-thread-attachments.png`, `s02-notes-todos.png`, `s03-checkins-board.png`, `s03-add-extra.png`, `s03-checkin-review.png`, `s04-habit-editor.png`, `s04-template-habits.png`, `s05-templates.png`, `s05-template-editor.png`, `s05-tracker-setup.png`, `s05-client-setup.png`, `s06-mealplan-editor.png`, `s06-template-nutrition.png`, `s07-training-editor.png`, `s07-exercise-library.png`, `s08-builder.webp`, `s08-widget-gallery.png`, `s08-template-dashboard.png`, `s09-tracker-today.png`, `s09-tracker-week.png`, `s09-tracker-trends.png`, `s09-tracker-config.png`, `s10-appearance.png`, `s10-clients-studio.png`, `s10-mealplan-studio.png`, `s11-preferences.png`, `s11-client-preview.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-01/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-01/verdict.md`, where the first line is `SHIP PR-01 <head sha>` or `FIX PR-01 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_pr01`, leave the worktree clean.

## Acceptance to check

- Signed in as the seed owner, all 35 screens render on the root app and pass the D32 parity check at 1440 and 390, with the account block showing the real name and role; sign-out returns to `/login`.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-01` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-01: S01 PARTIAL: /coach page mounts the whole workspace client-side inside Suspense
- S01-02: S01 PARTIAL: Sidebar brand: uploaded logo image or "infinity." wordmark plus "COACH WORKSPACE" label
- S01-03: S01 PARTIAL: Section nav: Clients, Templates, Check-ins, Messages, Notes & to-dos
- S01-05: S01 PARTIAL: Account block: initials avatar, coach name, "Coach" role, opens preferences dialog
- S01-07: S01 PARTIAL: Utility header breadcrumb: Workspace / Section / Editor
- S01-08: S01 PARTIAL: Dark/light mode toggle in header
- S01-09: S01 MISSING: "Local demo" / "Session only" storage indicator
- S01-12: S01 PARTIAL: Client-side route model ?section&client&editor&review&plan&tab + navigation guard ref
- S01-41: S01 PARTIAL: Shared canvas UI primitives + polish styles (Button, IconButton, Avatar, SearchBox, Select, Toggle, Empty, Dialog, PageTitle, Surface, Trans
- R3-1: S01 MISSING: Global user reduced-motion policy (MotionConfig at the root)
- S10-04: S10 MISSING: Ethereal studio shell: routes / (re-export) and /ethereal, sticky island header, 5-page segmented nav, hash routing #appearance
- S10-11: S10 MISSING: Foundations specimen gallery (type/numbers, actions/states, text+validation, choices+tabs, compact health fields incl. BP mask, confirm/empt
- S10-12: S10 MISSING: Ethereal primitive library (Avatar, StatusLabel, LabelTag, Segmented, SelectControl, TextInput, CheckboxControl, SwitchControl, Tabs, Widget
- S10-13: S10 UNWIRED: BodyweightTrend + NutritionTargets specimen components (SVG monotone chart, period select 7/14/30, metrics strip, macro target bars, add-sam
- S10-21: S10 PARTIAL: Ethereal theme token layer: eg-root data-mode vars (--canvas/--surface/--text/--muted/--border/--success/--warning/--danger/--accent-*) + at
- S11-01: S11 UNWIRED: Signed-in coach identity chip: avatar initials, "Liliana Mansfeld", "Coach" role label in sidebar
- S11-02: S11 UNWIRED: Implied authenticated coach session (whole /coach app assumes a signed-in coach; canvas has zero auth UI)
- S11-03: S11 UNWIRED: No sign-out affordance in canvas
