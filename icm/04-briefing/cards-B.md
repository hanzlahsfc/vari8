# Vari8 briefing cards, lane B (templates, nutrition, training)

## Templates and template editor

Verdict: The backend has the template store and client assignment, but the template shape has no slot for modules, habits, dashboard, roadmap or check-in settings, so most of the editor needs new model work before it can save.
Readiness: switch on 1 · connect 0 · reshape 13 · build 13 · your call 2
What works already:

- Template store with drafts, publish and archive, in `lib/coaching/templates.ts` and the `CoachingTemplate` model. It sits behind the templates flag, which is off by default (`ENABLE_COACHING_TEMPLATES`).
- Assigning a template to a client pins its latest published version (`lib/coaching/client-setup.ts`).
- Parameter library, the field definitions the tracker uses (`ParameterDefinition`, `lib/coaching/parameters.ts`). It starts empty until staff create entries.
  The real work:
- Template draft shape: `lib/coaching/templates.ts` accepts only a title and sections. Widen the draft definition for modules, summary pins, field options, check-in questions and the cycle flag.
- Saving must also publish, because assignments pin only published versions. The editor save and the assign action (`app/workspace/[workspaceId]/templates/actions.ts`, `client-setups/actions.ts`) need to move together.
- Daily overview pins, roadmap settings, phase options and the nutrition mode have no backend field at all. They are new domain work in new models in `db/schema.prisma`.
  Blocked on you:
- Deleting a template in the canvas can be undone with a toast. The backend archive is final and has no restore. Keep the undo and approve a restore rule, or replace it with a confirm-before-delete?
- Should each template keep one setup, or support several switchable setups per template? Keeping one until a real consumer exists is the lazy default. Which do you want?
  Start here: PR-W3 (Wire templates and setup). Depends on PR-M4 (template definitions) and PR-SV1 (scoped roster read model). First file: `frontend/src/components/coach/templates.tsx`.
  Screenshot: open `/coach`, click "Templates" in the coach side nav, then open any template card to reach the editor. Click paths for the capture lane: `icm/02-gap-matrix/output/R3/G5.md`.

## Nutrition plan

Verdict: Plan storage and the client's read of their current plan exist, but the editor promises food-level portions and calorie and macro totals, and the owner's current rule forbids computed nutrition, so the screen cannot be wired as drawn yet.
Readiness: switch on 1 · connect 1 · reshape 10 · build 6 · your call 11
What works already:

- Meal plan drafts with a revision check and immutable published versions (`lib/mealplan/service.ts`, `MealPlan` and `MealPlanVersion` in `db/schema.prisma`).
- Variants, meal rows with name, time and frequency, and the size limits (`lib/mealplan/payload.ts`, `lib/mealplan/limits.ts`).
- The client's own read of the current plan (`app/(tracker)/workspace/[workspaceId]/meal-plan/page.tsx`, `readOwnMealPlan` in `lib/mealplan/service.ts`).
  The real work:
- Food rows and swaps: the backend stores one free-text block per meal, so portions, swaps and saved meals need new keys in `lib/mealplan/payload.ts`. The food picker needs the catalog (`lib/nutrition/search.ts`), which is empty until the nutrition import runs, and the canvas field `fat` must map from the backend `fats`.
- Totals and percentages: the canvas computes them, the backend has no code for them, and the owner rule forbids them. Either the editor drops them or computes them only once the rule changes.
- Schedules (every day, weekly, repeating cycle) and the plan start date have no backend field. They need a new payload key and server-side day resolution, plus a timezone confirm control in the editor.
  Blocked on you:
- Can the editor show calorie and macro totals, percentages and swap quantities worked out from food values, or only the numbers a coach types in?
- Can a weekly or repeating schedule pick the training-day or rest-day variant automatically, or must every variant stay visible with no automatic pick?
  Start here: PR-W7 (Wire nutrition). Depends on PR-M5 (meal-plan payload) and PR-W1 (identity and client home). First file: `frontend/src/components/coach/plans/nutrition/editor.tsx`.
  Screenshot: open `/coach`, click Clients, open a client, go to "Plans & targets", then open the Nutrition row. Click paths for the capture lane: `icm/02-gap-matrix/output/R3/G5.md`.

