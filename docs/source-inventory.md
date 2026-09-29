# PRGRSS 2.0 — Source-to-UI Inventory (verified 2026-09-28)

> Redacted copy. This document is the committed, redacted version of the orchestrator
> inventory `SOURCE-INVENTORY.md`. Real client identifiers and health values have been
> replaced with placeholders; every replacement is recorded in
> `spec/redaction-manifest.json`. The original unredacted inventory remains outside this
> repository. Disclaimer, license, and footer text are preserved verbatim (explicitly
> allowed, not redacted).

Source: `/Users/apple/Downloads/PRGRSS 2.0 extracted/Copy of PRGRSS 2.0/` — 11 Google Sheets
HTML exports + `resources/` (sheet.css, 3 Google chart-runtime JS files, 12 images). This
source directory is **outside the repository** and contains real client data; it is never
copied in. Override its location with `SHEETS_SOURCE_DIR`.

## What the export preserves vs. loses

**Preserved:** cell values, text, merged regions, full visual styling (per-cell colors,
borders, fonts — Golos Text, dark theme `#191919`/`#282828`/`#e34332`), checkbox states
(rendered inline SVG, checked + unchecked), sparkline placeholder divs, images, frozen
row/column headers, the "HOW TO USE" manual, the medical disclaimer, license footer.

**Lost (not in export):** all formulas (values only), data-validation dropdowns/allowed
values, conditional-format rules, hidden rows/sheets, named ranges, the SALT/WATER TRACKER
tab referenced in the HOW TO USE, chart series definitions (sparkline config is a CSS
artifact only).

**Row counts vs. requirements claims (material gap):**

| Claimed        | Export contains                                              |
| -------------- | ------------------------------------------------------------ |
| ~990 exercises | **546** data rows (IDs 1–546), data ends at sheet row 549    |
| ~1,170 foods   | **599** foods (rows 4–602); rows 603+ are numbered but empty |

Either the xlsx genuinely holds ~half the claimed data, or rows were hidden/filtered at
export time. **The original `Copy of PRGRSS 2.0.xlsx` is required** to resolve this and to
recover formulas/validation. It is not currently available. Tracked as `TODO(product)` in
`docs/open-questions.md`.

## Sheet-by-sheet inventory

### DASHBOARD (727 non-empty cells; mostly a fixed layout over ~45 rows)

- Header strip: CURRENT WEEK (non-sensitive demo week label "WEEK 11", retained because the
  required Phase 11 test asserts it; the week range is not reproduced), CURRENT PHASE (demo
  phase label), CHECK-IN (weekday / TODAY).
- CLIENT & COACHING INFORMATION: full name, DOB, height, start date. (Values are real
  client data — see the redaction policy; none are reproduced in this document.)
- NUTRITION day-type table: HIGH/MEDIUM/LOW × (CALS, CHO g, PRO g, FAT g, WATER L).
- EXPENDITURE per day type: STEPS, CARDIO (min/WK), TRAINING (frequency %).
- BODY COMPOSITION section + a sparkline ("6 MONTHS" label; weight chart).
- COMPETITION SETUP table: SHOW / DIVISION / DATE / T-minus ("Show passed" states).
- HOW TO USE manual (verbatim text recovered) + medical disclaimer (Christian Kuess,
  "educational and entertainment purposes only", PRIVATE/CONFIDENTIAL) + license line:
  `© 2026 INFINITYCRE8 · Licensed to PRGRSS GmbH · License ID CK-2026-K8M3`.
- Mostly computed/linked cells — everything here is downstream of other sheets.

### DAILY TRACKER (11,894 non-empty cells; ~80 week blocks Mon–Sun, [REDACTED:date-range])

- Repeating block: `WEEK n` header → phase label row (HOLDING/REVERSE/RECOVERY/
  PRE PREP/PREP observed) → instruction row → 7 dated day rows → `Averages` row.
- Day columns (col index → field):
  - [5] weekday, [6] date
  - BODYWEIGHT: [9] weight kg, [10] weigh-in time
  - MENSES: [13] cycle day (auto-counts; "override 1 as menses occurs"), [14] PMS symptoms,
    [15] BBT °C, [16] E2 ([REDACTED:dose]), [17] PROG ([REDACTED:dose])
  - SLEEP: [19] duration, [20] quality score, [21] sleep time, [22] wake time
  - ACTIVITY: [24] steps, [25] cardio mins, [26] training session label (Push/Pull…),
    [27] training time
  - BIOFEEDBACK (all 1–10): [28] desire to train, [29] energy in gym, [30] mood in gym,
    [32] energy outside gym, [33] mood outside gym, [34] stress, [35] hunger, [36] adherence
  - BIOMETRICS: [38] RHR, [39] BP sys/dias, [40] blood glucose mmol/L
  - NUTRITION: [42] DAY LABEL (HIGH/MEDIUM/LOW), [43] carbs g, [44] protein g, [45] fats g,
    [46] CALORIES (marked "automatic" — formula lost), [47] salt g, [48] water L,
    [49] off-plan meal, [50] bowel movements (incl. a "4+" style count text)
  - NOTES: [52] coaches' notes, [53] client notes
