# PR-W7 verify: Wire nutrition and meal plans

Card slug `pr-w7-nutrition-verify`. Independent verifier on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-w7-nutrition-verify` (local branch `beta/pr-w7-nutrition-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-W7/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-w7-nutrition --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-w7-nutrition-verify && git fetch origin && git checkout --detach origin/beta/pr-w7-nutrition`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-W7 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prw7 LANE_PORT=3801 CARD=PR-W7 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-W7/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3801 with a fresh `app_verify_prw7` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-W7/<role>-<width>.png`.
4. Parity (D32) on `s06-mealplan-editor.png`, `s06-template-nutrition.png`, `s10-mealplan-studio.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-W7/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-W7/verdict.md`, where the first line is `SHIP PR-W7 <head sha>` or `FIX PR-W7 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prw7`, leave the worktree clean.

## Acceptance to check

- The coach publishes the demo plan and the client sees the same totals the canvas shows; parity passes.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W7` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- V3-CO02: S06 CONFLICT: Nutrition totals computed automatically
- S06-01: S06 PARTIAL: Plan lifecycle: draft + single active + history + archive, status labels, date-applicable selection
- S06-02: S06 PARTIAL: Plan name + startDate fields
- S06-03: S06 UNCONFIGURED: Variant ("option") tabs: add, rename, duplicate, delete options
- S06-04: S06 PARTIAL: Meal rows: name, time, frequency; add/remove/duplicate/reorder meals
- S06-05: S06 MISSING: Food portions inside a meal: food row = catalog food + quantity in food's own unit
- S06-06: S06 MISSING: Approved alternatives ("Swap" per portion: alt food + equivalent quantity + optional note)
- S06-07: S06 CONFLICT: Per-portion, per-meal and per-variant computed kcal/P/C/F display
- S06-08: S06 CONFLICT: Macro-energy distribution ring (P/C/F % at 4/4/9) in overview + IIFYM preview
- S06-09: S06 MISSING: Variant schedule: Every day / Weekly (training+rest roles, weekday strip, custom weekdays) / Repeating cycle (anchor date + steps 1–28d, ≤36
- S06-10: S06 MISSING: Saved meals library: save meal, search by meal/food, rename, duplicate, delete with undo, load into meal
- S06-11: S06 PARTIAL: Food database: 584 foods {id,name,amount,unit,protein,carbs,fat,calories} powering pickers + nutrient math
- S06-12: S06 PARTIAL: DatePicker + TimePicker themed popovers (calendar grid, Apply-commit time edit, Today/Clear)
- S06-13: S06 PARTIAL: Client plan preview: "Prepared for {client}", variant label, schedule instruction text, per-meal food/portion/swap table, meal totals
- S06-14: S06 PARTIAL: IIFYM editor: named target options; style Calories\
- S06-15: S06 CONFLICT: IIFYM preview: target text, derived ~kcal from macro targets at 4/4/9, macro ring, schedule text
- S06-16: S06 PARTIAL: Plan validation on save/activate (name, valid start date, ≥1 option w/ positive portions, label/time validity, food refs exist, schedule com
- V2-H2: S06 CONFLICT: Blank numeric inputs saved as zero, violates missing-is-not-zero
- V3-CP09: S06 MISSING: IIFYM day cards for training and rest days
- V3-CP10: S06 CONFLICT: IIFYM macro distribution ring
- V3-CP11: S06 UNWIRED: ClientPlanPreview meal plan panel
- R3-3: S06 PARTIAL: Nutrition rolling window and declared as-of date
- R3-4: S06 CONFLICT: Computed attainment and below/above/minimum status
- R3-5: S06 CONFLICT: Fixed-target percent and ring fill
- R3-6: S06 PARTIAL: Configured TD/NTD/active source mapping
- R3-9: S06 CONFLICT: Weekly/monthly means of intake and target bounds
- R3-11: S06 CONFLICT: Collapsing a range target to one midpoint
- R3-14: S06 CONFLICT: Automatic starter meals, food picks and quantities
- S10-20: S10 UNWIRED: Meal plans studio page: plan/variant editing, nutrition targets, cycle schedule, saved-meal library, food swap picker, archive, client plan
