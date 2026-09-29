# Stage 0 plan — repository/process correction

Source of truth: `TRACKER 2.0.md` §7 Stage 0. Baseline reviewed tree: `f4ebac0`.
Working copy: `/Users/apple/Documents/Codex/2026-09-29/hi/work/the-great-tracker`
Preserve the intentional uncommitted files (`TRACKER 2.0.md`, `docs/conductor-generic/SKILL.md`,
`.prettierignore` entry). Do not push/PR/deploy.

## A. Root `AGENTS.md`

Create concise `AGENTS.md` that directs agents to read `TRACKER 2.0.md` and
`docs/conductor-generic/SKILL.md` first; include authority order, safety rules, TDD,
real-browser requirement, independent review, and tracker-update requirement. No wholesale copy.

## B. Product decisions + licensing wording

- Create `docs/product-decisions.md` recording the locked decisions from `TRACKER 2.0.md` §3.
- Fix `docs/open-questions.md` #12: implementation permission is confirmed; only pre-release
  redistribution/licensing review remains open.
- Acceptance: no doc claims permission is unresolved.

## C. Repair E2E environment (AUTH_SECRET)

- Add deterministic **test-only** `AUTH_SECRET` (and a `DATABASE_URL` fallback) to
  `playwright.config.ts` `webServer.env`; never a real secret.
- RED: with a `DATABASE_URL`-only local `.env`, `npm run test:e2e` fails the invalid-credentials
  test (`MissingSecret`). GREEN after the fix; assertion unchanged.
- Add a unit regression test pinning the config (`tests/unit/playwright-config.test.ts`).

## D. Verification scripts + CI

- `package.json`: add `format:check` (`prettier --check .`), keep `verify` as typecheck+lint+test.
- `.prettierignore`: add `spec/` (generated artifacts must not be reformatted) and keep the
  intentional `docs/conductor-generic/SKILL.md` entry.
- Format the source/tests with `prettier --write` so `format:check` passes.
- `.github/workflows/ci.yml`: add Postgres service + env, and gate: `prisma generate`,
  `prisma validate`, `format:check`, `typecheck`, `lint`, `test`, `build`, `test:e2e`.
- Acceptance: CI fails if any gate fails; no silent exclusion of E2E.

## E. Restrict dev-only workbook viewer

- New `lib/sheet-viewer.ts` gate `isSheetViewerEnabled` (true only for `ENABLE_SHEET_VIEWER=1`).
- `app/sheets/page.tsx` and `app/sheets/[slug]/page.tsx`: `force-dynamic` + `notFound()` unless enabled.
- Remove dev-viewer links from `components/app-nav.tsx` and `app/page.tsx` (reach `/sheets`
  directly; no dead links baked into static builds).
- Tests: unit `tests/unit/sheet-viewer-gate.test.ts` (disabled default → notFound; enabled → renders);
  e2e with the flag enabled (`playwright.config.ts` env) proves the enabled path.
- Acceptance: disabled by default 404; enabled only with the flag.

## F. Dependency remediation

- Inspect `npm audit`. Record that no safe compatible fix exists (next→16 major; prisma→6.12.0
  downgrade; postcss transitive via next). Do not run `audit fix --force`; no changes.

## Verification (exact commands; real exit codes)

```
git diff --check
npm ci
npm run format:check
npm run typecheck
npm run lint
npm run test
npx prisma validate          # with DATABASE_URL set
npm run build
npm run test:e2e             # Postgres up; webServer env supplies AUTH_SECRET
npm audit
```

## Behavioral (real browser)

1. Product pages load (`/`, `/library/foods`, `/library/exercises`).
2. `/sheets` and `/sheets/<slug>` → 404 without `ENABLE_SHEET_VIEWER`.
3. `/sheets` works with `ENABLE_SHEET_VIEWER=1`.
4. `/login` invalid credentials → generic error; no Auth.js crash.
5. 390px + desktop: no obvious overflow/regression.

## Out of scope

No multi-tenant schema, roles, client/Daily persistence, formulas, PED/HRT, UI redesign, product
name, or raw-data import. Do not modify redacted extraction artifacts.
