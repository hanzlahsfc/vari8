# Backend reduction audit: Vari8-Beta

Scope: root Next app (`app/`, `lib/`, `components/`, `scripts/`, `db/`). `frontend/` (canvas) is read only, taken as is. Tests counted separately.
Ledger: 60,588 prod lines measured. Estimated cut: 25,163 lines (41.5%). 20,139 of that is certain (census-proven or directed by D33). 5,024 is conditional on the checks in section 5.

## 1. Measured LOC per directory

Non-blank lines, tracked `.ts/.tsx/.js/.mjs/.cjs`. Method in section 6.

| Directory | Files | LOC | Notes |
|---|---:|---:|---|
| `app/workspace/**` | 60 | 10,959 | 45 tsx (7,425) + 15 ts actions (3,534). Old coach UI. Replaced by canvas. |
| `app/(tracker)/**` | 25 | 3,742 | 21 tsx (3,368) + 4 ts (374). Old client tracker UI. Replaced by canvas. |
| `app/` other | 25 | 1,150 | library 225, sheets 149, daily 205, page 28, invite 176, login 108, reset 118, reset-request 85, others. |
| `lib/` | 116 | 38,114 | checkin 6,463, coaching 5,793, trainingprogram 4,695, onboarding 4,075, dashboard 1,954, daily-entry 1,903, auth 1,746, workspace 1,664, mealplan 1,658, extraction 1,527, habits 1,354, tasks 846, audit 624, consent 582, gdpr 485. |
| `components/` | 31 | 6,035 | checkin 2,372, trainingprogram 1,526, mealplan 856, onboarding 667. Old UI. |
| `db/` | 36 | n/a | `schema.prisma` 1,874 lines, 48 models, 31 enums. Migrations not counted. |
| `scripts/` | 3 | 588 | extract-sheets 430, import-nutrition 79, import-exercise 79. |
| **Prod total** | | **60,588** | app + lib + components + scripts. |
| `tests/` | 213 | 78,183 | Not in prod total. unit 109 files, integration 57, e2e 47. |
| `frontend/src` | 189 | 102,397 | Canvas. Not touched. |

## 2. Findings

Evidence paths are current line numbers. "Canvas needs" cites GAP-MATRIX rows, D-rows in `icm/03-plan/DECISIONS.md`, or PLAN sections. `WIRING-SPEC.md` does not exist on disk (see section 5).

