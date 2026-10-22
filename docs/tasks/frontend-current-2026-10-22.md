# Current frontend publication

## Authority and scope

The product owner requested a PR pipeline, direct review of the current VARI8
frontend, and a clean merge into `FRONTEND`. Promotion to `main` remains
Hanzlah's responsibility.

Publication checkout: `/private/tmp/vari8-frontend-publish-20261022`.
Source: the separate `ui sys` workspace. Its Git history is not imported.
Base: `great-tracker/FRONTEND` at
`fe5780dd5b759823b98f5adb4495530923cf4beb`.
Feature branch: `devin/vari8-frontend-current-20261022`.

Only `frontend/` and this publication/status record may change. Root app,
backend, database, dependencies and CI workflows remain unchanged. Preserve
the owner's source worktree and running local preview.

## Overlay plan

1. Additively copy source `src/`, `public/`, `scripts/` and `prompts/` into
   their corresponding `frontend/` paths.
2. Exclude `.DS_Store`, caches, dependencies, build output, environment files,
   local run/capture archives, reports and the unreferenced duplicate
   `client-tracker-preview/time-input 2.tsx`.
3. Copy `MEALPLANS.md`, `TRACKER-REDESIGN.md`, shared agent entrypoints,
   `PROJECT_CONTEXT.md`, `docs/DESIGN_SYSTEM.md`, the two approved feature
   briefs, stage/role context, ICM references, pinned Conductor reference and
   `docs/PR-WORKFLOW.md`.
4. Preserve target-only product files and `scripts/test-frontend.mjs`. Do not
   mirror-delete files or replace the standalone frontend README.
5. Preserve the target `.gitignore`, which tracks tests. Do not copy the
   source's local test-file ignore rules.
6. The source and target dependency lockfiles are byte-identical. Keep the
   target dependencies/lockfile and merge source scripts additively, retaining
   target `test` and `check`.
7. Copy the source Biome config's report exclusion and the source Next config
   that excludes development playground code from production bundles. Keep
   all unrelated target configuration.

## Existing regression preservation

The source roadmap tests do not contain two publication-specific active-plan
cases. Preserve the complete base roadmap test fixture and assertions as
`frontend/src/components/coach/roadmap-publication.test.mjs`. Adapt only its
module loading to the current domain and target-model imports.

Two inherited nutrition test fixtures assumed two default options, while the
current approved factory creates one neutral Daily plan. Repair the fixtures,
not the production behavior:

- In the all-options-positive IIFYM test, explicitly append a second zero
  calorie option before the first validation assertion. Clone the first
  option, use a unique `rest-option` ID and `Rest Day` label. Keep the
  existing zero/first-filled/both-filled assertions.
- In the weekly-role round-trip test, explicitly append a second meal-plan
  variant before destructuring training/rest IDs. Clone the first variant,
  use a unique `rest-role-option` ID and `Rest Day` label. Preserve the
  existing date-assignment and immutable activation assertions.

Do not remove tests, weaken validation, skip failures or change product
defaults to obtain a green run.

## Verification and review

Run the publication frontend's `npm ci` and `npm run check` using Node 24.
Prefer offline installation if the existing cache is sufficient; do not
replace the configured gate with source-only demo checks.

Record frontend desktop/mobile inspection on the publication snapshot,
particularly Activity targets, compact Supplements, saved client previews,
keyboard selection and the development-only playground boundary. Keep
artifacts outside Git. Report unavailable accessibility/performance checks
truthfully rather than invent evidence or change requirements.

The main session directly reviews the entire final diff. Repair concrete
blocking findings and re-run affected checks. Use `git diff --check` and an
explicit path audit before each commit. No source-workspace Git operations,
forced pushes or commits directly to shared branches.

## Publication and merge

After review and passing local gates:

1. Commit only the intended frontend and publication record paths.
2. Fetch the explicit `FRONTEND` ref again. If it advanced, merge that shared
   ref into the feature branch without rebasing published history.
3. Non-forced push of the feature branch to `great-tracker`.
4. Open one PR with base `FRONTEND`, checking for duplicates first.
5. Record the direct review and exact CI outcomes.
6. Merge only this PR into `FRONTEND` after required checks are green and
   the head is still the reviewed commit. Use the allowed squash method
   for the clean integration commit. Do not delete shared branches.
7. Verify the merged PR, resulting `FRONTEND` commit and unchanged `main`.

## State

Overlay applied and publication gates verified locally; commit, push, PR and
merge remain pending.

### Verification

- `npm test` in `frontend/`: 252 tests, 252 pass, 0 fail (exit 0).
- `npm run check` in `frontend/`: exit 0 — tests, agent-context check,
  `tsc --noEmit`, Biome (`check . --error-on-warnings`, 260 files, no
  findings) and `next build --webpack` all green. Build routes: `/`,
  `/_not-found`, `/coach`, `/dev/design-system`, `/ethereal`.
- Five stale test assertions were updated to deliberate current behavior
  (test files only): accent-contrast screenshot pink now keeps its fill with
  a dark label; mid-gray `#777777` keeps its fill with a black label; the
  widget catalogue count is 22 after CU17/CU18; CU17/CU18 intentionally have
  no source-record detail and are skipped by allowlist; `ChartPeriodControl`
  asserts the shared VARI8 `Select` trigger label and hidden input value
  instead of native `<option selected>`.
- Browser smoke on a dedicated dev server (port 3100, headless Chrome CDP):
  1440×900 and 390×844 screenshots of the Supplements plan, the Activity
  targets plan (`plan=activity-targets`) and the client preview dialog for
  `client-001`. Zero console errors; one `/favicon.ico` 404 in dev.
- `/dev/design-system` is listed in the production build but fails closed:
  built HTML renders the 404 page and the production webpack alias replaces
  the playground module with a throwing stub.
