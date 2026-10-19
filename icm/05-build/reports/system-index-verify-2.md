# system-index re-verification after fix pass 1 (PR #65)

Verifier: shino (independent; builder was deepseek-v4.1-flash). Not committed, pushed or merged.
Worktree: `/home/nexuslink/vari8-worktrees/system-index`, branch `beta/system-index`, HEAD `ef08c3e`
(fix pass 1 code `8cda794`, reports `ef08c3e`). Base `origin/Vari8-Beta` `ea8f514`.
Probe scripts live outside the repo: `~/.hermes/cache/scratch/verify2/`. Worktree is clean at the end
(`git status --porcelain` empty; every probe mutation restored).

## Verdict: FIX

Eight of the ten requested items pass. F5 (one-run convergence) fails and is reproduced twice.
F9 has one under-attributed row (root layout). Gates all pass. The one-run failure is a small
generator bug and should be a one-line fix plus a regression test.

## Per-item results

| Item | Result | Evidence (observed) |
|---|---|---|
| F1 routes | **PASS** | `find app -name page.tsx` = 48. ROUTES "Backend pages" section has 48 page rows; set equality with find is exact (0 missing, 0 extra). Route paths re-derived from file paths with App Router rules (route groups dropped): 0 mismatches. `/sheets` (`app/sheets/page.tsx`, `requireSheetViewer`) and `/sheets/[slug]` present. `spec/sheets/` routed: `spec/AGENTS.md` says `sheets/ (22)`, total 27 files, matching `find spec -type f` minus AGENTS.md = 27. `app/AGENTS.md` says 111 files, find gives 111. Canvas: 3 page rows = 3 find hits. |
| F2 symbols | **PASS** | Independent script `verify2/f2_check.js` (TypeScript compiler API, separate from the generator). Per module, three views compared: (a) `checker.getExportsOfModule`, (b) a syntactic AST walk over export statements (named exports, `export { X } from`, `export type { X }`, declarations, `export default`), (c) the names parsed from `SYMBOLS.md` bullets. Result: 119 modules with exports, 1161 names in each view, 0 per-module mismatches, 1161 bullets all parsed, 0 star expansions. `frontend/src/lib/utils.ts` lists `cn`. |
| F3 `@/` | **PASS** | Only `frontend/src/lib/coaching-data.ts` imports via `@/` inside the indexed tree (`import source from "@/data/mock-data.json"`). Picked 3 symbols: `seed` (`export const seed = source`), `Client` (`(typeof seed.clients)[number]`), `mealVariants` (`seed.mealPlan.variants`). A TS program built from `frontend/tsconfig.json` resolves `@/data/mock-data.json` to `frontend/src/data/mock-data.json`, no TS2307. Resolved types: `seed` has `clients`, `Client` is the 15-item client record shape, `mealVariants` has `meals` (JSON keys checked: `clients` list of 15, `mealPlan.variants` list of 2). The root `tsconfig.json` still maps `@/*` to `./*` (root `data/mock-data.json` absent), so the frontend symbols must come from the second program, which they do. |
| F4 icm router | **PASS** | `icm/AGENTS.md:4` now reads "Read the repo-root `CONTEXT.md` first." `CONTEXT.md` exists at repo root; `icm/CONTEXT.md` does not and is not referenced. Checked every backticked path and markdown link in the root and all 10 generated routers: 28 tokens, 0 unresolved. |
| F5 one-run convergence | **FAIL** | Reproduced twice. `rm -rf docs/index`, `npm run index` (exit 0), `npm run index:check` gives **exit 1**: `drifted: docs/AGENTS.md at line 5`, on disk `82 files in 3 subdirectories`, generated `82 files in 4 subdirectories`. Cause: `Subdirectories` counts `index/` by existence, so a run that creates `docs/index` changes the subdirectory count. A second run then converges (exit 0), and the subdirectory count keeps `index/ (0)`. Also a second defect, see N1. |
| F7 `/invite` | **PASS** | `docs/index/ROUTES.md:21` row `/invite | app/invite/page.tsx | server | auth`. The page calls `auth()` in `Promise.all` at line 28 (`app/invite/page.tsx`). Row no longer reads "none detected". |
| F9 COMPONENTS | **FAIL (one row, Low)** | Full table: 112 rows, 67 files, 93 distinct names. Every file exists and exports its name. Route reachability re-derived with my own import graph (roots: `layout.tsx` + `page.tsx` per route, `@/` and relative specifiers). 110 rows match exactly. 2 mismatches, same row: `MotionProvider` (`frontend/src/components/motion-provider.tsx`) is listed `/` only. It is imported by the root `frontend/src/app/layout.tsx`, which wraps `/coach` and `/ethereal` too. Cause: the generator treats layouts as their own entry labelled `/` and does not inherit them to other routes (`generate.ts` ~1400-1424). |
| F9 sample of 10 (seed 65) | **PASS** | `IifymPlanPreview` (`coach/plans/nutrition/editor.tsx:1797`, /coach); `CoachingWidgetContent` (`ethereal/builder/coaching-content.tsx:1138`, /, /ethereal); `NutritionTargets` (`ethereal/tracker-components.tsx:480`, /, /ethereal); `Widget` (`ethereal/ui.tsx:225`, /, /ethereal); `ClientsWorkspace` (`coach/clients.tsx:51`, /coach); `MealplanWorkspace` (`ethereal/mealplan/mealplan-workspace.tsx:134`, /, /ethereal); `MessagesWorkspace` (`coach/messages.tsx:40`, /coach); `NutritionWidgetContent` (`ethereal/builder/nutrition-content.tsx:831`, /, /ethereal); `PlanOverview` (`ethereal/mealplan/plan-overview.tsx:17`, /, /ethereal); `DetailContent` (`ethereal/builder/widget-content.tsx:314`, /, /ethereal). 10/10 file, name, definition line and importing screen match. |
| F9 "coach roster" | **PASS (2 reads)** | Read 1, `grep -i roster COMPONENTS.md`, returns only the ethereal `ClientRoster` (`ethereal/clients/client-roster.tsx`, /, /ethereal). That is the wrong screen for "coach". Read 2 returns `ClientsWorkspace` (`frontend/src/components/coach/clients.tsx`, /coach). Source: the roster table (`cd-roster-table`, lines 114-258) is inside `ClientsWorkspace` (line 51). The index does not name it "roster"; it is found on read 2 only. |
| F9 "client profile check-ins tab" | **PASS (1 read)** | Read 1 (`grep -i 'check\|profile'`) gives `ClientProfile` (`frontend/src/components/ethereal/clients/client-profile.tsx`, /, /ethereal). Source: `tab === "check-ins"` at line 697, inside `ClientProfile` (line 109, the file's only exported component). |
| F9 "meal plan editor" | **PARTIAL (1 read, ambiguous)** | Read 1 (`grep -i 'meal\|editor'`) returns two plausible answers: coach `NutritionEditor` (`coach/plans/nutrition/editor.tsx`, /coach; used by `coach/plans/workspace.tsx:518`, edits a `MealPlan`) and ethereal `MealplanWorkspace` (`ethereal/mealplan/mealplan-workspace.tsx`, /, /ethereal). The index does not say which screen a user means; the answer is correct for both but not unique. |
| Index twice, zero diff | **PASS** | Two consecutive `npm run index`: exit 0 both; sha256 over `docs/index`, `docs/AGENTS.md`, `app/AGENTS.md` identical across runs; `git diff HEAD` 0 lines. |
| `index:check` after adding a canvas component | **PASS** | Added `frontend/src/components/verify-probe/verify-probe-widget.tsx` (exported component with JSX). `index:check` **exit 1**: `drifted: docs/index/COMPONENTS.md at line 10` (112 to 113 components, 67 to 68 files). Probe directory removed; `index:check` exit 0; `git status` empty. |
| typecheck | **PASS** | `npm run typecheck` exit 0. |
| lint | **PASS** | `npm run lint` exit 0: 0 errors, 14 warnings, 0 in the PR's changed files (`scripts/index`, `tests/unit/system-index.test.ts`). |
| test | **PASS** | `npm run test` exit 0: 97 files, 1151 tests passed. `vitest run tests/unit/system-index.test.ts`: 14 passed. |
| build | **PASS** | `npm run build` exit 0 (Next 16.3.8 Turbopack, full route table printed). |
| frontend build | **PASS** | `cd frontend && npm run build` exit 0; `/`, `/_not-found`, `/coach`, `/ethereal` prerendered. |
| Scope | **PASS** | All changed files vs `ea8f514` are in the allowed set: `scripts/index`, `docs/index`, `AGENTS.md` routers (`app/`, `components/`, `db/`, `docs/`, `icm/`, `lib/`, `scripts/`, `spec/`, `tests/`, `themes/`), `icm/`, `tests/unit/system-index.test.ts`, `package.json`, `.prettierignore`. No change under `db/`, `lib/`, `app/api/` or `frontend/src/`. |

## New findings from this pass

- **N1 (Low): `index:check` does not notice a deleted hand-written README.** `docs/index/README.md`
  is hand-written (`HAND_WRITTEN_INDEX` in `generate.ts:991`) and the generator never writes it.
  `rm -rf docs/index` plus two runs gives `index:check` exit 0 with the README gone
  (`git status`: `D docs/index/README.md`). Recovery is `git restore` only. Fix: have the check
  assert the README exists, or keep it outside the generated directory.
- **N2 (Note, not reproduced): one `index:check` returned exit 137 (SIGKILL)** once, right after the
  second `npm run index` in the F5 sequence. Re-run four more times in the same and in consistent
  states: exit 0 each time, and 1 where expected. Memory was ample (about 35 GB available). Not
  attributed to the code; flagging so the parent knows it happened once.

## Fixes required before SHIP

1. **F5 (blocks SHIP).** In `generate.ts`, count and list a subdirectory in `Subdirectories` only
   when it holds at least one countable file, using the same rule as `countFiles`. Add a regression
   test: delete `docs/index`, run the generator once, `index:check` must exit 0.
2. **F9 (Low).** Inherit a layout's imports to every route under it (`app/layout.tsx` applies to
   `/coach` and `/ethereal`). Then `MotionProvider` lists `/, /coach, /ethereal`. Add a test on this row.
3. **N1 (Low, optional).** Make `index:check` fail when `docs/index/README.md` is missing.

## Worktree changes by this verification

- Added this file only: `icm/05-build/reports/system-index-verify-2.md` (untracked).
- Probes and mutations were all reverted: `docs/index` and `docs/AGENTS.md` restored with
  `git restore --source=HEAD`; probe component directory removed; no commit, push or merge.
- Final state: `git status --porcelain` shows only this file. Because this file sits under `icm/`,
  `npm run index:check` now exits 1 on `icm/AGENTS.md` (189 to 190 files). That is the generator
  working as designed, not a PR defect. When this report is committed, run `npm run index` first
  and commit the regenerated `icm/AGENTS.md` with it. I did not regenerate it, to keep the
  worktree at the reviewed state.