| # | Finding | Evidence | Canvas needs | Action | Lines out | Risk | PR owner |
|---|---|---|---|---|---:|---|---|
| F1 | Old root UI pages | `app/workspace/**/*.tsx` (45), `app/(tracker)/**/*.tsx` (21), `app/library`, `app/sheets`, `app/daily/page.tsx:15` (prototype gate), `app/page.tsx` (dev index). Six tracker layouts, 130 to 145 lines each, same skeleton (`app/(tracker)/workspace/[workspaceId]/*/layout.tsx`). | Canvas draws S01 to S11 (35 screens, PLAN PR-R1 parity). D3, D33. | DELETE | 11,400 | Low. Parity gate D32. | PR-R1 after PR-W2 to PR-W10 |
| F2 | Old components | `components/**` (31 files). Draft editors duplicated: `components/checkin/draft-editor.tsx` vs `components/onboarding/draft-editor.tsx` (87 shared 8-line windows). Keep `sign-out-button.tsx` (12 lines) for auth. | Canvas replaces every screen (GAP S03, S04, S06, S07, S09). | DELETE | 6,023 | Low. | PR-R1 |
| F3 | Action layer with a boundary hop | 19 action files: `app/workspace/[workspaceId]/checkins/actions.ts` and `onboarding/actions.ts` share 62 windows. Gross 3,908 lines. Each action calls a `lib/*/boundary.ts`, which calls a service. | One HTTP API under every screen (D6), capability table in PR-05 (D15). | REPLACE with `app/api/v1` handlers. Handlers call services directly. Estimate 50% net (unverified). | 1,954 | Medium. Non-disclosing errors must survive (see F9). | PR-05, PR-W1 to PR-W10 |
| F4 | Template-version transition subsystem | `lib/coaching/client-setup-transition.ts` (700), `client-setup-transition-boundary.ts` (327), `client-setup-transition-gate.ts` (40), `transition-diff.ts` (481), `transition-impact.ts` (388), `impact-consumers.ts` (73, one provider at line 33 to 36), `daily-entry-impact.ts` (136), `app/workspace/[workspaceId]/client-setups/transition-actions.ts` (225). | GAP-MATRIX ORPHAN R3-16: "canvas none" for upgrade, rollback, versionSeq. D33: "template transitions only if a canvas flow calls them." Grep of `frontend/src` for upgrade, rollback, impact: 0 hits. | DELETE once S01-27 ("setup review" on assign) is confirmed not to call transition-diff. | 2,370 | Medium, conditional. | PR-R1 (already lists R3-16) |
| F5 | Extraction pipeline, partial | Delete `lib/extraction/crosssheet.ts` (179), `databases.ts` (247), `redact.ts` (190), `source.ts` (122), `summaries.ts` (263), `theme.ts` (78). Also `scripts/extract-sheets.ts` (430) and `package.json:18`. Keep `contracts.ts`, `parse.ts`, `normalize.ts`, `css.ts`: `lib/nutrition/source.ts:9-10` and `lib/exercise/source.ts:3,9` import them, and those feed KEEP importers. | None. Canvas has no sheet viewer. D33: extraction goes "when no runtime caller remains". | DELETE partial | 1,509 | Low to medium. The CLI command is removed. | PR-R1 (fix its S12 list, section 5) |
| F6 | Dead helpers with dead-only callers | `lib/daily-prototype.ts` (278; callers `app/daily/*`, `lib/daily-entry/gate.ts:19-20`). `lib/sheet-viewer.ts` (13). `lib/catalog.ts` (154; callers are `app/library`, `app/sheets`, tests). `lib/spec-artifacts.ts` (50; same callers). `lib/trainingprogram/weeks.ts:191` `versionForWeek` (27, zero callers). `lib/daily-entry/gate.ts:33` conflict branch (about 10). | None. GAP-MATRIX R3-20, R3-21, R3-22. | DELETE | 532 | Low. | PR-R1 (catalog, weeks), PR-R3 (flag helpers) |
| F7 | Storage port with zero callers | `lib/storage.ts`: 0 prod importers. Only implementation is `nullObjectStorage` (`:117`). | D20: media goes behind `lib/storage.ts` with two adapters (local, S3). Canvas media rows S02-08, S02-24 and V1-X2 are PR-MEDIA. | DELETE now. PR-MEDIA recreates it when two adapters exist. | 120 | Low. | PR-MEDIA (re-add) |
| F8 | Retry logic copied 18 times | `withSerializedRetry` and `isRetryableSerialization` plus `MAX_ATTEMPTS` and `BACKOFF_BASE_MS`: `lib/checkin/forms.ts:321,334`, `lib/checkin/instances.ts:381,425`, `lib/coaching/parameters.ts:465,478`, `lib/mealplan/service.ts:135,182`, `lib/trainingprogram/service.ts:155,233`, and 13 more. 484 function lines plus 36 constant lines. Shared classifier already exists at `lib/db.ts:19`. | Truthful conflict states, not copies: R3-15 (`lib/checkin/instances.ts:57-66`), R3-19 (`lib/mealplan/boundary.ts:28-55`). | MERGE into `lib/db.ts` as one `withSerializedRetry`. | 495 | Low. Behaviour tests exist. | No PLAN PR. Propose a lib-only PR before PR-M1 |
| F9 | Boundary helpers copied 16 times | `CLOSED_MESSAGES`, `fail`, `mapError`, `guard` in 16 boundary files: `lib/tasks/boundary.ts:35,46,50,67`, `lib/habits/boundary.ts:38,49,53,70`, `lib/mealplan/boundary.ts:42,58`. 205 lines total. | Closed, non-disclosing vocabulary is needed (R3-15, R3-19). | MERGE into `lib/boundary.ts`. | 155 | Low. | PR-05 |
| F10 | Feature flags and classifier copies | 13 `ENABLE_*` flags (`.env.example:26-113`). Four near-identical `classifyXRuntime` copies (first two checked line for line): `lib/checkin/forms-gate.ts:31`, `lib/mealplan/gate.ts:33`, `lib/onboarding/submission-consent.ts:43`, `lib/trainingprogram/gate.ts:23`. About 285 flag-check lines in app, lib, components. | See section 3. | DELETE 11 product flags and 2 dev-tool flags. MERGE the 4 classifiers into one. | 330 | Low. Gate tests go with flags. | PR-R3 |
| F11 | Consent gates, five files | `lib/consent.ts` (582), `lib/checkin/instances-consent.ts` (49), `lib/mealplan/consent.ts` (48), `lib/trainingprogram/consent.ts` (46), `lib/onboarding/submission-consent.ts` (67). `ENABLE_CONSENT_GATES`: 0 hits in code. | Parked by D12. Canvas draws no consent UI. | MERGE into one gate behind `ENABLE_CONSENT_GATES` (D19). Low-confidence estimate. | 200 | High. 21 test files import `lib/consent.ts`. | PR-04 (PLAN line 261) |
| F12 | Seam with zero implementations | `lib/auth/password-reset-delivery.ts:43-45`: `ADAPTERS` is `{}`. | D17: one delivery port with a dev adapter. | KEEP the port. INLINE the empty registry. | 15 | Low. | PR-04, PR-05 |
| F13 | Dead symbols | 18 exported names referenced nowhere else: `lib/coaching/transition-impact.ts:44` (`IMPACT_REASON_RANK`), `lib/dashboard/config-schema.ts:913-914`, `lib/nutrition/source.ts:39`, `lib/exercise/source.ts:38`, `lib/trainingprogram/service.ts:3346` (`ClientBooking`), `lib/consent.ts:47` (`ConsentSource`), plus `app/(tracker)/.../dashboard/actions.ts:14,47,55`. 207 export names have no importer, mostly types. 174 lib names are used only by tests. | None. | DELETE the 18. Drop `export` on the rest. | 60 | Low. | PR-R1, PR-M* |
| F14 | Parked code with zero prod callers | `lib/gdpr.ts` (25), `lib/gdpr/export.ts` (375), `lib/gdpr/retention.ts` (110). | D12 parks consent and data-protection rules. GAP-MATRIX R3-JUDGED G6-504: no canvas surface. | KEEP-with-reason. Owner call. | 0 (510 held) | n/a | Owner |
| F15 | Schema | 48 models. Direct census: no model loses its last direct reader when the UI is deleted. `NutritionImportRun`, `NutritionImportRowOutcome`, `ExerciseImportRun`, `ExerciseImportRowOutcome` are write-only audit tables. | D33 keeps audit and catalog importers. | KEEP. Run a transitive census in PR-R2, after PR-W. | 0 | n/a | PR-R2 |

