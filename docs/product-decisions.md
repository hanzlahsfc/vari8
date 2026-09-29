# Product decisions

Locked decisions for the new PRGRSS-derived product. Source: `TRACKER 2.0.md` §3 (relayed
stakeholder decisions). This document does not authorize a push, PR, deploy, or external change.

1. **New repository, new product.** This is a new repository and a completely different final
   product name. `App`, `The-great-tracker-`, `Prime Tracker Pro`, and `PRGRSS 2.0` are
   placeholders or source names, not an approved product name.
2. **The sheets are the base and core.** The 11-sheet professional workbook is the product's
   specification and source of truth.
3. **Faithful layouts.** Reproduce the sheet layouts and information architecture faithfully in
   the web UI; do not independently redesign them.
4. **Data lives in the app.** Implement the sheet data and behavior inside the application; do
   not link to or embed the live sheets as the product.
5. **Sheet-derived catalogs.** Replace Prime State's food/exercise master data with the
   sheet-derived databases (`spec/data/foods.json`, `spec/data/exercises.json`).
6. **Prime State formulas are irrelevant.** Formula behavior must come from Lilly's schematic,
   the Google scripts, or another approved source — never from Prime State or guesswork.
7. **Unknown formulas wait.** PRGRSS 2.0 formulas/estimation not derivable from the HTML
   (calorie column, averages/trends, MEALPLAN subtotals, T-minus, MENSES estimation) remain
   blocked until the PRGRSS scripts and/or the original `.xlsx` arrive. The received CRE8
   input-flow overview (`CRE8_Input_Flow_Overview.html`, 2026-09-29) is a **different workbook
   that explicitly excludes PRGRSS 2.0**; it documents CRE8 wiring only and does not resolve
   PRGRSS 2.0 behavior.
8. **Use permission confirmed.** Aleks and Marcel confirmed the supplied workbook and the
   existing application may be used for implementation. Exact redistribution/licensing language
   still needs pre-release legal/product review; that review is **not** a blocker for local
   implementation.
9. **Licensing review is separate.** Pre-release redistribution/licensing determination remains
   an open, separate step; it is not the same as permission to implement.
10. **Supabase was a suggestion only.** Not approved. PostgreSQL + Prisma is the current stack;
    do not migrate providers without an explicit decision and migration plan.
11. **No data migration.** No existing Prime State client accounts or records are migrated unless
    explicitly requested later.
12. **CRE8 schematic received (reference only, not PRGRSS 2.0).** `CRE8_Input_Flow_Overview.html`
    (received 2026-09-29) documents CRE8 formula/script paths (Tracker→Backend, bodyweight
    averages/trends, Mealplan→Target Log snapshots, Timeline→Dashboard targets, cycle
    calculations, check-in submit/review, Programming→Logbook, PED Protocol→PED Change Log,
    Apps Script inventory). It **excludes PRGRSS 2.0** and has unresolved gaps of its own; it is
    not a substitute for the PRGRSS 2.0 formulas. `SCRIPT_CRE8.gs` is referenced but was not
    supplied.
