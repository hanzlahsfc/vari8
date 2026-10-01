# Phase 2.2 — Exercise Database catalog + import pipeline (plan + record)

**Plan committed before code.** Builder: Devin (SWE-2 High).
Branch `feature/phase-2-2-exercise-catalog`, based on verified `main`
`f75abd55c45858742b56732da8502fc1cbfaebb3` (remote tip matched at branch time).

Basis: `AGENTS.md`, `docs/conductor-generic/SKILL.md`,
`docs/tasks/phase-0-1-source-blueprint.md`, `docs/tasks/phase-2-1-nutrition-catalog.md`,
`docs/product-decisions.md`, `docs/security/authorization-model.md`,
`lib/extraction/{parse,databases,normalize}.ts`, `lib/nutrition/{source,import,search}.ts`.

## 1. Scope

The **in-app Exercise Database catalog**: a trusted local import command plus a
staff-facing, searchable workspace route backed by PostgreSQL. This is **not
Training** — no workouts, programs, prescriptions, progression, performance
tracking, training calculations, client entry, or exercise recommendations.

**In scope:** source-faithful field mapping; additive DB schema + migration for
the catalog and import provenance; transactional, idempotent, reconciling import
service + CLI; explicit row-level outcomes with reason codes; bounded indexed
server-side search; authenticated workspace route with per-form-factor layouts;
navigation entry.

**Out of scope (deferred):** TRAINING-sheet behavior (programming blocks,
sets/reps, tempo, week logging), any exercise recommendation/substitution logic,
client data entry, and any source field that is not safely mappable.

## 2. Source inspection (real export)

File inspected (outside the repo, never committed):
`/Users/apple/Downloads/PRGRSS 2.0 extracted/Copy of PRGRSS 2.0/Exercise Database.html`
(Google Sheets HTML export, `<table class="waffle">`, values-only; 740,305 bytes).

Parsed with the repo's existing `lib/extraction/parse.ts` (`parseSheetHtml`).
Verified on the real file:

- Header row = spreadsheet row **2**; data columns are spreadsheet columns
  **2–11** (column 1 is the empty row-label column). Columns **12–22** are
  **entirely empty**; no candidate row carries any value beyond column 11.
- Header labels (verbatim): `ID`, `Exercise Name`, `Muscle Group`,
  `Primary Target`, `Additional Target(s)`, `Equipment`, `Movement Pattern`,
  `Position / Setup`, `Coaching Notes / Cues`, `Video Link`.
- No formulas, data validations, conditional formats, hidden rows/sheets, or
  named ranges exist in the export (values-only; re-confirmed). Exactly one
  `<a>` element exists in the whole export (the single VIDEO LINK cell);
  link target equals its visible text.
- Rows scanned after the header (parsed rows 4–997; parsed row 3 is a chrome
  row with no data cells): **994**.
  - Candidate rows (any mapped column non-empty): **547**.
  - Ignored empty rows (no mapped data): **447**.
- Accepted: **546** — numeric `ID` 1–546, **contiguous, no gaps, no duplicate
  IDs**, every `EXERCISE NAME` non-empty and distinct (546 unique names). Zero
  full-content duplicate rows. Data ends at sheet row 549.
- Rejected — `non_data_row`: **1** (source row 996: the license footer
  `© 2026 INFINITYCRE8 · Licensed to PRGRSS GmbH · License ID CK-2026-K8M3 …`
  sits in the `ID` column; `EXERCISE NAME` empty).
- Rejected — `missing_name` / `invalid_source_id`: **0** in this export.
  Duplicates: **0**.
- No leading/trailing-whitespace anomalies in any mapped cell.
- Field fill rates across the 546 accepted rows: `MUSCLE GROUP` 546/546
  (12 distinct), `PRIMARY TARGET` 546/546 (20 distinct),
  `ADDITIONAL TARGET(S)` 14 non-empty, `EQUIPMENT` 546/546 (28 distinct,
  including the verbatim literal `Not specified` ×127), `MOVEMENT PATTERN`
  546/546 (34 distinct, incl. `Other / Not specified` ×3),
  `POSITION / SETUP` 546/546 (15 distinct, incl. `Not specified` ×374),
  `COACHING NOTES / CUES` 108 non-empty, `VIDEO LINK` 1 non-empty
  (`http://google.com/` — a placeholder, kept verbatim like all source text).