Test lines that die with the code: 1,988 (22 files import only cut-set files) plus 935 (four transition unit tests: `transition-diff`, `transition-impact`, `daily-entry-impact`, `client-setup-transition-actions`). Total 2,923, not in the prod total. 43 of 47 e2e specs (18,491 lines) hit root routes: 38 hit `/workspace`, 10 hit `/daily`, 38 hit `/login` (kept). These are rewritten by PR-W, not deleted.

## 3. Looks like a cut, is not

- `lib/gdpr/*` (510 lines). Parked by D12. Owner decision.
- Auth pages `app/login`, `app/invite`, `app/reset*`, `app/logout`, `app/forbidden.tsx`, and `lib/auth/*`. The canvas has no login UI (`frontend/src/app` holds only `coach`, `ethereal`, `page.tsx`).
- `lib/audit.ts` (624). D33 keeps audit.
- Catalog importers `lib/nutrition/import.ts`, `lib/exercise/import.ts`, `scripts/import-*.ts`. D33 keeps them.
- Feature flags guarding nothing. None is dead today. `ENABLE_DAILY_PROTOTYPE` and `ENABLE_SHEET_VIEWER` guard dev tools that get deleted (F1, F6). The other 11 guard product features the canvas assumes always on (D33). Nothing is left to guard once canvas-only lands.
- Eight fail-closed `assert*ExternallyExposable` guards (for example `lib/consent.ts:145`, `lib/storage.ts:129`, `lib/tokens.ts:30,48,67`). About 60 lines (estimate). They die with each route's wiring PR under D14, not counted above.

## 4. Top 15 cuts, ranked by lines

