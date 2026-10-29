# Client app and training logbook: frontend design

Status: Slice 1 (shell) implemented; slices 2–3 pending.

## Intent

The coach side of the prototype is far ahead of the client side. Today the
client experience exists only as the coach's "Preview assigned tool" dialog: a
row of up to eight text tabs inside the coach workspace. The owner's biggest
current problem is that there is no real client-side frontend, especially on
mobile, which is where clients log training sessions.

Build a client app, mobile first and also usable on desktop, where a client
views their plans, logs daily metrics, fills in and submits check-ins and logs
training. Everything the client sees and records is defined by what the coach
set up in the template library and the client's plans. The audience is
bodybuilding coaches and their clients.

This replaces pipeline steps 0 and 3 and the client half of step 6 in
`reports/coaching-frontend-pipeline-2026-10-21.html` for this scope.

## Goals

- A standalone client app surface with five sections: Home, Plans, Tracker,
  Training and Check-ins.
- A training logbook whose per-set inputs are chosen by the coach in the
  template, with the previous performance visible while logging.
- A check-in flow where the client fills in and submits the coach-defined
  questionnaire and sees past submissions and feedback.
- Coach review that sees the same fictional logs and submissions, with client
  changes to a session automatically flagged.
- The coach's existing "Preview assigned tool" shows this same client app.

## Non-goals

- Backend, accounts, authentication, authorization, real persistence,
  synchronization, push notifications or media storage. This is a
  browser-only preview with fictional data, stored the same way the rest of
  the demo is (browser-local coach state).
- A real rule for "similar exercise" swap suggestions. Deferred by the owner
  until a larger exercise database exists.
- Cardio finishers, time/distance set logging, rest timers, supersets,
  automatic progression recommendations, exercise video.
- Nutrition logging changes (pipeline step 5) and progress-photo comparison
  (step 4). The Tracker tab reuses what exists.
- Rebuilding coach plan editors or the dashboard builder.

## Anti-goals

- The client app must not feel like the coach workspace in a frame: no coach
  navigation, coach-only data or coach notes visible to the client.
- Logging must never rewrite history: changing the program, the template's
  logging fields or the exercise library must not change what an earlier
  session screen says was prescribed or performed.
- A blank input must never be shown or counted as zero.
- No fake login screen or anything implying real authenticated access.

## Constraints

- Follow `AGENTS.md`, `PROJECT_CONTEXT.md` and `docs/DESIGN_SYSTEM.md`: shared
  VARI8 controls in `src/components/vari8/`, achromatic fixed surfaces,
  accent-derived lighting, verification in both modes with pale and dark
  accents, open popups, keyboard use and narrow layouts.
- Next.js 16 in this repo differs from common knowledge; read the relevant
  guide in `node_modules/next/dist/docs/` before adding a route.
- Reuse existing seams: `CoachState` in `store.tsx`/`model.ts`, the
  `Variant` template configuration, `ClientPlans`, `TrainingPlan` with
  `resolveTrainingWeek`/`trainingRotationSchedule`, `Submission`, the
  dashboard builder's mobile breakpoint and `FormPreview` questions.
- Touch-sized targets, numeric keyboards for numeric inputs, stable focus,
  safe areas on phones.

## Approaches considered

- **A. Standalone client app reused by the coach preview (chosen by the
  owner).** A dedicated client route with its own shell (bottom tabs on
  mobile, sidebar on desktop) composed from existing views; the coach preview
  renders the same app inside a phone-sized frame. Logs and submissions live
  in the shared demo state so coach review reads them. Largest first step,
  because the shell comes before the logbook.
- **B. Grow the existing preview dialog into the app.** Less new structure,
  but the client side stays a modal inside the coach workspace and never
  behaves like a phone app; `client-preview.tsx` is already about 900 lines.
- **C. Logbook first inside today's preview, shell later.** Fastest visible
  logbook, but its layout is redone when the shell arrives and the mobile
  problem stays unsolved.

## Decisions

Marked **Owner** where the owner decided, **Lead** where the design lead made
the call (the owner can overrule).

### App shell

- **Owner:** tabbed client app; Home is the coach-built dashboard.
- **Lead:** five sections in this order: Home, Plans, Tracker, Training,
  Check-ins. Bottom tab bar below 768 px; left sidebar on wider screens.
