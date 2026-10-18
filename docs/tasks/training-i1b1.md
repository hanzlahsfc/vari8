# TRAINING-I1B-1 — Evergreen program mode (task record)

Builder: SWE-2 High (Devin). Branch: `feature/training-i1b1` from
`origin/main` `36eae79` (merged I1a repair). Synthetic-only: no PR,
merge, deployment, production enablement, real-client use, or
shared/production migration.

## Contract precedence (latest first)

1. Owner boundaries (PROMPT 260/262): Evergreen is ongoing, publishable
   and editable past seven days; versions immutable and prospective;
   programs end by replacement only; pending-leaf cancel unchanged; no
   active end/cancel op; mode immutable after first publish.
2. P2-A1 addendum `58bf0e70…0a870c` + confirmation `8ffb22be…a4d5`
   (DeepSeek): F6 adds `setTrainingProgramTimezone` to the mode-aware
   ceiling inventory; A1-1 (booking-only) remains open for I1b-2.
3. P2 plan `97bb2767…684dba` — all unoverridden clauses stand.
4. P2-R1 review `0ab6c92f…79d6` — R1 dispositions verified.
5. Decision #116 (I1a) — week-based contract unchanged for week-based
   programs; Evergreen adds a parallel mode, never a conversion.

## Scope (implemented)

- `training_program.program_mode` + CHECK (migration
  `20261019000000_training_i1b1_evergreen`); draft `programMode`
  literal unblocked for `EVERGREEN`; materialized payloads stamp the
  mode; Evergreen stores `weekCount=1`.
- Mode-aware branches at every week-derived site (5 `ceiling` sites +
  completed-state + publish bounds). Evergreen: ceiling 0 / no
  high-water advance / no upper bound / never completed.
- Editor: pre-publish mode select, no week nav/count for Evergreen,
  writes at boundary 1. Create form: mode select + "Ongoing" copy.
  Client: `ongoing` + prospective-update marker. Staff list: "Ongoing".

## Evidence (final tree)

- RED: pre-fix, `normalizeTrainingDraft` rejected `EVERGREEN` (all 8
  integration tests failed at create) — behavioral RED, not compile RED.
- GREEN: integration 8/8 + unit +2 → 1331/1331; full integration
  858/858 real PG; build clean; focused E2E 6/6; full E2E 417/429.
- Mutations (all bite, byte-identical restore): M1 save ceiling, M2
  publish `program_ended`, M3 completed-state, M4 timezone high-water.
- Migration: fresh deploy + base→candidate upgrade verified (backfill,
  CHECK rejects bad literals, zero new drift vs datamodel).

## Deferred

- I1b-2 dated-session bookings (A1-1 clause open), I2 logging/flags,
  template-snapshot integration, computed volume — not implemented.
