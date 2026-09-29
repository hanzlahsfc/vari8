# Redaction policy

The PRGRSS 2.0 exports contain a real client's personal identifiers and health data. This
policy defines what may be committed and what must be redacted. It applies to every committed
artifact, demo fixture, test, log line, and documentation file in this repository.

## Scope

Applies to:
- `docs/source-inventory.md` (redacted document)
- `spec/sheets/*.json` and `spec/sheets/*.summary.json` (committed, redacted)
- `spec/data/*.json`, `spec/theme.json`, `spec/cross-sheet.md`
- `spec/redaction-manifest.json`
- demo seeds / fixtures / tests
- logs and error messages

Does **not** apply to:
- the **disclaimer**, **license**, and **footer** text — these are reproduced **verbatim and
  unredacted** (explicitly allowed).
- the unredacted raw extraction, which stays **outside tracked files** under
  `RAW_EXTRACTION_DIR` (local-only).

## Must be redacted in committed artifacts

1. **Direct identifiers:** the client's full name, date of birth, age, email, phone, address.
2. **Health values (measured/derived):** bodyweight, BBT, cycle day/phase/length, period and
   ovulation estimates, E2/PROG/HRT doses, PED/ped-protocol doses, blood pressure, glucose,
   RHR, sleep, biofeedback scores, macros-as-consumed, and similar client-specific readings.
3. **Client-specific prescriptions/plans:** per-week prescribed targets and meal-plan totals
   that are the client's personal plan rather than generic template structure.
4. **Personal context:** the client's program goal text, competition/show name and date.
5. **Vendor/personal contact data** where it would be inappropriate to republish (not the
   sheet footer credit, which is preserved by the verbatim rule).

## May be preserved

- Layout, grid coordinates, spans, class names, and CSS declarations.
- Field/column labels, section headings, enums, phase-guide ranges (generic reference text).
- Structural counts (cell/row counts), sheet names, and slugs.
- The workbook's fixed template column lists (e.g. the 24 PED substance **column names** as
  schema), which are template structure, not a person's values.
- Disclaimer, license, and footer text, verbatim.
- Generic template numbers that do not identify a person or disclose individual health data.
- Non-identifying demo display labels explicitly required by an acceptance criterion (e.g. the
  dashboard current-week label `WEEK 11`, which the Phase 11 test asserts). These are retained
  so the inventory, the plan, and the committed test stay consistent.

## Placeholder convention

Redacted values are replaced with a category placeholder of the form
`[REDACTED:<category>]`, e.g. `[REDACTED:client-name]`, `[REDACTED:dose]`,
`[REDACTED:cycle-day]`, `[REDACTED:prescribed-target]`. Placeholders are stable strings so
structure and diffing remain meaningful.

## Manifest

Every redaction is recorded in `spec/redaction-manifest.json` with:
- `artifact`: the committed file path;
- `section` (or `line`): where in the artifact;
- `fieldCategory`: e.g. `client_identifier.name`, `menses.cycle_day`, `ped_protocol.dose`;
- `placeholder`: the replacement string;
- `reason`: a short category reason.

The manifest **never** contains the original value.

## Demo fixtures

Demo/demo seeds and test fixtures must use **synthetic** values that match the source
formats (e.g. `"00,0"`, `01.01.1900`, a clearly fictitious name) and must be namespaced and
documented as fixture data. They must never reuse the source person's values.

## Raw (unredacted) extraction

Unredacted output is opt-in via `RAW_EXTRACTION_DIR`, must live outside tracked files, and the
extractor **fails closed** unless `git check-ignore <dest>` confirms the destination is
ignored. The raw source HTML directory (`SHEETS_SOURCE_DIR`) is read-only input and is never
written to.

## Cell-level sheet artifacts (Phase 11)

`spec/sheets/<slug>.json` is the committed, redacted cell-level layout for each of the 11
sheets, produced by `npm run extract:sheets -- --redacted`.

Rules (implemented in `lib/extraction/redact.ts`):

- **Safe sheets kept in full:** the two reference databases (`exercise-database`,
  `nutrition-database`) and the empty `supplementation` template.
- **Client-bearing sheets** (`daily-tracker`, `dashboard`, `timeline`, `mealplan`, `menses`,
  `peaking`, `showday`): a cell survives only if its trimmed text is a curated static label, a
  safe structural marker (`WEEK n` / `MEAL n` / `DAY n` / `PRE` / `Averages`), or safe product
  copy (HOW-TO-USE body, disclaimer, license). Everything else — including ambiguous free text
  — is **redacted fail-closed**.
- **Contact identifiers are never safe**, even inside reference sheets (vendor credit/email).
- A redacted cell keeps its coordinates, spans, class, and checkbox state; its text becomes
  `[REDACTED:<category>]`, and any derived `normalized` value and `todo` are dropped.
- Genuinely empty cells stay empty (not redacted).
- Each redaction adds exactly one deterministic manifest entry (`artifact`, `sheet`,
  `cell{row,col}`, `fieldCategory`, `placeholder`, `reason`) and never the original value.

Categories: `client.daily-entry`, `client.profile`, `client.plan`, `client.mealplan`,
`client.menses`, `client.peaking`, `client.show`, and `vendor.contact`.

Known limitation (`TODO(product)`): the MENSES cycle-phase **guide** copy is over-redacted
because phase words (menstrual/follicular/ovulation/luteal) also appear as client values, so
keeping them would leak the client's cycle phase. The guide can be re-allowed once its
coordinates are confirmed against the xlsx/backend schematic.

## Enforcement

- A test redacts all 11 real sheets and asserts every redacted cell has exactly one manifest
  entry with no original value, that redacted cells carry no `normalized`, that no artifact
  contains `@`-like contacts, and that the artifacts equal the committed files byte-for-byte.
- Synthetic unit tests cover redaction, structure/checkbox/empty preservation, normalized
  removal, manifest shape, and deterministic ordering.
- If a source value cannot be safely redacted without destroying useful non-sensitive
  structure, stop and report the exact issue rather than guessing.
