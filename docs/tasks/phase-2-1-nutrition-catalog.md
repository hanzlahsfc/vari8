# Phase 2.1 — Nutrition Database catalog + import pipeline (plan + record)

**Plan committed before code.** Builder: opencode (deepseek-v4.1-flash).
Branch `feature/phase-2-1-nutrition-catalog`, based on the verified Phase 1 tip
`feature/phase-1-1-daily-tracker-shell` `080b32001ef3e7c80585b8a8124421380626368e`
(itself off the Phase 0.1 blueprint `b05c130` and verified `main` `fc2c936`).

Basis: `AGENTS.md`, `docs/conductor-generic/SKILL.md`,
`docs/tasks/phase-0-1-source-blueprint.md`, `docs/tasks/phase-1-1-daily-tracker-shell.md`,
`docs/product-decisions.md`, `docs/security/authorization-model.md`,
`lib/extraction/{parse,databases,normalize}.ts`.

## 1. Scope

The **first real in-app Nutrition Database catalog**: a trusted local import command
plus a staff-facing, searchable workspace route backed by PostgreSQL. This is **not
Mealplan** and **not** a nutrition calculator.

**In scope:** source-faithful field mapping; DB schema + migration for the catalog and
import provenance; transactional, idempotent, reconciling import service + CLI;
explicit row-level outcomes with reason codes; bounded indexed server-side search;
authenticated workspace route with responsive layouts.

**Out of scope (deferred):** meal creation, portions, meal totals, macro/calorie
calculations, targets, dashboard values, client data entry, Mealplan wiring, nutrition
scores/interpretations, and any source field that is not safely mappable.

## 2. Source inspection (real export)

File inspected (outside the repo, never committed):
`/Users/apple/Downloads/PRGRSS 2.0 extracted/Copy of PRGRSS 2.0/Nutrition Database.html`
(Google Sheets HTML export, `<table class="waffle">`, values-only).

Parsed with the repo's existing `lib/extraction/parse.ts` (`parseSheetHtml`). Verified:

- Header row = spreadsheet row **2**; data columns are spreadsheet columns **2–11**
  (column 1 is the empty row-label column). Columns 12–21 are **entirely empty**.
- Header labels (verbatim): `NO.`, `FOOD`, `AMOUNT`, `UNIT`, `CALORIES (kcal)`,
  `PROTEIN (g)`, `CARBS (g)`, `FATS (g)`, `COOKED/RAW/DRY`, `CAT`.
- No formulas, data validations, conditional formats, hidden rows/sheets, or named
  ranges exist in the export (already recorded in the blueprint; re-confirmed).
- Candidate data rows (any mapped column non-empty): **660**.
  - Accepted: **599** (all with a numeric `NO.` and non-empty `FOOD`).
  - Rejected — `missing_food`: **60** (numbered placeholder rows `NO.` 601–660,
    `FOOD` empty).
  - Rejected — `non_data_row`: **1** (source row 671, a footer attribution note in the
    `NO.` column).
  - Rejected — `invalid_source_number`: **0**; `invalid_numeric`: **0**; duplicates: **0**.
  - Ignored empty rows (no mapped data): the remainder, counted explicitly.
- Accepted `NO.` range 1–600, **599 distinct**; the source itself omits `NO.` 107
  (source gap, not an import error). No duplicate `NO.`.
- Exact duplicate rows (all 10 fields): **0**. Duplicate `FOOD` names: **23 groups** —
  these are distinct source rows (different `NO.`/macros/weights) and are kept, not
  deduped.
- Numeric columns parse cleanly via `normalizeNumeric` (English dot decimals):
  `CALORIES` 596/3 empty, `PROTEIN` 595/4 empty, `CARBS` 595/4 empty, `FATS` 594/5
  empty (empty stays null, never 0). `AMOUNT` is numeric in all 599 accepted rows.
