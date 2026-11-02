# PR-M6 report

Card `icm/05-build/cards/pr-m6-training-payload.md`, issue #115, PR #116.
Branch `beta/pr-m6-training-payload`, base `origin/Vari8-Beta` `6d06cf8`,
head `f14df1a` (this report adds docs only). Lane `app_wb_m6`, port 3925.
Host macOS, node 26.12.1 (gate target 24, WARN only), native PG17 on
127.0.0.1:5433.

## Acceptance

The card's contract, verbatim:

> A draft round-trips ordered sets; volume per muscle group equals the
> canvas panel on the demo program.

Measured on this head, both sides, against the running production server
and the lane database. Nothing below is copied from an earlier run.

### Canvas panel, live in the browser (1440 and 390)

Server: `npm run build` (exit 0) then `npx next start -p 3925`, production
build, `APP_ENV=test`, `ENABLE_TRAINING_PLANS=1`, real sign-in as the
seeded coach (`coach@vari8.test`, HTTP 200 on `/login`).

Panel: `/coach`, Clients, Emma Anders, Edit plans, Training, the canvas
plan editor's `section.te-volume` (`aria-label="Prescribed weekly
volume"`), which renders `prescribedMuscleVolume` from
`components/canvas/coach/plans/training/training-model.ts`.

The demo plan was entered in that editor: Deadlift (hamstrings) 4 sets,
Bench press (chest) 4 sets, Chest-supported row (back) 3 sets, Hip thrust
(glutes) 3 sets, 14 ordered set rows. Literal DOM text read at both
widths:

```
Weekly volume / 14 prescribed sets
Muscle group   Working sets
Chest          4
Back           3
Glutes         3
Hamstrings     4
```

Read at 1440x900 and again at 390x844 (`scrollWidth == innerWidth == 390`,
no horizontal overflow, panel still visible and readable). The draft also
survives a full page reload with the panel unchanged, which is the
canvas-side round trip of the ordered rows.

Screenshots (absolute paths):

- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m6-training-payload/_evidence/PR-M6/build/training-plan-editor-1440.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m6-training-payload/_evidence/PR-M6/build/volume-panel-1440.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m6-training-payload/_evidence/PR-M6/build/training-plan-editor-390.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m6-training-payload/_evidence/PR-M6/build/volume-panel-390.png`

The canvas library in the coach demo has no `Split squat` entry, so the
glutes slot of the demo program (Split squat, 3 sets) is entered as Hip
thrust, 3 sets. Per muscle group the numbers are the demo program's.

### Backend, from the lane database

`_evidence/PR-M6/build/probe.ts` (read only, `npx tsx`, exit 0) reads the
published program `Strength foundation` for Emma Anders in `app_wb_m6`
(version 1, 8 weeks from 2026-09-14, payload as the publish materialized
it) and feeds the stored sessions through `programMuscleVolume` from
`lib/training/volume.ts`:

```
program="Strength foundation" weeks=8 start=2026-09-14 versionSeq=1
week=1 chest=4 back=3 shoulders=0 biceps=0 triceps=0 core=0 glutes=3 quadriceps=0 hamstrings=4 calves=0 | total=14 unassigned=0
week=2 chest=4 back=3 shoulders=0 biceps=0 triceps=0 core=0 glutes=3 quadriceps=0 hamstrings=4 calves=0 | total=14 unassigned=0
week=3 chest=4 back=3 shoulders=0 biceps=0 triceps=0 core=0 glutes=3 quadriceps=0 hamstrings=4 calves=0 | total=14 unassigned=0
week=4 chest=4 back=3 shoulders=0 biceps=0 triceps=0 core=0 glutes=3 quadriceps=0 hamstrings=4 calves=0 | total=14 unassigned=0
week=5 chest=4 back=3 shoulders=0 biceps=0 triceps=0 core=0 glutes=3 quadriceps=0 hamstrings=4 calves=0 | total=14 unassigned=0
week=6 chest=4 back=3 shoulders=0 biceps=0 triceps=0 core=0 glutes=3 quadriceps=0 hamstrings=4 calves=0 | total=14 unassigned=0
week=7 chest=4 back=3 shoulders=0 biceps=0 triceps=0 core=0 glutes=3 quadriceps=0 hamstrings=4 calves=0 | total=14 unassigned=0
week=8 chest=4 back=3 shoulders=0 biceps=0 triceps=0 core=0 glutes=3 quadriceps=0 hamstrings=4 calves=0 | total=14 unassigned=0
week6 detail:
  session="Lower strength" exercise="Deadlift" muscle=hamstrings setRows=[d1,d2,d3,d4] working=4
  session="Lower strength" exercise="Split squat" muscle=glutes setRows=[ss1,ss2,ss3] working=3
  session="Upper strength" exercise="Bench press" muscle=chest setRows=[b1,b2,b3,b4] working=4
  session="Upper strength" exercise="Chest-supported row" muscle=back setRows=[r1,r2,r3] working=3
