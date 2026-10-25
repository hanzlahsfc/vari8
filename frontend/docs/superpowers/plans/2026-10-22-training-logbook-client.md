# Training logbook (client side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients can open their training week, start or resume a session, log each set with the template's logging fields while seeing last time's values, and finish it; the log is stored in the shared demo state.

**Architecture:** Pure logbook logic (periods, scheduled sessions, statuses, previous performance, log updates) in one tested module. Two client components, a week overview and a session logger, replace the read-only prescription as the Training section's default view, with the prescription kept one tap away. Logs live in `CoachState.trainingLogs` so the coach side can read them in slice 2b. A one-time demo seed gives Amara earlier logged sessions.

**Tech Stack:** React client components, shared VARI8 controls, Node test runner with the existing loader.

**Spec:** `docs/client-app-frontend-design.md`, "Training overview", "Logging fields" and "In a session". Slice 2a covers the client side for weekly and legacy rotations. **Out of scope here, in plan 2b:** the coach's "Client logging" settings UI, swap/reorder and change flags, coach session review, mesocycles (cycle rotations) and Adjust schedule, and carrying flags into check-ins.

## Global Constraints

- Browser-only demo; logs persist in browser-local coach state like everything else.
- A blank input is "not recorded" (`null`), never 0. A real 0 stays 0.
- A log stores its own prescription snapshot, logging fields and load unit; later program or template changes never alter it.
- Logging fields: `variant.training.logFields ?? ["weight", "reps", "note"]`; the allowed set is `weight`, `reps`, `rpe`, `rir`, `note`. "Set done" is always present. Load unit: `variant.training.loadUnit ?? "kg"`.
- Bodyweight exercises use the same row; a blank weight means bodyweight only.
- No skip, add-set or stop-early buttons. Unticked sets on finish are "not done".
- Week N follows `trainingWeek` (`plans/domain.ts:250`): 7-day blocks from the plan start date. Display index is unbounded; prescription content uses `trainingWeek(plan, date)`.
- Today is `localToday()` (`targets/model.ts:26`).
- Touch targets ≥44 px, numeric inputs use `inputMode="decimal"` (weight, RPE) / `"numeric"` (reps, RIR), shared VARI8 controls, both modes with pale and dark accents.
- No commits; baseline-copy existing files before editing into `.superpowers/sdd/2026-10-22-training-logbook-client/baseline/`; ledger every deviation.

## Review Focus

- A stored state containing `trainingLogs` must still pass `isCoachState`; otherwise the app silently falls back to "storage unavailable". (Task 1 guard test.)
- Sessions scheduled on weekdays before the plan start date in week 1 must not appear as missed. (Task 1 `scheduledSessions` test.)
- Typing in a set input and leaving the session must keep the value: the log autosaves on every change, and Resume restores it. (Task 3 browser check.)
- The previous-performance line must come from the most recent *finished* log of the same session and exercise before the current week, never from an in-progress log or the current session. (Task 1 test.)
- The illustrative sample athlete in the template library preview must not write logs into the shared state. (Task 3: illustrative shows the program only.)

---

### Task 1: Log types, guard and logbook logic

**Files:**
- Modify: `src/components/coach/plans/types.ts`: add the types below; add `logFields?: LogField[]; loadUnit?: "kg" | "lb"` to the training type used by `Variant["training"]` (in `src/components/coach/model.ts:615`).
- Modify: `src/components/coach/model.ts`: `CoachState.trainingLogs?: TrainingSessionLog[]`; extend `isCoachState` (and the Variant training guard) to accept the new optional fields with full shape validation.
- Create: `src/components/client-app/training-log/model.ts`
- Test: `src/components/client-app/training-log/model.test.mjs`

