# VZ-PAGE report: gap-matrix page lane

## Delivered

| File | What it is |
|---|---|
| `viz/template.html` | Shell: Nexus tokens, six section sockets, the filter layer. No data. |
| `viz/build.py` | Stdlib builder. Reads `viz/matrix.json` plus the template, renders every section at build time, inlines the JSON, writes `viz/gap-matrix.html`. |
| `viz/fixture.json` | Development fixture: the summary table from `GAP-MATRIX.md` plus 105 real rows, used before `matrix.json` landed. Not referenced by the page. |
| `viz/gap-matrix.html` | The page. 248 KB, single file, no external request, works from `file://`. |
| `viz/screenshots/vz-1440.png`, `vz-390.png` | Full-page renders from `measure-page.mjs`, plus its two JSON probes. |

`python3 build.py` (no arguments) regenerates the page from `viz/matrix.json`. Re-running it on unchanged data is byte-identical (`sha256 1c820d2e93ee1275…`), so a matrix change regenerates the page with no edits.

## The six sections

| # | Eyebrow | Form | Headline (as built) |
|---|---|---|---|
| 1 | 01 / SIZE | Two hero numbers plus a six-cell status readout | 338 canvas elements need backend work; none is wired |
| 2 | 02 / THE MATRIX | 12 × 6 heat matrix, count in every cell, count scale in five steps | The two largest surfaces hold 88 of 338 rows |
| 3 | 03 / WHERE THE WORK IS | Surfaces ranked by open rows, one stacked bar each, bar length = surface size, count on every segment | S01 carries the most open rows at 45 |
| 4 | 04 / WHAT BLOCKS WHAT | Decision tree on a cyan spine: decision, gloss, row ids left, count right; parked rows in a separate dashed block | Decision #115 holds up 10 of 30 conflict rows |
| 5 | 05 / EVERY ROW | 338 rows in 12 `<details>` groups, status, id, element text, R3 badge; filters on top | All 338 rows, grouped by surface |
| 6 | 06 / ROUND 3 | SVG waterfall 323 → +19 → −4 → 338 plus the orphan figure | Round 3 added 19 rows and parked 4 |

Interaction: a matrix cell (a `<button>` with `aria-pressed`) or a surface name filters the row list to that surface and status and moves focus to it. The filter bar adds surface, status and free text, with a live count. Without JavaScript the whole list still renders (all 338 rows, one group open) and the filter bar is hidden by `<noscript>`.

## Self-check

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `measure-page.mjs` at 1440 px: min font, overlaps, contrast | PASS | `{"W":1440,"docH":7244,"texts":507,"minFont":{"px":12},"below12":0,"overlaps":0,"onLine":0,"minContrast":{"ratio":4.59},"below45":0}` |
| 2 | `measure-page.mjs` at 390 px | PASS | `{"W":390,"docH":9918,"texts":582,"minFont":{"px":12},"below12":0,"overlaps":0,"onLine":0,"minContrast":{"ratio":4.59},"below45":0}` |
| 3 | Explorer shows 338 rows | PASS | `li.r = 338 (expected 338)` in headless Chromium, `file://` |
| 4 | Matrix cells sum to 338 | PASS | `cells = 338 (expected 338)` from the rendered `td` text |
| 5 | Cell click filters the list | PASS | clicked S01/UNWIRED: 1 visible (expected 1), `aria-pressed` 1, live text `1 of 338 rows` |
| 6 | Search and clear | PASS | search `roster` = 1 row, clear = 338, live `338 of 338 rows` |
| 7 | Keyboard focus on cells | PASS | tab order `BUTTON.sbtn > BUTTON.cellb`, first cell ring `2px solid rgb(0, 200, 240)` |
| 8 | Segment numbers not clipped | PASS | 53 segments, 53 labelled, 0 clipped (`scrollWidth <= clientWidth`) |
| 9 | No page-level horizontal scroll | PASS | `scrollWidth - innerWidth = 0` at 1440 |
| 10 | Round-3 rows marked | PASS | 19 R3 badges for 19 `round3` rows |
| 11 | No console errors | PASS | none captured over the run |
| 12 | Works without JavaScript | PASS | 338 rows, 12 groups, filter bar `display:none`, matrix totals 338 |
| 13 | Data inlined, no fetch | PASS | `<script type="application/json" id="data">` present; no `http(s)` src or href in the file |
| 14 | Status colours colour-blind safe | PASS | `contrast-cvd.py '#9df2ff' '#00c8f0' '#4c8dff' '#2f64c8' '#8299b5' '#536680'` exit 0; min pair ΔE 14.5 (tritanopia) |
| 15 | Rebuild reproduces the page | PASS | `python3 build.py` twice, same `sha256` |
| 16 | Word budget | PASS (see below) | 165 running prose words against about 230 |

