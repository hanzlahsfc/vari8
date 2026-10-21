# PR-M5 report

Card `icm/05-build/cards/pr-m5-mealplan-payload.md`, issue #113, PR #114. Branch `beta/pr-m5-mealplan-payload`. Head `7b5ac314b7bae292718f7f0a28855cc419b2866c`, base `5553b471e2be1e1f8ea4f3dbadfd50c65f162281` (merge base with `origin/Vari8-Beta`, which was `5553b47` when the gate ran). Lane: database `app_wb_m5` on 127.0.0.1:5433, port 3920, native PG17 on macOS.

## What changed

- `lib/nutrition/math.ts` (new): the canvas nutrition functions ported verbatim: `Nutrients`/`Food`, `emptyNutrients`, `addNutrients`, `calculatePortionNutrients`, `calculateMealNutrients`, `calculateVariantNutrients` (`ethereal/mealplan/model.ts`), `macroEnergyShares` 4/4/9 ring (`overview-model.ts`), `targetNumber` and `iifymTargetNutrients` (the IIFYM derived-kcal branch of `planTargets`, `coach/plans/domain.ts`). Exported for the server now; the canvas rewire is a later wiring PR (standing orders rule 3, `frontend/` untouched).
- `lib/nutrition/foods.ts` (new): `loadNutritionFoodMap` adapts `NutritionCatalogItem` rows into `Food` for server-side totals.
- `lib/mealplan/payload.ts` (reshape): the draft/version payload is the canvas `MealPlan` shape: `name`, `startDate`, `activeVariantId`, `schedule` (manual/weekly/cycle), variants with optional `dailyTarget`, meals of catalog-food `portions` with approved `swaps`, optional per-meal `target`. `MealTargets` carries per-field `fixed`/`range`/`minimum` kinds with style exclusivity (the calories style admits only `calories`, the macros style only protein/carbs/fat). The old `foodText` blob and hand-entered per-meal kcal/macros are removed (S06 blocker: food identity, quantity and unit were lost; S06-07: entered versus computed conflict, totals now compute through `lib/nutrition/math.ts`, D29). `archivedPlans` is not stored: superseded immutable versions are the archive (O11, no update path on `MealPlanVersion`; corrections publish a new version). The meal shape matches `SavedMealPayload` (`lib/db-types/saved-meal.ts`) so meals move between plan and the `saved_meal` library unchanged. Drafts permit incomplete but never malformed payloads; `forPublish` adds the canvas activation floor (name, valid startDate, active variant, complete schedule, each meal with at least one positive-quantity portion, HH:MM times). `collectMealPlanFoodIds` added.
- `lib/mealplan/limits.ts`: bounds updated for the new shape (portion/swap counts, ids, cycle days).
- `lib/mealplan/service.ts`: type re-exports only; workflow untouched.
- `components/mealplan/*`: the legacy staff editor and version views rebuilt for the canvas shape; version views render portions/swaps and, when catalog foods resolve, per-meal and variant totals plus the ring through the shared math. `Food[]` crosses the RSC boundary as a plain array (Map is rebuilt client-side).
- `app/**/meal-plan/{page,actions}.ts`: resolves catalog foods for the payload's foodIds and passes them to the views.
- `scripts/seed/34-nutrition.seed.ts` (new): 584 canvas foods into `nutrition_catalog_item` (canvas ids kept, `source_no` 900000 block), coach PRIMARY plus owner COACH assignments on all 15 demo clients, and one MealPlan for Emma Anders (open draft plus one published immutable version) mirroring `createInitialMealPlan` with deterministic ids.
- `tests/unit/mealplan-payload.test.ts` (rewritten), `tests/unit/nutrition-math.test.ts` (new), `tests/integration/mealplan-i1.test.ts` (fixture on the new shape).
- `docs/index/SYMBOLS.md`: regenerated index for the new exports.

Changed paths against the base, 17 files, 2600 insertions, 566 deletions:

```
M  app/(tracker)/workspace/[workspaceId]/meal-plan/page.tsx
M  app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/actions.ts
M  app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/page.tsx
M  components/mealplan/meal-plan-editor.tsx
M  components/mealplan/plan-version-view.tsx
M  components/mealplan/version-history.tsx
M  docs/index/SYMBOLS.md
A  icm/05-build/reports/PR-M5.md
M  lib/mealplan/limits.ts
M  lib/mealplan/payload.ts
M  lib/mealplan/service.ts
A  lib/nutrition/foods.ts
A  lib/nutrition/math.ts
A  scripts/seed/34-nutrition.seed.ts
M  tests/integration/mealplan-i1.test.ts
M  tests/unit/mealplan-payload.test.ts
A  tests/unit/nutrition-math.test.ts
```

## Gate at this head

