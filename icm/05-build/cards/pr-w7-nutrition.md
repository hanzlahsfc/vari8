# PR-W7 build: Wire nutrition and meal plans

Card slug `pr-w7-nutrition`. Board `vari8`. Track Wiring. Depends on PR-W0, PR-M5, PR-M4. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-w7-nutrition`, branch `beta/pr-w7-nutrition` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prw7` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3800. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-w7-nutrition && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-W7] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-W7] Wire nutrition and meal plans" --body-file icm/05-build/cards/pr-w7-nutrition.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-w7-nutrition --title "[PR-W7] Wire nutrition and meal plans" --body "Closes #<issue>. Card pr-w7-nutrition. Plan section PR-W7 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-w7-nutrition && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-w7-nutrition.md > /home/nexuslink/vari8-worktrees/pr-w7-nutrition.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prw7 LANE_PORT=3800 CARD=PR-W7 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-w7-nutrition.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-w7-nutrition.devin.log` and `pr-w7-nutrition.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W7` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

Owner ruling O2 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the food diary N04 to N07 stays deferred and out of wiring scope.
Owner ruling O11 (owner, 2026-10-20, same source): archived meal plans are the superseded immutable plan versions; this card lists them as the archive.

## Matrix rows this PR closes

- V3-CO02: S06 CONFLICT: Nutrition totals computed automatically
- S06-01: S06 PARTIAL: Plan lifecycle: draft + single active + history + archive, status labels, date-applicable selection
- S06-02: S06 PARTIAL: Plan name + startDate fields
- S06-03: S06 UNCONFIGURED: Variant ("option") tabs: add, rename, duplicate, delete options
- S06-04: S06 PARTIAL: Meal rows: name, time, frequency; add/remove/duplicate/reorder meals
- S06-05: S06 MISSING: Food portions inside a meal: food row = catalog food + quantity in food's own unit
- S06-06: S06 MISSING: Approved alternatives ("Swap" per portion: alt food + equivalent quantity + optional note)
- S06-07: S06 CONFLICT: Per-portion, per-meal and per-variant computed kcal/P/C/F display
- S06-08: S06 CONFLICT: Macro-energy distribution ring (P/C/F % at 4/4/9) in overview + IIFYM preview
- S06-09: S06 MISSING: Variant schedule: Every day / Weekly (training+rest roles, weekday strip, custom weekdays) / Repeating cycle (anchor date + steps 1–28d, ≤36
- S06-10: S06 MISSING: Saved meals library: save meal, search by meal/food, rename, duplicate, delete with undo, load into meal
- S06-11: S06 PARTIAL: Food database: 584 foods {id,name,amount,unit,protein,carbs,fat,calories} powering pickers + nutrient math
- S06-12: S06 PARTIAL: DatePicker + TimePicker themed popovers (calendar grid, Apply-commit time edit, Today/Clear)
- S06-13: S06 PARTIAL: Client plan preview: "Prepared for {client}", variant label, schedule instruction text, per-meal food/portion/swap table, meal totals
- S06-14: S06 PARTIAL: IIFYM editor: named target options; style Calories\
- S06-15: S06 CONFLICT: IIFYM preview: target text, derived ~kcal from macro targets at 4/4/9, macro ring, schedule text
- S06-16: S06 PARTIAL: Plan validation on save/activate (name, valid start date, ≥1 option w/ positive portions, label/time validity, food refs exist, schedule com
- V2-H2: S06 CONFLICT: Blank numeric inputs saved as zero, violates missing-is-not-zero
- V3-CP09: S06 MISSING: IIFYM day cards for training and rest days
- V3-CP10: S06 CONFLICT: IIFYM macro distribution ring
- V3-CP11: S06 UNWIRED: ClientPlanPreview meal plan panel
- R3-3: S06 PARTIAL: Nutrition rolling window and declared as-of date
- R3-4: S06 CONFLICT: Computed attainment and below/above/minimum status
- R3-5: S06 CONFLICT: Fixed-target percent and ring fill
- R3-6: S06 PARTIAL: Configured TD/NTD/active source mapping
- R3-9: S06 CONFLICT: Weekly/monthly means of intake and target bounds
- R3-11: S06 CONFLICT: Collapsing a range target to one midpoint
- R3-14: S06 CONFLICT: Automatic starter meals, food picks and quantities
- S10-20: S10 UNWIRED: Meal plans studio page: plan/variant editing, nutrition targets, cycle schedule, saved-meal library, food swap picker, archive, client plan

## Files

- `components/canvas/data/nutrition.ts`
- `components/canvas/coach/plans/nutrition/**`
- `components/canvas/ethereal/mealplan/**`
- app/api/v1/** routes the screen calls
- their tests

## Build

- Meal plan editor, food catalog, saved meals, IIFYM, client preview, computed totals and ring from `lib/nutrition/math.ts` (D29), the meal plans studio page.
- Each screen keeps its exact markup; only the data provider and server calls change.
- The canvas demo data for this domain comes from the model PR's seed file; if a value the screen shows is missing, add it to that seed file in this PR.
- No `db/` edits (D34).

## Acceptance (you see)

- The coach publishes the demo plan and the client sees the same totals the canvas shows; parity passes.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3800 against `app_prw7` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-W7/build/`.
- Parity (D32) on: `s06-mealplan-editor.png`, `s06-template-nutrition.png`, `s10-mealplan-studio.png`.
- Unit (D11, D14): Only keep-category tests (D14) for rules this PR adds; the screen is proven live.

## Report

Write `icm/05-build/reports/PR-W7.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
