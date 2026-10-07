# P-020A — Parameter Classification Foundation

## Scope and authorization

Owner-authorized implementation slice of the two-slice C2 plan (P-020-R3 +
R3.1 bounded addendum). Implements the parameter data-classification
foundation only. P-020B template-version transitions, DailyEntry persistence
or UI, C3, C4, production data collection, and deployment remain
unauthorized.

## What is live on merge (not flag-gated)

- `ParameterDataClassification` enum (`GENERAL_HEALTH`, `CYCLE`, `BLOODWORK`,
  `PED_HRT`) + nullable `parameter_definition.data_classification` — no
  default, no backfill; existing rows remain NULL.
- `dataClassification` on published template-version parameter snapshots
  (`TemplateVersionDefinition.parameters[id].dataClassification`); legacy
  snapshots without the field parse as absent → NULL internally.
- **Universal duplicate-parameter publish rejection (#64):** `publishTemplate`
  now rejects any draft referencing the same `parameterId` more than once
  with `duplicate_parameter` — zero version writes, zero publish audit; the
  stored draft is untouched. Existing published versions are never rewritten.
- `lib/coaching/daily-entry-eligibility.ts` — pure, deterministic,
  snapshot-only `evaluateDailyEntryVersionEligibility` with closed,
  rank-ordered reason codes. Called by no user-facing path yet; P-020B
  imports it.

## What is flag-gated

- The classification UI control and `classifyParameter` server action exist
  only while `ENABLE_PARAMETER_CLASSIFICATION === "1"` (exact match), layered
  over `ENABLE_COACHING_TEMPLATES`. Gate-off: control absent, action refuses
  before session resolution, input parsing, or database access.

## Classification semantics

- Only `ACTIVE` ParameterDefinition rows; ARCHIVED → `parameter_archived`.
- Permitted: `NULL → GENERAL_HEALTH`, `NULL → CYCLE`. Rejected:
  `NULL → BLOODWORK`, `NULL → PED_HRT` (unassignable by every role including
  platform admin and dual-role principals), any non-NULL reclassification,
  non-manager roles, cross-workspace.
- Positional binding: `parameterIndex` + `fingerprint` + `expectedRevision`;
  the browser never submits a raw ParameterDefinition id.
- Success: `revision` increments exactly once, `updatedByMemberId` set to the
  authorized member, `parameter_definition`/`UPDATE` audit in the same
  transaction (`meta: {changed:true, version:String(revision)}`). Denial,
  stale input, archive race loss, or audit failure → zero mutation, zero
  revision bump, zero audit.
- Lock order: `lockParameter` (parameter row `FOR UPDATE`) only — never a
  coaching-template lock, so no parameter→template reverse edge exists.
  Publish (`template → params ASC`) and classify coexist: whichever commits
  first decides whether that version's snapshot carries the classification;
  both orderings preserve immutability.
- Classification is the sole approved exception to the post-publication
  semantic lock; unit/rating/options/validation locking is unchanged.

## Tests-first evidence

RED at HEAD `93242bcb1798c45518e86f599fec150cf31f4aab`:

- `npx vitest run tests/unit/coaching-classification.test.ts` → file failed
  to collect: `../../lib/coaching/parameter-classification-gate`,
  `../../lib/coaching/selection-fingerprint`, and
  `../../lib/coaching/daily-entry-eligibility` did not exist.
- `INTEGRATION_DATABASE_URL=…p020a_integration npx vitest run --config
vitest.integration.config.ts tests/integration/p020a-parameter-classification.test.ts`
  → 17 tests failed: `classifyParameter`, `listClassifiableParameterIds`,
  and `resolveClassifySelection` were not exported; the
  `data_classification` column did not exist.

GREEN evidence recorded in `docs/STATUS.md`.

## Test coverage

- Unit: exact gate match; fingerprint determinism/order-sensitivity;
  snapshot eligibility matrix (absent/NULL/malformed classification,
  specialist classes, unsupported kinds/schemes, duplicate parameterId,
  incoherent metadata, malformed structure, deterministic reason ordering);
  boundary flag-off refusal before session/input/db.
- Integration (disposable PostgreSQL, `p020a_integration`): migration leaves
  NULL; owner/coach permitted transitions; reserved-classification rejection
  for every role incl. platform admin; non-manager/dual-role denials;
  archive/reclassification/stale-revision/foreign-workspace failures with
  zero mutation+audit; concurrent classification → one success; classify vs
  archive both orderings; publish-snapshot persistence of classification +
  revision and byte-identical pre-classification versions; universal
  duplicate rejection with zero writes/audits and draft preserved;
  positional selection + stale fingerprint + out-of-range index.
- E2E: owner classify journey; coach control visibility; reserved options
  absent; flag-off 404 + absent control; assistant denial; no raw parameter
  id in the classify DOM; horizontal-overflow checks at 1440/834/390.

## Exclusions

No P-020B transitions, DailyEntry persistence/submission/history, C3, C4,
specialist-data collection, or production enablement. Classification never
authorizes data collection; nothing is deployed.
