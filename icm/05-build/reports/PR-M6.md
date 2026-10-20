# PR-M6 report

Card `icm/05-build/cards/pr-m6-training-payload.md`, issue #115, PR #116.
Branch `beta/pr-m6-training-payload`, base `origin/Vari8-Beta` `bb31401`.
Gate receipt head `ed0c776` (this report adds docs only). Lane `app_wb_m6`,
port 3925. Host: macOS, node 26.12.0, native PG17 at 127.0.0.1:5433.

## Acceptance

"A draft round-trips ordered sets; volume per muscle group equals the canvas
panel on the demo program."

**Round-trip (real PG).**
`tests/integration/training-m6-roundtrip.test.ts` saves a draft, publishes
it, then reads it back as staff and as the client. It asserts literal row
order and values, not shape: `d1, d2, d3, d4` for the deadlift (with
`coachNote` "Keep the brace"), `b1` to `b4` for the bench, the derived
scalar `sets` 4, and `reps` "4-5" on the client read.

**Volume per muscle group (measured, both sides).**
`tests/unit/training-m6.test.ts` "the seeded demo program reproduces the
canvas volume panel" feeds two things into the same week:

- the canvas panel: `weeklyMuscleVolume(initialRecords.workoutSchedule, 6)`
  from `frontend/src/components/coach/muscle-volume.ts`, over the demo
  records the coach preview reads
  (`frontend/src/components/ethereal/builder/model.ts`);
- the backend: `programMuscleVolume` over the week-6 sessions of
  `demoProgramDraft()`, the program `scripts/seed/35-training.seed.ts`
  seeds, materialized by `materializeWeeks` exactly as a publish does.

Both give the same numbers for week 6 of the demo program:

| Group                                                | Sets |
| ---------------------------------------------------- | ---- |
| chest                                                | 4    |
| back                                                 | 3    |
| glutes                                               | 3    |
| hamstrings                                           | 4    |
| shoulders, biceps, triceps, core, quadriceps, calves | 0    |
| total                                                | 14   |
| unassigned                                           | 0    |

The test asserts group-by-group equality between the two panels, the total
in both, and the literal table above. Mutation check (D14): making
`workingSetCount` drop one set row (`length - 1`) fails this test and the
older literal test (2 failed, 14 passed), and reverting restores it, so the
guard is live and not tautological.

## What changed

- `lib/training/volume.ts` (new): verbatim port of the canvas
  `muscle-volume.ts` (`MUSCLE_GROUPS`, `PRIMARY_MUSCLE`, `ScheduledWorkout`,
  `weeklyMuscleVolume`) and of the canvas
  `prescribedMuscleVolume`/`volumeExerciseId` adapters, plus
  `programMuscleVolume`/`workingSetCount` reading materialized sessions
  (ordered `setRows` or the scalar `sets`, warm-up rows filtered like the
  canvas). `frontend/` untouched.
- `lib/trainingprogram/validators.ts` (new): `prescribedSetSchema` (canvas
  TrainingSet, no prescribed load per O12, optional `coachNote`),
  `setLogEntrySchema`, `loggedExerciseSchema`, `sessionSetLogSchema`
  (owner ruling O5: actual reps, load and unit, RPE, set note, flags,
  session `completedAt`), `exerciseLibraryItemInputSchema`.
- `lib/trainingprogram/payload.ts`: `setRows` boundary section
  (`"sid/eid"` to week to ordered `PrescribedSet[]`), exercise metadata
  (`muscle`, `secondaryMuscles`, `libraryItemId`, `generalNotes`),
  materialization emits ordered rows and derives the scalar `sets`,
  `projectForClient` gates `setRows` on the Sets toggle and strips per-set
  fields per toggle (`coachNote` always kept), `validatePublishCompleteness`
  accepts setRows, and pre-M6 stored drafts without `setRows` still load.
- `lib/trainingprogram/limits.ts`: `generalNotesMax`, `maxSecondaryMuscles`.
- `lib/trainingprogram/service.ts`: one line, `setRows` joins the
  locked-week boundary equality. Outside the card file list, required for
  the invariant to cover the new section.
- `scripts/seed/35-training.seed.ts` (new): seeds the `canvas-demo`
  workspace with the 10-item canvas starter library as
  `ExerciseLibraryItem` rows and the canvas sample program for Emma Anders
  ("Strength foundation", WEEK_BASED, 8 weeks from 2026-09-14, week 6 on the
  2026-10-19 demo date, published version 1, Europe/Vienna). The draft is
  built by `demoProgramDraft()` so the test above measures the seeded
  program itself instead of a copy of its numbers.
