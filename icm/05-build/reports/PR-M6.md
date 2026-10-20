# PR-M6 report

Card `icm/05-build/cards/pr-m6-training-payload.md`, issue #115, PR #116.
Lane: LANE_DB=app_m6, LANE_PORT=3875. Base `origin/Vari8-Beta` f00d37b.

## What changed

- `lib/training/volume.ts` (new): verbatim port of the canvas
  `muscle-volume.ts` (`MUSCLE_GROUPS`, `PRIMARY_MUSCLE`,
  `ScheduledWorkout`, `weeklyMuscleVolume`) plus the canvas
  `prescribedMuscleVolume`/`volumeExerciseId` adapters, with
  `programMuscleVolume`/`workingSetCount` reading materialized sessions
  (scalar `sets` or ordered `setRows`, warm-up filtered like the
  canvas). D29: same function, same numbers. `frontend/` untouched
  (lead ruling 3: port, do not rewire).
- `lib/trainingprogram/validators.ts` (new): zod contracts:
  `prescribedSetSchema` (canvas TrainingSet; no prescribed load per
  O12, optional `coachNote` for P05), `setLogEntrySchema` /
  `loggedExerciseSchema` / `sessionSetLogSchema` (owner ruling O5:
  per-set actual reps, load + unit, RPE, set note, flags; session
  `completedAt` marker; storage wires in PR-W8),
  `exerciseLibraryItemInputSchema` (coach-editable
  `ExerciseLibraryItem` write shape, closes V3-L1-Exercise).
- `lib/trainingprogram/payload.ts`: new `setRows` boundary section
  (`"sid/eid" -> week -> ordered PrescribedSet[]`), exercise
  declarations gain `muscle`, `secondaryMuscles`, `libraryItemId`,
  `generalNotes`; materialization emits ordered rows and derives the
  scalar `sets` count; `projectForClient` gates `setRows` on the Sets
  toggle and strips per-set fields per the field toggles (`coachNote`
  always kept); `validatePublishCompleteness` accepts setRows for the
  sets and reps requirements; tolerates pre-M6 stored drafts without
  `setRows`.
- `lib/trainingprogram/service.ts` (one line): `setRows` joins the
  locked-week boundary equality (`past_week_locked`). Deviation from
  the card file list, required for the invariant to cover the new
  section; minimal diff.
- `lib/trainingprogram/limits.ts`: `generalNotesMax`,
  `maxSecondaryMuscles` bounds.
- `scripts/seed/35-training.seed.ts` (new): seeds the canvas demo
  domain into `canvas-demo`: the 10-item `defaultExerciseLibrary()` as
  `ExerciseLibraryItem` rows and the canvas sample program for Emma
  Anders (client-001): "Strength foundation", WEEK_BASED 8 weeks from
  2026-09-14 (week 6 on the 2026-10-19 demo date), published version 1
  in Europe/Vienna, verbatim canvas values (Deadlift 4×"4–5" note
  "Leave two reps in reserve", Split squat 3×"8 / side", Bench press
  4×"6", Chest-supported row 3×"8–10"), muscle allocations per the
  canvas PRIMARY_MUSCLE table.
- Tests: `tests/unit/training-m6.test.ts` (15 tests: canvas demo
  program literal counts, setRows normalize/materialize/project,
  completeness, O5 log and library validation),
  `tests/integration/training-m6-roundtrip.test.ts` (real PG: draft
  save -> publish -> staff and client reads, literal ordered rows),
  `tests/unit/training-payload.test.ts` (+`setRows: {}` fixture key).

## Commands and exit codes

- `npm ci --no-audit --no-fund` root + `frontend`: 0.
- `npx vitest run tests/unit/training-m6.test.ts`: 0 (15 pass; failed
  on import before implementation; TDD order observed).
- `npx vitest run tests/unit/training-payload.test.ts`: 0 after
  `setRows: {}` fixture + tolerant materialization (18 pass).
