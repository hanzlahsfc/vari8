# STATUS — App foundation & extraction build

Append-only loop memory (newest first). "Done" = the exact gate re-run on the current
tree with a real exit code. This repo covers Phases 1–12 (foundation + spreadsheet-source
extraction) only, not the workbook UI itself.

## 2026-09-29 — Phase 10 — PASS
- Built: `lib/extraction/{summaries,theme,crosssheet}.ts`; `--spec-only` mode in
  `scripts/extract-sheets.ts`; committed `spec/sheets/<slug>.summary.json` (11),
  `spec/theme.json`, `spec/cross-sheet.md`; tests for summaries/theme/cross-sheet/privacy.
- Verified: `npm run verify` → exit 0 (89 tests). `npm run extract:sheets -- --spec-only`
  twice → summaries/theme/cross-sheet diffs exit 0 (byte-identical). Source dir untouched.
  Privacy: only curated static labels, reference-data names, and CSS values emitted; no cell
  dumps; cross-sheet omits client-bearing values.
- Caveats: summary block boundaries are marker-inferred; committed redacted `spec/sheets`
  cell artifacts remain deferred to the redaction phase.
- Next action: Phase 11 (test, determinism, privacy pass).

## 2026-09-29 — Phase 9 — PASS
- Built: `lib/extraction/databases.ts`; `spec/data/foods.json` (599), `spec/data/exercises.json`
  (546); `--data-only` mode.
- Verified: `npm run verify` → exit 0; `--data-only` twice → no diff.

## 2026-09-29 — Phase 8 — PASS
- Built: `lib/extraction/{parse,css,normalize}.ts`; parse all 11 sheets; `--raw` opt-in.
- Verified: 811,938 cells parsed; checkbox counts match markup; determinism via diff.

## 2026-09-29 — Phase 7 — PASS
- Built: extraction contract (`docs/extraction-contract.md`, `lib/extraction/{contracts,source}.ts`)
  and non-writing `--dry-run`.

## 2026-09-29 — Phase 6 — PASS
- Built: Docker Postgres, minimal Prisma `User` migration, Auth.js Credentials (JWT, scrypt),
  tokenized `pro-dark`/`pro-white` themes, `.env.example`, README. Part A gate passed before
  Phase 7.

## 2026-09-29 — Phase 5 — PASS
- Built: Next.js 15 / React 19 / strict TS / Tailwind 4 / Vitest / Playwright / ESLint /
  Prettier scaffold; neutral "app" identity; smoke test.

## 2026-09-29 — Phase 4 — PASS
- Built: redacted `docs/source-inventory.md`, `docs/reuse-assessment.md`,
  `docs/implementation-plan.md`, `docs/redaction-policy.md`, `docs/open-questions.md`,
  `spec/redaction-manifest.json`. Plan committed before code.

## 2026-09-29 — Phase 3 — PASS
- Reuse/adapt/omit assessment of Prime State (technical foundation only).

## 2026-09-29 — Phase 2 — PASS
- Audited 11 exports + resources; flagged PII; confirmed xlsx absent.

## 2026-09-29 — Phase 1 — PASS
- Cloned the empty new repository; Prime State untouched.

## Open TODO(product) items
- Missing `Copy of PRGRSS 2.0.xlsx` (formulas/validations/hidden rows unrecoverable).
- Missing images `cellImage_2050288505_0.jpg`, `cellImage_227302925_0.jpg`.
- Formula semantics (calories, averages, cycle estimation, T-minus, meal subtotals),
  water/salt average swap, sparkline config, SUPPLEMENTATION/PEAKING/SHOWDAY wiring.
- Product name/branding, license terms, PED/HRT policy, i18n.
