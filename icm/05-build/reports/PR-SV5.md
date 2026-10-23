# PR-SV5 — Check-in review read model (issue #171 / C05)

## Scope

Issue #171's delta over the `readStaffCheckInSubmissionDetail` /
`tracker-context` / answer-read contract that exists on the base (PR
#147 is still open; its branch adds `loadSubmissionAnswers`, which
documents verbatim that "the server carries no parameter values in
this DTO and no flags column at all"). No new service, no new consent
or audit semantics: the audited staff detail read gains the packet
and slots.

## Implemented contract

`StaffCheckInSubmissionDetail` (`lib/checkin/instances.ts`) gains:

- `parameterValues` — the daily tracker packet for the **check-in
  date**: the Vienna local date of the instance `dueAt` (the same
  date the canvas passes to the explicit tracker-context endpoint,
  `viennaDate(dueAt)`). The issue's "parameter values per answer"
  resolves to the date-level packet: the approved wiring spec
  (`icm/03-plan/output/wiring/coach.md`, screen 20, "Tracker &
  progress") declares the review's tracker table as one date per
  call, and the canvas's own `loadTrackerContext` contract reads one
  `entryDate`. Inside the same Serializable transaction:
  `authorize(dailyTracking/read)` → strict scope reconciliation with
  the check-in scope (`reconcileTrackerContextScopes`, shared helper)
  → `assigned` re-resolves the ACTIVE assignment FOR UPDATE — all
  **before** the consent step, mirroring the tracker-context read's
  authorize → scope → assignment → consent acquisition order so both
  paths take assignment before consent rows and never invert → daily
  consent kinds verified against rows already locked FOR UPDATE in
  sorted-kind order at the single consent step (the union of both
  registries' kinds — the same global lock order as the
  tracker-context intersection) → values rendered by
  `loadStaffDailyEntryDetailTx`, an **audit-free** loader split out
  of `readStaffDailyEntryDetailTx` (the tx function keeps its own
  `READ daily_entry` audit last — behavior unchanged). Rendered rows
  sort by the immutable template version's item order — DB row order
  is arbitrary and the review table needs a stable order.
  - `null` = withheld (denied, reconcile `denied`, missing ACTIVE
    assignment, daily consent missing, daily policy unconfigured,
    ineligible template) — never presented as "no entry".
  - `[]` = authorized date with no committed entry — honest empty.
- `flags`, `photos`, `nutrition` — availability slots with explicit
  semantics (`T[] | null`): `null` = unavailable (the owning lane has
  not landed), distinguishable from an authorized-but-empty `[]` once
  the feature exists. `flags` carries the canvas `{exercise, set,
date, text}` shape (issue 14); `photos` is the progress-photo slot
  (issue 11 — check-in answer attachments remain on
  `fields[].mediaIds`, a separate thing); `nutrition` awaits issue
  12a's contract. All three currently serialize as `null`.

One `checkin_submission` READ audit covers the whole view (the packet
does **not** write a second `daily_entry` audit); passive GETs audit
nothing, unchanged. Withdrawn **check-in** consent refuses the whole
read — answers and packet alike; withdrawn **daily** consent hides
only the packet (`null`) while answers still serve. Foreign
workspaces get nothing (`not_available`, non-disclosing). No schema
or migration changes — #158 retains the next schema slot.

## Evidence

### Canonical gate — `BASE_SHA=406c551 LANE_DB=app_chkreview LANE_PORT=3862 SKIP_PARITY=1`

`icm/05-build/tools/verify-local.sh` → **VERIFY-LOCAL PASS**, head
`fb3f3ebdeee7f01f53fd9f9ed1607b8ce627eb5d`, node v24.22.1:

- format/typecheck/frontend typecheck/lint/frontend lint: PASS
- unit tests: 102 files / 1199 tests PASS (fresh `npm run test`
  verbatim, exit 0)
- frontend tests: 198 PASS
- integration tests: **64 files / 903 tests PASS** — includes
  `sv5-checkin-review-read.test.ts` (14 tests) plus unchanged p025c /
  p025d6 / feedback suites (75/75 standalone before the gate).
- migrate deploy: no pending (no `db/` changes; schema guard PASS
  with no CARD)
- build / frontend build: PASS
- e2e flow specs: **10 passed / 7 skipped / 0 failed** (real https
  lane — TLS proxy + loopback backend, configured origin
  `https://127.0.0.1:3862`; the 7 skips are mail-adapter-dependent
  reset specs — skips, not passes)
- parity: SKIP (no screens change)

Host adaptation (recorded, no repo change): the shared DB container
is `app-db-1`; a PATH shim maps the script's hardcoded `docker exec
vari8-db-1` target to it. `VARI8_WORKTREES`/`VARI8_BETA` env point at
this host's paths.

### New acceptance coverage (`tests/integration/sv5-checkin-review-read.test.ts`)

- packet serves seeded daily values (`["80","kg"],["first",null]` rows
  — deterministic template-item order) with `flags`/`photos`/
  `nutrition` serialized as `null` (unavailable, not "authorized
  empty"), exactly one `checkin_submission` READ audit and zero
  `daily_entry` audits;
- latest committed revision only (`["81","revised"]`, not the first
  save);
- **date selection through the packet** (dueAt → Vienna local date):
  spring DST (2024-03-31T22:30Z → 2024-04-01), autumn DST
  (2024-10-26T22:30Z → 2024-10-27), local midnight (2024-06-10T22:00Z
  → 2024-06-11), year boundary (2024-12-31T23:30Z → 2025-01-01) —
  each against a decoy entry on the neighbouring date; plus dueAt-vs-
  submittedAt (a decoy on the real "today" never leaks in);
- authorized date with no entry → `[]` while answers serve;
- **check-in detail allowed but `dailyTracking` denied** via the
  injected `authorizeDaily` seam → answers served,
  `parameterValues: null`, one audit. This is **defensive-seam
  coverage, not a production asymmetric-role scenario** — the current
  RBAC matrix grants no staff role `checkinsCoachReviews` read while
  denying `dailyTracking` read; the seam exercises the fail-closed
  withholding path only;
- assigned coach (assigned∩assigned, production `authorize`)
  receives the packet; owner with no assignment receives it at
  workspace scope;
- daily consent missing, revoked, or registry-version change →
  `parameterValues: null`, answers still serve, audit count
  unchanged;
- check-in consent withdrawal → whole read `consent_missing`, zero
  audits;
- foreign-workspace coach → `not_available`, zero audits;
- open vs marked states stay distinct (`reviewed`/`feedback`
  fields; committed drafts are canvas-local by contract).

### Mutations (all restored byte-identically)

- `instance.dueAt` → `submission.submittedAt` in the packet date →
  **5 failures** including the dueAt-vs-submittedAt and DST vectors;
- drop `dailyConsented` from the packet gate → the
  withheld-packet test fails (packet would serve past consent);
- authorize `checkinsCoachReviews` instead of `dailyTracking` for the
  packet → the denied-daily test fails (intersection bypassed);
- **slots `null` → `[]`** (the mutation writes `[]`; the test asserts
  `null`) → the availability-semantics test fails;
- map `not_available` → withheld instead of `[]` → the honest-empty
  test fails (carried from the first round);
- remove the `renderRevisionDisplayRows` template-order sort → the
  new ordering unit tests fail on shuffled input (**3 of 5** — the
  drop/filter cases still pass since they assert filtering, not
  order).

### Lock ordering (review finding 7)

The packet's `authorize` → scope reconcile → ACTIVE-assignment
FOR UPDATE now runs **before** the consent step, mirroring the
tracker-context read's acquisition order exactly (authorize →
assignment → profile → consent). Both paths take the assignment lock
before consent rows; no inversion between them is constructible.

### Contract disposition (review findings 5–6)

- "parameter values per answer" (issue #171): resolved to the
  date-level packet by the approved wiring spec — screen 20 row
  "Tracker & progress, 7-day table" declares the review's tracker
  table one date per call (`showCheckInReviewTrackerContext`), and
  the canvas `loadTrackerContext` contract takes one `entryDate`.
  The DTO field is `parameterValues` (date-level packet for the
  check-in date).
- PR #147 remains **OPEN** — `loadSubmissionAnswers` lives only on
  its branch. This delivery is backend read-model only; UI
  consumption is a genuine merge dependency on #147, not claimed
  here.

## Dependencies / remaining gaps

- The canvas consumes the new fields only after PR #147 lands (its
  `loadSubmissionAnswers` fills `metrics`/`flags` from this DTO); the
  read model deliberately does not wire the panel itself.
- Flagged set notes, photos, and nutrition semantics stay deferred
  to issues 14 / 11 / 12a — the slots serialize as `null`
  (unavailable), explicitly not "authorized but empty".
- The separate `tracker-context` endpoint is unchanged and remains
  the explicit read for other callers; the embedded packet reuses its
  scope/consent/loader machinery rather than duplicating it.
- Browser-level canvas verification of the new columns is not
  claimed: the panel that draws them lives on #147's unmerged
  branch. The https e2e suite exercises the app's real flows on this
  head.