- `npm run typecheck`: 0.
- `npx eslint <changed files>`: 0.
- `npx prettier --check <changed files>`: 1, fixed with `--write`,
  recheck 0.
- `prisma migrate deploy` on app_m6: 0.
- `INTEGRATION_DATABASE_URL=... npx vitest run --config
vitest.integration.config.ts tests/integration/training-m6-roundtrip.test.ts`:
  0 (1 pass).
- `NODE_ENV=development DB_FRESH_SKIP_CATALOGS=1 SEED_OWNER_* SEED_COACH_* npm run db:fresh`: 0
  (`[seed] training: 10 library item(s), program "Strength foundation"
week 1-8 published for Emma Anders @ canvas-demo`).
- `npx tsx scratch/live-user.ts` (SEED-FIX credential workaround,
  owner + client): 0.
- `npx tsx scratch/proof.ts` (playwright chromium): 0.
- `npx tsx scratch/volume-proof.ts`: 0 (`EQUAL_CANVAS_PANEL=true`).
- `npm run index`: wrote SYMBOLS.md; `npm run index:check`: 0.
- Gate `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta)
LANE_DB=app_m6 LANE_PORT=3875 CARD=PR-M6
icm/05-build/tools/verify-local.sh`: see below.

## Evidence

`/home/nexuslink/vari8-worktrees/_evidence/PR-M6/build/`:

- `client-training-1440.png`, `client-training-390.png`: signed in as
  the Emma Anders client (credential workaround; SEED-FIX not merged,
  no `accounts` rows in the seed), the own-scope training program page
  renders "Strength foundation — week 6 of 8 (Europe/Vienna)" with
  literal sets/reps/note values.
- `staff-training-1440.png`: owner workspace view of Emma's program.
- `proof-transcript.txt`: measured DOM reads; mode line, Sets
  4/3/4/3, reps "4–5"/"8 / side"/"6"/"8–10", note "Leave two reps in
  reserve" at both widths; signed-out request redirects to /login.
- `volume-proof.txt`: seeded DB payload -> `programMuscleVolume`
  equals the canvas `weeklyMuscleVolume` panel on the canvas demo
  input: chest 4, back 3, hamstrings 4, glutes 3, total 14, unassigned
  0 (`EQUAL_CANVAS_PANEL=true`).
- `dev-server.log`: dev server on 3875 during the live check.
- Gate log: `/home/nexuslink/vari8-worktrees/pr-m6-training-payload.check.log`.

## Matrix rows closed

- V3-L1-TrainingSet: ordered per-set shape (`setRows`) in draft and
  materialized payload; canvas TrainingSet fields carried verbatim.
- V3-L1-Exercise: coach-editable `ExerciseLibraryItem` write shape +
  seeded workspace library (catalog stays read-only).
- V3-L1-TrainingPlan: program payload now carries per-set rows and
  exercise metadata; overrides map unchanged (P08 boundary semantics
  already carry forward).

## Could not do / open items

- O5 set-log shape is a validated contract only (validators.ts), no
  storage or routes by design (PR-W8 wires them). No `db/` edits.
- Coach-editable exercise library ships as the validated write shape
  plus seeded rows; a dedicated CRUD service was not built because the
  capability table lands in PR-05 (D15) and the card file list names
  no service module. Flagged for the verifier.
- "Exercise metadata and goals": no canvas demo goals exist
  (`seedState` leaves `plans.goals` empty) and `ClientGoal` needs a
  `ParameterDefinition` (PR-M4's domain), so no goals were seeded. The
  `ClientGoal` model exists (PR-M0).
- Keyboard-only pass of the changed interaction (PLAN live-verify
  row): N/A, no interaction changed; the screens are the existing
  backend read views (PR-W8 owns the canvas editor wiring).
- Parity (D32): none, no screen changes; the old backend
  training-program pages render as before.
- Node 26.8.2 vs target 24: gate records a warning, not a failure
  (standing orders 7).