- `Not specified` is a **source literal**, not an empty cell — preserved
  verbatim; empty cells become NULL (never fabricated text or 0).

Cross-check: `spec/sheets/exercise-database.summary.json` (committed summary)
reports header row 2 with the same 10 labels at columns 2–11 — consistent.
`spec/data/exercises.json` is a 2-row synthetic fixture (source-data policy).

### Field mapping (all source-backed; none invented)

| Source header           | DB column            | Type         | Notes                          |
| ----------------------- | -------------------- | ------------ | ------------------------------ |
| `ID`                    | `source_id`          | `Int` unique | source row identifier          |
| `Exercise Name`         | `name`               | `String`     | required (else `missing_name`) |
| `Muscle Group`          | `muscle_group`       | `String?`    | verbatim; empty ⇒ null         |
| `Primary Target`        | `primary_target`     | `String?`    | verbatim                       |
| `Additional Target(s)`  | `additional_targets` | `String?`    | verbatim; empty ⇒ null         |
| `Equipment`             | `equipment`          | `String?`    | verbatim                       |
| `Movement Pattern`      | `movement_pattern`   | `String?`    | verbatim                       |
| `Position / Setup`      | `position_setup`     | `String?`    | verbatim                       |
| `Coaching Notes / Cues` | `cues`               | `String?`    | verbatim; empty ⇒ null         |
| `Video Link`            | `video_link`         | `String?`    | verbatim text (href == text)   |

**Identity strategy:** the source `ID` column is a real, unique, contiguous
source identifier (1–546) — it is the row key (`source_id` unique). No invented
IDs; duplicate `ID` values are classified `duplicate_source_id` and never
merged. `row_fingerprint` (SHA-256 of the canonical mapped fields) detects
content changes on re-import, exactly as in Phase 2.1.

### Deliberately unmapped / deferred

- Spreadsheet columns 12–22 and row-label column 1: empty in the export.
- Any formula/validation/named-range/hidden-row semantics: absent — never
  inferred.
- `VIDEO LINK` is stored as verbatim text and rendered as text (no link
  behavior invented; the only populated value is a placeholder).
- No derived training fields (difficulty, substitutions, prescriptions).

## 3. Schema + importer design

**Models (additive migration `20261001200000_phase2_2_exercise_catalog`):**

- `exercise_catalog_item` — one row per accepted source row, keyed by unique
  `source_id`; `row_fingerprint` for change detection; `muscle_group` and
  `equipment` btree indexes; `name` **pg_trgm GIN** index created to support
  bounded substring search (raw SQL; Prisma cannot express GIN). The index
  exists to serve name search; PostgreSQL's planner may still choose a
  sequential scan while the catalog is small (~546 rows).
- `exercise_import_run` — provenance: `source_name`, `source_fingerprint`
  (SHA-256 of source bytes), scanned/source/accepted/rejected/duplicate/
  inserted/updated/unchanged counts, `status`, `started_at`/`completed_at`.
- `exercise_import_row_outcome` — row-level outcome per candidate row
  (`IMPORTED`/`REJECTED`/`DUPLICATE`) with `reason_code` (+ `reason_field`).
  **No raw row payload is stored** — only coordinates/identifiers and
  machine-readable reasons.
- New enum `ExerciseImportOutcome` (IMPORTED/REJECTED/DUPLICATE).

**Import service (`lib/exercise/import.ts`)** — one interactive transaction,
same shape as Phase 2.1:

1. Reconcile the supplied source: `source_row_count == accepted + rejected +
duplicate` and `scanned == source_row_count + ignored_empty`; on mismatch
   throw `ExerciseImportError("reconciliation_failed")` **before any write**.
2. Partition accepted rows by (`source_id`, fingerprint) into insert / update /
   unchanged.
