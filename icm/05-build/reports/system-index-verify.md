# system-index verification (PR #65)

Verifier: shino (independent; builder was deepseek-v4.1-flash). Not committed, pushed or merged.
Worktree: `/home/nexuslink/vari8-worktrees/system-index`, branch `beta/system-index`, HEAD `4d151e8`.
Base: `origin/Vari8-Beta` at `ea8f514` (PR base per `gh pr view 65`, state OPEN). Merge-base with
`ea8f514` is `ea8f514`; PR diff = 22 files, +4980 lines. Local `Vari8-Beta` (1701ef4) is stale and was
not used; diffing against it shows 145 files, which is a local-ref artifact, not the PR.

## Verdict: FIX

The index is deterministic, drift detection works, routers are within budget and the gates pass. But
two of the three accuracy claims are false as shipped: the route inventory silently drops two pages,
and the symbol index omits every re-exported name (47 names, one whole module). The report's wording
("every route", "every exported symbol") overstates coverage.

## Findings

| ID  | Sev    | Where                                                                                                | Evidence (observed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Fix                                                                                                                                                            |
| --- | ------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | High   | `scripts/index/generate.ts:51` (`"sheets"` in `SKIP_DIRS`, line 38); used at `:115`, `:129`, `:1048` | `SKIP_DIRS` matches by directory name at any depth, so the route segment `app/sheets/` is skipped. `app/sheets/page.tsx` and `app/sheets/[slug]/page.tsx` are missing from `docs/index/ROUTES.md`. `docs/index/ROUTES.md:7` says 46 backend pages; `find app -name page.tsx` = 48. `app/AGENTS.md:5` says 109 files; actual 111.                                                                                                                                                                                                                                                                                            | Skip only top-level/known tooling dirs, not route segments. Scope the skip to repo root and `spec/` and `frontend/`; do not match `app/sheets`.                |
| F2  | High   | `scripts/index/generate.ts:489-520` (`symbolsOf`)                                                    | Only statements carrying an `export` modifier are read. `export { X } from`, `export type { X } from` and `export type { X }` are skipped. Checker (`getExportsOfModule`) gives 119 modules / 1161 names; `docs/index/SYMBOLS.md:7` says 118 / 1114. 46 names in 16 modules are missing (e.g. `lib/auth/guard.ts` `WorkspaceRole`; `lib/trainingprogram/service.ts` `TrainingError`, `TRAINING_FIELD_KEYS`; `lib/onboarding/submissions.ts` `OnboardingSubmissionError`). The module `frontend/src/lib/utils.ts` (`export { cn } from "cn"`) is absent entirely. Header text ("Every exported symbol per module") is false. | Enumerate `checker.getExportsOfModule` and resolve alias declarations to their signature, instead of walking statements.                                       |
| F3  | Medium | `tsconfig.json:26` (`"@/*": ["./*"]`)                                                                | Requested check: `@/` must resolve to `frontend/src`. It does not. One root program serves both trees. `frontend/src/lib/coaching-data.ts:1` `import source from "@/data/mock-data.json"` targets root `data/mock-data.json`, which does not exist; the real file is `frontend/src/data/mock-data.json`. The builder disclosed this (report section 5, item 2). Current 5 frontend signatures still match, because none rely on an `@/` type.                                                                                                                                                                               | Build the frontend symbols with `frontend/tsconfig.json` as a second program, or record the limitation in `docs/index/README.md` next to the frontend section. |
| F4  | Medium | `scripts/index/generate.ts:67` (`icm:` DIR_PURPOSE); rendered at `icm/AGENTS.md:4`                   | Router says "Read `icm/CONTEXT.md` first". The file does not exist (`ls icm/CONTEXT.md` fails; the root `CONTEXT.md` exists). Agents are sent to a dead path.                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Point the purpose line at `CONTEXT.md` (repo root) or drop "first".                                                                                            |
| F5  | Low    | `scripts/index/generate.ts:134-137` (`countFiles` counts every file except `AGENTS.md`)              | Generated docs count toward their own directory's router. Reproduced: delete the four `docs/index/*.md`, run `npm run index` once: `docs/AGENTS.md:5` becomes "83 files ... index/ (1)"; a second run converges to "87 files ... index/ (5)". So one run from a missing-docs state is not the committed bytes, which contradicts the report's "two consecutive runs produce byte-identical files" from that state. Steady-state runs are deterministic (see check 3).                                                                                                                                                       | Exclude `docs/index/` from `countFiles` for `docs/`, or count only non-generated files.                                                                        |
| F6  | Low    | `tests/unit/system-index.test.ts` (commit `6cf181b`)                                                 | Outside the scope you set (scripts/index, docs/index, AGENTS.md, package.json, .prettierignore, icm/). Content is sound (7 behaviour tests, all pass). Decide whether to keep it in this PR or move it.                                                                                                                                                                                                                                                                                                                                                                                                                     | Parent decision.                                                                                                                                               |
| F7  | Low    | `docs/index/ROUTES.md` row `/invite` (generated from `app/invite/page.tsx:28` `auth()`)              | Says "none detected". The page calls NextAuth `auth()` for the session. Detector only matches `require*` names. The README caveat covers this in general, but a row with an explicit session read reads as unguarded.                                                                                                                                                                                                                                                                                                                                                                                                       | Count `auth()` as a session read in the detector, or label the column "require* helpers only".                                                                 |
| F8  | Info   | `icm/05-build/reports/system-index.md` header and section 2                                          | Report still says base `55a0f08` and head `566ebb6`; PR is now base `ea8f514`, head `4d151e8`. The report also claims `npm run test:integration` exit 0; I did not re-run it (needs the DB on 127.0.0.1:5433).                                                                                                                                                                                                                                                                                                                                                                                                              | Refresh the header when the report is next touched.                                                                                                            |

## Check results

**(1) ACCURACY**

- Routes, all 58 rows, not just the sample: rendered mode (`use client` vs server) 0 mismatches; `require*` helper set claimed vs. found in the page plus ancestor layouts: 0 mismatches. Layouts: 8 claimed, 8 found.
- 10 sampled routes (seed 65), all correct on path, file, rendered and auth: `/workspace/[workspaceId]/clients/[clientProfileId]/training-program`, `/workspace/[workspaceId]/client-setups`, `/coach`, `/workspace/[workspaceId]/meal-plan` (page and layout), `/workspace/[workspaceId]/checkins/forms/[formId]`, `/workspace/[workspaceId]/daily`, `/workspace/[workspaceId]/dashboard`, `/workspace/[workspaceId]/nutrition`, `/workspace/[workspaceId]/onboarding/[assignmentId]`.
- Canvas: `find frontend/src/app` gives 3 pages (`/`, `/coach`, `/ethereal`); all 3 appear in ROUTES. `frontend/src/app/layout.tsx` named as root layout: correct.
- ROUTES count vs find: find gives 48 backend `page.tsx` + 1 `route.ts` + 3 canvas = 52. ROUTES lists 46 + 1 + 3 = 50. Gap = F1. FAIL.
- Symbols, 15 sampled signatures, all match source after whitespace normalisation: lib (10, seed 65): `resolveOnboardingSubmissionConsentPolicy`, `listExerciseMuscleGroups`, `ExerciseSearchResult`, `createClientProfile`, `FORM_TOKEN_DOMAIN`, `TaskDueState`, `TokenStoreError`, `acceptInvitationFromLink`, `TASK_DUE_HORIZON_YEARS`, `editHabitFromAction`. Frontend (5): `formatDate`, `getVariant`, `isEmma` (`frontend/src/lib/coaching-data.ts:15,19,23`), `normalizeHex`, `themeVariables` (`frontend/src/lib/ethereal-appearance.tsx:172,246`). PASS on the 15 sampled; completeness FAIL (F2).
- Data model, 8 sampled models (seed 65): `ExerciseImportRun`, `CoachingTemplateVersion`, `Workspace`, `NutritionCatalogItem`, `ClientSetupPin`, `HabitLog`, `HabitSchedule`, `NutritionImportRowOutcome`. Fields, types, kinds, relation counts and schema lines match. Extended to all 48 models: model index rows (count, count, line) and every detail-section field list (name, type, kind) match `db/schema.prisma`. 48 models, 31 enums correct.

**(2) DRIFT** (run in worktree; each mutation reverted with `git restore --source=HEAD`; probe dir removed)

- Baseline: `index:check` EXIT 0.
- (a) export added at `lib/checkin/timezone.ts` (`VERIFY_PROBE_A`): EXIT 1, `drifted: docs/index/SYMBOLS.md at line 7` (1114 to 1115). Restored: EXIT 0.
- (b) field `verifyProbeB String?` added to `model Workspace` in `db/schema.prisma`: EXIT 1, `drifted: docs/index/DATA-MODEL.md at line 7` (480 to 481). Restored: EXIT 0.
- (c) canvas page `frontend/src/app/verify-probe/page.tsx` added: EXIT 1, `drifted: docs/index/ROUTES.md at line 7` (3 to 4 canvas pages). Dir removed: EXIT 0.
- Worktree clean after each step (`git status --porcelain` empty).

**(3) DETERMINISM**

- Run 1 `TZ=Asia/Tokyo LC_ALL=C`: EXIT 0, no diff vs HEAD.
- Run 2 `TZ=America/Los_Angeles LC_ALL=de_DE.UTF-8`: EXIT 0, no diff. Note: `de_DE.UTF-8` is not installed here (`locale -a`: C, C.utf8, en_US.utf8, POSIX), so this run actually used C. Treat it as weak.
- Forced regeneration with `TZ=Pacific/Kiritimati LC_ALL=en_US.UTF-8` then `TZ=Etc/GMT+12 LC_ALL=C`, after deleting the four docs: both produce the same tree hash (`8f2e3cd4...`), but the first pass differs from HEAD in `docs/AGENTS.md` (F5). A second pass returns to HEAD, `index:check` EXIT 0.
- Verdict: deterministic at steady state; not idempotent from a missing-docs state (F5).

**(4) ROUTERS**

- 10 generated routers (`app`, `components`, `db`, `docs`, `icm`, `lib`, `scripts`, `spec`, `tests`, `themes`): 12 to 17 lines each; all within 25.
- Paths named in routers resolve, except `icm/CONTEXT.md` (F4).
- Hand-written survival: appended `VERIFY-HANDWRITTEN-NOTE` below the END marker in `lib/AGENTS.md`; `npm run index` EXIT 0; note kept; generated block unchanged; `index:check` EXIT 0; reverted with `git restore`.
- Count drift in routers: `app/AGENTS.md` (F1), `spec/AGENTS.md:5` says "5 files in 1 subdirectories", but `spec/sheets/` (22 files) is silently omitted (same `SKIP_DIRS` cause as F1).
- Root `AGENTS.md` is hand-written (68 lines), not a generated router; the 25-line rule does not apply to it. Its one added navigation line is correct.
- `frontend/AGENTS.md` pre-exists and is out of the generator's scope; not in the PR diff.

**(5) USEFULNESS** (only docs/index and routers; reads counted per question)

- Q1, session check: `ROUTES.md` row for `/workspace/[workspaceId]` shows `requireSessionUser`; `SYMBOLS.md:143` (under `lib/auth/route-guard.ts`) gives its signature. 2 reads. Index got there. Definition is `lib/auth/route-guard.ts:185`.
- Q2, check-in answers model: `DATA-MODEL.md` model index row 26 gives `CheckInSubmissionAnswer` (`db/schema.prisma:1376`). 1 read. Index got there. It does not say which column holds the value; a second read would be needed for that.
- Q3, coach roster: `GLOSSARY.md` row W2 names `app/workspace/[id]/clients`; `ROUTES.md` maps it to `app/workspace/[workspaceId]/clients/page.tsx`. 2 reads. Partial: the canvas roster component `frontend/src/components/ethereal/clients/client-roster.tsx` is not in the index (`components/` has no SYMBOLS section and no ROUTES row). An agent working on the canvas side would not reach it.

**(6) SCOPE**

- 22 files changed vs `ea8f514`: `.prettierignore`, `AGENTS.md`, 10 routers, `package.json`, `docs/index/*` (5), `scripts/index/generate.ts`, `scripts/index/glossary-seed.json`, `icm/05-build/reports/system-index.md`, `tests/unit/system-index.test.ts`.
- Out of the requested scope: `tests/unit/system-index.test.ts` (F6). Everything else is in scope.
- No change under `db/`, `lib/`, `app/api/`, `frontend/src/` (except `.prettierignore`).
- Secrets: diff grep for connection strings, passwords, keys and tokens. Only type names matching "password"/"token" in signatures (`lib/auth/password-reset*`, `lib/tokens`). No credential values. `.env.example` is tracked (template); no `.env` tracked.

**(7) GATES** (HEAD `4d151e8`, dev install present, logs in `~/.hermes/cache/scratch/verify/`)

| Command                                          | Exit    | Result                                                                                                                                                                      |
| ------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                              | 0       | clean                                                                                                                                                                       |
| `npm run lint`                                   | 0       | 0 errors, 14 warnings; none in the PR's 22 files (warning files are in `app/`, `components/`, `lib/dashboard/config-schema.ts`, `icm/03-plan/tools/`, `tests/integration/`) |
| `npm run test`                                   | 0       | 97 files, 1144 tests passed                                                                                                                                                 |
| `npx vitest run tests/unit/system-index.test.ts` | 0       | 7 passed                                                                                                                                                                    |
| `npm run build`                                  | 0       | Next 16 build, full table                                                                                                                                                   |
| `cd frontend && npm run build`                   | 0       | `/`, `/coach`, `/ethereal` prerendered                                                                                                                                      |
| `npm run test:integration`                       | not run | needs the disposable DB; builder reports 0                                                                                                                                  |

## Required fixes before SHIP

1. F1: stop skipping `app/sheets` (and `spec/sheets` should be inventoried or explicitly listed as excluded in the router). Regenerate; ROUTES must show 48 backend pages and 52 total.
2. F2: include re-exports and alias exports; `frontend/src/lib/utils.ts` must appear. Regenerate; SYMBOLS must match the checker (119 modules, 1161 names).
3. F4: fix the `icm/CONTEXT.md` path.
4. F3: either resolve `@/` against `frontend/src`, or document the limitation in the index README where frontend symbols appear.
5. F5 (recommended): exclude generated `docs/index/` from its own router count.
6. F6: parent decides on the out-of-scope test file.

## Worktree changes by this verification

- Added this file only: `icm/05-build/reports/system-index-verify.md` (untracked).
- All probe mutations reverted; `git status --porcelain` empty at the end of the run; no commit, push or merge.
