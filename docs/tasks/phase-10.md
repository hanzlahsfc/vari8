# Phase 10 task record — sheet structure, theme metadata, cross-sheet candidates

Status: **PASS** (see `docs/STATUS.md`).

## Scope

Create safe, deterministic structural summaries, theme metadata, and a candidate cross-sheet
report from the 11 source exports. No full cell dumps; no client identifiers or person-specific
health values committed or printed. Do not weaken raw-output/source guards.

## Deliverables

- `spec/sheets/<slug>.summary.json` ×11 — counts (cells/rows/cols/spanned), curated static
  section labels with coordinates, repeated-block markers with counts/distinct-value counts,
  and `TODO(product)` notes.
- `spec/theme.json` — 89 distinct (background, text, border, font) combinations with
  `seenIn` provenance and cell counts; CSS values only.
- `spec/cross-sheet.md` — 11 food and 5 exercise reference-data text matches and 18 shared
  static labels, with `slug:rROWcCOL` locations; client-bearing value matching intentionally
  omitted.
- `--spec-only` extraction mode (`scripts/extract-sheets.ts`) that writes only these safe
  artifacts.
- Modules: `lib/extraction/{summaries,theme,crosssheet}.ts`.

## Verified block structure

| Sheet         | Marker                          | Count / distinct |
| ------------- | ------------------------------- | ---------------- |
| daily-tracker | Averages week-blocks            | 82               |
| peaking       | Averages week-blocks            | 40               |
| training      | WEEK n column groups (distinct) | 17               |
| training      | DAY n blocks (distinct)         | 10               |
| mealplan      | day-type tables                 | 3                |
| mealplan      | MEAL n (distinct)               | 9                |

## Commands + real exit codes

```
npm run verify                                   → 0  (14 files, 89 tests)
npm run extract:sheets -- --spec-only            → 0  (11 summaries + theme + cross-sheet)
[--spec-only twice] diff -r summaries/theme/cross → 0  (byte-identical)
npm run extract:sheets -- --dry-run              → 0  (11 sheets, 811,938 cells, no writes)
```

Source directory untouched (verified by mtime); no unredacted output written.

## Privacy checks

- Summaries emit only curated static labels (every `section.label` ∈ the configured safe set)
  and counts/coordinates.
- Cross-sheet matches only reference-data names and safe labels; values are asserted to be a
  subset of those safe sets; non-safe values are dropped. No `@`/emails in artifacts.
- No cell dumps committed in this phase.

## Review

Independent fresh-context review: recorded in the phase report (see commit message and the
conversation record). Limitation: reviewer shares the builder's underlying model — not
model-diverse.

## Remaining TODO(product)

- Week/section boundaries are marker-inferred (`WEEK`/`Averages`/`DAY`/`MEAL`) and not
  confirmed against the xlsx.
- Committed redacted `spec/sheets/<slug>.json` cell artifacts remain deferred until the
  redaction ruleset lands.
- Filtering of `MEALPLAN`/`TRAINING` reference rows to exact source provenance is a text
  match only (semantic wiring unverified).