- **Lead:** section mapping from the template's enabled views:
  - Home: the variant's dashboard (`DashboardBuilder` in preview-only mode,
    mobile layout on phones).
  - Plans: read-only Nutrition, Supplements, Activity targets and the
    Timeline / Roadmap, as sub-sections.
  - Tracker: the existing tracker with targets beside inputs; habits move
    here when the variant enables habits.
  - Training: the program and the logbook together (the program is not
    repeated under Plans).
  - Check-ins: due check-in, form, history and feedback.
  Visibility rules (**Lead**): Nutrition and Timeline / Roadmap follow the
  template's enabled views; Supplements and Activity targets follow plan
  assignment, as in today's preview. An enabled Nutrition sub-section without
  an active plan shows its empty state. Plans is hidden only when none of its
  four sub-sections qualifies. Tracker, Training and Check-ins follow the
  template's Tracker, Training Program and Check-In views; Home follows
  Dashboard.
- **Lead:** the coach's "Preview assigned tool" renders the client app in a
  phone-sized frame with a desktop/phone width toggle, labelled as a preview.
  Changes made in the coach preview are demo changes like the rest of the
  workspace.
- **Lead:** the client app is reachable on its own route for the selected
  fictional client. The route shows a clear "Local demo" label and a way back
  to the coach workspace; it is not a login.
- **Owner:** coaches must be able to see what the client logged in every
  session. For this frontend the coach-to-client loop is demonstrated in the
  same browser (client route at phone width, or the coach preview's phone
  frame). A separate device shows its own sample data; no export, import or
  sync is built.

### Training overview

- **Owner:** the Training tab opens on an overview of the current period and
  its sessions. Done sessions are ticked/greyed out; the client can go to the
  next session.
- **Owner:** weekly rotations show "Week N" with that week's sessions. Cycle
  rotations show "Mesocycle N" with that cycle's sessions in order, off days
  included.
- **Lead:** Week N comes from the program for "Week-based" programs and is
  the number of weeks since the plan start for "Evergreen" programs. Sessions
  come from `resolveTrainingWeek` for that week.
- **Lead:** plans without a rotation (legacy) show the week's sessions as an
  unordered list with the same done states.
- **Owner:** the schedule follows the calendar, and the coach decides how it
  adapts to disruption such as sickness or extra rest. The client does not
  move the schedule.
- **Lead, from the owner's description:** cycle positions are counted day by
  day from the plan start date, so Mesocycle N comes from the date. A cycle
  rotation in a week-based program uses the program week that contains each
  scheduled day.
- **Owner:** the coach can add one or more extra rest days from a chosen
  date and picks what follows:
  - **Shift:** the rhythm continues unchanged but starts later. Everything
    from that date moves forward by the number of rest days.
  - **Keep rhythm:** the sessions that fall on the rest days are skipped and
    the calendar rhythm continues as it was.
- **Lead:** this is an "Adjust schedule" action in the coach's view of the
  client's active training plan. The coach chooses the date and number of
  days, chooses Shift or Keep rhythm, sees a before/after preview of the
  coming days, and confirms. Adjustments are listed with their date and can
  be undone. The same action applies to weekly rotations (Shift moves the
  coming weekday sessions later by the chosen days; Keep rhythm drops them).
  The date may be in the past, for example sick days the client already
  missed, but finished logs are never moved or changed. Adjustments belong to
  the client's plan, not the template.
- **Lead:** a scheduled session whose day has passed without a finished log
  shows as missed in the overview. The client can still open it but the
  overview's "next session" is the next scheduled day. The client sees
  coach-added rest days labelled as such.
- **Lead:** a log completes one scheduled occurrence in the current period
  (the rotation schedule's entry key, e.g. a weekday instance or a cycle
  position), not a session id. If the same session is scheduled twice in a
  week, each occurrence is ticked separately. "Next session" is today's
  scheduled session if it is not finished yet, otherwise the next scheduled
  day's session (see missed sessions below).
- **Lead:** one shared "today" is used by the client app and by the coach
  screens that read client logs and submissions, so due/overdue states and
  week numbers never disagree between the two sides. Fictional history is
  generated relative to that date. Existing coach screens keep working.

### Logging fields

- **Owner:** one set of client logging fields for the whole template; it
  applies to every exercise in plans built from it.
- **Lead:** stored per variant beside the existing `training.fields`
  (prescription fields), as `training.logFields`, edited in the template's
  Training section as "Client logging".
- **Lead:** the field menu is weight, reps, RPE, RIR and a per-set note. A
  "set done" tick is always present. Default for new and existing variants:
  weight, reps and note.
- **Lead:** the load unit is a new kg/lb choice in the same "Client logging"
  settings (default kg). It is independent of the tracker's bodyweight unit,
  because a variant may not track bodyweight at all.
- **Lead:** for bodyweight exercises the weight field means added load; blank
  means bodyweight only. Same row as every other exercise.
- **Lead:** a logged session stores the logging fields it was recorded with;
  later template changes do not alter it.

### In a session

- **Owner:** while in an exercise, the client sees directly on screen what
  they did the previous time, for each logged field.
