# App — Implementation Plan

Status: **approved plan, committed before any implementation code.** This document is the
Conductor-required plan: it names exact paths, exact commands, and observable acceptance
criteria for every phase, and it is committed ahead of the code it governs.

Product placeholder name: **"App"** (final name TBD). The repository slug
(`The-great-tracker-`) is **not** the product name.

## 1. Objective

Build the technical foundation and the spreadsheet-extraction pipeline for a new coaching
web app whose data and layouts come from the 11-sheet PRGRSS 2.0 workbook. The sheets are the
product source of truth; the workbook layouts and information architecture must be
reproduced as the DATA and information architecture — but NOT the literal UI.
(Latest direction, relayed by Hanzlah 2026-09-30: complete desktop/web redesign
with platform-appropriate tablet and mobile interfaces — one shared design
system, but per-form-factor navigation, information density, panel structure,
tables, dashboards, and interactions; never one layout stretched or shrunk
across platforms; Prime Tracker's visual design is not the target.) This task builds **only** the foundation and the
extraction pipeline — not the product modules.

## 2. Non-goals

- No product modules (daily tracker, timeline, meal plan, training, menses, peaking, show
  day, supplementation) in this task.
- No workbook-domain Prisma models before the inventory/wiring brief is reconciled.
- No migration of Prime State client accounts, health records, or historical data.
- No push, PR, deploy, or production data changes.
- No product name/branding.

## 3. Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 (CSS-first) ·
Prisma + PostgreSQL via Docker Compose (local) · Auth.js v5 **Credentials** provider ·
Vitest (unit) · Playwright (e2e) · ESLint · Prettier · npm.

## 4. Governing rulings (locked)

1. **Missing original `.xlsx`** — not available. Extraction is **HTML-only** now. Recorded as
   `TODO(product)`; if `Copy of PRGRSS 2.0.xlsx` later lands under `sources/`, switch to
   `exceljs` as the primary source (formulas, validations, hidden sheets/rows).
2. **Raw source HTML location** — the exports contain real client PII/health data and stay
   **outside the repo**. `SHEETS_SOURCE_DIR` defaults to
   `/Users/apple/Downloads/PRGRSS 2.0 extracted/Copy of PRGRSS 2.0/` and is overridable via
   the environment. The extractor **fails clearly** if the directory is missing and **never
   writes into the source directory**.
3. **Raw extraction output** — unredacted output is opt-in via `RAW_EXTRACTION_DIR`, located
   outside tracked files. The extractor **fails closed** unless `git check-ignore <dest>`
   confirms the destination is ignored.
4. **Source-inventory privacy** — `docs/source-inventory.md` is a **redacted** copy of
   `SOURCE-INVENTORY.md`: real client name/DOB and personal/health values replaced by
   documented placeholders; useful structure and non-sensitive content preserved. Every
   replacement is recorded in `spec/redaction-manifest.json` (path/line or section, field
   category, placeholder — never the original value).
5. **Redaction policy** — committed workbook artifacts preserve **layout and structure**
   while redacting real client identifiers and health values. Demo fixtures use **synthetic**
   values matching source formats, never the source person's values. **Disclaimer, license,
   and footer text stay verbatim and unredacted.** See `docs/redaction-policy.md`.
6. **Missing images** — `cellImage_2050288505_0.jpg` (referenced by `DAILY TRACKER.html`) and
   `cellImage_227302925_0.jpg` (referenced by `TIMELINE.html`) are referenced but absent from
   `resources/`. Recorded as `TODO(product)`. The 12 available images are sufficient for
   layout work.
7. **i18n** — omitted from this scaffold. Prime State has de/en localization; localized UI
   may be requested later. Recorded as `TODO(product)`.

## 5. Target repository layout

```
The-great-tracker-/
  .gitignore, .env.example, README.md
  package.json, tsconfig.json, next.config.ts, postcss.config.mjs,
  eslint.config.mjs, .prettierrc.json, .prettierignore
  vitest.config.ts, playwright.config.ts, docker-compose.yml
  app/{layout.tsx,page.tsx,globals.css,login/page.tsx}
  themes/{pro-dark.css,pro-white.css}
  lib/db.ts
  auth.ts, auth.config.ts
  db/schema.prisma, db/migrations/<ts>_init/migration.sql
  scripts/extract-sheets.ts
  spec/
    sheets/<slug>.json            (committed, redacted)
    sheets/<slug>.summary.json    (committed, redacted)
    data/foods.json, data/exercises.json
    theme.json, cross-sheet.md, redaction-manifest.json
  docs/{source-inventory,reuse-assessment,implementation-plan,
        open-questions,redaction-policy}.md
  tests/{unit/*.test.ts, e2e/*.spec.ts, integration/*.test.ts}
```

## 6. The 12 phases (preserved) with gates

### Phase 1 — Repository safety and setup — DONE

Remote verified empty; cloned to a new local working dir; branch `main`; Prime State
untouched.

### Phase 2 — Source-file audit — DONE

All 11 exports + resources confirmed; xlsx absent; PII/health content flagged; missing images
identified.

### Phase 3 — Prime State reuse assessment and plan — DONE

`docs/reuse-assessment.md` produced; this plan drafted.

### Phase 4 — New-repo foundation transfer (documentation only)

Steps: confirm working tree; write `docs/` artifacts + `spec/redaction-manifest.json` +
`.gitignore`; **commit the plan before any implementation code**.
Acceptance: all docs exist and contain no real client identifiers/health values; every
redaction is manifested without its original value; raw source dirs ignored and
`spec/sheets/` **not** ignored; plan committed before code; local commit hash reported;
Prime State unchanged.

### Phase 5 — Application/toolchain scaffold

Steps: Next.js 15 app shell, React 19, strict TS, Tailwind 4, Vitest, Playwright, ESLint,
Prettier, npm scripts; port only the Phase 3-approved foundation (`tsconfig`, lint/format,
vitest/playwright, `lib/db.ts` singleton, script shape).
Paths: `package.json`, `app/{layout,page,globals.css}`, config files.
`npm run verify` = `typecheck && lint && test`.
Acceptance: `npm install && npm run verify; echo EXIT:$?` → `0`; minimal App shell renders.

### Phase 6 — DB, auth, themes, Part A gate

Steps: `docker-compose.yml` (Postgres only) + `db/schema.prisma` minimal `User` migration;
Auth.js v5 **Credentials** with hashed passwords (no plaintext, no hard-coded accounts/secrets;
documented JWT session strategy); tokenized themes with `data-theme` on `<html>`
(`pro-dark`, `pro-white`); `.env.example`; setup README.
Paths: `docker-compose.yml`, `db/schema.prisma`, `db/migrations/*`, `auth.ts`,
`auth.config.ts`, `app/login/page.tsx`, `themes/*.css`, `.env.example`, `README.md`.
Acceptance (Part A gate, exact commands + real exit codes):

```sh
docker compose up -d
npm install
npx prisma migrate deploy
npm run verify
```

Do not begin Phase 7 until the migration applies and `npm run verify` passes on the current
tree.

### Phase 7 — Extraction contract and input configuration

Steps: inspect actual export markup; define deterministic output schemas and stable sheet
slugs; implement `SHEETS_SOURCE_DIR` resolution (default = ruling 2), missing-dir failure,
never-write-to-source guard, and `RAW_EXTRACTION_DIR` fail-closed `git check-ignore` guard.
Slugs: `daily-tracker, dashboard, timeline, mealplan, supplementation, menses, training,
peaking, showday, exercise-database, nutrition-database`.
Acceptance: contract documented in this file; `scripts/extract-sheets.ts` dry-run resolves all
11 inputs; missing-source and non-ignored-raw-dir each fail with a clear message (tested).

### Phase 8 — Generic sheet parsing

Steps: parse `<table class="waffle">`; emit `spec/sheets/<slug>.json` with 1-based
`{row,col,rowSpan,colSpan,class,text}` cells; resolve spans to unambiguous grid locations
without fabricating blank cells; preserve source text exactly (German decimal commas) and add
`normalized` only when unambiguously numeric; extract checkbox state only when reliably
derivable (`#checked-checkbox-id` / `#unchecked-checkbox-id`), else `TODO(product)`; capture
source classes + CSS declarations from `resources/sheet.css`.
Acceptance: all 11 sheets emit; merged spans resolved; comma decimals preserved; ambiguous
checkbox state flagged not guessed.

### Phase 9 — Food and exercise datasets

Steps: emit `spec/data/foods.json` (NO., FOOD, AMOUNT, UNIT, CALORIES, PROTEIN, CARBS, FATS,
COOKED/RAW/DRY, CAT) and `spec/data/exercises.json` (ID, name, muscle group, primary/additional
targets, equipment, movement pattern, position/setup, cues, video link).
Acceptance: report actual counts (~599 foods, ~546 exercises); warn (do not fail) on count
difference; discrepancy explained.

### Phase 10 — Sheet structure and cross-sheet artifacts

Steps: emit `spec/sheets/<slug>.summary.json` (evidence-based section/block map),
`spec/theme.json` (distinct background/text/border/font combinations + derivation notes),
`spec/cross-sheet.md` (verbatim values in ≥2 sheets as **candidate** links), extend
`spec/redaction-manifest.json`, and `docs/open-questions.md`.
Acceptance: no semantic links or formulas inferred from coincidence; every masked cell
recorded; discrepancies captured as `TODO(product)`.

### Phase 11 — Test, determinism, privacy pass

Steps/tests: merged-cell spans; German-decimal preservation + safe normalization; checkbox
state; deterministic output (two runs, no diff); graceful missing/ambiguous handling; redaction
recorded and **no sensitive leak** into committed artifacts/logs/demo data; a unit test that
parses the **actual** `DASHBOARD.html` and asserts `"WEEK 11"` and the exact verbatim
disclaimer string are present. Sort records/keys; normalize line endings.
Acceptance: `npm run extract:sheets` twice → second run produces no changes; `npm run verify`
green.

### Phase 12 — Final verification and delivery

Steps: re-run applicable gates on the frozen tree; inspect diff; commit locally; report the
exact tested commit hash and evidence.
Acceptance: Phase 6 gate passed before Phase 7; `npm run verify` passes; deterministic `spec/`
committed with no secrets/real client data; report includes file tree, per-sheet status,
counts/warnings, exact commands + exit codes, TODO items, commit hash, and the Prime State
reuse/adapt/omit log. **No push, PR, or deploy.**

## 7. Verification doctrine

- Every "done" claim names the exact command and its real exit code (`cmd; echo EXIT:$?`).
- Re-run gates on the **current** tree; a PASS from an earlier run never validates a later
  change.
- Test-first for production behavior; every bug fix leaves a regression test.
- The builder never grades its own work: an independent reviewer (fresh context, not the
  builder) reviews meaningful changes. If the reviewer shares the builder's underlying model,
  that limitation is disclosed and model diversity is **not** claimed.

## 8. Privacy and redaction

Committed artifacts must never contain real client identifiers or health values. The raw
unredacted extraction is local-only under `RAW_EXTRACTION_DIR`. Full policy:
`docs/redaction-policy.md`. Manifest: `spec/redaction-manifest.json`.

## 9. Commands reference

```sh
npm install
docker compose up -d
npx prisma migrate deploy
npm run verify              # typecheck + lint + test
npm run extract:sheets      # deterministic spec/ generation
npm run test:e2e            # Playwright
npm run format:check
```
