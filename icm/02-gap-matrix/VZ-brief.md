# Gap matrix visual brief (VZ lanes)

Goal: one self-contained HTML page that shows Marcel the Vari8 gap matrix at a glance and lets him drill into every row. Nexus house style.

All paths under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/`. Source of truth: `icm/02-gap-matrix/output/GAP-MATRIX.md` (338 rows, round 3 folded in). Surface names: the surface table in `icm/02-gap-matrix/F1-card.md` (S01 to S12). Status meanings: `icm/02-gap-matrix/CONTEXT.md`. Owner decisions: `icm/03-plan/DECISIONS.md`. Output folder: `icm/02-gap-matrix/output/viz/` (create it). Write nothing else in the repo; never run formatters or installs in the repo.

## Data contract: `viz/matrix.json`

```json
{
  "source": "icm/02-gap-matrix/output/GAP-MATRIX.md",
  "generated": "<ISO date>",
  "statuses": [
    "UNWIRED",
    "UNCONFIGURED",
    "PARTIAL",
    "MISSING",
    "CONFLICT",
    "ROLES"
  ],
  "surfaces": [
    {
      "id": "S01",
      "name": "Coach shell, navigation, client roster, client profile"
    }
  ],
  "summary": {
    "S01": {
      "UNWIRED": 1,
      "UNCONFIGURED": 3,
      "PARTIAL": 21,
      "MISSING": 20,
      "CONFLICT": 0,
      "ROLES": 0,
      "total": 45
    }
  },
  "totals": {
    "UNWIRED": 26,
    "UNCONFIGURED": 37,
    "PARTIAL": 120,
    "MISSING": 118,
    "CONFLICT": 30,
    "ROLES": 7,
    "total": 338
  },
  "rows": [
    {
      "id": "S01-01",
      "surface": "S01",
      "status": "PARTIAL",
      "element": "...",
      "detail": "S01-*.md",
      "round3": false,
      "decision": null
    }
  ],
  "conflicts": [
    { "id": "...", "decision": "<binding decision it hits>", "note": "..." }
  ],
  "roles": [{ "id": "...", "doc_rule": "...", "code_rule": "..." }],
  "parked": [{ "id": "...", "old_status": "...", "note": "..." }],
  "orphans": { "count": 82, "items": [{ "id": "...", "note": "..." }] },
  "delta": { "before": 323, "round3_added": 19, "parked": 4, "after": 338 }
}
```

Rows come from the per-surface tables (`### S01 surface` to `### S11 surface`) plus the `ROLES decision (round 3)` rows. `round3` is true for ids starting `R3-`. Fill `decision` for CONFLICT and ROLES rows from the CONFLICT and ROLES sections.

## Page: `viz/gap-matrix.html`

Load the `design-nexus` skill (`skill_view("design-nexus")`) and its `references/visual-grammar.md` and `references/svg-recipes.md` before writing CSS. Use its tokens exactly: deep blue void, cyan accent, jade only for verified/go, vermillion only for the single warning. Status colours: pick a 6-step set from the skill's viz-only `--s1..--s5` plus one neutral, run `python3 ~/.hermes/skills/creative/design-nexus/references/contrast-cvd.py <hexes>` (must exit 0), and never use colour as the only cue (status name or letter on every mark).

Sections, each a different visual form, each with mono eyebrow, a finding-with-number headline (max 12 words) and a 1 to 2 sentence caption that explains the mechanism:

1. KPI strip: 338 rows, 0 WIRED, and the count per status.
2. The matrix: surfaces (rows, with names) by status (columns), every cell shows its count, cell shade scales with count. Clicking a cell (or a surface) filters section 5.
3. Where the work is: surfaces ranked by open rows, one stacked bar each, numbers on the segments.
4. Decisions that block work: CONFLICT and ROLES rows grouped by the decision they hit, as a flow or tree (decision on the left, row count and ids on the right). Parked consent rows shown as a small separate group labelled parked (D12).
5. Row explorer: every one of the 338 rows, grouped by surface in `<details>` blocks (works without JS), with status chip, id, element text. A small JS layer adds filter by surface and status and a text search. Round-3 rows marked `R3`.
6. Round 3 delta: 323 to 338 as a waterfall (plus 19, minus 4 parked), and the orphan count (82) as a single figure.

Rules: single file, data inlined (no fetch), works from `file://`, mobile-first 360 to 1440 px, no em dashes, no emoji, no gold, plain English. Word budget outside SVG and the row explorer: about 230 words. Sticky slim top bar with a small Nexus monogram and the label `VARI8 / GAP MATRIX`; Vari8 is the subject, Nexus is the brand. Footer: one source line naming `GAP-MATRIX.md` and the date.

## Build mechanism

`viz/build.py` (stdlib only) reads `viz/matrix.json` and `viz/template.html` and writes `viz/gap-matrix.html` with the JSON inlined in a `<script type="application/json" id="data">` block; the page renders sections from that data. Re-running it after the matrix changes must regenerate the page.

## Checks (each lane appends `## Self-check` with PASS or FAIL and evidence to `viz/<lane>-report.md`)

- Data lane: per-surface and per-status counts in `matrix.json` equal the summary table in `GAP-MATRIX.md` (a small assert script, `viz/check_data.py`, exit 0), 338 rows, every row id unique, every CONFLICT and ROLES row has a decision.
- Page lane: `node ~/.hermes/skills/creative/design-nexus/references/measure-page.mjs <abs path> vz` at 1440 and 390 px reports min font >= 12 px, 0 overlaps, min contrast >= 4.5; the word count command from the skill is within budget; the rendered page shows 338 rows in the explorer and the matrix cells sum to 338 (check in headless Chromium with Playwright from the repo's `node_modules`, run from `/tmp`, not by eye).

## Skills for the page (owner request: outstanding visual report)

Load with `skill_view` and apply: `design-nexus` (base, wins conflicts), `hud-dashboard-design`, `creative-eye`, `frontend-design` (fallback `/home/nexuslink/.hermes/cache/scratch/pr-bundle/pr-pipeline-frontend/skills/frontend-design/SKILL.md`), `ui-ux-pro-max`, `web-design-guidelines`, `accessibility-review` (WCAG AA, keyboard focus on cells and filters), `unslop` (fallback `/home/nexuslink/projects/cursor-plugins/pstack/skills/unslop/SKILL.md`) on all copy, `webapp-testing` for the headless checks. The report lists each skill and the change it drove.

## Review lane (after the page lands, different worker)

A reviewer that did not build the page loads `creative-eye`, `accessibility-review`, `web-design-guidelines` and `design-nexus`, opens the page headless at 1440 and 390 px, checks every number on the page against `matrix.json`, and writes `viz/VZ-REVIEW.md`: findings ranked by impact with a fix per finding. The page lane fixes, then the reviewer re-checks once.