- **Lead:** "previous" means the same exercise in the same session in the
  previous week (weekly) or previous mesocycle (cycle), compared set by set.
  If the client swapped the exercise, previous means the last time they
  performed the exercise they actually did. With no earlier entry, show "No
  previous entry", never zeros.
- **Lead:** exercise identity for "previous" uses the library exercise
  (`libraryId`) when present, otherwise the plan exercise id. A swap records
  the replacement's library id. Name matching is never used, because names
  are free text and editor clones get fresh ids.
- **Lead:** each exercise shows its prescription (sets, reps or rep range,
  tempo, set type, rest, instructions, progression notes, as enabled by the
  template) beside the editable set rows.
- **Owner:** the client can swap an exercise or rearrange the exercise order
  for that session only. The program is never changed.
- **Lead:** until the swap rule exists, Swap offers exercises from the
  current library with the same primary muscle, labelled as provisional
  suggestions. The swap flow, history and flag must not depend on how
  suggestions are chosen, so the rule can be replaced later.
- **Lead:** no skip, add-set or stop-early buttons. Sets left unticked when
  the client finishes are shown as "not done". A session can be left and
  resumed; finishing it records the completion date and time, editable by the
  client.
- **Lead:** per-set notes can be flagged. A flagged note is visible to the
  coach immediately on that session's review, and it is also carried into
  the client's next check-in submission using the existing
  `Submission.flags` shape (exercise, set, date, text).
- **Lead:** the daily tracker does not ask for the session again; it may
  show a read-only training summary for the day.

### Coach review

- **Owner:** sessions where the client changed something are automatically
  flagged for the coach.
- **Lead:** a "change" means a swap or a reorder only. Logging different
  numbers than prescribed, or leaving sets not done, is normal logging and is
  not flagged (not-done sets are still visible in the session).
- **Lead:** a changed session opens with its changes listed, for example
  "Swapped: Leg press → Hack squat" or "Order changed". Swaps are marked more
  strongly than reorders. The coach can open any completed session from the
  client's training view and from check-in review, read-only.

### Check-ins

- **Owner:** the coach defines the questionnaire in the template editor,
  including what is asked and what is submitted. Nothing else is attached
  automatically.
- **Lead:** the Check-ins tab shows the next due check-in (from the client's
  existing schedule and extra check-in dates), the form using the template's
  question types (short/long text, numeric, rating, choice, visual upload
  with local file preview), required-field validation, a review step,
  local submission with confirmation, and history with the coach's response
  when present. Submissions are stored as `Submission` records so the
  existing coach Check-ins section shows them. Full and Custom check-ins use
  the existing distinction.

## Build order

Each slice is reviewable on its own and leaves the app working.

1. **Shell:** client route, five-section navigation (mobile and desktop),
   Home, Plans and Tracker from existing views, coach preview switched to the
   new app, shared selected client/date.
2. **Training:** "Client logging" settings in the template, the
   week/mesocycle overview, session screen with prescription, set logging,
   previous performance, swap/rearrange, resume/finish, history, coach
   read-only session view and change flags, and the coach's "Adjust
   schedule" with Shift and Keep rhythm.
3. **Check-ins:** due check-in, form, validation, submit, history and
   feedback, visible in the coach Check-ins section.

## Acceptance

- On a 390 px phone and a desktop width, a fictional client can move between
  all enabled sections, and the coach preview shows the same app.
- A coach ticks client logging fields in a template; a client on that
  template sees exactly those inputs on every exercise.
- A client opens Week 3 (or Mesocycle 4), starts the next session, logs
  sets while seeing last time's values, swaps one exercise and reorders
  another, leaves and resumes, finishes, and sees the session ticked in the
  overview and in history.
- The coach opens that session read-only, sees it flagged with the swap and
  reorder listed, and the prescription shown is the one that applied then.
- On a cycle rotation (A, B, off, C, off), the coach adds two rest days from
  a date with Shift: the client's overview shows the rest days and the same
  sequence continuing two days later. Undoing it and repeating with Keep
  rhythm instead: the sessions on those two days show as skipped and the
  following days keep their original positions. Finished logs before the
  date are unchanged in both cases.
- A client fills in and submits a check-in with a required question left
  empty first (blocked), then complete (accepted); it appears in the client's
  history and in the coach's Check-ins section.
- Blank stays distinct from zero everywhere; both modes with pale and dark
  accents, keyboard use and open popups are checked.

## Left to the builder

- Exact component and folder names (pipeline suggests
  `coach/training-logbook/`), state shape beyond the decisions above, route
  path and how the shared demo state is extended, so long as earlier saved
  demo state still loads.
- Visual layout within the design system, including how previous values sit
  beside inputs on a phone, provided they are visible without extra taps.
- Fictional demo data needed to show each state (history for "previous",
  an unfinished session, a swapped session, a submitted check-in).