- `UNIT` has case variants (`g`/`G`, `mL`/`ml`) and descriptive values (e.g. `fists`,
  `packet (25g)`); `CAT` ∈ {CHO 217, PRO 180, OTHER 62, VEG 53, FAT 44, FRUIT 38} plus
  5 blank; `COOKED/RAW/DRY` mostly blank plus `Raw Weight`, `As Prepared Weight`,
  `Dry Weight`, `Cooked Weight`, `Drained Weight`, `Deshelled Weight`, `Soaked Weight`.
  All values preserved verbatim; no normalization/case-folding (a descriptor, not a rule).

Cross-check: the committed read-only reference `spec/data/foods.json` (Phase A) also
holds **599** records with `skippedNumberedRows` 60 — consistent with the 60 numbered
placeholder rows. Phase 2.1 additionally classifies the 1 footer row explicitly.

### Field mapping (all source-backed; none invented)

| Source header     | DB column   | Type         | Notes                                      |
| ----------------- | ----------- | ------------ | ------------------------------------------ |
| `NO.`             | `source_no` | `Int` unique | source row identifier                      |
| `FOOD`            | `name`      | `String`     | required (else `missing_food`)             |
| `AMOUNT`          | `amount`    | `Float?`     | empty ⇒ null                               |
| `UNIT`            | `unit`      | `String?`    | verbatim                                   |
| `CALORIES (kcal)` | `calories`  | `Float?`     | empty ⇒ null; never computed               |
| `PROTEIN (g)`     | `protein`   | `Float?`     | empty ⇒ null                               |
| `CARBS (g)`       | `carbs`     | `Float?`     | empty ⇒ null                               |
| `FATS (g)`        | `fats`      | `Float?`     | empty ⇒ null                               |
| `COOKED/RAW/DRY`  | `state`     | `String?`    | verbatim (aligned with `FoodRecord.state`) |
| `CAT`             | `category`  | `String?`    | verbatim (empty ⇒ null)                    |

### Deliberately unmapped / deferred

- Spreadsheet columns 12–21: empty in the export — not mapped.
- Row-label column 1: empty in the export — not mapped.
- Any formula/validation/named-range/hidden-row semantics: absent from the export and
  never inferred.
- No derived nutrition fields (per-portion scaling, macro ratios, scores, targets).

## 3. Schema + importer design

**Models (additive migration `20261001100000_phase2_1_nutrition_catalog`):**

- `nutrition_catalog_item` — one row per accepted source row, keyed by unique
  `source_no`; `row_fingerprint` (SHA-256 of the canonical mapped fields) for change
  detection; `category` btree index; `name` **pg_trgm GIN** index for bounded substring
  search (raw SQL; Prisma cannot express GIN).
- `nutrition_import_run` — provenance: `source_name`, `source_fingerprint` (SHA-256 of
  the source file bytes), scanned/source/accepted/rejected/duplicate/inserted/updated/
  unchanged counts, `status`, `started_at`/`completed_at`.
- `nutrition_import_row_outcome` — row-level outcome per candidate row
  (`IMPORTED`/`REJECTED`/`DUPLICATE`) with `reason_code` (+ `reason_field`). **No raw
  row payload is stored** — only coordinates/identifiers and machine-readable reasons.

**Import service (`lib/nutrition/import.ts`)** — one interactive transaction:

1. Reconcile the supplied source: `source_row_count == accepted + rejected + duplicate`
   and `scanned == source_row_count + ignored_empty`; on mismatch throw
   `NutritionImportError("reconciliation_failed")` **before any write**.
2. Compute inserted / updated (fingerprint changed) / unchanged (fingerprint equal).
3. `createMany` inserts; `update` only changed rows; write the run + outcomes.
4. Re-check `accepted == inserted + updated + unchanged`; failure throws → rollback.

Any DB error rolls the whole transaction back (no partial catalog). Re-running the
identical source inserts nothing and changes nothing (idempotent).

**CLI (`scripts/import-nutrition.ts`, `npm run import:nutrition -- --source <path>`)**
— trusted maintenance only, requires an explicit local path, no route/API/upload,
prints a JSON summary, exits non-zero on failure.

