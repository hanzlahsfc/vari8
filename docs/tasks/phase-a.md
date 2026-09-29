# Phase A task record — read-only reference libraries + workbook viewer

Status: **PASS** (first product-UI slice after the completed extraction foundation).

## Scope

Read-only UI only: searchable Foods and Exercises libraries backed by `spec/data/*.json`,
and a read-only viewer for all 11 sheets backed by `spec/sheets/<slug>.json` +
`<slug>.summary.json`. No formulas, data entry, persistence, roles, permissions, consent,
audit, PED/HRT, or demo accounts.

## What was built

- `lib/catalog.ts` — pure, tested helpers: `searchFoods`, `foodCategories`,
  `searchExercises`, `exerciseFacets`, `toSparseGrid`, `sheetDisplayName`.
- `lib/spec-artifacts.ts` — server-only cached loaders for the committed redacted artifacts.
- `components/app-nav.tsx` — primary navigation.
- `/` (nav + links), `/sheets` (index, source order), `/sheets/[slug]` (viewer, dynamic),
  `/library/foods`, `/library/exercises`.
- Tokenized styles only (CSS custom properties; no hex outside `themes/`).

## Viewer behavior

- **Sparse rendering:** only cells with visible content (text or checkbox) create DOM nodes;
  hundreds of thousands of empty cells are not rendered. Coordinates and merged spans are
  preserved via CSS grid placement; the committed artifact contract is unchanged.
- **Redaction distinction:** redacted cells render a neutral `▨` marker (never the value or the
  category text); genuinely empty cells are simply not rendered.
- Safe static labels/section chips and reference-database text are shown verbatim.

## Tests + real exit codes

```
npm run verify        → 0  (18 files, 123 tests: catalog + spec-artifacts + existing)
npm run build         → 0  (/library/* static, /sheets/[slug] dynamic)
npm run test:e2e      → 0  (16 passed: library, sheets, a11y, smoke, theme, auth)
```

E2E covers: index order (11 sheets, source order), all 11 sheet views load with heading+grid
region, daily-tracker shows safe labels + neutral markers (no `[REDACTED:` text or client
values in the DOM), navigation, library counts/fields/order, search does not navigate,
category/muscle filters, single h1 + labelled nav, scoped table headers, and a 390px mobile
viewport where wide sheets scroll horizontally.

## Access / shell

- Inspected the shell: there is **no middleware and no route guard**, so routes are already
  public (the home page is public). Phase A adds only read-only GET pages; **no auth bypass,
  no exposure policy change, no default account, and no new role** were introduced.

## Privacy

- UI renders only committed redacted artifacts; no client values. Redacted cells show a neutral
  marker; tests assert no `[REDACTED:` text or client values in the DOM.
- Source artifacts unchanged (`git status` clean before/after; extraction modes still exit 0).

## Limitations / unresolved

- **Licensing/exposure:** the workbook layouts/reference data are licensed content; serving the
  viewer publicly is a licensing decision (tracked in `docs/open-questions.md`), not resolved
  here.
- Products/layouts are redacted: person-specific values are placeholders by design.
- No formulas/averages/estimation (await Lilly's blueprint); no roles/permissions; no writes.
