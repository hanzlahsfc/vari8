# PR-M6 build: Training payload and the shared volume math

Card slug `pr-m6-training-payload`. Board `vari8`. Track Model. Depends on PR-M0, PR-R0. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-m6-training-payload`, branch `beta/pr-m6-training-payload` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prm6` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3752. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-m6-training-payload && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-M6] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-M6] Training payload and the shared volume math" --body-file icm/05-build/cards/pr-m6-training-payload.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-m6-training-payload --title "[PR-M6] Training payload and the shared volume math" --body "Closes #<issue>. Card pr-m6-training-payload. Plan section PR-M6 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-m6-training-payload && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-m6-training-payload.md > /home/nexuslink/vari8-worktrees/pr-m6-training-payload.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prm6 LANE_PORT=3752 CARD=PR-M6 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-m6-training-payload.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-m6-training-payload.devin.log` and `pr-m6-training-payload.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/gowther/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/gowther/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/spec-driven-implementation/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/sql-queries/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-M6` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

Owner ruling O5 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): this card adds the set-logging model with the per-set shape (actual reps, load, RPE, set note, flags); PR-W8 wires it.
Owner ruling O12 (owner, 2026-10-20, same source): no prescribed load per set; the canvas does not show it.

## Matrix rows this PR closes

- V3-L1-TrainingSet: S07 PARTIAL: TrainingSet, TrainingExercise and TrainingSession shapes differ
- V3-L1-Exercise: S07 PARTIAL: ExerciseDefinition is read-only in backend catalog
- V3-L1-TrainingPlan: S07 PARTIAL: TrainingPlan shape differs from backend

## Files

- `lib/trainingprogram/payload.ts`
- `lib/trainingprogram/validators.ts`
- `lib/training/volume.ts`
- `scripts/seed/35-training.seed.ts`
- their tests

## Build

- Ordered per-set prescriptions, exercise metadata and goals; coach-editable exercise library.
- Move the canvas muscle-volume function into `lib/training/volume.ts` (D29).
- Seed the canvas demo data for this domain (synthetic, values copied from the canvas demo state) in `scripts/seed/35-training.seed.ts`, so the wiring PR's parity run compares like with like.
- No `db/` edits (D34).

## Acceptance (you see)

- A draft round-trips ordered sets; volume per muscle group equals the canvas panel on the demo program.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3752 against `app_prm6` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-M6/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): Calculation guard: literal working-set counts per group for the demo program.

## Report

Write `icm/05-build/reports/PR-M6.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
