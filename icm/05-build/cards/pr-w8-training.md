# PR-W8 build: Wire training

Card slug `pr-w8-training`. Board `vari8`. Track Wiring. Depends on PR-W0, PR-M6, PR-M4. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-w8-training`, branch `beta/pr-w8-training` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prw8` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3803. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-w8-training && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-W8] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-W8] Wire training" --body-file icm/05-build/cards/pr-w8-training.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-w8-training --title "[PR-W8] Wire training" --body "Closes #<issue>. Card pr-w8-training. Plan section PR-W8 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-w8-training && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-w8-training.md > /home/nexuslink/vari8-worktrees/pr-w8-training.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prw8 LANE_PORT=3803 CARD=PR-W8 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-w8-training.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-w8-training.devin.log` and `pr-w8-training.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W8` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-39: S01 PARTIAL: Store slices: client.plans, habits, retiredHabits, entries, exerciseLibrary, coach-level plan (owned by plans/habits/daily surfaces)
- S07-01: S07 PARTIAL: Plans & targets "Training" module row: lifecycle status, plan name, start date, "N sessions · N weeks / Ongoing" detail
- S07-02: S07 PARTIAL: Plan meta: name input, "Starts" date picker, active-plan line; toolbar History/Preview draft/Save draft/Review & activate
- S07-03: S07 UNCONFIGURED: Draft persistence + unsaved-changes guard + "Saved draft and active client content are separate"
- S07-04: S07 PARTIAL: Activation-time validation error list + Review preview dialog
- S07-05: S07 PARTIAL: Activated plan history dialog: versions, retained prescription view, Discard draft, Archive active plan, Create replacement
- S07-06: S07 UNCONFIGURED: Week-based program structure + program length 1-52 + "overrides retained" note
- S07-07: S07 MISSING: Evergreen program mode ("Ongoing program", edits apply across program)
- S07-08: S07 UNCONFIGURED: Week nav strip W1..W52 + carry-forward override semantics ("edits apply until next override")
- S07-09: S07 PARTIAL: Session cards: add/rename/reorder/duplicate/remove
- S07-10: S07 PARTIAL: Exercise rows: name, muscle allocation select, library cue + snapshot banner, reorder/duplicate/remove
- S07-11: S07 PARTIAL: Per-set rows: index, reps, rep-range "Up to", tempo, type, rest selects, per-set instructions, add/remove set
- S07-12: S07 PARTIAL: Template-driven prescription field config (8 toggles + volume + breakdown + presentation)
- S07-13: S07 MISSING: Template option vocabularies + starting defaults for setType/progression/tempo/rest dropdowns
- S07-14: S07 PARTIAL: Exercise library: manage form (name, primary muscle enum, secondary groups multi-select, coaching notes), searchable picker, 10-item starter
- S07-15: S07 CONFLICT: Weekly muscle volume panel: per-group working-set counts, unassigned row, Table or Heatmap presentation, total prescribed sets
- S07-16: S07 PARTIAL: Prescription read view: coach preview column, preview/history dialogs, client "Prescription for <date>" picker
- S07-20: S07 MISSING: "Training Program" module visibility gate on the assigned setup (hidden module shows Empty, data retained)
- S07-22: S07 MISSING: Activation records into check-in review draft (kind, versionId, name, startDate appended on activate when route.review)
- V3-CP13: S07 CONFLICT: Muscle volume table
- V3-CP14: S07 MISSING: Training session logbook
- R3-19: S07 PARTIAL: Render server, CAS, timezone and publish errors, not only local validation
- V3-CP12: S09 MISSING: Body map heatmap

## Files

- `components/canvas/data/training.ts`
- `components/canvas/coach/plans/training/**`
- app/api/v1/** routes the screen calls
- their tests

## Build

- Program editor with per-set rows, exercise library manager, history, volume panel and body map from `lib/training/volume.ts` (D29), client current week.
- Each screen keeps its exact markup; only the data provider and server calls change.
- The canvas demo data for this domain comes from the model PR's seed file; if a value the screen shows is missing, add it to that seed file in this PR.
- No `db/` edits (D34).
- Booking code (TRAINING-I1B-2, `TrainingSessionBooking`) stays and is flagged as possibly removed later (docs/product-decisions.md #119); PR-W8 must not delete booking code without a ruling.

## Acceptance (you see)

- The coach publishes a per-set plan and the client sees the current week with the canvas volume numbers; parity passes.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3803 against `app_prw8` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-W8/build/`.
- Parity (D32) on: `s07-training-editor.png`, `s07-exercise-library.png`.
- Unit (D11, D14): Only keep-category tests (D14) for rules this PR adds; the screen is proven live.

## Report

Write `icm/05-build/reports/PR-W8.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