## Training plan

Verdict: Training program storage, versions and the client's current-week view exist, but the backend keeps one value per exercise instead of one per set, and the exercise library and goals have no model, so the editor cannot save what a coach builds yet.
Readiness: switch on 3 · connect 1 · reshape 15 · build 8 · your call 4
What works already:

- Training program drafts with a revision check, published versions and a version history (`lib/trainingprogram/service.ts`, `components/trainingprogram/version-history.tsx`). All of it sits behind `ENABLE_TRAINING_PLANS`, which is missing from `.env.example`.
- Week-based programs from 1 to 52 weeks, with per-week overrides that carry forward (`lib/trainingprogram/payload.ts`, `lib/trainingprogram/weeks.ts`).
- The client's current-week view (`app/(tracker)/workspace/[workspaceId]/training-program/page.tsx`).
  The real work:
- Sets: the canvas stores one object per set with its own reps, tempo, type and rest. The backend stores one scalar cell per exercise per week. Add a set-row node in `lib/trainingprogram/payload.ts`. This is the largest model gap.
- Exercise library: the backend catalog is read-only master data (`lib/exercise/search.ts`, write denied in `lib/auth/rbac.ts`). A coach's own library with the ten-group muscle list needs a new model.
- Goals, phase and roadmap: no goal or phase model exists, and the weekly roadmap needs a metric service on top of `lib/daily-entry/week-groups.ts`, which only groups days. Also merge the final-week fix from the r3 branch first, or the client view marks the last week as done.
  Blocked on you:
- Who may edit a client's training plan: the owner, the assigned coach, or both? Also, should coach library notes stay hidden from the client? The docs and the code disagree on both. This blocks every wiring step, not only this screen.
- Should the weekly muscle volume panel show plain counts of prescribed sets per muscle group, or be hidden? The current rule bans volume calculations.
  Start here: PR-W8 (Wire training). Depends on PR-M6 (training payload) and PR-W1 (identity and client home). First file: `frontend/src/components/coach/plans/training/editor.tsx`.
  Screenshot: open `/coach`, click Clients, open a client, go to "Plans & targets", then open the Training row. Click paths for the capture lane: `icm/02-gap-matrix/output/R3/G5.md`.

## Sources

- Readiness counts: `icm/02-gap-matrix/output/viz/matrix.json`, rows by surface (S05 29, S06 29, S07 31 rows, including rows that cite other files).
- Surface detail: `icm/02-gap-matrix/output/F1/S05-templates-setup.md`, `S06-nutrition.md`, `S07-training.md`.
- Plan and PR ids: `icm/03-plan/output/PLAN.md` (PR-M4, PR-M5, PR-M6, PR-SV1, PR-W1, PR-W3, PR-W7, PR-W8).
- Owner rules: `icm/03-plan/DECISIONS.md` (D10 roles, D12 parked consent) and the owner questions in `PLAN.md` "Owner decisions needed".
- Canvas nav label "Templates": `frontend/src/components/coach/coach-app.tsx:34` in the merge-proto tree.

## Self-check

- Readiness matches matrix counts, per card: PASS for Templates (1 / 0 / 13 / 13 / 2 = 29), PASS for Nutrition (1 / 1 / 10 / 6 / 11 = 29), PASS for Training (3 / 1 / 15 / 8 / 4 = 31). The "your call" counts are the CONFLICT plus ROLES rows.
- Every Start here PR id exists in PLAN.md: PASS (PR-W3, PR-W7, PR-W8, plus the dependencies PR-M4, PR-SV1, PR-M5, PR-W1, PR-M6).
- No internal ids in Verdict, What works already or The real work: PASS (checked by pattern: no surface, row, decision, owner-question or PR codes in those sections).
- Blocked on you: 2 questions per card, each tied to a conflict or roles row: PASS.
- Not checked: the screenshot click paths were not run against the live canvas. They come from the navigation labels in the source tree and `G5.md`. The capture lane must confirm them.
