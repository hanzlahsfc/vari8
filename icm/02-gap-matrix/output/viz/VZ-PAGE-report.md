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

## Fix pass

Findings 1 to 7 from `VZ-REVIEW.md`, fixed in `template.html` and `build.py` only. `gap-matrix.html` rebuilt with `python3 build.py` (`sha256 5711fb216e92f2ec…`, byte-identical on a second run). `matrix.json` and `GAP-MATRIX.md` untouched. Probe PNGs and scripts stayed in `~/.hermes/cache/scratch/vz-review/` and `/tmp`.

### 1. Matrix colour meant two things

Cells now carry magnitude only. `build.py` computes a five step neutral slate ramp, `ramp("#1a2740","#dbe9f7")`, and calls `fg_for()` on every step, so the build fails rather than ship a fill that cannot hold 4.5:1 text. Status hue survives in three places only: the column header swatches, the two keys, and the bar segments.

| Cell fill | Text | Contrast |
|---|---|---|
| `#1a2740` | `#eef6fd` | 13.66:1 |
| `#4a586e` | `#eef6fd` | 6.61:1 |
| `#7a889c` | `#0a1120` | 5.23:1 |
| `#abb8c9` | `#0a1120` | 9.36:1 |
| `#dbe9f7` | `#0a1120` | 15.27:1 |

No cell fill equals any of the six status hexes, so `#9df2ff` no longer reads as MISSING. Segment text on the status fills measures 5.09, 5.89, 9.44, 14.88, 6.44 and 5.37:1.

### 2. Sideways scroll at 390 px

- Section 3 drops the 1040 px track. Under 640 px each surface is one full width row: name and total on line one, the stacked bar on line two, the numbers on line three as `UNWIRED 1 UNCONFIGURED 3 PARTIAL 21 MISSING 20`.
- Section 6 drops the 600 px SVG for a CSS waterfall of four columns at 100% width. Bar heights are percentages of the 342 peak, values sit above the marks, dashed connectors at 323, 342 and 338.
- The matrix keeps its `overflow-x:auto` wrapper, now a labelled region (`tabindex="0"`, `aria-label="Gap matrix table, 12 surfaces by 6 statuses"`), with `min-width:44px` cells and 44 px surface buttons.
- Both skip links and every filter control are 44 px tall.

Measured at 390 px: `.bars` overflow 0, `.wf` overflow 0, page overflow 0, matrix wrapper overflow 0. Targets under 44 px: 0 (was 58). Cells are 44 by 44.

At 390 px the matrix fits by hiding the surface name inside the row header (the id, `title` and `aria-label` carry it, and the explorer lists the full name). Names are visible from 601 px up. Below 375 px the table scrolls inside the labelled region rather than shrinking the targets.

### 3. Four claims that did not match the data

| Section | Was | Now | Source |
|---|---|---|---|
| 1 | "338 canvas elements need backend work" | "None of 338 elements is wired; 37 rows wait on a decision" | `wired` = 0, `blocked` = 30 CONFLICT + 7 ROLES |
| 3 | "S01 carries the most open rows at 45" (repeated section 2) | "Partial and missing rows make up 70% of the 338 rows" | (120 + 118) / 338 |
| 4 | "Decision #115 holds up 10 of 30 conflict rows" | "11 rows cite decision #115; 10 lead with it" | 11 rows mention #115, 10 name it first |
| 6 | "Four consent rows moved to the parked appendix" | "4 rows parked under D12, consent and cycle tracking. 2 more were judged parked and sit outside the count." | `parked` = 4 active + 2 `PARKED-D12` |

The two `R3-JUDGED` entries (G6-102, G6-504) now appear in the parked block, labelled as not counted.

Every headline is computed. A build from a mutated copy of the data (`/tmp/vz-mut.json`: delta 300 / +42 / -4, orphans 99) prints "Round 3 added 42 rows and parked 4", draws 300, +42, -4, 338 and shows 99 in the orphan tile. The string `323` does not survive in the output.

### 4. Section 4 read as a list