**Interfaces (produces):**
```ts
// plans/types.ts
export type LogField = "weight" | "reps" | "rpe" | "rir" | "note";
export type LoggedSet = {
  setId: string; done: boolean;
  weight: number | null; reps: number | null; rpe: number | null; rir: number | null;
  note: string; flagged: boolean;
};
export type LoggedExercise = { exerciseId: string; exerciseKey: string; prescription: TrainingExercise; sets: LoggedSet[] };
export type TrainingSessionLog = {
  id: string; clientId: string; planId: string;
  week: number;                 // display week index (unbounded)
  occurrenceKey: string;        // from trainingRotationSchedule entry key
  sessionId: string; sessionName: string; scheduledDate: string;
  logFields: LogField[]; loadUnit: "kg" | "lb";
  exercises: LoggedExercise[];
  status: "in-progress" | "finished";
  startedAt: string; finishedAt?: string;   // ISO date-time
};

// client-app/training-log/model.ts
export const DEFAULT_LOG_FIELDS: LogField[]; // ["weight","reps","note"]
export function exerciseKey(exercise: TrainingExercise): string; // libraryId ?? id
export function displayWeek(plan: TrainingPlan, date: string): number; // floor(days since start / 7) + 1, min 1
export function weekRange(plan: TrainingPlan, week: number): { start: string; end: string };
export type ScheduledSession = { occurrenceKey: string; date: string; session: TrainingSession; weekdayLabel: string };
export function scheduledSessions(plan: TrainingPlan, week: number): ScheduledSession[]; // dated, sorted, dates < plan.startDate removed
export type SessionStatus = "done" | "in-progress" | "today" | "upcoming" | "missed";
export function sessionStatus(item: ScheduledSession, logs: TrainingSessionLog[], today: string): SessionStatus;
export function nextSession(items: ScheduledSession[], logs: TrainingSessionLog[], today: string): ScheduledSession | undefined;
export function findLog(logs: TrainingSessionLog[], planId: string, week: number, occurrenceKey: string): TrainingSessionLog | undefined;
export function previousPerformance(
  logs: TrainingSessionLog[], args: { clientId: string; sessionId: string; exerciseKey: string; beforeWeek: number },
): { date: string; exercise: LoggedExercise } | undefined;
export function startLog(args: {
  id: string; clientId: string; plan: TrainingPlan; week: number; item: ScheduledSession;
  logFields: LogField[]; loadUnit: "kg" | "lb"; now: string;
}): TrainingSessionLog;        // one LoggedSet per prescribed set, all values null, done false
export function updateSet(log: TrainingSessionLog, exerciseId: string, setId: string, patch: Partial<Omit<LoggedSet, "setId">>): TrainingSessionLog;
export function finishLog(log: TrainingSessionLog, finishedAt: string): TrainingSessionLog;
export function notDoneCount(log: TrainingSessionLog): number;
```
Rules: weekly rotations map weekday entries to the date `weekRange(plan, week).start + offset`, where offset is that weekday's position counted from the start date's weekday within the 7-day block. Legacy (no rotation) lists the week's sessions without a date (`date` = week start, `weekdayLabel` = ""). `cycle` rotations return `[]` in 2a and the UI shows "Mesocycle view arrives in the next update". Status: a finished log → `done`; an in-progress log → `in-progress`; date = today → `today`; date > today → `upcoming`; otherwise `missed`. `nextSession` = first item with status `in-progress` or `today`, else first `upcoming`.

- [ ] **Step 1: Write failing tests** in `model.test.mjs` with a small fixture plan (start Tuesday 2026-10-13, Week-based, weekly rotation Mon A, Tue B, Thu C, Sat D, exercises with and without `libraryId`):
  - `scheduledSessions(plan, 1)` returns Tue 13 (B), Thu 15 (C), Sat 17 (D) and omits Monday because it precedes the start; week 2 returns Mon 19 A, Tue 20 B, Thu 22 C, Sat 24 D.
  - `displayWeek(plan, "2026-10-22") === 2`; `weekRange(plan, 2)` = `{ start: "2026-10-20", end: "2026-10-26" }`.
  - `sessionStatus` yields done / in-progress / today / upcoming / missed for the five cases; `nextSession` prefers an in-progress or today session over upcoming ones.
  - `previousPerformance` returns week 1's finished log for the same session and exercise, ignores an in-progress week-1 log and any week-2 log, matches by `libraryId` even when exercise ids differ, and returns `undefined` with no earlier finished log.
  - `startLog` creates null values and `done: false` for every prescribed set and snapshots the prescription; `updateSet` changes only the targeted set and keeps `0` as `0`; `finishLog` sets status and `finishedAt`; `notDoneCount` counts unticked sets.
  - `isCoachState(seedState())` stays true after adding a valid `trainingLogs` array and a variant with `logFields: ["weight","reps","rpe"]`, `loadUnit: "lb"`; it is false for `trainingLogs: [{ id: 1 }]`.
