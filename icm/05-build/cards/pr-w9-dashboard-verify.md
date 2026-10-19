# PR-W9 verify: Wire the dashboard builder

Card slug `pr-w9-dashboard-verify`. Independent verifier on a different model than the builder (devin/swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-w9-dashboard-verify` (local branch `beta/pr-w9-dashboard-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-W9/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-w9-dashboard --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-w9-dashboard-verify && git fetch origin && git checkout --detach origin/beta/pr-w9-dashboard`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-W9 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prw9 LANE_PORT=3807 CARD=PR-W9 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-W9/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3807 with a fresh `app_verify_prw9` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-W9/<role>-<width>.png`.
4. Parity (D32) on `s08-builder.webp`, `s08-widget-gallery.png`, `s08-template-dashboard.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-W9/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-W9/verdict.md`, where the first line is `SHIP PR-W9 <head sha>` or `FIX PR-W9 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prw9`, leave the worktree clean.

## Acceptance to check

- The client sees only client-visible widgets with live data; parity passes.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W9` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S04-13: S04 UNCONFIGURED: Builder widgets "Today's habits" (TL21) and "Habit consistency" (TL22) over HabitRecord{scheduledDates,completions[date,status done/skipped]
- S05-10: S05 MISSING: Dashboard config section (CoachDashboardEditor, bindDashboardUnits)
- S07-21: S07 MISSING: Dashboard widget "Training week, Completed sessions" (source "sessions")
- S08-01: S08 PARTIAL: Persisted dashboard draft document
- S08-02: S08 UNCONFIGURED: Coach dashboard editor screen (name input, canvas, card tools)
- S08-03: S08 UNWIRED: Dashboard name input (<=80, blur commit, rename)
- S08-04: S08 PARTIAL: Widget gallery: 19-kind library, category groups, search, staging, live preview, configure/replace forms
- S08-05: S08 PARTIAL: Widget settings form fields (title, source, summary, period, historyPeriod, target, size, fields, labels, option, unit)
- S08-06: S08 MISSING: Per-widget audience visibility (staff vs client)
- S08-07: S08 PARTIAL: Per-breakpoint layout rects and widths (desktop/tablet/mobile; x/y/w/h/size; mobile w=columns)
- S08-08: S08 UNWIRED: Drag/resize/keyboard gestures, size presets, move-step, reorder, auto arrange, duplicate
- S08-09: S08 UNWIRED: Undo/redo history
- S08-10: S08 UNCONFIGURED: Autosave state line ("Template draft") and implicit saves
- S08-11: S08 UNWIRED: Reset dashboard dialog; Load example layout
- S08-12: S08 UNCONFIGURED: "Client preview" toggle / previewOnly render
- S08-13: S08 MISSING: Source detail dialog per widget (widgetDetailKey routes: metric/exercise/nutrition/workouts/recovery/habits/tasks/checkins/feedback/destinat
- S08-14: S08 MISSING: BN21 custom metric card (bodyweight/waist/steps; latest/average/total; kg/lb, cm/in)
- S08-15: S08 MISSING: BN01 bodyweight trend + weekly-average + WoW delta
- S08-16: S08 MISSING: BN08 weekly bodyweight change (absolute/percentage)
- S08-17: S08 MISSING: BN15 macro target summary (protein/carbs/fat, TD/NTD, circles/lines, dated targets)
- S08-18: S08 MISSING: BN19 nutrition intake trend (line/stacked/single, nutrient, week..year, target bands)
- S08-19: S08 MISSING: TL26 current/next workout (prescriptions, workoutSchedule, exercise/sets/reps/coach instructions)
- S08-20: S08 MISSING: TL28 exercise performance trend (load/reps/sets per exercise)
- S08-21: S08 MISSING: TL06 step count (latest/average/total, bars, stepsTarget)
- S08-22: S08 MISSING: TL11 sleep duration (h/min, average/latest/history)
- S08-23: S08 MISSING: TL14 recovery ratings (energy/stress/readiness scales, latest/distribution/history)
- S08-24: S08 UNWIRED: TL21 today's habits (scheduled list, done/skipped/not-logged, client toggles, per-habit labels, contributions mode)
- S08-25: S08 UNWIRED: TL22 habit consistency (counts, calendar, contribution strip, historyPeriod)
- S08-26: S08 MISSING: CU01 weekly focus (phase strip, emphasis, successCue, published date)
- S08-27: S08 MISSING: CU02 this week at a glance (roadmap week metrics, WoW delta, targets, focus strip)
- S08-28: S08 UNWIRED: CU03 client tasks (due window, open/completed/both, toggle)
- S08-29: S08 UNWIRED: CU04 check-in status (next scheduled, latest submission, draft marker, recurring/additional filter)
- S08-30: S08 MISSING: CU06 coach feedback (excerpt, read flag, video flag, plan-change links)
- S08-31: S08 MISSING: CU09 selected roadmap metrics (weekly trends, per-metric target)
- S08-32: S08 MISSING: CU10 current phase progress (elapsed bar, week N of M, phase dates, published milestones, days remaining)
- S08-33: S08 UNWIRED: CU16 quick links launcher (destination list + labels + live captions)
- S08-34: S08 MISSING: recordsForCoach mapping variant+client to SourceRecords (fixture-driven preview data)
- S08-35: S08 UNWIRED: Dirty-guard on navigation while editing
- S08-36: S08 UNWIRED: Interactive writes inside preview (habit done/skipped, task complete, TD/NTD switch)
- V3-BWA01: S08 PARTIAL: Content dispatcher shell with layout measure and data-kind
- R3-2: S08 PARTIAL: Coaching/detail widget period and history-week vocabulary
- R3-7: S08 PARTIAL: Non-empty title and required visible-field validation
- R3-8: S08 PARTIAL: Per-kind and per-source unit allowlist
- R3-10: S08 PARTIAL: Progress inclusive period-window selection
- R3-12: S08 CONFLICT: Percent fill derived from done/scheduled counts
- S10-14: S10 UNCONFIGURED: Dashboard builder editor: name field, Add widget, undo/redo, Client preview switch, auto-arrange, reset dialog, drag/keyboard move+resize, p
- S10-15: S10 UNCONFIGURED: Dashboard draft persistence: localStorage ethereal-dashboard-draft-v1 + validation isValidDraft
- S10-16: S10 MISSING: Sample records the widgets read: localStorage ethereal-dashboard-records-v1 + SourceRecords (bodyweight, waist, steps, macroTargets, macroIn
- S10-17: S10 UNCONFIGURED: Widget gallery: 20-kind catalogue in 9 categories, search+category filter, staged multi-add, configure/replace side form (title, source, gra
