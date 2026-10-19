# PR-W4 verify: Wire the client tracker, trends and roadmap

Card slug `pr-w4-tracker-verify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-w4-tracker-verify` (local branch `beta/pr-w4-tracker-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-W4/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-w4-tracker --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-w4-tracker-verify && git fetch origin && git checkout --detach origin/beta/pr-w4-tracker`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-W4 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prw4 LANE_PORT=3792 CARD=PR-W4 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-W4/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3792 with a fresh `app_verify_prw4` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-W4/<role>-<width>.png`.
4. Parity (D32) on `s09-tracker-today.png`, `s09-tracker-week.png`, `s09-tracker-trends.png`, `s09-tracker-config.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-W4/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-W4/verdict.md`, where the first line is `SHIP PR-W4 <head sha>` or `FIX PR-W4 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prw4`, leave the worktree clean.

## Acceptance to check

- The client logs three days, reloads, and Week and Trends draw from the server; parity passes.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W4` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S07-17: S07 PARTIAL: Roadmap / Timeline tab: weekly rows (Mon-Sun), phase column + badge, per-metric cells (Weekly average / Trend / Adherence / Target vs actual
- S07-18: S07 MISSING: Goals editor (shared file): numeric field goals {fieldId, value, unit, date} feeding roadmap targets
- S09-01: S09 PARTIAL: Tracker shell: title, client name, "Log data"/"Coach notes" entry-mode switch, Configure button, Today/Week/Trends view switch, status line
- S09-02: S09 PARTIAL: Monday-first 7-day strip with per-day recorded dots, prev/next week, return-Today, "future date logging unavailable"
- S09-03: S09 PARTIAL: Edit-in-progress guard blocking date/view switches
- S09-04: S09 PARTIAL: Today heading: weekday/date + "N of M recorded" completion dot
- S09-05: S09 MISSING: Daily overview strip: up to 4 pinned metrics in configured order (summaryParameterIds / Variant.trackerHighlights)
- S09-06: S09 PARTIAL: Category grouping of fields (Weight basics, Nutrition, Sleep, ...) in template order, with per-group recorded counts
- S09-07: S09 UNCONFIGURED: Numeric measurement cell: read value, inline edit, min/max + decimals validation, canonical-unit storage
- S09-08: S09 PARTIAL: Rating cell: 1-10 / 1-5 select, word-labels display ("Low/Moderate/High", sleep "Poor/Okay/Good")
- S09-09: S09 UNCONFIGURED: Clearing a recorded value back to empty
- S09-10: S09 CONFLICT: Time fields (weigh-in time, bedtime, wake-time) with 12/24-hour editor
- S09-11: S09 UNCONFIGURED: Blood-pressure "118/76" single formatted field
- S09-12: S09 UNCONFIGURED: Free-text daily note / context note fields
- S09-13: S09 UNCONFIGURED: Single-choice field (select from configured options)
- S09-14: S09 PARTIAL: Multi-choice field with optional note ({choices[], note} JSON)
- S09-15: S09 PARTIAL: Location-rating composite ({location, rating 1-10})
- S09-16: S09 PARTIAL: Context field (answer Yes/No + context note)
- S09-18: S09 PARTIAL: Week view: transposed 7-day metric x date table, sticky labels, collapsible groups, per-metric summary cell (Average / Latest / Total / Most
- S09-19: S09 MISSING: Trends view: searchable metric picker (max 3), ranges 7/30/56/90/180 days, numeric line/bar charts, completion grids, dated text lists, late
- S09-20: S09 MISSING: "Coach notes" mode: coach-only comment popover per value, dot marker, "Coach note:" display under the field
- S09-21: S09 PARTIAL: Coach viewing a client's recorded tracker data (values, ratings, text)
- S09-22: S09 PARTIAL: Configured display units + conversions (kg/lb, cm/in, L/fl oz, kcal/kJ, degC/degF, mg/dL<->mmol/L, mg<->g, 12/24h)
- S09-23: S09 PARTIAL: TrackerConfig projected from assigned template (parameterIds order, cycleTrackingEnabled, fieldUnits, fieldOptions, ratingScales, energyUnit
- S09-24: S09 PARTIAL: Client preview shell: banner (avatar, name, "Assigned/Sample athlete . template", preview note), tab strip (Dashboard, Tracker, Timeline/Roa
- S09-25: S09 MISSING: Sample athlete + deterministic 56-day synthetic history for unassigned template preview
- S09-26: S09 PARTIAL: Persisted shapes: TrackerEntry[] {date, values{paramId:number}}, textValues Record<"date:paramId",string>, comments Record<"date:paramId",st
- S09-27: S09 MISSING: Weight trend arrow on the cell ("Up/Down X kg compared with the previous recorded weight")
- S09-28: S09 PARTIAL: State messaging: "No tracking fields configured", "Future date . logging unavailable", "Finish editing to change dates or views", "Updated"/
- V3-BWB15: S09 UNWIRED: SmoothTrend primitive exists without a product data path
- V3-CP06: S09 MISSING: Roadmap header and phase badge
- V3-CP07: S09 MISSING: Roadmap weekly table
- V3-CP08: S09 MISSING: Roadmap phase select per week
- V3-CO03: S09 CONFLICT: Tracker edits overwrite values without revision history
- R3-13: S09 CONFLICT: Calories as an ordinary entered parameter
- S10-18: S10 PARTIAL: Client tracker studio page: configurator (categories body/nutrition/recovery/movement, parameter pick, unit config, summary pick, rating sca
- S11-19: S11 UNCONFIGURED: Client logs own daily tracker entries and cell comments
- S09-17: CONFLICT (S09): Cycle tracking group. Wired like any parameter (D19).