Run through the wave runner, which sets `POSTGRES_PASSWORD`, `AUTH_TRUST_HOST`, `VARI8_WORKTREES`, `PRETTIER`, `BASE_SHA` and `SKIP_PARITY=1`:

```
./run-gate.sh pr-m5-mealplan-payload PR-M5 app_wb_m5 3920
```

Log: `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/WAVEB-LEAD/pr-m5-mealplan-payload.check.log`. Summary block, verbatim:

```
== verify-local summary
head=7b5ac314b7bae292718f7f0a28855cc419b2866c base=5553b471e2be1e1f8ea4f3dbadfd50c65f162281 node=v26.12.0 card=PR-M5 db=app_wb_m5 port=3920
PASS clean tree (0s)
WARN node: target 24 (D5), running v26.12.0; recorded, not certified
PASS schema guard (D34) (0s)
PASS program generator check (1s)
PASS npm ci (19s)
PASS prisma generate (1s)
PASS frontend npm ci (8s)
PASS format check (11s)
PASS typecheck (27s)
PASS frontend typecheck (4s)
PASS lint (17s)
PASS frontend lint (2s)
PASS unit tests (18s)
PASS frontend tests (1s)
PASS integration tests (135s)
PASS migrate deploy (1s)
PASS build (41s)
PASS frontend build (9s)
PASS e2e flow specs (serialized) (26s)
SKIP parity regression (D32): SKIP_PARITY=1, card contract gates no screens
VERIFY-LOCAL PASS
```

`EXIT=0` at 22:24:08. The earlier red run at head `9e64d54` (base `fb5c387`) failed only on parity, before the base carried the skip knob; the card's parity line is "none" and this run skipped it, so that finding is closed by the base rather than by a weakened check.

## Acceptance

Contract: "A draft round-trips; totals from `lib/nutrition/math.ts` equal the canvas totals on the demo plan."

Re-measured on this head. Commands and exits:

| Command                                                               | Exit |
| --------------------------------------------------------------------- | ---- |
| `npm run db:fresh` (with `DB_FRESH_SKIP_CATALOGS=1`, see limits)      | 0    |
| `npx tsx .../pr-m5-accept.ts`                                         | 0    |
| `npx vitest run tests/unit/nutrition-math.test.ts --reporter=verbose` | 0    |
| `node .../pr-m5-live-final.mjs` against `next start` on port 3920     | 0    |

`npm run db:fresh` log `pr-m5-acceptance.dbfresh.log` ends with `[seed] nutrition: 584 foods, 30 assignments, meal plan + version 1 for Emma Anders` and `[db:fresh] done`.

The acceptance script (`pr-m5-accept.ts`, kept in the wave evidence directory, outside the branch) computes the canvas side with the canvas's own code (`createInitialMealPlan`, `calculateVariantNutrients`, `macroEnergyShares` from `frontend/src/components/ethereal/mealplan/{model,overview-model}.ts` over `frontend/src/data/food-database.json`) and the backend side from the seeded `meal_plan.draft` row through `normalizeMealPlanPayload`, `loadNutritionFoodMap` and `lib/nutrition/math.ts`. It then saves that same draft through `saveMealPlanDraft` as the seeded coach (CAS on the revision), reads the row back and recomputes. Output, `pr-m5-acceptance.log`:

```
plan row: cmvikc6po003w8okwii409h62 title: Nutrition plan draftRevision: 1
canvas  portions: Breakfast:food-057x50, Lunch:food-001x150, Afternoon:food-451x200, Dinner:food-005x150
backend portions: Breakfast:food-057x50, Lunch:food-001x150, Afternoon:food-451x200, Dinner:food-005x150
canvas  totals: kcal 907 protein 107.55 carbs 48.6 fat 30.7
backend totals: kcal 907 protein 107.55 carbs 48.6 fat 30.7
canvas  ring: P 48% C 22% F 31%
backend ring: P 48% C 22% F 31%
acceptance totals equal to canvas: true | portions equal: true
ROUND TRIP: saved revision 2 db draftRevision 2 | payload identical: true | totals after: kcal 907 P 107.55 C 48.6 F 30.7

ACCEPTANCE: EQUAL
```

So a draft persists (revision 1 to 2, the stored payload normalizes to the identical object) and the totals from `lib/nutrition/math.ts` equal the canvas totals on the demo plan: 907 kcal, 107.55 g protein, 48.6 g carbs, 30.7 g fat, ring 48/22/31.

### Live, both widths

Production build from the gate, served with `npm start -- -p 3920` (`APP_ENV=test`, `ENABLE_MEAL_PLANS=1`, lane `DATABASE_URL`), coach session from the repo seed. Page `/workspace/cmvikc68n00008okwv0ew7reb/clients/cmvikc6bj000h8okwjnazgnp2/meal-plan`, status 200.

