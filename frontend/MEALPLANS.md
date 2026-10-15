# Coach meal-plan workspace

Open `/#mealplan` (or `/ethereal#mealplan`) from the Meal plans navigation item. This page creates and configures plans for the selected illustrative client. It extends the existing Ethereal appearance system, using the Foundations reference for neutral surfaces, recessed pill controls, typography, edge lighting and restrained motion. Apple Design and High-End Visual Design guide the implementation within those established components.

The source development brief is used as requirements evidence. Current scope covers coach meal structure and swaps (N01), reusable meal authorship/portion adjustment (the applicable part of N05), and custom variants/start dates/history (N08). The coach assigns a variant for every day, separately for each weekday, or through a repeating rhythm. Rhythms use ordered blocks of 1–28 days per variant, repeat from a chosen anchor date, and support alternating days or longer custom rotations; their calendar-day calculation stays aligned through daylight-saving changes. Browsing variants does not change this prescription; individual meals have no frequency controls. Separate daily and meal targets are not configured here. The prescribed plan itself defines the nutrition target; the overview displays its totals without separate target fields. Food tracking, consumed/remaining intake, barcode scanning, food diaries, client logging and downstream consumption review (N04, N06–N07) are deferred by the owner's explicit instruction.

A single overview above the editor compares all variants, with source calories, macro grams and a macro-energy distribution ring. Ring segments use protein/carbohydrate energy at 4 kcal/g and fat at 9 kcal/g, normalized to their own sum; database calories remain independent. The ring follows the active accent and neutral palette with a bright tint, darker neutral and small segment separators for distinction. The variant schedule spans the page above the full-width meal editor; no side rail is reserved. Food rows display portion calories and macros. Client preview presents the prescribed meal names, times, quantities, food-specific units, approved alternatives and nutrition as readable text, without disabled inputs or portion pills. Its schedule shows the coach’s daily, weekday or repeating assignments as instructions. Date and time controls use themed popovers; time edits commit with Apply. Swap search opens at the selected food’s Swap button, and approved alternatives appear directly under their source food in client preview.

## Food data

The Saved meals library in the coach toolbar lists meals saved for the selected client. Search by meal or food name, inspect portions, alternatives and nutrition, rename or duplicate a template, and delete with an undo action. Library changes persist in this browser and do not alter meals already assigned to variants. The library also explains how to save the first meal when empty.

`src/data/food-database.json` contains 584 complete foods from the supplied `food database.xlsx` Nutrition Database worksheet. Only names, portion bases, calories, protein, carbohydrates and fat are imported. The original workbook is read only.

The workbook has mixed bases. Each row retains its own `amount` and `unit`; nutrition for an entered portion is `source nutrient × portion quantity ÷ source amount`. Grams, millilitres, individual items and named servings are not interchangeable. Calories remain exactly as supplied rather than being recalculated from macros. Approved alternatives do not add to a meal's prescribed totals. Loading a saved meal replaces the destination meal’s foods and copies their portions and swaps independently; its name and time remain unchanged.

Of 599 named source rows, five incomplete records were excluded and ten exact duplicates removed. Excluded rows: MPS Max (140 and 146), Rasins (158), Lettuce (235), and Beetroot (245). Independent reconciliation matched all 584 exported records to their source names, bases and nutrition values.

Reimport with a Python environment containing `openpyxl`:

```sh
python3 scripts/import-food-database.py '/path/to/food database.xlsx'
```

## Verification

```sh
node --experimental-strip-types --test scripts/mealplan-model.test.ts scripts/mealplan-overview.test.ts
npm run typecheck
npm run build
```

The sixteen model and overview tests cover mixed serving bases, source calories, swap exclusion, independent duplicates and archives, daily/weekly/repeating schedules, anchor and step boundaries, daylight-saving transitions, start dates, invalid configurations safe loading of stored drafts, macro-energy shares and compatibility with legacy target drafts. Browser-local persistence supports the frontend prototype; it does not send or assign plans to a backend or client account.