Six multi row decision groups are plotted as bars on the spine, width proportional to rows (#115 10/10, #96 4, #101, #112, #114, #116 at 2, D10 at 7). The top three carry an "Example row S06-07: …" gloss, wrapped in full instead of truncated at 78 characters. The eight single row decisions collapsed into one disclosure, "8 decisions hold one conflict row each", listing id and source. Every group is labelled by its source decision number, and D10 names the role rows.

### 5. Section 3 depended on colour

A six item key sits directly above the bars. Segments label themselves "PARTIAL 21" where the width allows and with the count alone where it does not; every one of the 53 segments carries an `aria-label` ("Partial, 21 rows"). No `title` tooltips remain in the bar chart (0 of 53).

### 6. Filters were late in the keyboard order

A second skip link, "Skip to filters", targets `#filters` (`tabindex="-1"`). Tab order now runs `A.skip` → `A.skip` → `DIV.scroll` (the labelled matrix region) → surface button → cells. Both links are 44 px tall and both rise to 8 px on focus. The `noscript` block hides the filters link with the filters.

### 7. Copy and small details

- Plural: `plural()` in the build. 0 of 65 aria labels match `1 rows`; 53 cells and 12 surface buttons pass through it.
- Placeholder: "Search text or id, e.g. S06-07 or nutrition…".
- Dash rule, settled once: page copy carries no em dash. Inside a quoted canvas string an em dash becomes a colon, which keeps the label shape of the source ("Training week: Completed sessions", "Client create: not drawn in canvas"); an en dash becomes a hyphen because the five affected strings use it for ranges ("09:00-18:00", "1-28d"). 0 em or en dashes remain outside the inlined JSON.
- Quotes stay straight. `unslop` rule 19 asks for straight quotes, and no visible copy wraps a quote in typographic marks, so the review's curly preference loses to the writing standard.
- Filter state lives in the hash: `#rows&s=S01&t=UNWIRED`, `#rows&s=S06&t=CONFLICT&q=nutrition`. Loading that URL restores both selects and the row count (11 of 338 for S06 + CONFLICT).

### Checks, re-run after the fixes

| Check | Result | Evidence |
|---|---|---|
| `measure-page.mjs` 1440 | PASS | min font 12 px, below 12 = 0, overlaps 0, text on lines 0, min contrast 4.59:1, below 4.5 = 0, docH 6734 |
| `measure-page.mjs` 390 | PASS | min font 12 px, below 12 = 0, overlaps 0, text on lines 0, min contrast 4.59:1, below 4.5 = 0, docH 10262 |
| Explorer rows | PASS | `li.r = 338` |
| Matrix cells | PASS | rendered `td` sum = 338 |
| Charts need no sideways scroll at 390 | PASS | `.bars` 0, `.wf` 0, page 0, matrix wrapper 0 |
| 44 px targets at 390 | PASS | 0 under 44; cell 44x44 |
| Cell and surface filters | PASS | S01/UNWIRED: 1 visible, `aria-pressed` 1, live "1 of 338 rows" |
| Clear restores | PASS | 338 visible |
| Deep link | PASS | `#rows&s=S06&t=CONFLICT` → 11 visible |
| Round 3 badges | PASS | 19 |
| Segments labelled and not clipped | PASS | 53 segments, 53 aria labels, 0 clipped |
| No JavaScript | PASS | 338 rows, 12 groups, filter bar `display:none` |
| External requests | PASS | 0 |
| Structure | PASS | 1 h1, 6 h2, 1 labelled region, 1 table caption, 20 `scope` headers |
| Word budget | PASS | 214 words of running prose (eyebrows, six headlines, six captions, the interaction note) |
| Colour blind | PASS | `contrast-cvd.py` on the six status hexes exits 0, min pair ΔE 14.5 (tritanopia) |
| Rebuild | PASS | two runs, same sha256 |

Not re-run: real screen reader pass, 200% zoom, a vision pass on the full page PNG (the 10262 px tall shot exceeds the vision API limit; sections were checked as element shots instead).