3. `createMany` inserts; `update` only changed rows; write the run + outcomes.
4. Re-check `accepted == inserted + updated + unchanged`; failure throws →
   rollback.

Any DB error rolls the whole transaction back (no partial catalog). Re-running
the identical source inserts nothing and changes nothing (idempotent).
Upsert-only — rows removed from a later source are not deleted.

**CLI (`scripts/import-exercise.ts`,
`npm run import:exercise -- --source <path>`)** — trusted maintenance only,
explicit local path required, no route/API/upload, prints a JSON summary, exits
non-zero on failure.

**Search (`lib/exercise/search.ts`)** — `MIN_QUERY_LENGTH = 2`,
`RESULT_LIMIT = 50` (clamped 1–50); case-insensitive `name` substring (ILIKE; a
pg_trgm GIN index exists to support it, though PostgreSQL may choose a
sequential scan at the current catalog size) with optional exact
`muscle_group` and `equipment` filters (btree-indexed, populated from distinct
source values). Empty/below-min query returns an empty state — never the
unbounded catalog. Facet choices mirror the
existing `searchExercises`/`exerciseFacets` precedence in `lib/catalog.ts`.

## 4. Route + UI

`app/workspace/[workspaceId]/exercises/page.tsx` — server component,
`force-dynamic`, session gate then `foodExerciseMasterData/read` workspace
authorization (existing reviewed matrix/guard; no auth/session change). GET
search form (works without JS), result count, source-backed result cards.
`components/exercise/exercise-results.tsx` renders the verbatim source fields.
Added to `components/workspace-nav.tsx` next to Nutrition Database. Reuses the
tokenized `.catalog-*` styles: dense desktop field grids (1440), reflowed
touch-friendly cards at tablet (834) and mobile (390); zero horizontal document
overflow; labels, focus, keyboard, semantic landmarks.

## 5. Acceptance criteria (atomic; tests encoded first)

- **AC1** `extractExerciseSource` maps the real header set and classifies every
  candidate row with a reason code; counts reconcile exactly (546/1/0 on the
  real export).
- **AC2** Import is transactional, idempotent, and reconciling; re-run inserts 0
  and leaves the catalog byte-identical; a failure leaves no partial
  catalog/run.
- **AC3** Invalid rows and duplicates are explicit, auditable outcomes with
  reason codes; no raw rows/payloads are persisted or committed.
- **AC4** Search is bounded (`limit`), min-query gated, source-backed
  (name/muscle group/equipment), and supported by a pg_trgm GIN index that
  exists to serve name search — PostgreSQL may still choose a sequential scan
  for the current small catalog; empty/below-min returns an empty state.
- **AC5** Authorized staff reach `/workspace/[id]/exercises` via navigation;
  non-member 403; unauthenticated → login.
- **AC6** Route usable at 1440/834/390 with no horizontal overflow, keyboard
  access, visible focus, touch-appropriate controls.
- **AC7** Regression safety: `/library/*`, `/daily`, Nutrition, schema/other
  models, and auth semantics unchanged; `spec/data/exercises.json` stays a
  synthetic fixture.

## 6. Files

- `db/schema.prisma`,
  `db/migrations/20261001200000_phase2_2_exercise_catalog/migration.sql`
- `lib/extraction/databases.ts` (additive exports only: `ExerciseField`,
  `EXERCISE_ALIASES`), `lib/exercise/{source,import,search}.ts`
- `scripts/import-exercise.ts`, `package.json` (`import:exercise`)
- `app/workspace/[workspaceId]/exercises/page.tsx`,
  `components/exercise/exercise-results.tsx`, `components/workspace-nav.tsx`
- `tests/unit/exercise-source.test.ts`,
  `tests/integration/phase-2-2-exercise-import.test.ts`,
  `tests/e2e/exercise-catalog.spec.ts`,
  `tests/integration/s1-a-identity.test.ts` (expected table list)
- `docs/tasks/phase-2-2-exercise-catalog.md`, `docs/STATUS.md`

## 7. RED → GREEN + gates

