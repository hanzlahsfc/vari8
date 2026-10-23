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
  `viennaDate(dueAt)`). Inside the same Serializable transaction:
  `authorize(dailyTracking/read)` → strict scope reconciliation with
  the check-in scope (`reconcileTrackerContextScopes`, shared helper)
  → `assigned` re-resolves the ACTIVE assignment FOR UPDATE → daily
  consent kinds verified against rows already locked FOR UPDATE in
  sorted-kind order at the single consent step (the union of both
  registries' kinds — the same global lock order as the
  tracker-context intersection, so no lock-order inversion) → values
  rendered by `loadStaffDailyEntryDetailTx`, an **audit-free** loader
  split out of `readStaffDailyEntryDetailTx` (the tx function keeps
  its own `READ daily_entry` audit last — behavior unchanged).
  - `null` = withheld (denied, reconcile `denied`, missing ACTIVE
    assignment, daily consent missing, daily policy unconfigured,
    ineligible template) — never presented as "no entry".
  - `[]` = authorized date with no committed entry — honest empty.
- `flags` — the flagged set-notes column (issue 14): `[]` until it
  lands. `CheckInFlaggedSetNote` matches the canvas `{exercise, set,
date, text}` shape.
- `nutrition` — the issue 12a slot: `[]` until its contract exists.
- Photos (issue 11): already served per-answer via
  `fields[].mediaIds`; no duplicate slot.

One `checkin_submission` READ audit covers the whole view (the packet
does **not** write a second `daily_entry` audit); passive GETs audit
nothing, unchanged. Withdrawn **check-in** consent refuses the whole
read — answers and packet alike; withdrawn **daily** consent hides
only the packet (`null`) while answers still serve. Foreign
workspaces get nothing (`not_available`, non-disclosing). No schema
or migration changes — #158 retains the next schema slot.

## Evidence

### Canonical gate — `BASE_SHA=406c551 LANE_DB=app_chkreview LANE_PORT=3860 SKIP_PARITY=1`

`icm/05-build/tools/verify-local.sh` → **VERIFY-LOCAL PASS**, head
`2ef8ebd5af01e0cf66b7a41d6f359437276cd48a`, node v24.22.1:

- format/typecheck/frontend typecheck/lint/frontend lint: PASS
- unit tests: 102 files / 1199 tests PASS (fresh `npm run test`
  verbatim, exit 0)
- frontend tests: 198 PASS
- integration tests: **64 files / 896 tests PASS** — includes the new
  `sv5-checkin-review-read.test.ts` (7 tests) and unchanged p025c /
  p025d6 / feedback suites (75/75 run standalone before the gate).
- migrate deploy: no pending (no `db/` changes; schema guard PASS
  with no CARD)
- build / frontend build: PASS
- e2e flow specs: **10 passed / 7 skipped / 0 failed** (real https
  lane — TLS proxy + loopback backend, configured origin
  `https://127.0.0.1:3860`; the 7 skips are mail-adapter-dependent
  reset specs — skips, not passes)
- parity: SKIP (no screens change)

Host adaptation (recorded, no repo change): the shared DB container
is `app-db-1`; a PATH shim maps the script's hardcoded `docker exec
vari8-db-1` target to it. `VARI8_WORKTREES`/`VARI8_BETA` env point at
this host's paths.

### New acceptance coverage (`tests/integration/sv5-checkin-review-read.test.ts`)

- packet serves seeded daily values (`["80","kg"],["first",null]` rows)
  with `flags`/`nutrition` empty, exactly one `checkin_submission`
  READ audit and zero `daily_entry` audits;
- latest committed revision only (`["81","revised"]`, not the first
  save);
- authorized date with no entry → `[]` while answers serve;
- daily consent missing → `parameterValues: null`, answers still
  serve, audit count unchanged;
- check-in consent withdrawal → whole read `consent_missing`, zero
  audits;
- foreign-workspace coach → `not_available`, zero audits;
- open vs marked states stay distinct (`reviewed`/`feedback`
  fields; committed drafts are canvas-local by contract).

### Mutations (both restored byte-identically)

- drop `dailyConsented` from the packet gate → the
  withheld-packet test fails (packet would serve past consent);
- map `not_available` → withheld instead of `[]` → the honest-empty
  test fails.

## Dependencies / remaining gaps

- The canvas consumes the new fields only after PR #147 lands (its
  `loadSubmissionAnswers` fills `metrics`/`flags` from this DTO); the
  read model deliberately does not wire the panel itself.
- Flagged set notes, photos/lightbox, nutrition semantics stay
  deferred to issues 14 / 11 / 12a — the slots are honest empties.
- The separate `tracker-context` endpoint is unchanged and remains
  the explicit read for other callers; the embedded packet reuses its
  scope/consent/loader machinery rather than duplicating it.
- Browser-level canvas verification of the new columns is not
  claimed: the panel that draws them lives on #147's unmerged
  branch. The https e2e suite exercises the app's real flows on this
  head.
