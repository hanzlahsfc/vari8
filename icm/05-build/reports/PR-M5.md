# PR-M5 report

Card `icm/05-build/cards/pr-m5-mealplan-payload.md`, issue #113, PR #114. Branch `beta/pr-m5-mealplan-payload`. Base `fb5c387` (merge base with `origin/Vari8-Beta`), gate head `9e64d54`.

## What changed

- `lib/nutrition/math.ts` (new): the canvas nutrition functions ported verbatim: `Nutrients`/`Food`, `emptyNutrients`, `addNutrients`, `calculatePortionNutrients`, `calculateMealNutrients`, `calculateVariantNutrients` (`ethereal/mealplan/model.ts`), `macroEnergyShares` 4/4/9 ring (`overview-model.ts`), `targetNumber` and `iifymTargetNutrients` (the IIFYM derived-kcal branch of `planTargets`, `coach/plans/domain.ts`). Exported for the server now; the canvas rewire is a later wiring PR (standing orders rule 3, `frontend/` untouched).
- `lib/nutrition/foods.ts` (new): `loadNutritionFoodMap` adapts `NutritionCatalogItem` rows into `Food` for server-side totals.
- `lib/mealplan/payload.ts` (reshape): the draft/version payload is now the canvas `MealPlan` shape: `name`, `startDate`, `activeVariantId`, `schedule` (manual/weekly/cycle), variants with optional `dailyTarget`, meals of catalog-food `portions` with approved `swaps`, optional per-meal `target`. `MealTargets` carries per-field `fixed`/`range`/`minimum` kinds with style exclusivity (`calories`-style admits only `calories`, `macros`-style only protein/carbs/fat). The old `foodText` blob and hand-entered per-meal kcal/macros are removed (S06 blocker: food identity/quantity/unit were lost; S06-07: entered-vs-computed conflict, totals now compute via `lib/nutrition/math.ts`, D29). `archivedPlans` is not stored: superseded immutable versions are the archive (O11, no update path on `MealPlanVersion`; corrections publish a new version). The meal shape matches `SavedMealPayload` (`lib/db-types/saved-meal.ts`) so meals move between plan and the `saved_meal` library unchanged. Drafts permit incomplete but never malformed payloads; `forPublish` adds the canvas activation floor (name, valid startDate, active variant, complete schedule, each meal >=1 positive-quantity portion, HH:MM times). `collectMealPlanFoodIds` added.
- `lib/mealplan/limits.ts`: bounds updated for the new shape (portion/swap counts, ids, cycle days).
- `lib/mealplan/service.ts`: type re-exports only; workflow untouched.
- `components/mealplan/*`: the legacy staff editor and version views rebuilt for the canvas shape; version views render portions/swaps and, when catalog foods resolve, per-meal/variant totals plus the ring via the shared math. `Food[]` crosses the RSC boundary as a plain array (Map is rebuilt client-side).
- `app/**/meal-plan/{page,actions}.ts`: resolves catalog foods for the payload's foodIds and passes them to the views.
- `scripts/seed/34-nutrition.seed.ts` (new): 584 canvas foods into `nutrition_catalog_item` (canvas ids kept, `source_no` 900000 block), coach PRIMARY + owner COACH assignments on all 15 demo clients, and one MealPlan for Emma Anders (open draft + one published immutable version) mirroring `createInitialMealPlan` with deterministic ids.
- `tests/unit/mealplan-payload.test.ts` (rewritten), `tests/unit/nutrition-math.test.ts` (new), `tests/integration/mealplan-i1.test.ts` (fixture on the new shape).

## Gate at this head

`BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_wb_m5 LANE_PORT=3920 CARD=PR-M5 icm/05-build/tools/verify-local.sh`

Head `9e64d54`, base `fb5c387`, node v26.12.0 (target 24, WARN only), database `app_wb_m5`. Log `pr-m5-mealplan-payload.check.log` in the wave evidence directory. Overall exit 1, every step PASS except parity.

| Step                    | Exit | Result                                  |
| ----------------------- | ---- | --------------------------------------- |
| clean tree              | 0    | clean                                   |
| schema guard (D34)      | 0    | no `db/` change                         |
| program generator check | 0    | `generate.py --check`                   |
| npm ci                  | 0    | root, 767 packages                      |
| prisma generate         | 0    |                                         |
| frontend npm ci         | 0    | 383 packages                            |
| format check            | 0    | all files Prettier-clean                |
| typecheck               | 0    |                                         |
| frontend typecheck      | 0    |                                         |
| lint                    | 0    | 81 warnings, 0 errors                   |
| frontend lint           | 0    | biome, 196 files                        |
| unit tests              | 0    | 98 files, 1129 tests passed             |
| frontend tests          | 0    | 76 pass, 0 fail                         |
| integration tests       | 0    | 61 files, 865 tests passed on real PG   |
| migrate deploy          | 0    |                                         |
| build                   | 0    |                                         |
| frontend build          | 0    |                                         |
| e2e flow specs          | 0    | 10 passed, 7 skipped                    |
| parity regression (D32) | 1    | `parity FAIL: 70 problem(s), retried=0` |