```

Every one of the eight weeks reads 4 / 3 / 3 / 4 with `total=14
unassigned=0`.

Card unit line, literal working set counts per group for the demo program:

| Group                                                | Working sets |
| ---------------------------------------------------- | ------------ |
| chest                                                | 4            |
| back                                                 | 3            |
| glutes                                               | 3            |
| hamstrings                                           | 4            |
| shoulders, biceps, triceps, core, quadriceps, calves | 0            |
| total                                                | 14           |
| unassigned                                           | 0            |

Canvas panel and backend payload agree group by group at both widths and
in the database read.

### Ordered sets round trip (real PG)

`npx vitest run --config vitest.integration.config.ts
tests/integration/training-m6-roundtrip.test.ts` on a fresh probe
database `app_wb_m6_rt`, exit 0, 1 test passed. It saves a draft, publishes
it, then reads the version back as staff and as the client and asserts
literal rows, not shape: `d1, d2, d3, d4` with `coachNote` "Keep the
brace", `b1` to `b4`, `ss1` to `ss3`, `r1` to `r3`, the derived scalar
`sets` 4 and `reps` "4 to 5".

`npx vitest run tests/unit/training-m6.test.ts` (the canvas parity guard
plus the volume literal), exit 0, 16 tests passed. That suite compares
`weeklyMuscleVolume` from the canvas module against `programMuscleVolume`
over the seeded draft week 6 and asserts the table above literally.

## Commands and exit codes

| Command                                                                                                | Exit                   |
| ------------------------------------------------------------------------------------------------------ | ---------------------- |
| `git status --short --branch`, `git log --oneline -3` at start                                         | 0                      |
| `which -a npm npx node` (no `flagproof` shim on PATH this round)                                       | 0                      |
| `dropdb` / `createdb app_wb_m6`                                                                        | 0 / 0                  |
| `npx prisma migrate deploy` (lane)                                                                     | 0                      |
| `npx tsx scripts/seed/index.ts` (10 library items, program published)                                  | 0                      |
| `npm run build` (production, real node_modules)                                                        | 0                      |
| `npx next start -p 3925`, `GET /login`                                                                 | 200                    |
| browser sign-in as `coach@vari8.test`, then `/coach`                                                   | 200                    |
| `curl /coach` without a session (redirect to sign-in)                                                  | 307                    |
| `npx tsx _evidence/PR-M6/build/probe.ts` (lane read)                                                   | 0                      |
| `npx vitest run tests/unit/training-m6.test.ts`                                                        | 0, 16 passed           |
| `npx vitest run --config vitest.integration.config.ts tests/integration/training-m6-roundtrip.test.ts` | 0, 1 passed            |
| `npx vitest run tests/unit/system-index.test.ts` (evidence dir present)                                | 1, 2 failed            |
| same test with `_evidence/` moved out of the tree                                                      | 1, 1 failed, 17 passed |

## Gate status

No gate ran this round, by instruction: the wave gate is blocked by PR
#145, and `origin/Vari8-Beta` `6d06cf8` is red on its own at
`tests/unit/system-index.test.ts`. I reproduced that on this head: 1
failed, 17 passed, exit 1, `F1: indexes a route-segment directory such as
app/sheets`, `expected 'Counts: 52 backend pages'`. A missing gate receipt
here is not a green gate.

One thing the wave lead should know before gating: with this card's
`_evidence/` directory present in the worktree, the same test fails a
second time with `missing: _evidence/AGENTS.md`, because the index
generator walks the filesystem, not the git tree. The evidence directory
must be moved out (or the gate run after it is archived) or the unit step
goes red for a reason that has nothing to do with the code.

## What changed

Reports only this round. Branch diff against `origin/Vari8-Beta` is the
card's own files from the earlier build round: `lib/training/volume.ts`,
`lib/trainingprogram/validators.ts`, `lib/trainingprogram/payload.ts`,
`lib/trainingprogram/limits.ts`, `lib/trainingprogram/service.ts` (one
line, `setRows` joins the locked-week boundary equality),
`scripts/seed/35-training.seed.ts`, two new tests, one fixture key in
`tests/unit/training-payload.test.ts`, `docs/index/SYMBOLS.md`
(regenerated), and this report. No `db/` changes.

The earlier `scripts/seed/33-checkins.seed.ts` change is no longer in the
branch: the merge to `6d06cf8` dropped it, so the branch carries nothing
outside the card. The base seed defect it addressed (client profiles
re-pointed at credential-less `<slug>@canvas-demo.test` users) is visible
again on this lane and blocks the client-facing render below.

## Could not do

- **Gate**: pending on PR #145, not run, no READY line written.
- **Live client-facing render of the seeded program**: not reachable on
  this lane. `scripts/seed/00-workspace.seed.ts` and
  `scripts/seed/33-checkins.seed.ts` create no `client_assignment` rows,
  so the staff program page authorizes to 200 with "You don't have access
  to this training program", and the profile named Emma Anders is owned by
  the credential-less `emma.anders@canvas-demo.test` user while the
  credential user `emma.anders@vari8.test` owns no profile. Both are seed
  fixture behaviour outside this card's file list; the backend numbers
  above were read through the same payload the page consumes.
- **Parity (D32)**: out of contract for this card ("Parity (D32) on:
  none") and not run.
- **O5 set-log shape** ships as validators only, no storage or routes
  (PR-W8 wires it). **Coach-editable exercise library** ships as the
  validated write shape plus seeded rows, no CRUD service. **Exercise
  goals** were not seeded: the canvas demo state has no goals and
  `ClientGoal` needs a `ParameterDefinition` from PR-M4.

## Matrix rows closed

- V3-L1-TrainingSet: ordered per-set shape (`setRows`) in the draft and
  the materialized payload, canvas TrainingSet fields carried verbatim.
- V3-L1-Exercise: coach-editable `ExerciseLibraryItem` write shape plus
  the seeded workspace library; the catalog stays read-only.
- V3-L1-TrainingPlan: the program payload carries per-set rows and
  exercise metadata; override semantics unchanged.