**Search (`lib/nutrition/search.ts`)** — `MIN_QUERY_LENGTH = 2`,
`RESULT_LIMIT = 50` (clamped); case-insensitive `name` substring (`ILIKE`, trigram
GIN-indexed) with an optional exact `category` filter (btree-indexed); empty/below-min
query returns an empty state rather than the whole catalog.

## 4. Route + UI

`app/workspace/[workspaceId]/nutrition/page.tsx` — server component, `force-dynamic`,
session gate then `foodExerciseMasterData/read` workspace authorization (existing
reviewed matrix/guard; no auth/session change). GET search form (works without JS),
result count, and source-backed result cards. Added to `components/workspace-nav.tsx`.
Responsive: dense desktop grid (1440), reflowed single-column touch-friendly cards at
tablet (834) and mobile (390); zero horizontal document overflow; labels, focus,
keyboard, semantic landmarks.

## 5. Acceptance criteria (atomic; tests encoded first)

- **AC1** `extractNutritionSource` maps the real header set and classifies every
  candidate row with a reason code; counts reconcile exactly (599/60/1/0).
- **AC2** Import is transactional, idempotent, and reconciling; re-run inserts 0 and
  leaves the catalog byte-identical; a failure leaves no partial catalog/run.
- **AC3** Invalid rows and duplicates are explicit, auditable outcomes with reason
  codes; no raw rows/payloads are persisted or committed.
- **AC4** Search is bounded (`limit`), min-query gated, source-backed (name/category),
  and backed by the pg_trgm GIN index; empty/below-min returns an empty state.
- **AC5** Authorized staff reach `/workspace/[id]/nutrition` via navigation; non-member
  403; unauthenticated → login.
- **AC6** Route usable at 1440/834/390 with no horizontal overflow, keyboard access,
  visible focus, touch-appropriate controls.
- **AC7** Regression safety: `/library/*`, `/daily`, Daily Tracker, schema/other models,
  and auth semantics unchanged.

## 6. Files

- `db/schema.prisma`, `db/migrations/20261001100000_phase2_1_nutrition_catalog/migration.sql`
- `lib/extraction/databases.ts` (additive exports only: `FoodField`, `FOOD_ALIASES`,
  `normalizeHeader`), `lib/nutrition/{source,import,search}.ts`
- `scripts/import-nutrition.ts`, `package.json` (`import:nutrition`)
- `app/workspace/[workspaceId]/nutrition/page.tsx`,
  `components/nutrition/nutrition-results.tsx`, `components/workspace-nav.tsx`,
  `app/globals.css`
- `tests/unit/nutrition-source.test.ts`,
  `tests/integration/phase-2-1-nutrition-import.test.ts`,
  `tests/e2e/nutrition-catalog.spec.ts`
- `docs/tasks/phase-2-1-nutrition-catalog.md`, `docs/STATUS.md`

## 7. RED → GREEN + gates

1. Commit this plan.
2. Write failing unit/integration/E2E tests → **RED**.
3. Implement; focused tests → **GREEN**.
4. Gates (real exit codes): `git diff --check`; `format:check`; `typecheck`; `lint`;
   `test`; `test:integration` (disposable PG); `build`; `test:e2e`.
5. Run the real CLI against the actual export on a disposable DB (first run, identical
   rerun, invalid-row, reconciliation-failure) and record counts.
6. Fresh-context independent review; repair + re-check.

## 8. Rollback

`git revert` of the scoped commits and `DROP` the three additive tables; no existing
table/column modified; no external state.

## 9. Boundaries

No raw exports/ZIPs/client data/credentials/`TRACKER 2.0.md`/raw catalog dumps committed.
No Mealplan, calculations, targets, dashboard, or client entry. No auth/session change.
Product name undecided. No PR/merge/deploy.

## 10. Implementation + verification record

**Status: implemented, all gates green, independently reviewed PASS.**

- Base verified live: `origin/feature/phase-1-1-daily-tracker-shell` =
  `080b32001ef3e7c80585b8a8124421380626368e` (remote tip matched; `main` remains
  `fc2c936`; the Phase 0.1 blueprint is present). Feature branch
  `feature/phase-2-1-nutrition-catalog` off that tip.
