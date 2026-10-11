# P-025-D — Deferred Check-In Capability Decisions (#98–#103)

Docs-only decision-record task. **No implementation was authorized,
implemented, or deployed.**

## Verified starting state

`origin/main` `9a05b0da9e81db13cdfa99ee23b5bf024f46bc61` — PR #33
MERGED (parents `65fad84` + `b6f32b3`); main CI `38081706634`/
`114299791007` SUCCESS; remote = `main` only; protection strict-verify

- admin-enforced; `ENABLE_CHECK_INS` commented/default-off; nothing
  deployed; no P-025-D implementation exists.

## Merged P-025 inventory

- **P-025-A:** `CheckInForm`/`CheckInFormVersion` (`versionSeq`,
  immutable published definitions), staff builder/preview/archive.
- **P-025-B:** `CheckInInstance` (one-off), `CheckInSubmission`/Answer
  (immutable, `unique(instanceId)`), staff schedule/cancel, client
  list/detail/submit, derived SCHEDULED/SUBMITTED/CANCELLED.
- **P-025-C:** `CheckInReview` (`unique(submissionId)`, immutable),
  staff header list, explicit audited detail reveal, terminal review
  acknowledgement; REVIEWED added to the derived projector.
- RBAC `checkinFormDefinitions`/`checkinInstances`/`checkinsCoachReviews`
  (all deny-set members); `chkin`→`member` lock order; synthetic
  dev/test consent; `daily_entry` audit exists.

## Planning and review chronology

1. **P-025-D-P1** (Devin, SWE-2 High) — six-slice decomposition + owner
   package.
2. **P-025-D-P1-R1** (DeepSeek v4.1 Flash, independent) — CONDITIONAL
   PASS: `dailyEntries`→`dailyTracking`, false deny-set claim, false
   "no deadlock" claim.
3. **P-025-D-P2** (Devin) — corrected: strict `checkinsCoachReviews`∩
   `dailyTracking` intersection; separate action; `csetup`→`member`.
4. **P-025-D-P2-R1** (DeepSeek) — CONDITIONAL PASS: DailyEntry
   relevance/date rule undefined.
5. **P-025-D-P3** (Devin) — date rule added as owner question Q6;
   scope-reconciliation, lock/snapshot, deterministic deadlock specs.
6. **P-025-D-P3-R1** (DeepSeek) — **PASS**; owner package READY.
7. **Owner approval** — "approve" = all six recommended options.

## Decisions #98–#103 (recorded in product-decisions.md)

- **#98 Recurrence** — rule record + bounded materialized instances;
  submitted/reviewed instances immutable. **Open:** grammar, timezone
  authority, DST, horizon, pause/skip, edit-future, default TZ.
- **#99 Custom coverage** — coach explicitly marks coverage; no silent
  fulfillment, no auto-match. **Open:** D-05 client-initiation
  eligibility/UI/data-model details.
- **#100 Selected summaries** — immutable build-time field flags inside
  the published definition. **Excluded:** AI summaries, auto DailyEntry
  panel, parameter FKs, cross-domain behavior. **Open:** field kinds,
  formulas, thresholds, periods, empty states.
- **#101 Feedback** — bounded staff-authored text first.
  **Gated/unchanged:** video (D-09), attachments, messaging,
  notifications, retention (D-10), legal, edit/delete lifecycle.
- **#102 Retention direction** — owner-defined retention window for
  client-visible records. **Open:** duration, defaults, workspace
  configurability, withdrawal, legal holds, deletion behavior; D-10
  NOT resolved.
- **#103 DailyEntry context** — explicit manual `YYYY-MM-DD` selection
  (option C1); latest committed revision of exactly that date; no
  fallback date, no passive preload, no availability list/API, no raw
  IDs, non-disclosing empty state, superseded values hidden.
  **Not approved:** browsable availability headers (C2).

## Binding D6 engineering contract (not owner choices)

Separate explicit server action in its own Serializable tx; strict
`checkinsCoachReviews/read` ∩ `dailyTracking/read` with explicit scope
reconciliation (ws+ws→ws; ws+asg→asg; asg+asg→asg; else deny);
dual-role PA denied via the Check-In resource; shared assignment
re-resolve+lock; `csetup`→`member` advisories (never `chkin` after
`member`); Check-In coherence via snapshot reads (no Check-In row
locks); fresh consent intersection FOR UPDATE; `READ daily_entry`
audit last (at-least-once on repeats); audit failure → zero values;
no new table/RBAC/audit resource; default-off, production fail-closed.
Required tests: barrier-driven real-PG deadlock/inversion probe with
explicit timeouts, full role/scope matrix, asymmetric authorization,
consent withdrawal, cross-tenant substitution, date bounds, no-
fallback, no-entry, latest-revision-only, passive-query prevention,
audit rollback, biting mutations.

## Slice gates

- **D6** — product gate RESOLVED (#103). IMPLEMENTED on candidate
  branch `feature/p025d6-checkin-tracker-context` (2026-10-11; record
  `docs/tasks/p025-check-in-v1.md`) — unreviewed; no PR/merge until
  independent different-model review.
- **D2 Calendar** — may proceed independently (renders existing one-off
  instances).
- **D1 Recurrence** — still gated by timezone/DST and remaining #98
  sub-rules.
- **D3 Custom** — gated by remaining D-05 detail.
- **D5 Summaries** — needs aggregation/display specifics.
- **D4 Feedback** — gated by D-09/D-10/legal/lifecycle.
- **C07** — deferred until a real plan domain exists.

## Confirmation

Documentation-only task: no schema, migration, code, test, config,
flag, deployment, or production change. The builder (Devin, SWE-2
High) performed a same-model documentation self-review — explicitly
NON-INDEPENDENT; independent different-model review is the next gate.
