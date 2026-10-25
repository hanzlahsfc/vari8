# Athlete profile v3 — coaching workspace

Supersedes the overview, timeline and nutrition-override parts of
`athlete-profile-v2-spec.md`. Stays inside `docs/DESIGN_SYSTEM.md` and
`docs/visual-reset-spec.md`. The owner's Google Sheet screenshots are rough
references for content and density only, never for styling.

## Why

Coaches must see, in one place and faster than in a sheet: what the client
tracked, how it compares to targets, which phase/week they are in, and the
active plans. v2 gave refeeds/deloads too much weight and modelled them
wrongly (an event that re-points the day to an existing option).

## Profile structure

Tabs: **Overview · Timeline · Plans · Check-ins · Notes & tasks**.

Header (shared above all tabs): name, phase line, contact, Edit plans, Open
client app, chat, and a **Client settings** icon button that opens a dialog
with: Coaching setup (check-in rhythm, priority messages, change assignment)
and Onboarding answers. The Onboarding tab and the Coaching setup card are
removed. No dropdown menus in the header (the old one clipped).

## Data foundation (must exist before any view)

1. **Persisted daily tracking.** `CoachClient.tracking?: { entries:
   TrackerEntry[]; text: Record<string, string> }` (`TrackerEntry` from
   `ethereal/client-tracker/model`). The client Tracker writes to it through
   the coach store (same browser). Reader `clientTracking(client)` returns
   `tracking.entries`, or entries derived from legacy `client.entries` when
   `tracking` is absent. All coach views read only through this reader.
