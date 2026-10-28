# PR-W9 build: Wire the dashboard builder

Card slug `pr-w9-dashboard`. Board `vari8`. Track Wiring. Depends on PR-W0, PR-M9, PR-SV3, PR-M4. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-w9-dashboard`, branch `beta/pr-w9-dashboard` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prw9` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3806. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-w9-dashboard && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-W9] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-W9] Wire the dashboard builder" --body-file icm/05-build/cards/pr-w9-dashboard.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-w9-dashboard --title "[PR-W9] Wire the dashboard builder" --body "Closes #<issue>. Card pr-w9-dashboard. Plan section PR-W9 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-w9-dashboard && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-w9-dashboard.md > /home/nexuslink/vari8-worktrees/pr-w9-dashboard.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prw9 LANE_PORT=3806 CARD=PR-W9 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-w9-dashboard.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-w9-dashboard.devin.log` and `pr-w9-dashboard.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

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

## Files

- `components/canvas/data/dashboard.ts`
- `components/canvas/coach/builder/**`
- `components/canvas/ethereal/builder/**`
- app/api/v1/** routes the screen calls
- their tests

## Build

- Template dashboard editor, studio builder, widget gallery, per-widget audience visibility, live data for bound widgets (D31).
- Each screen keeps its exact markup; only the data provider and server calls change.
- The canvas demo data for this domain comes from the model PR's seed file; if a value the screen shows is missing, add it to that seed file in this PR.
- No `db/` edits (D34).

## Acceptance (you see)

- The client sees only client-visible widgets with live data; parity passes.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3806 against `app_prw9` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-W9/build/`.
- Parity (D32) on: `s08-builder.webp`, `s08-widget-gallery.png`, `s08-template-dashboard.png`.
- Unit (D11, D14): Only keep-category tests (D14) for rules this PR adds; the screen is proven live.

## Report

Write `icm/05-build/reports/PR-W9.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