| Rank | Cut | Lines | Certainty | PR |
|---:|---|---:|---|---|
| 1 | F1 Old root UI pages | 11,400 | certain | PR-R1 |
| 2 | F2 Old components | 6,023 | certain | PR-R1 |
| 3 | F4 Template-version transition subsystem | 2,370 | conditional | PR-R1 |
| 4 | F3 Action layer to `app/api/v1` | 1,954 | estimate | PR-05, PR-W* |
| 5 | F5 Extraction pipeline, partial | 1,509 | certain | PR-R1 |
| 6 | F6 Dead helpers | 532 | certain | PR-R1, PR-R3 |
| 7 | F8 Retry copies into `lib/db.ts` | 495 | certain | new lib-only PR |
| 8 | F10 Flags and classifiers | 330 | conditional | PR-R3 |
| 9 | F11 Consent gates merged | 200 | conditional, low confidence | PR-04 |
| 10 | F9 Boundary helpers merged | 155 | conditional | PR-05 |
| 11 | F7 Storage port (re-added in PR-MEDIA) | 120 | certain | PR-R1 or now |
| 12 | F13 Dead symbols | 60 | certain | PR-R1 |
| 13 | F12 Empty adapter registry | 15 | conditional | PR-04 |
| 14 | Tests that die with the code | 2,923 (not prod) | certain | PR-R1 |
| 15 | Fail-closed `ExternallyExposable` guards | about 60 (not in total) | certain at route wiring | PR-W* |

**Total estimate: 25,163 prod lines out** (41.5% of 60,588). Certain: 20,139. Conditional or estimate: 5,024. Remaining prod after cuts: about 35,425.

## 5. Defects to fix before PR-R1 runs

1. `icm/02-gap-matrix/output/F1/WIRING-SPEC.md` does not exist. `F1-card.md:48`, `PLAN-brief.md:18`, `RESUME-2026-10-18-crash.md:8` all name it. This audit cites GAP-MATRIX rows and DECISIONS/PLAN instead.
2. PLAN PR-R1 disposal list (`PLAN.md:1885`) includes S12-43 (`lib/db.ts`, the Prisma singleton used by the services and both import scripts). It also includes S12-44, S12-48, S12-49 (extraction `contracts`, `normalize`, `parse`). `lib/nutrition/source.ts:9-10` and `lib/exercise/source.ts:3,9` import those, and S12-57 and S12-58 depend on them. Remove those four ids from R1.
3. PLAN PR-R1 disposes R3-17 (parameter create, edit, archive). GAP-MATRIX (`:515`) says it "stays an active ORPHAN." Resolve with the owner. R3-18 is safe to dispose: canvas draws add and toggle only (GAP-MATRIX `:603`).
4. PLAN PR-R1 file list omits `scripts/extract-sheets.ts` and `package.json:18` (`extract:sheets`). It names `components/canvas/data/*.ts`, which is not in the root tree (it lives under `frontend/`).
5. D33 says "keeps development-only gates." After this audit none remain except the `APP_ENV` trust checks. `ENABLE_CONSENT_GATES` is not in code yet (PR-04).
6. No PLAN PR owns F8 (retry copies). Propose a lib-only PR before PR-M1.
7. Verify S01-27 ("setup review") before cutting F4. The string does not occur in canvas `.tsx`.

## 6. Method and limits

- LOC: non-blank lines, tracked code files, per directory. `frontend/`, `tests/`, `icm/`, `docs/`, `spec/` excluded from the prod total.
- Import graph: regex parser for `import`, `export ... from`, and `import()`, resolving `@/` and relative paths. Root files included (`auth.ts`). Name-level matching. `import *` counted as using every name. Not a TypeScript compiler.
- Dead exports: 207 names with no importer; 18 with zero references anywhere in code (word count).
- ts-prune not run. The worktree has no `node_modules`, and no install was attempted.
- Duplicates: normalized 8-line windows, trivial lines dropped. 1,400 duplicate windows across 119 files. Cluster counts overlap, so they are not summed.
- Flag call sites: grep, about 285 lines.
- Items marked "est." or "estimate" are judgement, not measured. Expect about plus or minus 10% on F3 and F11.
- Raw data: `/home/nexuslink/.hermes/cache/scratch/graph.json` (import graph, exports, per-file LOC), `loc.json`.
