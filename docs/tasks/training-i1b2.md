# TRAINING-I1B-2 — dated-session bookings (task record)

Builder: SWE-2 High (Devin). Branch: `feature/training-i1b2` from
`origin/main` `f71198b` (merged I1b-1 Evergreen). Synthetic-only: no
PR, merge, deployment, production enablement, real-client use, or
shared/production migration.

## Contract precedence (latest first)

1. Bookings finalization `df88e01f…65e0` — A1-1 pin-all-client-
   presentation override (pinned tuple + pinned version's fieldConfig;
   `bookedWeek` label vs `scheduledDate` appointment kept distinct).
2. P2-A1 addendum `58bf0e70…0a870c` — corrected booking clauses.
3. P2 plan `97bb2767…684dba` — unoverridden booking clauses.
4. P1-R1 independent review `929a89da…ef50a` — contract READY.
5. Decisions #117 (Evergreen), #116 (I1a) — unchanged for their scopes.

## Scope (implemented)

- `training_session_booking` (migration
  `20261019180000_training_i1b2_bookings`): immutable pin
  `(pinned_version_id, session_id, booked_week)` + mutable
  `scheduled_date` (DATE, declared local calendar date) + scheduler/
  canceller provenance. Partial unique
  `(program_id, session_id, scheduled_date) WHERE cancelled_at IS NULL`
  = natural-key idempotency; cancelled rows free the tuple. Composite
  coherence FKs + `booked_week >= 1` + cancel-pairing CHECKs (raw-SQL
  convention).
- Service: `bookTrainingSession` / `moveTrainingSessionBooking` /
  `cancelTrainingSessionBooking` + `readStaffTrainingBookings` +
  `readOwnTrainingBookingHistory`; staff detail gains `bookings` +
  `bookableSessions`; client view gains `agenda`; pending-leaf program
  cancel atomically cancels non-past bookings.
- Pin resolution: anchor = `versionSeq=1.effectiveTimezone`; declared
  date resolved via `resolveTrainingActivation` (skipped dates reject,
  no fold to another date); `gvAt(versions, bookedInstant, takeover)`
  picks the pin once; week via `weekIndex` (Evergreen forced 1);
  `wk.week === bookedWeek` field-match lookup; bounded date range
  (anchor-today floor, +366d).
- Boundary codes: `booking_conflict`, `booking_date_bounds`,
  `past_handover`, `no_governing_version`.
- Actions + UI: staff `program-bookings` panel (book/move/cancel,
  upcoming + labelled history, pinned-version note) on the program
  detail page; client `training-agenda` section renders pinned
  projection with "Booked for {date}" vs "Week {n} prescription".

## Evidence (final tree)

- RED→GREEN: 14 focused tests written first; initial run failed at
  `beforeAll` (missing `training_session_booking` — net-new-surface
  RED, disclosed). GREEN: focused 14/14 on fresh deploy AND on a
  genuine base→candidate upgrade DB; unit 1331/1331; full integration
  872/872 (fresh `tgt_i1b2_full`); build clean; focused E2E 7/7; full
  E2E on dedicated `app_i1b2_e2e`.
- Mutations (all bit, byte-identical restore verified): M1 pin-at-now
  (gvAt wrong instant) → 2 failures; M2 non-pinned fieldConfig → 2;
  M3 move recomputes bookedWeek → 1; M4 cancelled rows occupy the key →
  1; M5 no cutoff check → `past_handover` assertion fails.

## I1B-2-R2 — independent-review repair

R1 independent review (`bf608abc…dea006e`, 256 lines) CONDITIONAL PASS
with one must-fix (F1) plus F2; repaired forward-only on this branch.

- F1: client booking history leaked pending-successor bookings
  pre-takeover. `readOwnTrainingBookingHistory` now joins the program's
  `version_seq=1` version and requires `activation_instant <= now`
  (injected op clock; inclusive at the exact takeover instant — same
  in-force rule as `selectCurrent`/`deriveProgramState`). Pending leafs
  stay staff-only until takeover; governed superseded programs keep
  their labelled history; cancelled/unpublished/foreign stay hidden.
- F2: staff history `hasMore` unreachable. `listTrainingBookingsAction`
  - a "Load more" control on the bookings panel — same bounded keyset,
    target-scoped cursor, dedupe on append, pending/error/disabled
    handling, remount-per-target via route key.
- Tests committed first (`32ea7d5`, RED on `dfac206`), implementation
  `21d5d98` + `8df3d65` (GREEN). Mutations: predicate removal fails
  both history assertions; dispatch stub stalls pagination at 12 rows —
  restored byte-identical.
- Advisories recorded in STATUS + R2 report: M5 wording correction
  (prospective only), pending-leaf cascade single program-level audit
  is contract-authorized (no change), client history still unwired.

## R3 — A1-D1 transport-failure repair (feature/training-i1b2-r3)

Merged at `688b5e6`. Synthetic browser acceptance found A1-D1:
rejected server-action promises in `program-bookings.tsx` escaped
`startTransition` to the app error boundary. Repaired (tests-first
`9427c7c` RED → `2f7bbf2` fix): transport failures surface truthful
uncertainty via `booking-message` + `router.refresh()` reconcile for
mutations, `bookings-history-error` with same-cursor retry for
pagination; structured errors unchanged; no automatic mutation
retries. Mutation-verified, restored byte-identical.

## Excluded (unchanged)

Recurrence, automatic generation, logging/completion tracking, notes/
flags/review, computed volume, formulas/recommendations, template
integration, active-program end, client scheduling writes, retention.
I2 and template integration remain deferred. `ENABLE_TRAINING_PLANS`
stays production-unset/fail-closed.
