# PR-M5 report

Card `icm/05-build/cards/pr-m5-mealplan-payload.md`, issue #113, PR #114. Branch `beta/pr-m5-mealplan-payload`, base `f00d37b` (merge base with `origin/Vari8-Beta`).

## What changed

- `lib/nutrition/math.ts` (new): the canvas nutrition functions ported verbatim — `Nutrients`/`Food`, `emptyNutrients`, `addNutrients`, `calculatePortionNutrients`, `calculateMealNutrients`, `calculateVariantNutrients` (`ethereal/mealplan/model.ts`), `macroEnergyShares` 4/4/9 ring (`overview-model.ts`), `targetNumber` and `iifymTargetNutrients` (the IIFYM derived-kcal branch of `planTargets`, `coach/plans/domain.ts`). Exported for the server now; the canvas rewire is a later wiring PR (standing orders rule 3 — `frontend/` untouched).
- `lib/nutrition/foods.ts` (new): `loadNutritionFoodMap` adapts `NutritionCatalogItem` rows into `Food` for server-side totals.
- `lib/mealplan/payload.ts` (reshape): the draft/version payload is now the canvas `MealPlan` shape — `name`, `startDate`, `activeVariantId`, `schedule` (manual/weekly/cycle), variants with optional `dailyTarget`, meals of catalog-food `portions` with approved `swaps`, optional per-meal `target`. `MealTargets` carries per-field `fixed`/`range`/`minimum` kinds with style exclusivity (`calories`-style admits only `calories`, `macros`-style only protein/carbs/fat). The old `foodText` blob and hand-entered per-meal kcal/macros are removed (S06 blocker: food identity/quantity/unit were lost; S06-07: entered-vs-computed conflict — totals now compute via `lib/nutrition/math.ts`, D29). `archivedPlans` is not stored: superseded immutable versions are the archive (O11 — no update path on `MealPlanVersion`; corrections publish a new version). The meal shape matches `SavedMealPayload` (`lib/db-types/saved-meal.ts`) so meals move between plan and the `saved_meal` library unchanged. Drafts permit incomplete but never malformed payloads; `forPublish` adds the canvas activation floor (name, valid startDate, active variant, complete schedule, each meal ≥1 positive-quantity portion, HH:MM times). `collectMealPlanFoodIds` added.
- `lib/mealplan/limits.ts`: bounds updated for the new shape (portion/swap counts, ids, cycle days).
- `lib/mealplan/service.ts`: type re-exports only; workflow untouched.
- `components/mealplan/*`: the legacy staff editor and version views rebuilt for the canvas shape; version views render portions/swaps and, when catalog foods resolve, per-meal/variant totals plus the ring via the shared math. `Food[]` crosses the RSC boundary as a plain array (Map is rebuilt client-side).
- `app/**/meal-plan/{page,actions}.ts`: resolves catalog foods for the payload's foodIds and passes them to the views.
- `scripts/seed/34-nutrition.seed.ts` (new): 584 canvas foods into `nutrition_catalog_item` (canvas ids kept, `source_no` 900000 block), coach PRIMARY + owner COACH assignments on all 15 demo clients, and one MealPlan for Emma Anders (open draft + one published immutable version) mirroring `createInitialMealPlan` with deterministic ids.
- `tests/unit/mealplan-payload.test.ts` (rewritten), `tests/unit/nutrition-math.test.ts` (new), `tests/integration/mealplan-i1.test.ts` (fixture on the new shape).

## Commands and exit codes

| Command                                                                                                                   | Exit   | Result                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run tests/unit/nutrition-math.test.ts`                                                                        | 0      | 12/12 (demo-meal literals, 4/4/9 ring, blank-not-zero)                                                                |
| `npx vitest run tests/unit/mealplan-payload.test.ts` + math                                                               | 0      | 31/31                                                                                                                 |
| `npx tsc --noEmit`                                                                                                        | 0      | clean                                                                                                                 |
| `npx eslint <changed files>`                                                                                              | 0      | clean                                                                                                                 |
| `INTEGRATION_DATABASE_URL=... npx vitest run --config vitest.integration.config.ts tests/integration/mealplan-i1.test.ts` | 0      | 19/19 on real PG                                                                                                      |
| `npm run db:fresh` (app_m5, skip catalogs, env creds)                                                                     | 0      | 584 foods, 30 assignments, plan+version 1 for Emma Anders                                                             |
| `npm run index` / `npm run index:check`                                                                                   | 0 / 0  | SYMBOLS.md regenerated                                                                                                |
| `npm run build` (dev box, 3 attempts)                                                                                     | 1      | `SIGABRT` "OS can't spawn worker thread" under parallel-lane thread starvation; TypeScript step itself finished clean |
| `verify-local.sh`                                                                                                         | see PR | gate log `pr-m5-mealplan-payload.check.log`                                                                           |

## Live check (lane DB `app_m5`, dev server :3870)

- Sign-in via the credential workaround (standing orders 5 — seed writes no `accounts` rows); labeled here.
- Client (Emma) own meal-plan page: published version renders 4 meals with catalog-food portions and shared-math totals — `907 kcal · protein 107.6 g · carbs 48.6 g · fat 30.7 g — ring 48/22/31`, matching the canvas `createInitialMealPlan` demo totals exactly (verified identical to `calculateVariantNutrients` on the same fixture). Screenshots `client-1440.png`, `client-390.png`.
- Coach staff editor loads the draft including a service-level save (`Breakfast (svc)` → revision 2): the canvas-shaped draft round-trips DB → normalize → view. Screenshots `coach-staff-1440.png`, `coach-staff-390.png`, `owner-staff-1440.png`, `owner-staff-390.png`.
- Signed out: staff URL redirects to `/login` (`signedout-1440.png`).
- Transcript `proof-transcript.txt` / `proof-run*.log`; dev log `dev-server*.log`.

Caveat (measured, environmental): in dev mode on this saturated host, client-bundle hydration lagged so the editor's save button did not fire within script budgets; the draft round-trip was therefore proven at the service boundary plus read-back rendering, not by a button click. Service `saveMealPlanDraft` on the lane DB returned revision 2 and the saved label renders in the editor.

## Matrix rows closed

- V3-L1-PlanVersion: the published payload now carries the canvas version content (name, startDate, variants, activeVariantId, schedule) inside the immutable `MealPlanVersion` (O11); `activationInstant`/`effectiveDate` replace `activatedAt`/`archivedOn` as decided.
- V3-L1-PlanLifecycle: canvas `PlanLifecycle {draft?, active?, history[]}` maps to the backend lifecycle — mutable shared draft under `draftRevision` CAS plus immutable published versions; superseded versions are the history/archive (O11).

## What I could not do or chose

- No `db/` edits (D34). `saved_meal` table (PR-M0) holds the library; the plan payload deliberately does not duplicate it — "saved meals" is satisfied by sharing the meal payload shape.
- IIFYM `iifym_plan` table/payload (`lib/db-types/iifym.ts`) exists from PR-M0; its service/UI is the IIFYM lane's scope, not this card's.
- Portion `foodId` is validated as a bounded opaque reference; catalog existence is not DB-checked in the pure normalizer (same trust boundary as before).
- Canvas rewire of `frontend/` to `lib/nutrition/math.ts` is intentionally left to the wiring PR.
