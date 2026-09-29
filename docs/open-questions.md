# Open questions

Unresolved items and `TODO(product)` decisions. `TODO(product)` marks behavior or content
that cannot be derived from the supplied HTML exports and must not be guessed.

## Blocking source gaps

1. **`TODO(product)` — Missing original `Copy of PRGRSS 2.0.xlsx`.** All formulas, data
   validations, conditional formats, and hidden rows/sheets are lost in the HTML export. The
   export contains 546 exercises and 599 foods versus the requirements' ~990 / ~1,170, so the
   HTML is likely partial. Extraction is HTML-only until the workbook is supplied; if it is
   added under `sources/`, `exceljs` becomes the primary source.
2. **`TODO(product)` — Missing image references.** `cellImage_2050288505_0.jpg` (referenced by
   `DAILY TRACKER.html`) and `cellImage_227302925_0.jpg` (referenced by `TIMELINE.html`) do not
   exist in `resources/`. The 12 available images are sufficient to continue layout work.

## Underivable semantics (awaiting Lilly's backend schematic / Google Apps Script)

3. **`TODO(product)` — Calorie column** in DAILY TRACKER is marked "automatic"; the formula is
   not in the export.
4. **`TODO(product)` — Weekly averages/trends** semantics (Δkg, Δ%, session count, "no data",
   "0/0" empty) are values-only; rules unknown.
5. **`TODO(product)` — MENSES cycle-phase estimation** and next-period/ovulation estimation
   logic are unknown.
6. **`TODO(product)` — T-minus** computation is values-only.
7. **`TODO(product)` — MEALPLAN per-meal subtotals and overview sums**; formulas lost. The
   MEALPLAN overview values also disagree with the TIMELINE target values — reconcile.
8. **`TODO(product)` — Water/salt averages appear swapped** in the DAILY TRACKER export
   (columns [47]/[48]); verify against the xlsx whether labels or averaging are misaligned.
9. **`TODO(product)` — Sparkline/chart configuration** is a CSS artifact only; actual series
   definitions are absent.
10. **`TODO(product)` — SUPPLEMENTATION / PEAKING / SHOWDAY** have no confirmed wiring to the
    other sheets.

## Product / scope decisions

11. **`TODO(product)` — Product name and branding** are undecided; "App" is a placeholder. The
    repository slug is not the product name.
12. **`TODO(product)` — Pre-release redistribution/licensing review** for a shipped web app.
    Aleks and Marcel **confirmed permission to use the supplied workbook and the existing
    application for implementation** (see `docs/product-decisions.md` #8), so permission to
    implement is **not** open. What remains open is the separate pre-release legal/product
    determination of redistribution/licensing terms for distributing the app (the workbook is
    licensed material: `© 2026 INFINITYCRE8 · Licensed to PRGRSS GmbH · License ID
CK-2026-K8M3 · Redistribution, resale or sublicensing prohibited`).
13. **`TODO(product)` — PED/HRT data policy and legal review** before shipping any module that
    surfaces this data.
14. **`TODO(product)` — Localization.** Prime State has de/en localization; localization is
    omitted from this scaffold and may be requested later. Do not add i18n now.
15. **`TODO(product)` — `SHEETS_SOURCE_DIR` default.** Per ruling 2 the default is the supplied
    extracted folder and it is overridable via the environment; the extractor must fail clearly
    if missing and never write into the source directory.

## Resolved (recorded for traceability)

- **Privacy policy:** committed artifacts preserve structure and redact identifiers/health
  values; unredacted output is local-only and fail-closed; demo data is synthetic; disclaimer,
  license, and footer text stay verbatim. See `docs/redaction-policy.md`.
- **Prime State reuse boundary:** technical foundation only; no product identity, data,
  formulas, seeds, or security assumptions. See `docs/reuse-assessment.md`.