- `scripts/seed/33-checkins.seed.ts`: one block, outside this card. See
  "Base defect found and fixed" below.
- Tests: `tests/unit/training-m6.test.ts` (16 tests),
  `tests/integration/training-m6-roundtrip.test.ts` (1 test, real PG),
  `tests/unit/training-payload.test.ts` (+`setRows: {}` fixture key).
- `docs/index/SYMBOLS.md`: regenerated after the merge (`npm run index`).

## The build failure, diagnosed

The handoff said `npm run build` exited 1 on the Linux host with the cause
unknown. On this Mac it does not reproduce. Two runs, both exit 0: a
standalone `npm run build` on the merged tree (18s) and the gate's build
step, plus `frontend` build, both PASS.

What I did find is an environment defect that fakes npm results on this
host. Two 17-byte shims, `npm` and `npx` at
`/Users/marcelspatz/.hermes/cache/scratch/flagproof/`, each `#!/bin/sh` and
`exit 0`, sat earlier in `PATH` than the real npm. With them in front of the
real binary, `npm ci` exits 0 and installs nothing (`node_modules` absent,
empty log) and every npm script becomes a hollow pass. The first two
`npm ci` runs in this session were exactly that. I removed that directory
from this shell's `PATH` (I did not delete it, it is another lane's scratch
directory) and the same commands then installed 767 root and 383 frontend
packages and did real work.

That shim cannot itself produce exit 1, since it swallows the command. So
the Linux exit 1 is not explained by it. The Linux run left no log in the
shared evidence directory, so its error text cannot be inspected from here.
What I can rule out from evidence: this branch's code. The same tree with a
clean install builds twice, and every other gate step that ran on the same
tree passes. The residual likely causes are host-side, a stale or absent
`node_modules` at build time or memory pressure with three lanes building at
once; I could not confirm either, so this stays an inference, not a finding.

## Commands and exit codes

Lane setup: `POSTGRES_PASSWORD` read from the repo `.env` (never printed),
`PATH` with the wave shims, `VARI8_WORKTREES`, `AUTH_TRUST_HOST=1`,
`PRETTIER` pointed at the root checkout's prettier.

| Command                                                                                                                 | Exit                          |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `git merge --ff-only origin/beta/pr-m6-training-payload` (already at remote head)                                       | 0                             |
| `git merge origin/Vari8-Beta` (one conflict, `docs/index/SYMBOLS.md`)                                                   | 1                             |
| `npm run index` / `npm run index:check` after the merge                                                                 | 0 / 0                         |
| `npm ci` (root, 767 packages) / `npm ci` (frontend, 383)                                                                | 0 / 0                         |
| `npm run format:check`                                                                                                  | 0                             |
| `npm run typecheck` / `npm --prefix frontend run typecheck`                                                             | 0 / 0                         |
| `npm run lint` (81 warnings, 0 errors) / `npm --prefix frontend run lint`                                               | 0 / 0                         |
| `npm run test` (95 files, 1091 tests)                                                                                   | 0                             |
| `npm --prefix frontend run test` (76 tests)                                                                             | 0                             |
| `npx prisma migrate deploy` on `app_wb_m6`                                                                              | 0                             |
| `npm run test:integration` (61 files, 859 tests)                                                                        | 0                             |
| `npm run build` (standalone, pre-gate)                                                                                  | 0                             |
| `npx tsx scripts/seed/index.ts` on a fresh probe DB                                                                     | 0                             |
| `npx vitest run --config vitest.integration.config.ts tests/integration/seed-credentials.test.ts` (before the base fix) | 1                             |
| same test after the base fix                                                                                            | 0                             |
| `npx vitest run tests/unit/training-m6.test.ts` (mutation applied)                                                      | 1, 2 tests failed as intended |
| gate `verify-local.sh`, log `Vari8-evidence/WAVEB-LEAD/pr-m6-training-payload.check.log`                                | 1                             |

Gate summary verbatim (19 PASS, 1 WARN, 1 FAIL):

