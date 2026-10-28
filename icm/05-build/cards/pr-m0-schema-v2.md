# PR-M0 build: Schema v2: every canvas entity in one migration set

Card slug `pr-m0-schema-v2`. Board `vari8`. Track Model. Depends on PR-05. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-m0-schema-v2`, branch `beta/pr-m0-schema-v2` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prm0` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3731. May touch `db/`: yes (D34 schema writer).

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-m0-schema-v2 && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-M0] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-M0] Schema v2: every canvas entity in one migration set" --body-file icm/05-build/cards/pr-m0-schema-v2.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-m0-schema-v2 --title "[PR-M0] Schema v2: every canvas entity in one migration set" --body "Closes #<issue>. Card pr-m0-schema-v2. Plan section PR-M0 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-m0-schema-v2 && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-m0-schema-v2.md > /home/nexuslink/vari8-worktrees/pr-m0-schema-v2.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prm0 LANE_PORT=3731 CARD=PR-M0 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-m0-schema-v2.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-m0-schema-v2.devin.log` and `pr-m0-schema-v2.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/gowther/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/gowther/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/spec-driven-implementation/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/sql-queries/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-M0` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- V3-L1-Plan: S05 MISSING: Flat Plan entity has no backend model
- V3-L1-ClientPlans: S05 MISSING: ClientPlans aggregate has no backend equivalent
- V3-L1-IIFYM: S06 MISSING: IifymOption and IifymPlan have no backend equivalent
- V3-L1-ClientGoal: S07 MISSING: ClientGoal has no backend equivalent

## Production-readiness P0 rows this PR owns (`icm/05-build/audits/PRODREADY-BASELINE.md`)

- PR-001: Designed schema, not improvised tables (PARTIAL): baseline owner
- PR-015: Migrations run forward and roll back (PARTIAL): baseline owner
- PR-024: Timezones stored correctly (PARTIAL): baseline owner

## Files

- `db/schema.prisma`
- `db/migrations/<timestamp>_schema_v2/**`
- `lib/db-types/**`

## Build

- The only schema writer of the model wave (D34). Add everything the canvas model needs (`frontend/src/components/coach/model.ts`, `plans/domain.ts`, `plans/types.ts`, `builder/schema.ts`), in one reviewed migration set:
- ClientProfile: label, coachingSince, heightCm, archivedAt, archive reason (D27). Workspace: retentionDays default 90, appearance (mode, accent, font, density), logo media id, availability text, notification toggles (D25). Member preference: sidebar collapsed.
- CoachNote and CoachTask (workspace or client linked, D26); TrackerComment (client x date x parameter).
- Template definition slots: modules, summaryParameterIds (max 4), nutrition mode, per-field unit and option overrides, questionnaire binding, dashboard layout (D31). ParameterKind additions for TIME, DURATION, BLOOD_PRESSURE, LOCATION_RATING, CONTEXT, MULTI_CHOICE (D28).
- CheckInInstance coach note; CheckInAnswerKind RATING and VISUAL. Habit reason. ClientGoal. SavedMeal. Coach-editable ExerciseLibraryItem.
- Conversation, Message, MessageAttachment, MessageDraft, MessageRead, per-client priority-flag permission (D20). MediaObject (D20).
- Soft-delete restore window columns for every entity the canvas undoes (D24).
- Migration applies to a fresh database and to a database seeded by PR-04; down path documented.

## Acceptance (you see)

- `prisma migrate deploy` on a fresh and on a seeded database exits 0; `prisma validate` exits 0; the seed still runs.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3731 against `app_prm0` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-M0/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): One integrity test per new uniqueness or foreign-key rule the canvas relies on (for example one draft per client conversation). Each bites.

## Report

Write `icm/05-build/reports/PR-M0.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
