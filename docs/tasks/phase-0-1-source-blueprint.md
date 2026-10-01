# Phase 0.1 — PRGRSS source blueprint & Daily Tracker specification

**Documentation and source analysis only — no application code, schema, migration,
dependency, route, UI, or import change.** Builder: SWE-2 High. Branch
`feature/phase-0-1-source-blueprint` off verified `main` `fc2c936`.

**Scope:** build a concise, auditable blueprint of the PRGRSS 2.0 sources actually
available, a field-level Daily Tracker crosswalk, an explicit list of unknowns, an
inventory of the remaining sheets, and acceptance criteria for the first Daily Tracker
slice. Product name remains **undecided** (`App` placeholder). `TRACKER 2.0.md` and any
workbook contents stay out of Git.

**Evidence labels used below:** **CONFIRMED** = present in a committed artifact or directly
observed in the source; **INTERPRETATION** = reasonable reading, not proven by a formula or
decision; **UNKNOWN** = not derivable from the available sources (recorded, never guessed).

## 0. Sources inspected

| Source                                               | Path                                                              | Status                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| PRGRSS HTML exports (11) + `resources/`              | `/Users/apple/Downloads/PRGRSS 2.0 extracted/Copy of PRGRSS 2.0/` | **Accessible** (outside the repo; contains real client data)                                               |
| Prime Tracker Pro requirements                       | `/Users/apple/Downloads/PRIME-TRACKER-PRO-REQUIREMENTS.md`        | **Accessible** (requirements draft; first line is a stray chat fragment, not requirement text)             |
| CRE8 input-flow overview                             | `/Users/apple/Downloads/CRE8_Input_Flow_Overview.html`            | **Accessible** — documents **CRE8 only**, explicitly excludes PRGRSS 2.0; **not used** to fill PRGRSS gaps |
| Original `Copy of PRGRSS 2.0.xlsx`                   | —                                                                 | **Inaccessible / not supplied**                                                                            |
| PRGRSS Apps Script backend / Lilly's finer schematic | —                                                                 | **Inaccessible / not supplied**                                                                            |
| `SCRIPT_CRE8.gs`                                     | —                                                                 | **Inaccessible / not supplied**                                                                            |

Committed repository artifacts re-used as evidence (already redacted): `docs/source-inventory.md`,
`spec/sheets/*.summary.json`, `spec/sheets/daily-tracker.json`, `spec/data/*.json`,
`docs/open-questions.md`, `docs/implementation-plan.md`, `docs/extraction-contract.md`.

## 1. Manifest of PRGRSS files/sheets found

**Format:** every sheet is a **Google Sheets HTML export** (`<table class="waffle">`), not a
workbook. `resources/` holds the export's CSS, Google Charts runtime JS, and images.

| #   | File                                                                                                                         | Sheet (slug)       | Format                   | Bytes               | Formulas/scripts                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------ | ------------------- | -------------------------------- |
| 1   | `DASHBOARD.html`                                                                                                             | dashboard          | HTML export              | 1,237,821           | Absent                           |
| 2   | `DAILY TRACKER.html`                                                                                                         | daily-tracker      | HTML export              | 1,650,259           | Absent                           |
| 3   | `TIMELINE.html`                                                                                                              | timeline           | HTML export              | 2,242,312           | Absent                           |
| 4   | `MEALPLAN.html`                                                                                                              | mealplan           | HTML export              | 2,101,987           | Absent                           |
| 5   | `SUPPLEMENTATION.html`                                                                                                       | supplementation    | HTML export              | 709,376             | Absent                           |
| 6   | `MENSES.html`                                                                                                                | menses             | HTML export              | 2,807,504           | Absent                           |
| 7   | `TRAINING.html`                                                                                                              | training           | HTML export              | 6,179,196           | Absent                           |
| 8   | `PEAKING.html`                                                                                                               | peaking            | HTML export              | 831,848             | Absent                           |
| 9   | `SHOWDAY.html`                                                                                                               | showday            | HTML export              | 742,679             | Absent                           |
| 10  | `Exercise Database.html`                                                                                                     | exercise-database  | HTML export              | 740,327             | Absent                           |
| 11  | `Nutrition Database.html`                                                                                                    | nutrition-database | HTML export              | 885,848             | Absent                           |
| —   | `resources/sheet.css`                                                                                                        | —                  | CSS                      | 4,282,874           | —                                |
| —   | `resources/1938708465-ChartsExportJ2cl_j2cl_core.js`, `…Bootstrap_bootstrap_core.js`, `…RitzChartRenderingJ2cl_j2cl_core.js` | —                  | Google Charts runtime JS | 9,030–1,332,357     | Runtime only; not workbook logic |
| —   | `resources/image_*.jpg` (9), `resources/cellImage_*_1.jpg` (2), `resources/cellImage_824781815_0.jpg`                        | —                  | JPEG                     | ~1.38 MB / ~0.41 MB | —                                |