- [ ] **Step 2:** Run `node --experimental-strip-types --loader ./src/components/coach/plans/test-loader.mjs --test src/components/client-app/training-log/model.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement the types, guards and module.
- [ ] **Step 4:** Same command. Expected: all pass. Then `npm run typecheck` exit 0.

---

### Task 2: Demo history for Amara

**Files:**
- Create: `src/components/coach/training-log-demo.ts`: `TRAINING_LOG_DEMO_REVISION = 1`, `adoptTrainingLogDemo(state: CoachState, today: string): CoachState`.
- Modify: `src/components/coach/model.ts` (`demoSeeds.trainingLogDemo?: 1` in type and guard; `seedState` applies it after `adoptClientAppDemo`), `src/components/coach/store.tsx` (hydrate applies it after `adoptClientAppDemo`).
- Test: `src/components/coach/training-log-demo.test.mjs`

**Interfaces:** consumes Task 1's `scheduledSessions`, `startLog`, `updateSet`, `finishLog`, `displayWeek`, `exerciseKey`.

Behavior: only client-007, only when she has an applicable training plan and no logs yet; sets the flag either way once applied. For every scheduled session from the plan start up to yesterday: a finished log at 18:00 local that day, every set done, reps within the prescribed range, deterministic loads per exercise that rise 2.5 kg per week (seeded PRNG, no `Math.random`), and one set note "Left knee felt tight on the last rep" with `flagged: true` on the first logged lower-body session. Exception: the most recent past session is left `in-progress` with only its first two exercises logged, so Resume is demonstrable. Today's session gets no log.

- [ ] **Step 1: Failing tests:** applies to client-007 and sets the flag; second call is a no-op (deep-equal); other clients unchanged; with `today = "2026-10-22"` the logs cover Tue 13, Thu 15, Sat 17 and Mon 19 as finished, Tue 20 as in-progress, and none for Thu 22; loads for the same exercise increase between week 1 and week 2; the result passes `isCoachState`.
- [ ] **Step 2:** Run it with the Task 1 command pattern. Expected: FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Expected: pass; `npm run typecheck` exit 0.

---

### Task 3: Week overview and session logger in the client app

**Files:**
- Create: `src/components/client-app/training-log/training-logbook.tsx`: `TrainingLogbook({ client, configuration }: { client: CoachClient; configuration: Variant })`, owning the view state (`overview` | `session`).
- Create: `src/components/client-app/training-log/session-logger.tsx`
- Create: `src/components/client-app/training-log/training-log.css`
- Modify: `src/components/client-app/client-app.tsx`: Training section renders a `SegmentedControl` labelled "Training view" with `Sessions` (default) and `Program`; Sessions → `TrainingLogbook`, Program → existing `TrainingTab`. When `illustrative` is true, render only `TrainingTab` with the caption "Session logging is available for assigned clients."

**Interfaces:** consumes Task 1 functions; writes via `useCoach().setState`, replacing or appending the log in `state.trainingLogs` by `id`; ids from `uid("log")` (`coach/model.ts`). Plan: `applicablePlan(client.plans.training, today)`. No plan → `Empty` "No training program yet".

Overview:
- Header `Week N` with the date range ("20–26 Oct"), previous/next week icon buttons (labels "Previous week" / "Next week") from week 1 to current week + 1.
- One row per scheduled session: weekday and date, session name, exercise count, and a status chip: `Done` (tick, row muted), `In progress`, `Today`, `Upcoming`, `Missed`. The next session (Task 1 `nextSession`) is emphasised with a primary button: `Start` (no log), `Resume` (in-progress). Other rows open on tap: done → read-only session, missed/upcoming → session screen (logging allowed).
- Cycle rotation → `Empty` "Mesocycle view arrives in the next update".

Session screen:
- Top: back button "Week N", session name, date; `Finish session` primary button at the bottom (sticky above the app's bottom bar).
- Per exercise card, in prescription order: name; prescription line built from the enabled `configuration.training.fields` (sets × reps or range, tempo, set type, rest; instructions and progression notes as secondary text); "Last time · <date>" listing that session's previous values set by set for the logged fields (e.g. "1 · 82.5 kg × 10"), or "No previous entry".
- Set rows: set number, prescribed reps as a hint, one input per logging field except note (weight shows the unit suffix), a "Done" checkbox. Note: a small "Note" button per set that reveals a text input and a "Flag for coach" toggle; flagged sets show a flag icon. Inputs autosave on every change via `updateSet`; empty input → `null`.
- Opening Start creates the log immediately (`startLog`) so leaving keeps it in progress.
- Finish: if `notDoneCount > 0`, a VARI8 `Modal` "Finish session?" / "N sets are not done. They'll be saved as not done." / buttons "Keep logging" and "Finish". After finishing show the summary: completion date and time (VARI8 `DateTimePicker`, editable, updates `finishedAt`), sets done X of Y, and the read-only log. "Edit log" reopens the inputs while keeping the status finished.
- Read-only view for done sessions uses the same layout with inputs replaced by values; blank shows "—".

- [ ] **Step 1:** Implement components and CSS.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm run ui:check` exit 0; Task 1 and 2 tests pass.
- [ ] **Step 3: Browser check** on `http://127.0.0.1:3000/client?client=client-007` (seed applied) at 390×844 and 1440×900, settled screenshots into `.agent-runs/2026-10-22-training-logbook-client/`: overview (week 2: Mon done, Tue in progress, Thu today with Start, Sat upcoming); previous week shows week 1 done; Start Thursday → enter weight/reps for two sets, add a flagged note, leave to overview (In progress), Resume → values still there; "Last time" visible on each exercise; Finish with unticked sets → modal → summary with editable time; overview shows Thursday Done. Light and dark mode, pale and dark accent; keyboard: Tab through set inputs and the Done checkboxes in order. Coach preview Phone mode shows the same logbook. 0 console errors.
