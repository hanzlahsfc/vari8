# Phase 3 — first controlled main integration (plan + record)

**Plan committed before remediation.** Builder: opencode (deepseek-v4.1-flash).
Integration branch `feature/integrate-tracker-shell-nutrition-catalog` from the verified
Phase 2.1 tip `feature/phase-2-1-nutrition-catalog`
`72963fe1e9261db1b36ce89e55fb07bd3c976a57` (which contains Phase 0.1 blueprint, Phase 1.1
Daily Tracker shell and Phase 2.1 Nutrition catalog; `main` is its ancestor).

## 1. Goal

Integrate the completed Phase 0.1/1.1/2.1 work into `main` through one reviewed merge
PR, after a mandatory source-data policy remediation. No deploy.

## 2. Source-data audit (main + candidate tree)

| Artifact                                                                 | Contents                                                      | Verdict                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `spec/data/foods.json`                                                   | 599 copied Nutrition Database records (normalized dump)       | **Prohibited — remove**                                                 |
| `spec/data/exercises.json`                                               | 546 copied Exercise Database records (normalized dump)        | **Prohibited — remove**                                                 |
| `spec/sheets/nutrition-database.json`                                    | full sheet grid; 0 real redactions (unredacted catalog copy)  | **Prohibited — remove**                                                 |
| `spec/sheets/exercise-database.json`                                     | full sheet grid; 0 real redactions (unredacted catalog copy)  | **Prohibited — remove**                                                 |
| `spec/sheets/*.summary.json`                                             | aggregate metadata (labels, counts, block markers)            | Retain (not a data dump)                                                |
| `spec/sheets/<health>.json`                                              | PII-redacted client-sheet extraction (2k–10k redactions each) | Retain (sanctioned redacted extraction output; `.gitignore` allow-rule) |
| `spec/theme.json`, `spec/cross-sheet.md`, `spec/redaction-manifest.json` | derived metadata                                              | Retain                                                                  |
| `docs/**`, blueprints, app code, migrations                              | product/code/docs                                             | Retain                                                                  |

No external PRGRSS ZIP/HTML/resources/`TRACKER 2.0.md` are present in the tree. The trusted
local `npm run import:nutrition` remains the approved path for real Nutrition data into PG.

## 3. Remediation

- Replace the four prohibited catalog dumps with **minimal synthetic fixtures** that cannot
  be mistaken for a real PRGRSS export (sentinel `sourceFile` `SYNTHETIC-…`, `SYNTHETIC
FIXTURE` record names, ≤3 records / ≤10 cells each).
- Update the two consumers/tests that referenced the real data
  (`tests/unit/spec-artifacts.test.ts`, `tests/e2e/library.spec.ts`) and the library page
  ledes so synthetic fixtures are not described as real source data.
- Add a committed **regression guard** `tests/unit/source-data-policy.test.ts` asserting the
  catalog fixtures are synthetic and contain no known real records.

## 4. Acceptance criteria (atomic)

- **AC1** No committed full copied Nutrition/Exercise catalog dump remains: `spec/data/{foods,
exercises}.json` and `spec/sheets/{nutrition-database,exercise-database}.json` are synthetic.
- **AC2** The trusted import path and the Phase 2.1 catalog/schema/search/route are unchanged.
- **AC3** Libraries (`/library/foods`, `/library/exercises`) and the dev sheet viewer still
  build/render from the synthetic fixtures; all existing behaviour stays green.
- **AC4** No app code, migrations, blueprint/docs, `main` history, or `TRACKER 2.0.md` is
  altered; only the prohibited artifacts, their tests/consumers, and a policy guard change.
- **AC5** Full gates green; independent review PASS; merged via a normal merge commit (no
  squash/rebase/force); `main` reachable at the Daily Tracker and Nutrition routes.

## 5. Files

- Remove/replace: `spec/data/foods.json`, `spec/data/exercises.json`,
  `spec/sheets/nutrition-database.json`, `spec/sheets/exercise-database.json`.
- Edit: `tests/unit/spec-artifacts.test.ts`, `tests/e2e/library.spec.ts`,
  `app/library/foods/page.tsx`, `app/library/exercises/page.tsx`.
- Add: `tests/unit/source-data-policy.test.ts`, this record, `docs/STATUS.md` entry.

## 6. Gates

`git diff --check`; `format:check`; `typecheck`; `lint`; `test`; `test:integration`
(disposable PG); `build`; `test:e2e` (full). Then fresh-context independent review → PR →
merge commit → post-merge verify → delete merged branches.

## 7. Boundaries

No deploy; no force-push/history rewrite; no direct `main` push; no Exercise/Training/
Mealplan feature work; no client shell/auth redesign; no raw source in Git.

## 8. Record (implementation + verification)

**Status: remediation complete, all gates green.**

- Integration branch `feature/integrate-tracker-shell-nutrition-catalog` off verified
  `feature/phase-2-1-nutrition-catalog` `72963fe` (`main` `fc2c936` unchanged).
- Commits: `4f58aac` plan; `acf1cbf` remediation (4 fixtures + tests + page ledes +
  policy doc); record follows.
- RED→GREEN: `tests/unit/source-data-policy.test.ts` failed 4/4 before remediation
  (real 599/546-record dumps present) → 4/4 after.
- Removed prohibited full copied catalog dumps (replaced with synthetic fixtures):
  `spec/data/foods.json` (599→3 fixture records), `spec/data/exercises.json` (546→2),
  `spec/sheets/nutrition-database.json` (≈200k-line grid → 5 cells),
  `spec/sheets/exercise-database.json` (≈176k-line grid → 5 cells). Net **−395,322**
  lines of copied source data.
- Consumers/tests updated so the libraries and dev sheet viewer keep working:
  `tests/unit/spec-artifacts.test.ts`, `tests/unit/redact-real.test.ts` (catalog slugs
  excluded from the real-source determinism lock and asserted synthetic),
  `tests/e2e/library.spec.ts`, and the two library page ledes. `docs/redaction-policy.md`
  now states no full copied catalog dump may be committed.
- Gates on the exact tree (real exit codes): `git diff --check` 0; `format:check` 0;
  `typecheck` 0; `lint` 0; `test` 0 (41 files / 429 tests); `test:integration` 0
  (18 files / 205 tests, disposable `tracker_p3_int`); `build` 0 (both
  `/workspace/[workspaceId]/daily` and `/workspace/[workspaceId]/nutrition` emitted);
  `test:e2e` 0 (49 passed).
- Retained: all summaries/metadata, PII-redacted health-sheet extraction artifacts,
  theme/cross-sheet/manifest, blueprints, app code, migrations.
- Residual: `scripts/extract-sheets.ts` can still regenerate real dumps into `spec/` if run
  manually against the external source; it is a dev-only extractor, not an app path, and is
  not run in CI. Recorded for a future policy decision.