2. **Carbs and fat tracker fields.** New parameters `carbs` ("Carbohydrate
   intake", g) and `fat` ("Fat intake", g) in the Nutrition group, defined
   like `protein`.
3. **Temporary nutrition plans** replace nutrition overrides. Coaches look at
   the data, decide "next 3 days is plan X", and adapt the active plan for
   that range:
   `ClientPlans.nutrition.temporary?: TemporaryNutrition[]` with
   `{ id; kind: "refeed" | "diet-break" | "custom"; label; startDate; endDate;
   source: "mealPlan" | "iifym"; plan: MealPlan | IifymPlan; createdAt }`.
   `nutritionForDate` resolves: a temporary plan covering the date (latest
   `createdAt` wins) → otherwise the regular active plan and its scheduled
   option. The regular plan is never modified. A one-day temporary plan is
   also how a coach sets day-by-day targets. `TimelineEvent.nutritionOverride`
   is dropped (normaliser strips it); timeline events remain only as simple
   week tags (deload).
4. **Check-in photos.** `Submission.photos?: { pose: string; src: string }[]`.
   The check-in form's "Visual upload" question lists its poses in `options`
   (comma separated). Default poses: Front relaxed, Side relaxed, Back
   relaxed, Front double biceps, Back double biceps.
5. **Pinned notes.** `internalNotes[].pinned?: boolean`.
6. **Training focus.** `TrainingPlan.focus?: string` (e.g. "Hypertrophy ·
   lower-body priority").
7. **Habit frequency** (Plans phase): `frequency` becomes structured:
   `{ kind: "daily" } | { kind: "per-week"; count: 1–7 } | { kind:
   "every-n-days"; n: 2–7 } | { kind: "weekdays"; days: number[] }`, with a
   per-habit completion log `habitLog?: Record<habitId, string[]>` (dates).
   Adherence = completions ÷ expected occurrences in the window. Legacy text
   frequencies map to `daily` unless they parse as "Nx/week" / "every N days".

Demo (Amara, client-007, via the existing one-time adoption flags): ~10
weeks of tracking (weight, calories, protein, carbs, fat, steps,
cardio-duration, sleep, water) consistent with her plan targets (adherence
mostly 90–105 %, a few gaps), a refeed as a 2-day temporary plan (carbs up),
4 check-ins with photos (first coaching week + 3 later), 2 pinned notes,
training focus. Demo physiques are generated, fictional SVG silhouettes
(no real people), stored under `public/demo/physique/`.

## Overview (fixed layout, not customizable for now)

Every card is a link to where its data lives. 12 columns desktop, 6 tablet,
1 column phone.

| Row | Cards (desktop span) |
|---|---|
| 1 | Phase progress (6) · Check-in (3) · Pinned notes (3) |
| 2 | Nutrition targets vs actual (6) · Calorie intake (6) |
| 3 | Bodyweight (8) · Expenditure (4) |
| 4 | Physique comparison (8) · Training program (4) |

- **Phase progress** → Timeline. Phase name, "Week 7 of 22" (of the whole
  phase plan) and week within phase; a proportional segmented line of all
  phases, filled up to today with a today marker; "Next: Peak week in 3
  weeks". Empty: "Plan phases" → Timeline.
- **Check-in** → Check-ins tab / review. Next date with relative text ("in 3
  days", "today", "overdue 2 days"). Status chip, priority: Waiting for
  feedback (latest submission has no response) > Overdue > Due today >
  Upcoming.
- **Pinned notes** → Notes & tasks. Up to 3 pinned private notes, "+N more".
- **Nutrition targets vs actual** → Plans/nutrition. One column per option
  (Training day, Rest day, …) plus an active temporary plan, which is
  highlighted with its range ("Refeed · until Sat"). Large target kcal; below
  it "ø 2,690" actual and accuracy %. Then C/P/F: target bold, ø actual small,
  accuracy %. Actual = average of tracked days in the last 7 days on which that
  option applied. Accuracy = actual ÷ target; a range target counts as 100 %
  inside the range, otherwise relative to the nearest bound. Colour: within
  ±5 % positive, within ±10 % neutral, beyond warning.
- **Calorie intake** → Timeline (Nutrition view). Bars per day for 7 days with
  the day's target as a dashed step line; header "ø 2,684 avg intake" and
  "+226 vs last week". Toggle 7 days / 4 weeks (weekly averages).
- **Bodyweight** → Timeline. Latest weight, 7-day average, weekly change
  (7-day avg vs previous 7-day avg), 4-week trend; line chart with a range
  segmented control 2W / 4W / 12W / All.
- **Expenditure** → Plans/activity targets. Steps target + ø actual + %,
  cardio target (min/week) + actual + %, small daily-steps line with a
  dotted target.
- **Physique comparison** → the check-in review of the right-hand photo. Pose
  select, two date selects (defaults: first submission vs latest), side by
  side with date and that day's bodyweight. Empty: "Add a photo upload
  question to the check-in form" → template editor, check-in section.
- **Training program** → Plans/training. Name, rotation ("4-day cycle · Lower
  A, Upper A, Lower B, Upper B" or "Weekly · Mon Tue Thu Sat"), focus, "Week
  6", sessions done this week x/y, one line for unfinished sessions / flagged
  notes if any.

Removed from Overview: timeline widget, needs attention, recent training,
coaching setup, inline adjust dialogs, quick-add events, layout link. The
template editor's "Athlete overview" section is removed (`athleteOverview`
stays in the model, unused).

## Timeline tab

The coach's dense week-by-week view. No wide spreadsheet table.

- **Week rows grouped by phase.** A phase header row ("Prep · weeks 12–22 ·
  −0.5 %/wk") followed by compact week rows; the current week is highlighted;
  past weeks show actuals, future weeks show targets only. Long plans start
  scrolled to the current week; "Show earlier weeks".
- **Compact row** (reference: owner screenshot 5): week number, dates,
  then the columns of the selected view, then the weekly note and change
  markers ("+ Nutrition", "+ Training", "+ Activity" from plan version
  activations; "Refeed 2 d" / "Deload" tags), and a chevron.
- **Expanded row**: a 7-day grid (Mon–Sun) of the view's metrics with daily
  values against that day's target, the weekly averages, the editable weekly
  coach note, the week's check-in if any, and the plan changes that week.
- **Views** (tabs above the rows): Overview, Nutrition, Activity, Recovery,
  Training, plus coach-created views. A view is an ordered list of columns
  from a registry (phase, bodyweight ø / change / rate, kcal target vs ø,
  macros target vs ø, steps target vs ø, cardio, sleep ø, water ø, sessions
  done/planned, check-in, note, changes). Views are stored per coach
  workspace (`CoachState.timelineViews`) and apply to all clients; built-in
  views can be reordered but not deleted; "Customize view" edits columns.
- **Phase planning lives here** (moved out of Plans): "Edit phases" opens a
  side panel with start date and an ordered list (name, weeks, optional
  weekly rate target), reorder/add/remove, live preview in the rows.
- **Deload tag**: add/remove a deload on a week from the row's menu.
- Phone: rows stack; expanded row shows days as a vertical list.

## Plans tab

Card grid instead of wide rows (2 columns desktop, 1 phone).

- **Nutrition**: plan name, active since, then per option a compact block
  with kcal and P/C/F targets and which days it applies; active/upcoming
  temporary plans listed with range, edit and remove; actions: Edit plan,
  Temporary plan.
- **Temporary plan flow**: kind (Refeed / Diet break / Custom + name), start
  date (default today), days or end date; then the nutrition editor opens in
  a large dialog prefilled with a copy of the active plan; save stores it.
  The client app shows the temporary plan on those days with a banner
  ("Refeed · 24–26 Oct").
- **Training**, **Activity targets**, **Supplements**: same card pattern,
  key facts first, Edit action.
- **Other targets** (replaces Goals): individual metric targets without a
  date, e.g. sleep ≥ 7.5 h, water 4–5 L. Pick a tracker field, kind
  (minimum / maximum / range / exact) and value(s). No timed weight goals.
- **Habits**: structured frequency control (Daily / N× per week / every N
  days / specific weekdays) and adherence shown per habit (this week and
  4-week %).

## Notes & tasks

Three separate inputs, no kind dropdown: Private note (pin toggle), Coach
to-do (optional due date), Client task (title + required deadline). Lists
below each, client tasks with status (open / done / overdue by deadline).

## Client app (later step)

The client Home still renders the old customizable dashboard. It is replaced
in the client-app pass with a fixed Today screen; not part of this spec.

## Build order

A1 data foundation + demo → A2 Overview + header settings → B Timeline →
C Plans, Other targets, Habits, Notes & tasks → D client check-in submit
with photo upload.