The draft editor rendered the round-tripped draft at both widths: `draft revision 2`, plan name `Nutrition plan`, start `2026-10-19`, variant `v_td_demo` / `TD`, and the four canvas portions in the form fields (`food-057` 50, `food-001` 150, `food-451` 200, `food-005` 150).

The published version view, opened through the real `View` server action (POST to the page route, 200), rendered:

```
totals: 907 kcal, protein 107.6 g, carbs 48.6 g, fat 30.7 g, ring 48/22/31
Breakfast  08:00  Oats 50 g                      187 kcal    5.5 g P   32 g C    4.1 g F
Lunch      12:30  Chicken Breast (Cooked) 150 g  217.5 kcal  48 g P     0 g C     2.8 g F
Afternoon  16:00  Arla 0% Fat Vanilla Skyr 200 g 144 kcal    17.2 g P  16.6 g C  0.4 g F
Dinner     19:30  Salmon (Cooked) 150 g          358.5 kcal  36.9 g P   0 g C    23.4 g F
```

The per-meal kcal sum to 907 and the protein values sum to 107.55, which the view rounds to one decimal (107.6). Driver log `pr-m5-live-final.log` ends in `LIVE: PASS`, every assertion PASS at 1440x900 and 390x844. Screenshots (gitignored through `.git/info/exclude`, so they stay out of the branch):

- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m5-mealplan-payload/_evidence/PR-M5/build/staff-draft-editor-1440.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m5-mealplan-payload/_evidence/PR-M5/build/staff-draft-editor-390.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m5-mealplan-payload/_evidence/PR-M5/build/staff-version-totals-1440.png`
- `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/pr-m5-mealplan-payload/_evidence/PR-M5/build/staff-version-totals-390.png`

### Unit guards (the card's unit line)

`tests/unit/nutrition-math.test.ts`, 12 tests, exit 0, log `pr-m5-unit-nutrition.log`:

- Literal totals for the two demo meals: Oats 50 g is 187 kcal, 5.45 g protein, 32 g carbs, 4.05 g fat; Chicken Breast (Cooked) 150 g is 217.5 kcal, 48 g protein, 0 g carbs, 2.85 g fat.
- Demo variant totals 907 / 107.55 / 48.6 / 30.7 and the 4/4/9 ring at 430.2/900.9, 194.4/900.9 and 276.3/900.9, summing to 1. A second synthetic total pins 100/390, 200/390 and 90/390.
- Blank stays missing: a portion to an unknown food contributes nothing, an all-zero meal yields all-zero shares rather than an invented split, a zero-quantity portion contributes zeros.

## Matrix rows closed

- V3-L1-PlanVersion: the published payload now carries the canvas version content (name, startDate, variants, activeVariantId, schedule) inside the immutable `MealPlanVersion` (O11); `activationInstant`/`effectiveDate` replace `activatedAt`/`archivedOn` as decided.
- V3-L1-PlanLifecycle: canvas `PlanLifecycle {draft?, active?, history[]}` maps to the backend lifecycle: mutable shared draft under `draftRevision` CAS plus immutable published versions; superseded versions are the history/archive (O11).

## What I could not do or chose

- The seeded client login is not Emma Anders, and the demo client profile Emma Anders links to a user with no credential account, so the client-facing `/workspace/<id>/meal-plan` page answers "You don't have access to this meal plan" for both seeded accounts. The client surface is therefore not covered live here; the numbers above come from the coach surfaces that render the same payload through the same `lib/nutrition/math.ts`.
- `npm run db:fresh` needs the sheet exports (`Nutrition Database.html`, `Exercise Database.html`) or `DB_FRESH_SKIP_CATALOGS=1`. Neither export exists on this Mac, so the catalog import step was skipped; the 584 canvas foods and the demo plan still seed through `scripts/seed/34-nutrition.seed.ts`.
- `next dev` on this host never hydrates: no React client tree, no server action POST, a dead theme toggle, and the only console output is a failing HMR websocket. The production build hydrates and runs the `View` action normally, which is what the screenshots and numbers above use. This is a host/dev-server condition visible on every page, not this card's code.
- Parity regression is skipped by design (`SKIP_PARITY=1`, card declares "Parity (D32) on: none").
- Node 26.12.0 on this host against the D5 target of 24. Recorded by the gate as WARN, not certified.
- No `db/` edits (D34). `saved_meal` (PR-M0) holds the library; the plan payload deliberately does not duplicate it, "saved meals" is satisfied by sharing the meal payload shape.
- IIFYM `iifym_plan` table/payload (`lib/db-types/iifym.ts`) exists from PR-M0; its service and UI are the IIFYM lane's scope, not this card's.
- Portion `foodId` is validated as a bounded opaque reference; catalog existence is not DB-checked in the pure normalizer (same trust boundary as before).
- Canvas rewire of `frontend/` to `lib/nutrition/math.ts` is intentionally left to the wiring PR.