- Averages row semantics observed: avg weight, weekly Δkg and Δ%, dominant cycle phase,
  avg sleep metrics ("no data" when empty), avg steps/cardio, session count
  ("2 sessions"/"no sessions"), avg biofeedback scores, avg RHR, avg BP ("0/0" empty),
  avg glucose, avg macros, salt/water averages, off-plan count. NOTE: water/salt averages
  appear swapped in export (columns [47]/[48], values [REDACTED:average-value]; headers say
  salt/water); verify against xlsx whether the column labels or the averaging is misaligned.
- Per-week target row shows prescribed values (steps, cardio, salt, water:
  [REDACTED:prescribed-target]) — driven from TIMELINE targets per phase.
- Contains demo data for a real client ([REDACTED:client-name]); treat as sensitive; likely
  a real client sheet, not only mock data.
- Checkboxes exist (CHECK-IN column area) — rendered as SVG, state preserved.

### TIMELINE (3,617 non-empty cells; ~40 week rows)

- Per-week columns: W counters (3 numbering systems: calendar wk, phase wk, total wk),
  FROM–TO dates, PHASE, ENERGY BALANCE (DEFICITE/MAINTENANCE observed), HORMON LEVELS
  (HRT/TRT+/TRT/PHYS./SUPRA labels), NOTES, COMP SETUP (show name, T-minus),
  BODYWEIGHT (⌀ weight, trend Δkg, Δ%), TARGETS (actual calorie intake, HIGH/MEDIUM/LOW
  cal targets, steps, cardio sessions × min → min/WK), CHANGES (NUTRITION / EXPENDITURE /
  TRAINING / PED'S / OTHER free-text), PED'S grid.
- PED'S fixed substance columns (24): HGH, BPC-157, TB500, LANUTS, NOVO, TEST, MAST,
  PRIMO, NPP, TREN, OXA, STAN., PROVI., CLEN, L-CAR., YHCL, T3, T4, E2, PROG, TELMI,
  METF., CIALIS — dose text per week ([REDACTED:dose]). (Column list is the workbook's
  fixed template schema, not client-specific values.)
- Header: "NEXT SHOW — Regional x 14 Weeks out +1 more Show".

### MEALPLAN (1,390 non-empty cells; 3 side-by-side day-type tables)

- OVERVIEW strip: target CALS/CHO/PRO/FAT/WATER per day type (HIGH/MEDIUM/LOW values
  [REDACTED:plan-totals] — these look like live plan sums, not the round target numbers
  seen in TIMELINE [REDACTED:prescribed-target]; flag discrepancy).
- LOW DAY / MEDIUM DAY / HIGH DAY tables, each with MEAL 1–9 (LOW table also has "PRE").
- Per food row: FOOD, AMOUNT, UNIT, CHO, PRO, FAT, CALS, NOTES — food names match the
  Nutrition Database (Corn Cakes, Oats, Whey Protein, Eggs Whole…).
- Per-meal subtotal row (e.g. "C | P | F | kcal" summary format) — computed, formula lost.

### MENSES (1,202 non-empty cells; mostly dashboard)

- Status strip: CURRENT CYCLE DAY ([REDACTED:cycle-day]), CURRENT PHASE
  ([REDACTED:cycle-phase]), AVG CYCLE LENGTH ([REDACTED:cycle-length]), NEXT PERIOD EST.
  ([REDACTED:date]), EST. OVULATION ([REDACTED:date]), [REDACTED:cycle-progress] progress +
  BBT sparkline.
- CYCLE PHASE GUIDE: MENSTRUAL days 1–5 / FOLLICULAR 6–13 / OVULATION day 14 /
  LUTEAL 15–28, each with descriptive text and an icon glyph.
- LAST CYCLES table: START date → CYCLE LENGTH ([REDACTED:cycle-history]).
- HRT SETUP table: compound (E2, PROG), DOSE ([REDACTED:dose]), FROM/TO cycle days
  ([REDACTED:cycle-day-range]) — this is what drives DAILY TRACKER's E2/PROG columns.
- All derived from DAILY TRACKER cycle columns — formulas lost; estimation logic unknown.

### TRAINING (7,095 non-empty cells; widest sheet, ~452 cols)

- PROGRAMMING header: name/nr, SCHEDULE 10-day rotation (DAY 1 PUSH, 2 PULL, 3 LEGS,
  4–5 rest?, 6 UPPER, 7 LOWER, 8 LEGS…), SPLIT "UPPER / LOWER", ROTATION LENGTH "10 DAYS",
  GOAL ([REDACTED:program-goal]), ADDITIONAL INFO with "MRP*1" markers (probably myo-rep notes).
- One block per scheduled day (PUSH/PULL/LEGS/UPPER/LOWER/LEGS populated; ~4 empty blocks).
- Per exercise row: NR, EXERCISE (names match Exercise Database), BRAND/MACHINE,
  TYPE (Straight Set/Drop Set), TEMPO (3010), NOTES.
- Then per week, WEEK 1–17: target SETS + REPS (e.g. "2 | 6-10"), plus logged S1–S4 each
  with WT and REP sub-rows, plus per-week NOTES. Two-row structure per exercise
  (WT row / REP row).

### PEAKING (3,601 non-empty cells; ~52 identical week blocks)

- Same week-block pattern as DAILY TRACKER but columns: DATE, NOTES, BODYWEIGHT→SETUP
  (enum TAPER/BASELINE/LOAD/DEPLETE/REFUEL/SHOW), CHECK-IN AM/PW/PM, AM WEIGHT, PM WEIGHT,
  WATER, SALT, STEPS, CARDIO, TRAINING, INTENSITY %, BIOFEEDBACK (stress, hunger only),
  CARBS/PROTEIN/FATS/CALORIES, BOWEL MOVEMENTS, Averages row.
- Only week 1 ([REDACTED:date-range]) has demo data; rest are empty templates.
- HOW TO USE: "If water or salt is not prescribed, record actual intake."

### SHOWDAY (1,082 cells; near-empty template)

- SHOW DAY INFO: NAME ([REDACTED:show-name]), DATE OF THE SHOW ([REDACTED:show-date]),
  DIVISION(S) (Fitmodel), EST. STAGE TIME (15:00), TANNING (07:00), HAIR/MAKE-UP (11:00),
  NOTES.
- TIME / INSTRUCTIONS run-sheet table — empty in export.

### SUPPLEMENTATION (1,056 cells; near-empty template)

- Columns: TIME / SUPPLEMENT / DOSAGE / STATUS; single "ACTIVE" status value shown.

### Exercise Database (4,974 cells; 546 rows)

- ID, Exercise Name, Muscle Group, Primary Target, Additional Target(s), Equipment,
  Movement Pattern, Position/Setup, Coaching Notes/Cues, Video Link (sparse).

### Nutrition Database (6,796 cells; 599 rows)

- NO., FOOD, AMOUNT, UNIT, CALORIES, PROTEIN, CARBS, FATS, COOKED/RAW/DRY
  (Cooked/Raw/Drained Weight), CAT (PRO/CHO/FAT/… categories).

## Cross-sheet wiring (from HOW TO USE + workflow report, not formulas)

- DAILY TRACKER → DASHBOARD (summaries), → MENSES (cycle day/BBT feed phase calc),
  → TIMELINE (⌀ weight/trend per week).
- DASHBOARD (coach targets) → TIMELINE per-period targets → DAILY TRACKER target row.
- NUTRITION DATABASE → MEALPLAN (food picker values); MEALPLAN sums → DASHBOARD targets.
- EXERCISE DATABASE → TRAINING (exercise picker).
- SUPPLEMENTATION / PEAKING / SHOWDAY: standalone tabs; no confirmed wiring.
- CRE8_PRGRSS2_Workflow_Report.html is **confirmed by the stakeholder transcript as Lilly's
  "zoomed out general mapping"** — the first half of the promised blueprint. She is still
  preparing "a finer schematic of every function/script that is in the backend" — i.e., the
  workbook's **Google Apps Script** backend. Until that lands, all computed-cell semantics
  (averages, calorie column, cycle-phase estimation, T-minus, MEALPLAN subtotals) stay
  TODO(product). The brief also covers a second workbook "CRE8" that was not supplied — its
  BACKEND/TARGET LOG/CHANGE LOG pattern is a design hint only, not build scope.

## Licensing/IP (flag, do not decide)

Every sheet footer: `© 2026 INFINITYCRE8 · Licensed to PRGRSS GmbH · License ID
CK-2026-K8M3 · Redistribution, resale or sublicensing prohibited.` The product embeds
licensed content (databases, layout, texts). Reuse is stakeholder-approved per handoff,
but the license terms for a shipped multi-tenant web app need explicit confirmation.
