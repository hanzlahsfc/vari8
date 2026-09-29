# Extraction contract

Defines the deterministic input/output contract for turning the 11 PRGRSS 2.0 HTML
exports into committed artifacts. Phase 7 defines and tests this contract and provides a
non-writing dry-run; parsing and artifact emission begin in Phase 8.

## Source handling

| Rule | Behavior |
|---|---|
| Source directory | `SHEETS_SOURCE_DIR`, defaulting to `/Users/apple/Downloads/PRGRSS 2.0 extracted/Copy of PRGRSS 2.0` (a trailing slash is normalized) |
| Override | Any non-empty `SHEETS_SOURCE_DIR` env var wins |
| Location | Must exist, be a directory, and be **outside the repository** — otherwise fail clearly (`SourceConfigError`) |
| Sheet coverage | All 11 expected exports must be present; missing files are reported and the run aborts, never silently skipped; unexpected `.html` files are reported |
| Writes | The extractor never writes into the source directory |

Raw/unredacted output is **opt-in** via `RAW_EXTRACTION_DIR`, must be git-ignored, and the
extractor fails closed (`git check-ignore`) otherwise.

## Sheet slugs

Deterministic mapping from file name to slug: trim, drop the `.html` extension, lowercase,
and collapse every run of non-alphanumeric characters to a single hyphen
(`slugifySheetFileName`).

| File | Slug |
|---|---|
| `DAILY TRACKER.html` | `daily-tracker` |
| `DASHBOARD.html` | `dashboard` |
| `TIMELINE.html` | `timeline` |
| `MEALPLAN.html` | `mealplan` |
| `SUPPLEMENTATION.html` | `supplementation` |
| `MENSES.html` | `menses` |
| `TRAINING.html` | `training` |
| `PEAKING.html` | `peaking` |
| `SHOWDAY.html` | `showday` |
| `Exercise Database.html` | `exercise-database` |
| `Nutrition Database.html` | `nutrition-database` |

## `spec/sheets/<slug>.json` — cell artifact

```ts
type ExtractionCell = {
  row: number;      // 1-based, top-left anchor
  col: number;      // 1-based, top-left anchor
  rowSpan: number;
  colSpan: number;
  class: string | null;            // source class attribute, or null
  text: string;                    // original text, preserved exactly
  normalized?: number;             // additive; ONLY when unambiguously numeric
  checkbox?: "checked" | "unchecked"; // ONLY when reliably derived from SVG markup
  todo?: string;                   // e.g. "TODO(product): ambiguous checkbox state"
};

type SheetArtifact = {
  slug: string;
  sourceFile: string;
  cells: ExtractionCell[];
  classes: Record<string, Record<string, string>>; // source class -> CSS declarations
  todos: string[];
};
```

Rules:
- **1-based** coordinates.
- **Merged cells:** a merged region is represented **once**, at its top-left anchor, with
  its `rowSpan`/`colSpan`. No cells are fabricated for the covered area; blank areas stay
  absent rather than invented.
- **Text preservation:** `text` is the exact source string, including German decimal commas
  (e.g. `"4,5"`). `normalized` is additive and set **only** when the value is unambiguously
  numeric; the original text is never altered.
- **Checkbox state:** captured only when reliably derived from the exported SVG
  (`#checked-checkbox-id` / `#unchecked-checkbox-id`). Ambiguous state is recorded as a
  `TODO(product)` note, never guessed.
- **Classes/CSS:** source class names map to their CSS declarations parsed from the export
  and `resources/sheet.css`.

## `spec/sheets/<slug>.summary.json` — section map

```ts
type SheetSummaryArtifact = {
  slug: string;
  sourceFile: string;
  cellCount: number;
  rowCount: number;
  colCount: number;
  spannedCellCount: number;
  sections: { label: string; row: number; col: number }[]; // curated static labels only
  repeatedBlocks: {
    kind: string;
    marker: string;
    count: number;
    distinctValues?: number;
    firstRow: number | null;
    lastRow: number | null;
  }[];
  todos: string[];
};
```

Evidence-based section/block map only. `sections` contains a **curated** set of static
template labels (never arbitrary cell text); `repeatedBlocks` reports safe marker counts
(e.g. `Averages` week-blocks, `WEEK n` column groups, `MEAL n`, `DAY n`). Patterns are never
forced onto a sheet whose source contradicts them; discrepancies become `TODO(product)`.

## `spec/data/*.json`

Committed reference databases (safe: no client health data). Columns are resolved from
the real header labels, not assumed.