1. Commit this plan.
2. Write failing unit/integration/E2E tests → **RED**.
3. Implement; focused tests → **GREEN**.
4. Gates (real exit codes): `git diff --check`; `format:check`; `typecheck`;
   `lint`; `test`; `test:integration` (disposable PG); `build`; `test:e2e`.
5. Run the real CLI against the actual export on a disposable DB (first run,
   identical rerun, invalid-row, reconciliation-failure) and record counts.
6. Fresh-context independent review; repair + re-check.

## 8. Rollback

`git revert` of the scoped commits and `DROP` the three additive tables (+ the
`ExerciseImportOutcome` enum); no existing table/column modified; no external
state.

## 9. Boundaries

No raw exports/ZIPs/client data/credentials/`TRACKER 2.0.md`/raw catalog dumps
committed. No Training/workouts/programs/sets/reps/progression/calculations,
client entry, or recommendations. No auth/session change. Product name
undecided. No PR/merge/deploy.

## 10. Implementation + verification record

**Status: implemented, all gates green, independently reviewed PASS.**

- Base verified live: `origin/main` =
  `f75abd55c45858742b56732da8502fc1cbfaebb3` (remote tip matched; clean
  worktree). Feature branch `feature/phase-2-2-exercise-catalog` off that tip.
- Commits: `250f95e` plan; `76f3022` schema/import/search/CLI; `70d7122`
  route/nav; `731e453` tests; review-repair + docs commits follow.
- RED→GREEN: `tests/unit/exercise-source.test.ts` exit 1 (module absent)
  before `lib/exercise/source.ts`; integration search/import tests exercised
  only after the services landed.
- **Real CLI against the actual export** (disposable `tracker_p22_int`;
  `app_dev` untouched by real data; source file never copied into the repo):
  - First run: fingerprint `fac31164…b8dfb1`, header row 2, scanned 994,
    source rows 547, ignored empty 447, accepted **546**, rejected **1**
    (`non_data_row` — license footer, source row 996), duplicates 0, inserted
    **546**, updated 0, unchanged 0. Exit 0.
  - Identical rerun: inserted **0**, updated **0**, unchanged **546**; catalog
    still 546 rows; 2 runs / 1094 outcomes. Exit 0 — idempotent, no
    duplicates.
  - Reconciliation identities held: `547 = 546 + 1 + 0` and
    `994 = 547 + 447`.
- Invalid-row / duplicate / rollback cases: covered by integration
  (`missing_name`, `non_data_row`, `invalid_source_id`,
  `duplicate_source_id`, reconciliation mismatch, post-insert failure → full
  rollback) — persisted only as row coordinates + reason codes, never
  payloads.
- Gates on the exact tree (real exit codes): `git diff --check` 0;
  `format:check` 0; `typecheck` 0; `lint` 0; `test` 0 (42 files / 433 tests,
  +4); `test:integration` 0 (19 files / 213 tests, +8, disposable PG);
  `build` 0 (`ƒ /workspace/[workspaceId]/exercises` emitted); `test:e2e` 0
  (57 passed, +8 at 1440/834/390 incl. keyboard and overflow).
- Mutations caught and restored byte-exact (SHA-256 verified): search
  min-length 2→0 (integration FAIL); source-count reconciliation disabled
  (integration FAIL); `missing_name` reason misclassified (unit FAIL).
- `s1-a-identity.test.ts` expected-table list updated for the three
  intentional new tables; `exercise` removed from the forbidden-substring
  list (the exact sorted table-list assertion remains the guard). The
  forbidden-table guard still proves no premature health/meal/program
  tables exist.
- `git diff f75abd5 -- lib/extraction/databases.ts` verified additive-only
  (two `export` keywords); `app/globals.css` unchanged (shared `.catalog-*`
  styles reused); no auth/session/RBAC file touched.

## 11. Independent review

- Fresh-context, read-only reviewer subagent on the frozen branch tree:
  **PASS**, no P0 blockers. Reviewer runs on the same model as the builder
  (SWE-2 High) — **model diversity is NOT verified in-environment**.