Word count, stated precisely because the two measures differ:

- Running prose (eyebrows, six headlines, six captions, the one interaction note): **165 words**.
- Every token outside SVG and the row explorer, which adds surface names, row ids and 190 numeric labels: **627**.
- The skill's literal command on the whole page prints **5333**, because it counts the 338 element labels in the explorer, which the brief excludes from the budget.

## Skills and what each changed

`design-nexus` is the base and wins conflicts.

| Skill | Concrete change it drove |
|---|---|
| `design-nexus` | Tokens used verbatim; status colours taken from `--s1..--s5` plus `--faint` and passed through `contrast-cvd.py`; one vermillion mark only (the 0 wired), jade unused; mono eyebrows, numbered sections, hairline dividers; 12 px floor; direct labels, no legend for the waterfall; single self-contained file; zero em dashes outside the inlined JSON. |
| `hud-dashboard-design` | Readout strip instead of an eight-card grid; cyan spine with node dots for the blocker list, headline node enlarged with a ring; status codes and unit suffixes on the marks; second decorative tick ruler cut. |
| `creative-eye` | Three critique passes over the rendered PNGs. Fixed after those passes: every bar was the same length (bars now scale to the largest surface), status labels clipped in the readout, tree glosses truncated at 46 characters, `TOTA` clipped at 390 px, mid-word breaks in surface names. |
| `frontend-design` | One bold element per section, no accent-the-word headlines, decoration cut (rulers, second swatch column), sentence-case headings, deliberate asymmetry in the KPI row; type scale fixed at 12/13/14/15/20-27 px with tabular numbers. |
| `ui-ux-pro-max` | Priority table applied directly: contrast and keyboard first, 44 px targets on every matrix cell, filter control and summary row; no colour-only encoding; mobile-first breakpoints at 600 and 680 px. Its searchable database was not queried, because the house style already fixes palette, type and layout. |
| `web-design-guidelines` (guidelines fetched fresh) | Semantic HTML first: `table/th[scope]`, `details/summary`, `button`, one `h1`, skip link, `aria-live` filter count, `:focus-visible` rings, `color-scheme:dark`, `theme-color`, `tabular-nums`, `overflow-wrap` on long element strings, no `transition: all`. |
| `accessibility-review` | WCAG 2.1 AA pass: every matrix cell is a real button with an `aria-label` naming surface, status and count, zero cells are not focusable, `aria-pressed` states the filter, SVGs carry `aria-label`, table has a caption, filters have visible labels, 44 px targets, focus ring 2 px cyan at 9.4:1. |
| `unslop` | Copy rewritten for the page: no em dashes, no rule-of-three lists, no "not just X but Y", no adverb padding, no abstract nouns. Captions dropped from 781 words to 165 by deleting sentences that repeated a chart. |
| `webapp-testing` | `/tmp/vz-check.mjs`, run from `/tmp` against the repo's Playwright copy, drives headless Chromium over `file://` for checks 3 to 11 above, plus a JavaScript-disabled context for check 12. |

## Decisions worth knowing

- The matrix cell fill is a count scale, not a status hue, so a cell's shade does not match its column colour. Each column header carries a status swatch and a code, and every cell prints its number.
- Closed `<details>` groups get `display:none` in CSS so the layout probe measures only rendered rows, and so a collapsed list cannot report phantom overlaps.
- The role block is labelled `D10` in the matrix and the bar chart, because its rows are the owner's role cells, not a surface; the full name appears in the explorer.
- The bar chart needs a 1040 px track to keep numbers inside every segment, so it scrolls sideways below about 1080 px. The count is also in the matrix cell for each segment.
- Element strings are source text; em and en dashes inside them are normalised to commas and hyphens at render time, so the visible page carries none.