- `foods.json` — `{ version, sourceFile, count, skippedNumberedRows, records }` where each
  record is `{ no, food, amount, unit, calories, protein, carbs, fats, state, category,
  normalized?, sourceRow }`.
- `exercises.json` — `{ version, sourceFile, count, records }` where each record is
  `{ id, name, muscleGroup, primaryTarget, additionalTargets, equipment, movementPattern,
  positionSetup, cues, videoLink, sourceRow }`.

Rules: source text preserved exactly (German commas included) with additive `normalized`
only when unambiguous; empty fields preserved as `""` (never fabricated); records keep
source-row order and `sourceRow` for traceability. Numbered-but-empty placeholder rows
(e.g. Nutrition IDs 601–660) and non-numeric footer rows are skipped (counted in
`skippedNumberedRows`). Expected counts are ~599 foods and ~546 exercises; a difference is
a warning, not a failure.

```sh
npm run extract:sheets -- --data-only   # writes only spec/data/foods.json + exercises.json
```

## `spec/theme.json`

```ts
type ThemeArtifact = {
  version: number;
  derivation: string;
  combinations: {
    background: string | null;
    text: string | null;
    border: string | null;
    font: string | null;
    seenIn: string[]; // sheet slugs
    count: number; // cells using the combination
  }[];
};
```

Distinct background/text/border/font combinations observed across the exports, with
documented derivation.

## `spec/cross-sheet.md`

Values appearing verbatim in two or more sheets, as **candidate** links only. A text match
does not prove a semantic relationship; links are labelled candidates. Only two safe value
classes are matched — reference-data names (foods, exercises) and curated static labels —
and locations are written as `slug:rROWcCOL`. Arbitrary values from client-bearing sheets are
never matched or printed (deferred until redaction in Phase 11).

## Redaction and `spec/redaction-manifest.json`

Committed artifacts **redact identifiers and preserve structure**:

- Replace client identifiers and health values with `[REDACTED:<category>]` placeholders;
  preserve cell coordinates, spans, classes, layout, and surrounding structure.
- Keep **disclaimer, license, and footer text verbatim and unredacted**.
- Manifest entries record `artifact`, optional `sheet`/`cell` or `section`, `fieldCategory`,
  `placeholder`, and `reason` — **never the original value**.
- Demo fixtures and tests use **synthetic** values, never the real client's values.
- Unredacted raw output is local-only via `RAW_EXTRACTION_DIR` (git-ignored, fail-closed).

## `TODO(product)` convention

Anything missing, ambiguous, or unsupported is recorded as `TODO(product)` (in `todos[]`
and/or `docs/open-questions.md`) rather than guessed. This includes lost formulas, ambiguous
checkbox state, unresolved structure, and any value not derivable from the export.

## Implementation status (Phase 8)

The generic parser (`lib/extraction/parse.ts`, `css.ts`, `normalize.ts`) is implemented
and exercised against all 11 real exports:

- resolves merged cells to a stable top-left anchor (no fabricated blanks);
- skips `<th>` chrome and `freezebar-cell` spacers so columns align with A/B/C…;
- preserves original text (German decimal commas included) and adds additive
  `normalized` values only when unambiguous;
- decodes checkbox state from the exported SVG, flagging unrecognised/conflicting
  state as `TODO(product)`;
- captures used source classes and their declarations from the inline `<style>` and
  `resources/sheet.css`.

**Committed, redacted `spec/sheets/**` artifacts are intentionally deferred** until the
redaction ruleset (identifiers/health values → placeholders) is implemented in a later
phase. Committing parsed sheet text now would expose real client data.

## Commands

```sh
# Non-writing: validate the source, parse all 11 sheets, print a coverage report.
npm run extract:sheets -- --dry-run

# Safe artifacts only: summaries + theme + cross-sheet (no cell dumps).
npm run extract:sheets -- --spec-only

# Reference databases only: spec/data/foods.json + spec/data/exercises.json.
npm run extract:sheets -- --data-only

# Opt-in: write UNREDACTED artifacts to a git-ignored RAW_EXTRACTION_DIR (fail-closed).
RAW_EXTRACTION_DIR=.local-raw npm run extract:sheets -- --raw
```

Both modes validate the source folder and the 11 sheets. `--raw` additionally requires a
git-ignored `RAW_EXTRACTION_DIR`; otherwise the run fails closed. Neither mode ever writes
into the source directory. Output is deterministic (stable ordering, LF, trailing newline).