Parity is not this card's contract ("Parity (D32) on: none"), and the failure is the harness defect tracked as PR #137: it fails on every screen, not on this card's screens only, with zero geometry and zero text tolerance reported. Representative lines, verbatim:

```
FAIL s01-roster@390 px=64387 geom=0/0/139 text=0
FAIL s02-messages@390 px=54220 geom=0/0/43 text=0
FAIL s06-mealplan-editor@390 px=119952 geom=0/0/72 text=0
FAIL s11-preferences@390 px=124894 geom=0/0/114 text=0 ruled=1
parity FAIL: 70 problem(s), retried=0; report .../tools/parity/out/report.html
```

70 screens fail, 70 capture OK. No `SKIP_PARITY` knob exists in `icm/05-build/tools/verify-local.sh` at base `fb5c387` (checked with `git show origin/Vari8-Beta:... | grep -c SKIP_PARITY`, result 0), so a clean exit 0 is not reachable on this base for any card that runs the gate unchanged.

## Acceptance: canvas totals vs backend totals on the demo plan

Measured on this head against the real seed in `app_wb_m5` (`npm run db:fresh`, exit 0: 584 foods, 30 assignments, meal plan + version 1 for Emma Anders). Canvas side is the canvas's own code, `createInitialMealPlan` plus `calculateVariantNutrients` and `macroEnergyShares` from `frontend/src/components/ethereal/mealplan/{model,overview-model}.ts`. Backend side is the seeded draft read back from the `meal_plan` row, through `normalizeMealPlanPayload`, with catalog rows loaded by `loadNutritionFoodMap` and totals from `lib/nutrition/math.ts`.

Plan row `cmvh09c1s003w8ovgf6x4ds81`, draft revision 1, active variant `TD`. Both sides resolve the same four portions: Breakfast `food-057` x 50, Lunch `food-001` x 150, Afternoon `food-451` x 200, Dinner `food-005` x 150.

| Totals  | kcal | protein (g) | carbs (g) | fat (g) | ring 4/4/9 |
| ------- | ---- | ----------- | --------- | ------- | ---------- |
| canvas  | 907  | 107.55      | 48.6      | 30.7    | 48/22/31   |
| backend | 907  | 107.55      | 48.6      | 30.7    | 48/22/31   |

Script `pr-m5-totals.ts` (kept in the wave evidence directory, outside the branch) prints both rows, compares all four macros at 1e-6 and the portion lists exactly, and exits 1 on any difference. Run `npx tsx pr-m5-totals.ts` with `DATABASE_URL` on `app_wb_m5`: exit 0, `ACCEPTANCE: EQUAL`. Output `pr-m5-totals.log`; `db:fresh` output `pr-m5-acceptance.dbfresh.log`.

The two demo meals the unit guard pins (`tests/unit/nutrition-math.test.ts`, 12 tests, part of the 1129 above): Breakfast Oats 50 g and Lunch Chicken Breast (Cooked) 150 g, plus the ring percentages and blank-not-zero behavior.

## Live check (earlier run on the builder machine, not repeated here)

The earlier live browser pass ran in the builder environment on its own lane database and server: client page rendered the published version with the same totals, the coach editor loaded the draft and a service-level save returned revision 2, staff URL redirected to `/login` when signed out. Its screenshots are not present on this Mac and are not committed to this branch, so this report does not cite them as evidence.

## Matrix rows closed

- V3-L1-PlanVersion: the published payload now carries the canvas version content (name, startDate, variants, activeVariantId, schedule) inside the immutable `MealPlanVersion` (O11); `activationInstant`/`effectiveDate` replace `activatedAt`/`archivedOn` as decided.
- V3-L1-PlanLifecycle: canvas `PlanLifecycle {draft?, active?, history[]}` maps to the backend lifecycle: mutable shared draft under `draftRevision` CAS plus immutable published versions; superseded versions are the history/archive (O11).

## What I could not do or chose

- Parity regression is red on this base for all 70 screens (harness defect PR #137). Not fixed here, as instructed; the card's parity line is "none".
- No live browser pass at this head on this Mac. The numbers above come from the real seeded lane database and both code paths, and the gate's e2e specs and integration suite passed, but no screenshots were produced for the re-gate.
- Node 26.12.0 on this host against the D5 target of 24. Recorded as WARN by the gate, not certified.
- No `db/` edits (D34). `saved_meal` table (PR-M0) holds the library; the plan payload deliberately does not duplicate it, "saved meals" is satisfied by sharing the meal payload shape.
- IIFYM `iifym_plan` table/payload (`lib/db-types/iifym.ts`) exists from PR-M0; its service/UI is the IIFYM lane's scope, not this card's.
- Portion `foodId` is validated as a bounded opaque reference; catalog existence is not DB-checked in the pure normalizer (same trust boundary as before).
- Canvas rewire of `frontend/` to `lib/nutrition/math.ts` is intentionally left to the wiring PR.
