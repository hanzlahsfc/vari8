# Phase 12 task record — final verification and delivery

Status: **PASS** (see `docs/STATUS.md`).

## Scope delivered
The repository foundation and the spreadsheet-source **extraction** pipeline only. This is
**not** the finished workbook UI, and it does not reproduce formulas/validations/hidden
rows that are absent from the HTML export (see limitations).

## Audited state at start
- Branch `main`; local HEAD == GitHub `main` == `e6cdcb72d823e6d8301df05eb6f99c9fc18a94f2`
  (Phase 11), clean tree. Prime State untouched (`aa59905`).

## Final audit results (counts/categories only; no values printed)
- Artifacts present and schema-valid: `spec/sheets/<slug>.json` ×11, `<slug>.summary.json` ×11,
  `spec/theme.json`, `spec/cross-sheet.md`, `spec/data/{foods,exercises}.json`,
  `spec/redaction-manifest.json`.
- Redaction: 811,938 cells — 11,052 kept, 20,856 redacted, 780,030 empty. Manifest bijective
  with redacted cells (20,856 cell entries + 22 document entries); 0 leaked `normalized`/`todo`.
- Privacy: 0 client-name files, 0 DOB files, 0 real emails (only synthetic `example.com`/
  `example.invalid` test addresses), 0 vendor-domain tokens in tracked files or published
  history. No source exports / raw output / `.env` / secrets in tracked files or history.
- Guards: `--raw` (no dir) → exit 1; `RAW_EXTRACTION_DIR=spec/sheets --raw` → exit 1; `.env`
  git-ignored; 0 raw dirs tracked.
- Determinism: `--redacted` twice → `spec/sheets` and manifest diffs empty.

## Narrow fix: MENSES cycle-phase guide
- Investigated privately: the `CYCLE PHASE GUIDE` block (phase names, `Days 1-5`..`Days 15-28`,
  generic descriptions, glyphs) is generic static product copy, while client values sit in the
  status strip (row 7), `LAST CYCLES`, and `HRT SETUP` (rows 26+).
- Correction: keep the guide via a **source-located region** anchored on the `CYCLE PHASE GUIDE`
  label (`mensesGuideRegion`), not a global word allowlist; client values outside the region
  remain redacted. Regression test added in `tests/unit/redact.test.ts`.
- Effect: kept +23, redacted −23 (11,029→11,052 kept; 20,879→20,856 redacted; manifest
  20,901→20,878).

## Size assessment
- Measured: `spec/sheets` ≈ 99 MB (training 33 MB, menses 16 MB, timeline 12 MB),
  `spec/redaction-manifest.json` ≈ 6.8 MB, `spec/data` ≈ 448 KB.
- Dominated by 780,030 preserved empty cells. Not reduced, to preserve the documented
  structure exactly; left as a noted limitation.

## Gates + real exit codes
```
npm run verify                            → 0  (16 files, 106 tests)
npm run extract:sheets -- --redacted      → 0
[--redacted twice] sheets/manifest diffs  → 0
npm run extract:sheets -- --dry-run       → 0
npm run extract:sheets -- --data-only     → 0
npm run extract:sheets -- --spec-only     → 0
--raw (no dir) → 1 ; RAW_EXTRACTION_DIR=spec/sheets --raw → 1
```

## Conditional vs reproducible checks
- **Reproducible without source:** all `tests/unit` except the `*-real` suites; committed
  artifact byte-equality is asserted by those real suites (which skip when the external source
  folder is absent), so a source-less CI enforces schema/shape but not real counts.
- **Local-only (needs the external exports):** real-sheet parsing/redaction counts, checkbox
  counts, and committed-vs-regenerated equality.

## Review
Independent fresh-context review of the final state recorded in the report. Limitation:
reviewer shares the builder's underlying model — not model-diverse.

## Remaining TODO(product) / out of scope
- Missing `Copy of PRGRSS 2.0.xlsx`: formulas, validations, hidden rows, named ranges.
- Formula semantics (calories, averages, cycle estimation, T-minus, meal subtotals), water/salt
  average swap, sparkline config, SUPPLEMENTATION/PEAKING/SHOWDAY wiring.
- Product name/branding, licence terms, PED/HRT policy, i18n.
- The workbook UI, interactions, and data relationships are a separate roadmap (not Phase 12).
