# PR-R2 build: Drop database models left without a reader

Card slug `pr-r2-schema-reduction`. Board `vari8`. Track Reduction. Depends on PR-R1, PR-M0. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-r2-schema-reduction`, branch `beta/pr-r2-schema-reduction` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prr2` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3815. May touch `db/`: yes (D34 schema writer).

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-r2-schema-reduction && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-R2] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-R2] Drop database models left without a reader" --body-file icm/05-build/cards/pr-r2-schema-reduction.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-r2-schema-reduction --title "[PR-R2] Drop database models left without a reader" --body "Closes #<issue>. Card pr-r2-schema-reduction. Plan section PR-R2 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-r2-schema-reduction && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-r2-schema-reduction.md > /home/nexuslink/vari8-worktrees/pr-r2-schema-reduction.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prr2 LANE_PORT=3815 CARD=PR-R2 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-r2-schema-reduction.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-r2-schema-reduction.devin.log` and `pr-r2-schema-reduction.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/gowther/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/gowther/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/spec-driven-implementation/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/sql-queries/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-R2` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Backend orphans this PR owns (delete or keep as each line says)

- S12-17: User model (platform identity). Evidence: `db/schema.prisma:124`. (model census: keep if read, drop if not (D33, D34))
- S12-18: Workspace model (tenant boundary). Evidence: `db/schema.prisma:160`. (model census: keep if read, drop if not (D33, D34))
- S12-19: WorkspaceMember model. Evidence: `db/schema.prisma:203`. (model census: keep if read, drop if not (D33, D34))
- S12-20: CoachProfile model. Evidence: `db/schema.prisma:278`. (model census: keep if read, drop if not (D33, D34))
- S12-21: ClientAssignment model (coach-client link). Evidence: `db/schema.prisma:332`. (model census: keep if read, drop if not (D33, D34))
- S12-23: AuditEvent model. Evidence: `db/schema.prisma:375`. (model census: keep if read, drop if not (D33, D34))
- S12-24: AccessToken model (invite/reset tokens). Evidence: `db/schema.prisma:420`. (model census: keep if read, drop if not (D33, D34))
- S12-25: NutritionImportRun model. Evidence: `db/schema.prisma:501`. (model census: keep if read, drop if not (D33, D34))
- S12-26: NutritionImportRowOutcome model. Evidence: `db/schema.prisma:527`. (model census: keep if read, drop if not (D33, D34))
- S12-27: ExerciseImportRun model. Evidence: `db/schema.prisma:581`. (model census: keep if read, drop if not (D33, D34))
- S12-28: ExerciseImportRowOutcome model. Evidence: `db/schema.prisma:607`. (model census: keep if read, drop if not (D33, D34))
- S12-29: OnboardingForm model. Evidence: `db/schema.prisma:632`. (model census: keep if read, drop if not (D33, D34))
- S12-30: OnboardingFormVersion model. Evidence: `db/schema.prisma:660`. (model census: keep if read, drop if not (D33, D34))
- S12-31: OnboardingFormAssignment model. Evidence: `db/schema.prisma:695`. (model census: keep if read, drop if not (D33, D34))
- S12-32: OnboardingSubmissionReview model. Evidence: `db/schema.prisma:1165`. (model census: keep if read, drop if not (D33, D34))

## Files

- `db/schema.prisma`
- `db/migrations/<timestamp>_schema_reduction/**`

## Build

- Census per model (zero readers after PR-R1), then one migration that drops them. Third and last schema writer (D34).

## Acceptance (you see)

- Migration applies to a fresh and to a seeded database; the app and the seed run.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3815 against `app_prr2` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-R2/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): None needed beyond the migration and the full local gate.

## Report

Write `icm/05-build/reports/PR-R2.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
