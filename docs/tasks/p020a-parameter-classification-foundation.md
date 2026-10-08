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
  transaction (`meta: {changed:true, version:"v<revision>"}`). Denial,
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
  → 17 tests failed: `classifyParameter` and `listClassifiableParameterIds`
  were not exported; the `data_classification` column did not exist.

GREEN evidence recorded in `docs/STATUS.md`.

## Test coverage

- Unit: exact gate match; fingerprint determinism/order-sensitivity;
  snapshot eligibility matrix (absent/NULL/malformed classification,
  specialist classes, unsupported kinds/schemes, duplicate parameterId,
  incoherent metadata, malformed structure, deterministic reason ordering);
  boundary flag-off refusal before session/input/db.
- Integration (disposable PostgreSQL): migration leaves NULL; owner/coach
  permitted transitions; reserved-classification rejection for every role
  incl. platform admin; non-manager/dual-role denials;
  archive/reclassification/stale-revision/foreign-workspace failures with
  zero mutation+audit; concurrent classification → one success; classify vs
  archive AND classify vs publish in **both orderings under genuine overlap**
  — a test-only proxy wraps the injected `client` and uses deferred barriers
  inside the transaction (winner parks holding the parameter row lock while
  the loser's FOR UPDATE request is provably in flight; arrival order is
  forced by gating the loser's authorize read). No sleeps; no production
  test hooks. Publish-snapshot persistence of classification + revision and
  byte-identical pre-classification versions; universal duplicate rejection
  with zero writes/audits and draft preserved; positional selection +
  stale fingerprint + out-of-range index resolved inside the mutation
  transaction.
- Action-layer gate ordering pinned directly: with the classification flag
  off, the exported Server Action returns the flag-off result before
  `auth()`, before any FormData accessor runs, and before the boundary —
  proven with spies (`coaching-classification-actions.test.ts`).
- Audit `meta.version` follows the established coaching-domain convention
  `v<N>` (`client-setup.ts` writes `v${versionSeq}`); the plan's `"rev<N>"`
  example was intentionally not adopted — a bare `v`-prefixed structural
  string is the repo convention and stays inside the shared allowlist.
- E2E: owner classify journey; coach control visibility; reserved options
  absent; flag-off 404 + absent control; assistant denial; no raw parameter
  id in the classify DOM; horizontal-overflow checks at 1440/834/390.

## P-020A-I1-R3 — final repair round

Independent re-review of `99883cb` (`opencode-go/deepseek-v4.1-flash`,
P-020A-I1-R2-R1): **CONDITIONAL PASS** — no P0/P1; both prior P2s and all
four P3s closed; every executed gate reproduced green. Two residuals
remained and are repaired in one forward commit:

- **Residual P2 (evidence tightening, test-only):** the archive-wins and
  publish-wins orderings proved genuine overlap and forced arrival order
  but released the parked winner after the loser's in-transaction list
  read — they did not await the loser's `onParameterLockIssued` signal.
  Both tests now add `onParameterLockIssued` on the losing classify client
  and await it before releasing the winner (which is still parked holding
  the row lock), so all four orderings prove the loser's
  `parameter_definition … FOR UPDATE` request was issued and queued while
  the winner held the lock — literal lock contention. A loser that never
  issued the request would hang the await and fail by the bounded test
  timeout. Honest note: the prior tests lacked this awaited proof signal;
  the tightened tests now pin it — no RED production failure was fabricated
  and no production transaction or lock behavior changed.
- **Residual P3 (UI edge):** an ACTIVE, unclassified row missing
  `classifyIndex` (e.g. excluded from the authorized classifiable list)
  rendered the control under a `?? 0` fallback id (`classification-select-0`)
  and only revealed the stale state on click. The control now renders only
  for a defined ordinal; ordinal-less rows render no classification control
  and cannot submit — the `submitClassify` undefined-ordinal guard remains
  as defense in depth. The focused DOM test was updated RED-first (it
  failed on the pre-repair render of `classification-select-0`) and also
  pins the absence of the fallback id, no FormData submission, and a valid
  ordinal still rendering/submitting the exact positional fields.

Gates on the repair (fresh disposable PG `p020a_r3_repair_1791455741` on
local `app-db-1`): `git diff --check` 0; `prettier --check .` 0;
`tsc --noEmit` 0; `eslint` 0; `prisma generate` 0; `prisma validate` 0;
focused unit (`coaching-classification` + `coaching-classification-actions`

- `parameter-classification-dom`) 27/27; focused P-020A integration 21/21;
  `-t "both in flight"` 3 passed; full integration 419/419;
  `next build` (turbopack) 0; focused classification E2E 9/9 (Chromium).
  Full unit and full E2E suites intentionally not rerun — the parent
  candidate passed both complete suites, the reviewers reproduced the
  relevant gates, and PR CI runs the complete pipeline.

No PR, merge, main change, deployment, production enablement, P-020B, or
DailyEntry implementation occurred; no approved product decision altered.

## Exclusions

No P-020B transitions, DailyEntry persistence/submission/history, C3, C4,
specialist-data collection, or production enablement. Classification never
authorizes data collection; nothing is deployed.