**Confirmed source facts**

- **Formulas are absent** — the export is values-only. Data-validation dropdowns, conditional
  formats, hidden rows/sheets, and named ranges are also absent (`spec/sheets/daily-tracker.summary.json`
  `todos`; `docs/source-inventory.md` "What the export preserves vs. loses").
- **No Apps Script / `.gs`, no `.xlsx`, no `.csv`, no `.json`** exist in the source folder
  (verified by `find`).
- **Counts below the requirements' claims:** export holds **546** exercise rows and **599**
  food rows vs. the requirements' ~990 / ~1,170 (`docs/source-inventory.md`; `docs/open-questions.md` #1).
- **Two referenced images are missing:** `cellImage_2050288505_0.jpg` and
  `cellImage_227302925_0.jpg` (`docs/open-questions.md` #2). The `_1` variants exist.
- The **CRE8** overview is a different workbook and does not document PRGRSS 2.0.

## 2. Daily Tracker — field-level crosswalk

Source: `DAILY TRACKER.html`; column indices and section grouping are from the committed redacted
inventory (`docs/source-inventory.md` §DAILY TRACKER). I independently confirmed every label below
is present in the source HTML (each header label appears **82×**, once per week block). The
committed `spec/sheets/daily-tracker.json` **redacted the field-header row** (row 10) to
`[REDACTED:client.daily-entry]`, so the artifact alone cannot recover labels — the HTML and the
inventory are the label source (recorded in §3).

Sheet geometry (`spec/sheets/daily-tracker.summary.json`): `cellCount` 38,762, `rowCount` 1,002,
`colCount` 54, `spannedCellCount` 5,334; **82** `Averages` week blocks (`WEEK n` headers distinct
82). Repeating block = `WEEK n` header → phase/instruction row → 7 dated day rows → `Averages` row.

Legend: **Type** is the observed/interpreted shape; **Req?** and **Validation** are **UNKNOWN**
unless stated (no validation survives the export).

| Section (row-8 header)             | Col | Label (verified in HTML) | Type                    | Units                          | Req?    | Validation                     | Relationships                                                    | Calc/wiring                                  |
| ---------------------------------- | --- | ------------------------ | ----------------------- | ------------------------------ | ------- | ------------------------------ | ---------------------------------------------------------------- | -------------------------------------------- |
| DATE & PHASE (c3)                  | 5   | weekday                  | text                    | —                              | UNKNOWN | UNKNOWN                        | week/date grouping                                               | none documented                              |
| DATE & PHASE                       | 6   | date                     | date                    | —                              | UNKNOWN | UNKNOWN                        | anchors the day row; feeds week block                            | none documented                              |
| BODYWEIGHT (c7)                    | 9   | WEIGHT                   | number                  | kg (INTERPRETATION)            | UNKNOWN | UNKNOWN                        | feeds TIMELINE ⌀/Δ and DASHBOARD chart (documented, not formula) | average/Δkg/Δ% **UNKNOWN**                   |
| BODYWEIGHT                         | 10  | Weigh-in (time)          | time                    | —                              | UNKNOWN | UNKNOWN                        | none documented                                                  | none documented                              |
| MENSES (c11)                       | 13  | cycle day                | integer                 | day                            | UNKNOWN | UNKNOWN                        | feeds MENSES sheet (documented)                                  | "auto-counts" — formula **UNKNOWN**          |
| MENSES                             | 14  | PMS (symptoms)           | text                    | —                              | UNKNOWN | UNKNOWN                        | MENSES sheet                                                     | none documented                              |
| MENSES                             | 15  | BBT                      | number                  | °C (INTERPRETATION)            | UNKNOWN | UNKNOWN                        | MENSES phase/ovulation calc (documented)                         | estimation **UNKNOWN**                       |
| MENSES                             | 16  | E2                       | text (dose)             | —                              | UNKNOWN | UNKNOWN                        | driven by MENSES HRT SETUP (documented)                          | none documented                              |
| MENSES                             | 17  | PROG                     | text (dose)             | —                              | UNKNOWN | UNKNOWN                        | driven by MENSES HRT SETUP (documented)                          | none documented                              |
| SLEEP (c17)                        | 19  | DURATION                 | number/time             | UNKNOWN (h or min)             | UNKNOWN | UNKNOWN                        | averages row                                                     | average rule **UNKNOWN**                     |
| SLEEP                              | 20  | Sleep Score              | number                  | score                          | UNKNOWN | UNKNOWN                        | averages row                                                     | average rule **UNKNOWN**                     |
| SLEEP                              | 21  | SLEEP TIME               | time                    | —                              | UNKNOWN | UNKNOWN                        | none documented                                                  | none documented                              |
| SLEEP                              | 22  | WAKE TIME                | time                    | —                              | UNKNOWN | UNKNOWN                        | none documented                                                  | none documented                              |
| ACTIVITY (c22)                     | 24  | STEPS                    | integer                 | steps                          | UNKNOWN | UNKNOWN                        | target row from TIMELINE (documented)                            | average rule **UNKNOWN**                     |
| ACTIVITY                           | 25  | CARDIO                   | number                  | minutes                        | UNKNOWN | UNKNOWN                        | target row (min/WK) from TIMELINE                                | average rule **UNKNOWN**                     |
| ACTIVITY                           | 26  | TRAINING (session label) | text                    | —                              | UNKNOWN | UNKNOWN                        | session count in averages; TRAINING sheet (interpretation)       | count rule **UNKNOWN**                       |
| ACTIVITY                           | 27  | (training) TIME          | time                    | —                              | UNKNOWN | UNKNOWN                        | none documented                                                  | none documented                              |
| BIOFEEDBACK (c30)                  | 28  | DESIRE TO TRAIN          | integer 1–10            | score                          | UNKNOWN | 1–10 observed (INTERPRETATION) | averages row                                                     | average rule **UNKNOWN**                     |
| BIOFEEDBACK                        | 29  | ENERGY IN GYM            | integer 1–10            | score                          | UNKNOWN | 1–10 observed                  | averages row                                                     | **UNKNOWN**                                  |
| BIOFEEDBACK                        | 30  | MOOD IN GYM              | integer 1–10            | score                          | UNKNOWN | 1–10 observed                  | averages row                                                     | **UNKNOWN**                                  |
| BIOFEEDBACK                        | 32  | ENERGY OUTSIDE (gym)     | integer 1–10            | score                          | UNKNOWN | 1–10 observed                  | averages row                                                     | **UNKNOWN**                                  |
| BIOFEEDBACK                        | 33  | (MOOD) OUTSIDE GYM       | integer 1–10            | score                          | UNKNOWN | 1–10 observed                  | averages row                                                     | **UNKNOWN**                                  |
| BIOFEEDBACK                        | 34  | STRESS                   | integer 1–10            | score                          | UNKNOWN | 1–10 observed                  | averages row                                                     | **UNKNOWN**                                  |
| BIOFEEDBACK                        | 35  | HUNGER                   | integer 1–10            | score                          | UNKNOWN | 1–10 observed                  | averages row                                                     | **UNKNOWN**                                  |
| BIOFEEDBACK                        | 36  | ADHERENCE                | integer 1–10            | score                          | UNKNOWN | 1–10 observed                  | averages row                                                     | **UNKNOWN**                                  |
| BIOMETRICS (c36)                   | 38  | RHR                      | integer                 | bpm (INTERPRETATION)           | UNKNOWN | UNKNOWN                        | averages row                                                     | average rule **UNKNOWN**                     |
| BIOMETRICS                         | 39  | BLOOD PRESSURE           | text                    | mmHg sys/dias (INTERPRETATION) | UNKNOWN | UNKNOWN                        | averages row ("0/0" when empty)                                  | average rule **UNKNOWN**                     |
| BIOMETRICS                         | 40  | BLOOD GLUCOSE            | number                  | mmol/L (INTERPRETATION)        | UNKNOWN | UNKNOWN                        | averages row                                                     | average rule **UNKNOWN**                     |
| (nutrition; no row-8 header found) | 42  | LABEL (day label)        | enum                    | HIGH/MEDIUM/LOW (observed)     | UNKNOWN | enum observed (INTERPRETATION) | selects DASHBOARD/MEALPLAN day-type plan (documented)            | none documented                              |
| (nutrition)                        | 43  | CARBS                    | number                  | g                              | UNKNOWN | UNKNOWN                        | vs. target from TIMELINE/DASHBOARD                               | sum/average rule **UNKNOWN**                 |
| (nutrition)                        | 44  | PROTEIN                  | number                  | g                              | UNKNOWN | UNKNOWN                        | vs. target                                                       | **UNKNOWN**                                  |
| (nutrition)                        | 45  | FATS                     | number                  | g                              | UNKNOWN | UNKNOWN                        | vs. target                                                       | **UNKNOWN**                                  |
| (nutrition)                        | 46  | CALORIES                 | number                  | kcal                           | UNKNOWN | UNKNOWN                        | marked "automatic"                                               | formula **UNKNOWN** (`open-questions.md` #3) |
| (nutrition)                        | 47  | SALT                     | number                  | g                              | UNKNOWN | UNKNOWN                        | target row from TIMELINE                                         | average appears swapped (`#8`)               |
| (nutrition)                        | 48  | WATER                    | number                  | L                              | UNKNOWN | UNKNOWN                        | target row from TIMELINE                                         | average appears swapped (`#8`)               |
| (nutrition)                        | 49  | OFF-PLAN                 | text/flag               | —                              | UNKNOWN | UNKNOWN                        | off-plan count in averages                                       | count rule **UNKNOWN**                       |
| (nutrition)                        | 50  | BOWEL MOVEMENTS          | text (incl. "4+" count) | —                              | UNKNOWN | UNKNOWN                        | averages row                                                     | **UNKNOWN**                                  |
| NOTES (c51)                        | 52  | Coaches (notes)          | text                    | —                              | UNKNOWN | UNKNOWN                        | coach view                                                       | none documented                              |
| NOTES                              | 53  | Client Notes             | text                    | —                              | UNKNOWN | UNKNOWN                        | client view                                                      | none documented                              |

Additional observed structure (INTERPRETATION, from `docs/source-inventory.md`): a per-week
**target row** shows prescribed steps/cardio/salt/water (driven from TIMELINE per phase), and a
CHECK-IN checkbox area exists in the day columns (SVG-rendered checkboxes; exact semantics
UNKNOWN). The `Averages` row carries weight average + Δkg/Δ%, dominant cycle phase, sleep
averages ("no data" when empty), steps/cardio averages, session count ("no sessions"), biofeedback
averages, RHR/BP/glucose averages, macro averages, salt/water averages, off-plan count — **all
value-only; rules UNKNOWN**.

## 3. Unknown, conflicting, or unverified rules (and what would resolve each)

| #   | Item                                                                                                                     | Status                        | Resolving source/decision                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| U1  | All formulas (calorie column, averages/trends, Δkg/Δ%, cycle-phase estimation, T-minus, MEALPLAN subtotals)              | UNKNOWN                       | Original `Copy of PRGRSS 2.0.xlsx` and/or Lilly's Apps Script backend schematic (`open-questions.md` #1, #3–#7, #9) |
| U2  | Field required/optional status and every data-validation rule (dropdowns, ranges)                                        | UNKNOWN (lost in export)      | Original `.xlsx`                                                                                                    |
| U3  | Exact units for SLEEP DURATION, BP format, glucose, BBT, weigh-in/training times                                         | UNKNOWN (INTERPRETATION only) | Original `.xlsx` cell formats, or a stakeholder decision                                                            |
| U4  | Checkbox semantics in the CHECK-IN area                                                                                  | UNKNOWN                       | `.xlsx` / backend schematic                                                                                         |
| U5  | Weekly `Averages` semantics ("no data", "no sessions", "0/0")                                                            | UNKNOWN                       | `.xlsx` / backend schematic (`#4`)                                                                                  |
| U6  | Water/salt averages appear swapped (cols 47/48)                                                                          | CONFLICT                      | `.xlsx` to confirm whether labels or averaging are misaligned (`#8`)                                                |
| U7  | Week-block boundaries inferred from `WEEK`/`Averages` markers, not confirmed                                             | UNKNOWN                       | `.xlsx` (`spec/sheets/daily-tracker.summary.json` todo)                                                             |
| U8  | Day-range covered by the export (82 week blocks)                                                                         | UNKNOWN                       | `.xlsx`                                                                                                             |
| U9  | The committed `daily-tracker.json` redacted the field-header row, so labels are only recoverable from the HTML/inventory | CONFIRMED gap                 | Redaction policy review, or accept HTML+inventory as the label source                                               |
| U10 | Exercise/food counts below requirements claims (546/599 vs ~990/~1,170)                                                  | CONFLICT                      | `.xlsx` (`#1`)                                                                                                      |
| U11 | MENSES cycle-phase/next-period/ovulation estimation logic                                                                | UNKNOWN                       | `.xlsx` / backend schematic (`#5`)                                                                                  |
| U12 | TIMELINE ↔ DAILY TRACKER target propagation exact rules                                                                  | UNKNOWN                       | Backend schematic (`docs/source-inventory.md` cross-sheet section)                                                  |
| U13 | SUPPLEMENTATION / PEAKING / SHOWDAY wiring                                                                               | UNKNOWN (no confirmed wiring) | Backend schematic (`#10`)                                                                                           |
| U14 | Whether the DAILY TRACKER contains real client data (vs. demo)                                                           | CONFIRMED sensitive           | Privacy/redaction policy; source stays outside the repo                                                             |
| U15 | PED/HRT policy, licensing, product name, i18n                                                                            | UNKNOWN / open                | Stakeholder decisions (`#12`–`#14`)                                                                                 |

**Rule:** none of U1–U13 may be turned into an implementation assumption. They stay
`TODO(product)`/`TODO(human)` until a listed source or decision lands.

## 4. Remaining workbook sheets — inventory

Confirmed facts vs. interpretation (full detail: `docs/source-inventory.md`).

| Sheet              | CONFIRMED                                                                                                                                                                                                                                                                                                            | INTERPRETATION / UNKNOWN                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| DASHBOARD          | Header strip (CURRENT WEEK/PHASE/CHECK-IN), CLIENT & COACHING INFORMATION, NUTRITION day-type table (HIGH/MEDIUM/LOW × CALS/CHO/PRO/FAT/WATER), EXPENDITURE (STEPS/CARDIO min-per-WK/TRAINING), BODY COMPOSITION + sparkline, COMPETITION SETUP (SHOW/DIVISION/DATE/T-minus), HOW TO USE, disclaimer, license footer | Most cells computed/linked; chart series UNKNOWN                       |
| TIMELINE           | ~40 week rows; per-week phase, energy balance, hormone labels, comp setup, bodyweight trend, targets, changes, fixed 24-substance PED grid                                                                                                                                                                           | Exact target/trend formulas and PED policy UNKNOWN                     |
| MEALPLAN           | OVERVIEW strip + LOW/MEDIUM/HIGH tables, MEAL 1–9 (LOW also "PRE"), food rows (FOOD/AMOUNT/UNIT/CHO/PRO/FAT/CALS/NOTES), per-meal subtotal rows                                                                                                                                                                      | Subtotals/overview sums UNKNOWN; overview vs TIMELINE targets disagree |
| MENSES             | Status strip (cycle day/phase/avg length/next period/ovulation/BBT), CYCLE PHASE GUIDE, LAST CYCLES, HRT SETUP (E2/PROG)                                                                                                                                                                                             | Estimation logic UNKNOWN                                               |
| TRAINING           | PROGRAMMING header + 10-day rotation/split/goal, day blocks (PUSH/PULL/LEGS/UPPER/LOWER), per-exercise rows (NR/EXERCISE/BRAND/TYPE/TEMPO/NOTES), WEEK 1–17 target SETS+REPS, S1–S4 WT/REP logging                                                                                                                   | Progression/rotation rules UNKNOWN                                     |
| PEAKING            | Week blocks; SETUP enum (TAPER/BASELINE/LOAD/DEPLETE/REFUEL/SHOW), AM/PM weight, water/salt/steps/cardio/training/intensity, stress/hunger, macros, digestion, Averages; "record actual intake if not prescribed"                                                                                                    | Only week 1 has demo data; formulas UNKNOWN                            |
| SHOWDAY            | SHOW DAY INFO (name/date/divisions/stage time/tanning/hair-makeup/notes); TIME/INSTRUCTIONS run-sheet table (empty)                                                                                                                                                                                                  | Run-sheet content/derivation UNKNOWN                                   |
| SUPPLEMENTATION    | Columns TIME/SUPPLEMENT/DOSAGE/STATUS                                                                                                                                                                                                                                                                                | Wiring UNKNOWN                                                         |
| Exercise Database  | 546 rows: ID, Exercise Name, Muscle Group, Primary Target, Additional Target(s), Equipment, Movement Pattern, Position/Setup, Cues, Video Link                                                                                                                                                                       | —                                                                      |
| Nutrition Database | 599 rows: NO., FOOD, AMOUNT, UNIT, CALORIES, PROTEIN, CARBS, FATS, COOKED/RAW/DRY, CAT                                                                                                                                                                                                                               | —                                                                      |

## 5. Proposed acceptance criteria — first Daily Tracker implementation slice

**Scope of the slice:** capture, persist, and display the **verified Daily Tracker day fields**
with server-side authorization. It must **not** implement any computed/wired semantics
(U1–U13) and must not invent validation.

**Fields in scope (verified labels/columns from §2):** date + weekday; weight + weigh-in time;
cycle day/PMS/BBT/E2/PROG; sleep duration/score/sleep/wake; steps/cardio/training label/time;
the eight 1–10 biofeedback scores; RHR/BP/glucose; day label (HIGH/MEDIUM/LOW); carbs/protein/
fats/calories; salt/water; off-plan; bowel movements; coaches'/client notes.

**Acceptance criteria (observable):**

1. A signed-in client can create/edit **one entry per (workspace, client, date)**; the entry
   stores every in-scope field with the exact source label meaning; German decimal commas are
   accepted where numeric.
2. **Authorization:** only the owning client (own) or an authorized coach/owner (assigned/
   workspace) can read; writes are workspace-scoped and server-enforced; denials are structural
   (403), never UI-only. Consent gate: Daily Tracker is health data → requires `PRIVACY_NOTICE`
   - `HEALTH_DATA` per `docs/security/consent-audit.md` before any read/write.
3. **Empty state:** no entry for a date renders an empty form with no fabricated values; a day
   with no data shows "no data" (never `0`).
4. **Validation:** only the two **observed** constraints are enforced (biofeedback integers
   1–10; day label ∈ {HIGH, MEDIUM, LOW}); every other field is stored as entered without
   inventing ranges/required-ness (U2). Invalid input returns a structural error, not a 500.
5. **Explicitly out of scope / not claimed:** calorie auto-calc, weekly averages/trends, Δkg/Δ%,
   cycle-phase estimation, T-minus, MEALPLAN subtotals, checkboxes, target-row propagation —
   all remain `TODO(product)`.
6. **Browser checks (real, not mechanism gates):** the entry and read views render at
   **desktop (≥1280px)**, **tablet (~834px)**, and **mobile (~390px)** widths with no horizontal
   document overflow; a deliberately designed desktop layout (grouped panels/tables) and distinct
   tablet/mobile layouts (not a stretched mobile view); the 1–10 biofeedback controls are usable
   by touch at tablet/mobile.
7. **Persistence/round-trip:** saved values reload byte-identical (commas preserved), and a
   second save is idempotent for the same (workspace, client, date).
8. **Audit:** entry create/update writes one metadata-only audit event (no health values) coupled
   to the mutation transaction.
9. **Prerequisites (blocking, outside this slice):** the workbook-domain schema, the consent
   gate wiring, and the authorization matrix cell for daily-tracking persistence must be planned
   and independently reviewed before code; the current repo has **no** daily-tracker model or
   route.

## 6. Boundaries

- Documentation only: no `app/**`, `lib/**`, `db/**`, `tests/**`, dependency, or config change.
- No workbook contents, no real client data, and no `TRACKER 2.0.md` added to Git.
- Product name, licensing, PED/HRT policy, retention, and i18n remain undecided.
- Prime State / Prime Tracker repository untouched.

## 7. References

- `docs/source-inventory.md` (redacted, committed) — sheet-by-sheet source inventory.
- `spec/sheets/daily-tracker.summary.json`, `spec/sheets/daily-tracker.json` (redacted).
- `spec/data/foods.json`, `spec/data/exercises.json`.
- `docs/open-questions.md`, `docs/product-decisions.md`, `docs/implementation-plan.md`,
  `docs/extraction-contract.md`, `docs/redaction-policy.md`.
- `docs/security/authorization-model.md`, `docs/security/consent-audit.md`.
