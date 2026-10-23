# Product brief and roadmap

Working brief. Decisions not stated by the owner were made by the design
lead and can be changed at any time.

## Who it is for

A premium coaching platform for ambitious bodybuilding coaches who prepare
athletes for competition.

It is not built for lifestyle coaches whose main job is keeping clients
accountable and on plan. When a feature only makes sense for accountability
coaching, it does not belong here.

## What a coach must be able to do

1. See every athlete's status at a glance: where they are in their prep,
   what needs attention today, and who is drifting.
2. Open one athlete and understand their plans, timeline and data within
   seconds.
3. Change a plan quickly, with a clear date it applies from, without losing
   what came before.
4. Schedule deloads, diet breaks and refeed days on the athlete's timeline,
   and give such a day or period its own plan without touching the
   prescribed plan. For example, a refeed day gets its own meal plan; the
   regular meal plan stays unchanged and applies again the next day. Peak
   week and show day follow later.
5. Set up a new athlete fast from their own templates: training programs,
   meal plans and supplement plans.
6. Review check-ins and logged training efficiently and respond.

## What a client must be able to do

1. Log a training session quickly on a phone, with last time's numbers in
   view.
2. Enter daily metrics in seconds.
3. Fill in and submit check-ins.
4. See their current plans clearly.

The client app has to feel like an app a serious athlete would choose to
use, not a website squeezed onto a phone.

## Quality bar

- Premium, calm and consistent. Every screen uses the same spacing, type,
  borders and controls.
- Light and dark mode are equally finished. No input looks harsher than
  another.
- Speed for the coach matters more than endless configuration.

## Order of work

Only the current step's questions need answers. Everything else waits on the
parked list.

| Step | What | Done when |
| --- | --- | --- |
| 1 | This brief | The owner has corrected it and the partner has seen it. |
| 2 | Visual reset (done: approved as the tool-wide standard on 2026-10-23) | One visual direction is chosen from references, the shared controls and colours are rebuilt to match it (`docs/visual-reset-spec.md`), and the client app shell and training logbook show it in light and dark mode. |
| 3 | Athlete profile rebuilt | A coach can see status, the phase timeline with deloads, diet breaks and refeeds, current plans and key data in one place, and change a plan from there. |
| 4 | Plan library | Training, meal and supplement templates can be created and applied to an athlete. The template builder and dashboard builder are kept, simplified or replaced, based on what step 3 taught us. |
| 5 | Client app | A redesigned mobile app with fast training logging, daily entry and check-ins, plus the coach's review and plan-change workflow. |

Steps 2 and 3 are deliberately small. After that, features can be added
quickly, and they come out consistent because they are built on the new
foundation.

## What already exists and carries over

The logic underneath works and is reused under the new design:

- Training programs with weekly rotations and week-based changes.
- The training logbook: week overview, set logging, last time's values,
  resume and finish.
- Activity targets with dated changes.
- The supplement planner with the product database.
- Nutrition plans (meal plan and IIFYM) with plan history.
- Check-in questions, submissions and coach responses.
- Browser-local demo data, including the fully filled demo athlete Amara
  Lewis.

What changes is mainly how all of this looks and how coaches and clients
work with it.

## Parked list

Each item waits for its step. Nothing here needs a decision now.

**Step 2, visual reset**
- Light mode looks bad on some screens.
- Inconsistent input borders and harsh edges.
- Weight-trend card overflows on phone.

**Step 3, athlete profile**
- Phase timeline with deloads, diet breaks, refeed days, and later peak
  week and show day.
- Day or period overrides: a refeed day or diet break carries its own meal
  plan (or a deload its own training) while the prescribed plan stays as it
  is.
- Status overview across all athletes.
- One shared "today" across coach and client screens.

**Step 4, plan library**
- Training program templates, meal plan templates, supplement plan
  templates.
- Rethink the template builder.
- Rethink the dashboard builder.
- Client logging settings per template (RPE, RIR, kg or lb).
- Rule for suggesting similar exercises when a client swaps, once the
  exercise database is larger.

**Step 5, client app and coach review**
- Redesign of the client app and of data entry.
- Swap and reorder exercises, with the automatic coach flag.
- Coach view of logged sessions and flagged set notes.
- Mesocycles for cycle rotations and the coach's Adjust schedule.
- Check-in fill, submit and history on the client side.
- Nutrition logging: IIFYM macros and meal plan accuracy.
- Progress photo gallery and comparison.

**Later**
- Menses and female athlete insights, bloodwork, Posing Studio and other
  add-on modules.
- Publishing the newest local work to the shared `FRONTEND` branch.