- Model-diverse independent review (arranged by the orchestrator against the
  pushed tip `c83855b`): **`opencode-go/deepseek-v4.1-flash` — PASS**, no
  P0/P1; checks, build/E2E, and the real import were independently
  reproduced. This satisfies the different-model review requirement.
- All remaining reviewer observations below are **non-blocking follow-ups**,
  not merge criteria.
- P1 (process): STATUS/§10 records not yet written at review time — repaired
  here before push.
- P2 findings and dispositions:
  - `first_imported_at` was overwritten on update (mirrored Phase 2.1
    pattern) — **fixed in this module**: update payloads now omit it;
    deterministic regression assertions added (explicit `now` injection).
    The same flaw remains in `lib/nutrition/import.ts` (out of scope; a
    shared fix is a future tested change).
  - `completedAt` uses real wall-clock while `startedAt` uses the injected
    `now` — kept (semantically correct completion timestamp; faithful to the
    reviewed Phase 2.1 pattern).
  - LIKE metacharacters (`%`/`_`) pass through to ILIKE unescaped — kept
    (bounded by `take ≤ 50`; identical reviewed behavior in nutrition
    search; recorded as a shared limitation).
  - Oversized digit-string `ID`s (> int4) classify as accepted and then fail
    at insert as `write_failed` with full rollback — kept (fail-safe;
    unreachable with the real export).
  - `databases.ts` additive-only diff confirmed by the builder after review
    (`export` keywords only).

## 12. Deferred source fields / out-of-scope

- Spreadsheet columns 12–22 and row-label column 1: empty in the export —
  unmapped.
- No formula/validation/named-range/hidden-row semantics to recover
  (values-only export); none inferred.
- `VIDEO LINK` stored/rendered as verbatim text (1 placeholder value in the
  export); no link behavior invented.
- Rows removed from a later source are not deleted (upsert-only) — a future
  change-management decision, not this slice.
- Entirely deferred (not built): TRAINING sheet, workouts, programs,
  completed training records, set/rep prescriptions, progression,
  performance tracking, training calculations, client data entry, exercise
  recommendations. The claimed ~990-exercise count vs. the export's 546 rows
  remains an open source question (needs the original `.xlsx`; recorded in
  `docs/source-inventory.md` / `docs/tasks/phase-0-1-source-blueprint.md`).

## 13. Deviations / blockers

- None. The catalog is workspace-scoped master data; the route reuses the
  reviewed `foodExerciseMasterData/read` authorization and does not change
  auth/session semantics. Correction on client reach: although the RBAC matrix
  grants CLIENT a workspace-scope `foodExerciseMasterData/read` cell, a CLIENT
  member cannot currently reach the catalog — the enclosing staff workspace
  layout authorizes `workspaceSettings/read`, which denies CLIENT with HTTP 403. Client-facing access remains deferred client-shell work, unchanged by
  this task.

## 14. Non-blocking follow-ups (consolidated reviewer observations)

Recorded for future work; none are merge criteria:

- `lib/nutrition/import.ts` still rewrites `first_imported_at` on update —
  the exercise module fixed this; a shared tested fix for nutrition remains
  open.
- ILIKE metacharacters (`%`/`_`) reach `contains` unescaped in both catalog
  searches (bounded by `take ≤ 50`).
- Digit-string `ID`s exceeding int4 classify as accepted then fail at insert
  as `write_failed` (clean rollback) rather than `invalid_source_id`.
- `reason_field` is never populated for exercise rows (no field-level
  rejection reasons exist); the column is carried for pattern symmetry.
- A facet param value absent from the dropdown list renders the select as
  "All" while the filter still applies (same quirk as nutrition `cat=`).
- `EXERCISE_SOURCE_HEADERS` is exported but unreferenced (documentation-only;
  `NUTRITION_SOURCE_HEADERS` identical).
- `scannedRowCount` counts only post-header rows (nutrition convention);
  content above the header row would be uncounted — not possible in the real
  export.
- `completedAt` uses wall-clock while `startedAt` uses the injected `now`
  (faithful to Phase 2.1; semantically a completion timestamp).