```
head=ed0c7762fcc0a2192c1506154bd3f123e7f6fe4d base=bb3140111d9f02ab0fd7e2ecdf16a1732536c66e node=v26.12.0 card=PR-M6 db=app_wb_m6 port=3925
PASS clean tree (0s)
WARN node: target 24 (D5), running v26.12.0; recorded, not certified
PASS schema guard (D34) (0s)
PASS program generator check (2s)
PASS npm ci (13s)
PASS prisma generate (1s)
PASS frontend npm ci (6s)
PASS format check (10s)
PASS typecheck (2s)
PASS frontend typecheck (3s)
PASS lint (16s)
PASS frontend lint (3s)
PASS unit tests (18s)
PASS frontend tests (1s)
PASS integration tests (133s)
PASS migrate deploy (1s)
PASS build (18s)
PASS frontend build (18s)
PASS e2e flow specs (serialized) (22s)
FAIL parity regression (D32) exit=1 (226s)
VERIFY-LOCAL FAIL
EXIT=1
```

Parity is the only failing step and the card file excludes it: "Parity
(D32) on: none." `verify-local.sh:135` runs `npm run parity` unconditionally
and this branch's copy has no `SKIP_PARITY` (`grep -c SKIP_PARITY` on
`origin/Vari8-Beta:icm/05-build/tools/verify-local.sh` is 0; PR #137 adds it
and is still open). The failure signature is the reference-host font metric
one the lead measured: 70 screens, `geom=0/0/91`, `text=0` on the samples,
that is no element added or removed and no text changed, only sub-pixel
geometry moves. It is not this branch's code and cannot pass on macOS with
the Linux baseline.

## Base defect found and fixed (outside the card)

`npm run test:integration` failed once on the merged base:
`tests/integration/seed-credentials.test.ts` could not find a client profile
owned by the seeded client user.

Root cause, reproduced on a fresh DB: `scripts/seed/33-checkins.seed.ts`
(merged with PR #120) re-pointed every client profile it touches at a
credential-less `<slug>@canvas-demo.test` user. For the first roster client
that overwrote the link `scripts/seed/00-workspace.seed.ts` writes for the
SEED-FIX credential user, so the seeded client signed in as a user with no
`accounts` row and no profile. Both files are identical to `origin/Vari8-Beta`,
so the base is red for every lane that merges #120, not just this one.

Fix, one block in `demoClientUser`: a profile that already has a user keeps
it, and only a profile with no user gets the demo user. That is what the
function's own comment already intends ("no credentials, the SEED-FIX
credential path owns sign-in"). After the change the full suite is 859 of
859 and the check-in seed still writes its three submissions.

This file belongs to PR-M8, so it needs the lead's sign-off, and PR-M8's
author should see it. It is one block and reverts cleanly if the lead
prefers to fix it on the integration branch instead.

## Matrix rows closed

- V3-L1-TrainingSet: ordered per-set shape (`setRows`) in the draft and the
  materialized payload, canvas TrainingSet fields carried verbatim.
- V3-L1-Exercise: coach-editable `ExerciseLibraryItem` write shape plus the
  seeded workspace library; the catalog stays read-only.
- V3-L1-TrainingPlan: the program payload carries per-set rows and exercise
  metadata; override semantics unchanged.

## Could not do

- **Parity (D32)**: not runnable on this host against the Linux baseline,
  and out of contract for this card. The gate therefore exits 1 on that
  single step. `SKIP_PARITY` is not on `origin/Vari8-Beta` yet (PR #137).
- **Live browser pass at 1440 and 390**: not run in this session. The
  acceptance above is measured at the data layer against the canvas
  function itself, plus a real-Postgres round-trip; no screen changed, so
  the canvas rule (Lilly's frontend looks exactly as today) holds by
  construction. The prior Linux run's screenshots are under
  `_evidence/PR-M6/build` on the Linux host and were not re-verified here.
- **O5 set-log shape is a contract only** (validators), no storage or routes
  by design; PR-W8 wires it. No `db/` edits.
- **Coach-editable exercise library** ships as the validated write shape
  plus seeded rows. No CRUD service: the capability table lands in PR-05
  (D15) and the card file list names no service module.
- **Exercise goals**: the canvas demo state has no goals (`seedState` leaves
  `plans.goals` empty) and `ClientGoal` needs a `ParameterDefinition` from
  PR-M4, so none were seeded.
- Node 26.12.0 against target 24: the gate WARNs, it does not fail (D5).

## Environment note for the wave lead

`/Users/marcelspatz/.hermes/cache/scratch/flagproof/{npm,npx}` are `exit 0`
shims and any lane that inherits that directory in `PATH` gets hollow npm
passes and an empty `node_modules`. I left them in place (not mine to
delete) and cleared them from this lane's `PATH`. Worth removing before the
next wave of gates.