- Commits: `eb64354` plan; `3486c7f` schema/import/search/CLI; `beaf76f` route/nav/styles;
  `ccbb62d` tests; documentation + branch-name records follow review.
- RED→GREEN: `tests/unit/nutrition-source.test.ts` exit 1 (module absent) before
  `lib/nutrition/source.ts`; integration search/import tests exercised only after the
  services landed.
- **Real CLI against the actual export** (disposable `tracker_p21_int`; `app_dev`
  untouched; source file never copied into the repo):
  - First run: fingerprint `cb93e907…066b8`, header row 2, scanned 1169, source rows 660,
    ignored empty 509, accepted **599**, rejected **61** (`missing_food` 60,
    `non_data_row` 1), duplicates 0, inserted **599**, updated 0, unchanged 0. Exit 0.
  - Identical rerun: inserted **0**, updated **0**, unchanged **599**; catalog still 599
    rows; 2 runs / 1320 outcomes. Exit 0 — idempotent, no duplicates.
  - Reconciliation identity held in the service and is enforced: `660 = 599 + 61 + 0`
    and `1169 = 660 + 509`.
- Invalid-row case: covered by integration (`missing_food`, `non_data_row`,
  `invalid_source_number`, `invalid_numeric` + `reason_field`, `duplicate_source_number`)
  — persisted only as row coordinates + reason codes, never payloads.
- Reconciliation-failure case: integration asserts a declared-count mismatch throws
  `NutritionImportError("reconciliation_failed")` with catalog 0 / runs 0 (no partial
  write); a forced post-insert failure also rolls the whole transaction back.
- Gates on the exact tree (real exit codes): `git diff --check` 0; `format:check` 0;
  `typecheck` 0; `lint` 0; `test` 0 (40 files / 425 tests, +4); `test:integration` 0
  (18 files / 205 tests, +7, disposable PG); `build` 0
  (`ƒ /workspace/[workspaceId]/nutrition` emitted); `test:e2e` 0 (49 passed, +8 at
  1440/834/390 incl. keyboard and overflow).
- Mutations caught and restored byte-exact (SHA-256 verified): search min-length 2→0
  (integration FAIL); source-count reconciliation disabled (integration FAIL);
  `missing_food` reason misclassified (unit FAIL).
- `s1-a-identity.test.ts` schema snapshot updated for the three intentional new tables;
  its forbidden-table guard (no premature health/meal/program tables) still holds.

## 11. Independent review

- Fresh-context, read-only reviewer in a separate `opencode run` session on the frozen
  tree: **PASS**, no criterion violated. Reviewer model `opencode-go/glm-5.3` is
  **different** from the builder model `opencode-go/deepseek-v4.1-flash` — model
  diversity verified. The reviewer independently re-ran the unit (4/4) and integration
  (7/7) suites on the disposable DB.
- Process findings, both repaired before push: (1) commits initially sat on the local
  Phase 1 branch — repointed to the scoped `feature/phase-2-1-nutrition-catalog`; (2)
  missing STATUS/task record — added here and in `docs/STATUS.md`.
- Residual observations folded in: `import.ts` comment clarified (upsert-only, no
  deletes); limit-clamp tests added (`1..50`); `fileExerciseMasterData` read is
  workspace-scoped, so a CLIENT member (per the reviewed matrix) may also read the
  catalog — the existing matrix is intentionally unchanged.

## 12. Deferred source fields / out-of-scope

- Spreadsheet columns 12–21 and row-label column 1: empty in the export — unmapped.
- No formula/validation/named-range/hidden-row semantics to recover (values-only export);
  none inferred.
- Rows removed from a later source are not deleted (upsert-only) — a future
  change-management decision, not this slice.
- Entirely deferred: Mealplan, portions, meal totals, macro/calorie calculations,
  targets, dashboard values, client entry, Nutrition scores/interpretations.

## 13. Deviations / blockers

- None. The catalog is workspace-scoped master data; the route reuses the reviewed
  `foodExerciseMasterData/read` authorization and does not change auth/session semantics.
