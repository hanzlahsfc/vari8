# VZ-REVIEW: gap-matrix page, independent review

Reviewer did not build the page. Read-only on `gap-matrix.html` and `matrix.json`. Only this file was written. Probe output and scratch scripts sit in `~/.hermes/cache/scratch/vz-review/`.

Checked: 1440 and 390 px in headless Chromium (Playwright from the repo's `node_modules`, run from scratch), the design-nexus layout probe (`measure-page.mjs`), every rendered number against `matrix.json`, keyboard tab order and focus, text and non-text contrast, and a visual pass on the 1440 screenshot.

## Verdict: FIX

The data is right. Three things stop it shipping: the matrix uses colour with two meanings, two charts need sideways scrolling at 390 px, and four headline or caption claims overstate or misstate the data.

## Findings, ranked by impact

### 1. High. The matrix colour means two things

- Header swatches for the six statuses are `#2f64c8`, `#4c8dff`, `#00c8f0`, `#9df2ff`, `#8299b5`, `#536680`.
- Cell fills use a count ramp drawn from the same blues. S01 PARTIAL (21) and S01 MISSING (20) are both `#9df2ff`, the MISSING swatch colour.
- The CONFLICT and ROLES swatches (`#8299b5`, `#536680`) never appear in any cell. Grey headers sit over blue cells.
- The vision pass on the 1440 screenshot reached the same reading: cell shade reads as status, not magnitude.

**Fix:** pick one meaning per colour. Option A: cells use a single neutral count ramp (`--panel` to `--cyan-hi`), and status hue lives only in headers and bar segments. Option B: each column keeps its own hue, and only opacity steps by count. Option A is the smaller change.

### 2. High (390 px). Two charts depend on sideways scroll, and cells are too small

- Section 3 bar track is 1040 px inside a 350 px scroller. Section 6 waterfall SVG is 600 px inside a 350 px scroller. The labels on the far side are off-screen until scrolled.
- Neither scroller has `tabindex`, so keyboard users cannot scroll them.
- At 390 px the matrix cells are 27 to 28 px wide (44 px tall). 58 interactive targets are under 44 px, including the skip link (39 px tall). The builder's "44 px target on every cell" holds only at desktop width.

**Fix:** under 600 px, section 3 becomes one full-width stacked bar per surface with its numbers in a line below. Section 6 switches to a vertical waterfall at 100% width. Wrap the matrix in `overflow-x:auto` with `tabindex="0"` and an `aria-label`, and set cell `min-width: 44px`.

### 3. Medium-high. Four headline or caption claims do not match the data

- **Section 4, "Decision #115 holds up 10 of 30 conflict rows."** Eleven rows cite #115. V2-H2 is filed under #36 (`"#36, #115"`), so it is missing from the #115 group. **Fix:** headline "11 rows cite #115; 10 lead with it", or show V2-H2 under both decisions.
- **Section 6, "Four consent rows moved to the parked appendix."** S09-17 and V2-H4 are cycle-tracking rows, not consent. `matrix.json` lists six parked entries. The two `R3-JUDGED` entries (G6-102, G6-504) appear nowhere on the page. **Fix:** "Four rows parked under D12 (consent and cycle tracking). Two more were judged parked and are not counted."
- **Section 1, "338 canvas elements need backend work."** 37 rows (30 CONFLICT, 7 ROLES) wait on a decision, not on backend work. **Fix:** "None of 338 elements is wired. 37 wait on a decision."
- **Sections 2 and 3 repeat the same number.** Both headlines state S01 at 45, and section 3 re-plots the matrix totals. The brief asks each section to answer its own question. **Fix:** change section 3's question to status mix. Partial plus missing is 238 of 338 (70%), so "Partial and missing rows make up 70% of the work" is a finding section 2 does not give.

### 4. Medium. Section 4 reads as a list, and its labels and glosses are unreliable

- 9 of 14 decision groups hold one row each. The eye lands on #115 and then reads a long tail.
- Group labels mix forms: "#115", then "trusted runtime" (source is `# runtime-gate policy`), then "CALORIES" (source is a file citation).
- Each gloss is the note of the first row in its group, not decision text. "#115: No automatic totals or derived nutrition calculations" is S06-07's note. `icm/03-plan/DECISIONS.md` has no #115 entry (grep finds none).
- The CALORIES gloss is truncated: "...without new…" drops "evidence and approval".

**Fix:** plot the top three decisions as bars on the spine. Collapse single-row decisions into one line ("9 decisions, one row each") with the ids in an expandable list. Label every group by its source decision number. Either quote the decision's own text or prefix glosses with "example row:". Wrap long glosses instead of truncating.

### 5. Medium. Section 3 depends on colour alone

- Status names appear only in `title` tooltips, which keyboard and touch users cannot reach. The legend sits two sections up.
- Adjacent status hues differ by 1.6 to 1.7:1 in luminance. The blue ramp reads as an order (UNWIRED darkest, MISSING palest), but statuses are categories.

**Fix:** write the status name inside each segment wide enough to hold it ("PARTIAL 21"). Put a six-item key directly above the bars. Replace the tooltip values with visible or screen-reader text.

### 6. Medium-low. Keyboard reaches the filters late

- The matrix adds 65 tab stops (12 surface buttons, 53 cells) before the explorer. The skip link ("Skip to the 338 rows") jumps past the filter controls, so the filters are never reached by skip.

**Fix:** add a second skip link, "Skip to filters", or use a roving tabindex with arrow keys across the matrix grid.

### 7. Low. Copy and small accessibility details

- 13 aria-labels read "S01 unwired, 1 rows" (plural wrong).
- Search placeholder "element text or row id" does not end in "…" and gives no example pattern (web-design-guidelines).
- Five quoted UI strings had em or en dashes replaced by commas or hyphens. For example, `Training week — Completed sessions` displays as `Training week, Completed sessions`. The quoted text no longer matches the source. This is a deliberate trade-off against the no-em-dash rule. Decide it once, and if quotes stay verbatim, use `:` or `(` instead.
- Visible quotes are straight, not curly.
- Filter state (surface, status, search) is not in the URL, so a filtered view cannot be linked.

**Fix:** correct the plural with a `rows` / `row` switch. Use "…" and "e.g. S06-07 or nutrition" in the placeholder. Put filter state in the hash. Settle the dash rule for quoted strings.

## Verified and passing

- **Numbers.** All 338 rows match `matrix.json` by id, status, surface and element text (five dash exceptions are in finding 7). Round-3 badges: 19 of 19. Per-surface counts: 12 of 12. Matrix cells: 53 non-zero buttons, all equal to the summary. Bar segments: 12 bars, every segment equal to the summary. KPI tiles: 26 + 37 + 120 + 118 + 30 + 7 = 338. Surfaces S01 + S08 = 88. Waterfall: 323 + 19 − 4 = 338. Orphans: 82, equal to the JSON count. Conflicts: 30 across 14 decision labels. Roles: 7 ids match. Explorer: 338 rows, live region "338 of 338 rows".
- **Layout probe.** `measure-page.mjs` at both widths: minimum font 12 px, 0 overlaps, 0 text on lines, minimum contrast 4.59:1.
- **Contrast.** All text is at least 4.59:1 (the red "0 wired" at 64 px is the lowest). Body and label text is 6:1 or better.
- **Focus.** 2 px cyan ring, 2 px offset, about 9.4:1 against the void background. Visible on every cell and surface button.
- **Keyboard.** Every cell and surface button is reachable. Enter and Space filter. `aria-pressed` reflects state. Surface filter shows 28 rows, search "roster" shows 12, clear restores 338. No keyboard trap found.
- **Structure.** One h1, one h2 per section, labelled landmarks, labelled filter controls, `scope` on headers, table caption, `aria-hidden` on decorative swatches.
- **Visual forms.** Six sections, six forms: KPI tiles, heat table, stacked bars, decision spine, row list, SVG waterfall. Each uses a different form.

## Not verified

- No-JavaScript rendering (builder's claim, not re-run).
- Zoom to 200%.
- Real screen-reader pass (VoiceOver or NVDA).
- Absence of external requests (builder's claim; file:// load produced no request failures).

## Re-check

Per the brief, the page lane fixes findings 1 to 3 and reruns this check once. Findings 4 to 7 are optional for that pass.
