# Phase 11 task record — test, determinism, and privacy pass

Status: **PASS** (see `docs/STATUS.md`).

## Scope
Implement the privacy redaction pipeline and commit redacted cell-level sheet artifacts for
all 11 sheets, preserving structure/safe product copy and redacting person identifiers and
health values fail-closed, with a complete deterministic manifest. No source modification;
raw output only via the existing `RAW_EXTRACTION_DIR` opt-in.

## Deliverables
- `lib/extraction/redact.ts` — fail-closed, source-aware redaction.
- `scripts/extract-sheets.ts` `--redacted` mode → `spec/sheets/<slug>.json` ×11 +
  `spec/redaction-manifest.json`.
- Tests: `tests/unit/redact.test.ts` (synthetic) and `tests/unit/redact-real.test.ts` (real).

## Redaction model
- **Kept in full:** `exercise-database`, `nutrition-database`, `supplementation`.
- **Client sheets:** keep only curated static labels, safe structural markers
  (`WEEK n`/`MEAL n`/`DAY n`/`PRE`/`Averages`), and product copy (HOW-TO-USE, disclaimer,
  license); redact everything else fail-closed.
- Contacts (email / credit) redacted everywhere, including reference sheets.
- Redacted cell: text → `[REDACTED:<category>]`; `normalized`/`todo` dropped; coordinates,
  spans, class, checkbox preserved; empty cells preserved.
- Categories: `client.daily-entry`, `client.profile`, `client.plan`, `client.mealplan`,
  `client.menses`, `client.peaking`, `client.show`, `vendor.contact`.

## Counts (never originals)
- Cells: 811,938 total — 11,052 kept, 20,856 redacted, 780,030 empty.
- Manifest: 20,878 entries (20,856 cell-level; 22 document-level from Phase 4).
- (Counts updated in Phase 12 after the narrow MENSES guide-region correction; see
  `docs/tasks/phase-12.md`.)

## Commands + real exit codes
```
npm run verify                            → 0  (16 files, 104 tests)
npm run extract:sheets -- --redacted      → 0  (11 artifacts + manifest)
[--redacted twice] diff -r sheets / manifest → 0  (byte-identical)
npm run extract:sheets -- --dry-run       → 0  (no writes)
npm run extract:sheets -- --raw (no dir)  → 1  (fail-closed guard intact)
```
Source dir untouched. No raw output written into tracked paths.

## Privacy checks
- No client markers/emails in artifacts; manifest holds only structural keys.
- Redacted cells carry no `normalized`; kept client-sheet text is labels/markers/copy only.
- No full-cell dumps of unredacted client data; `spec/sheets/<slug>.json` is redacted.

## Review
Independent fresh-context review recorded in the phase report. Limitation: reviewer shares the
builder's underlying model — not model-diverse.

## Remaining TODO(product)
- MENSES cycle-phase guide: RESOLVED in Phase 12 via a source-located region rule.
- ~99 MB artifacts dominated by empty cells; left unchanged (contract fidelity).
- Safe-label/copy allowlist to be confirmed against the xlsx/backend schematic.
