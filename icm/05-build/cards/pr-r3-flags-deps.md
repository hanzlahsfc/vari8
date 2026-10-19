# PR-R3 build: Collapse product flags and drop unused dependencies

Card slug `pr-r3-flags-deps`. Board `vari8`. Track Reduction. Depends on PR-R1. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-r3-flags-deps`, branch `beta/pr-r3-flags-deps` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prr3` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3818. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-r3-flags-deps && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-R3] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-R3] Collapse product flags and drop unused dependencies" --body-file icm/05-build/cards/pr-r3-flags-deps.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-r3-flags-deps --title "[PR-R3] Collapse product flags and drop unused dependencies" --body "Closes #<issue>. Card pr-r3-flags-deps. Plan section PR-R3 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-r3-flags-deps && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-r3-flags-deps.md > /home/nexuslink/vari8-worktrees/pr-r3-flags-deps.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prr3 LANE_PORT=3818 CARD=PR-R3 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-r3-flags-deps.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-r3-flags-deps.devin.log` and `pr-r3-flags-deps.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/kakashi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/kakashi/skills/systematic-debugging/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/codebase-design/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-R3` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Backend orphans this PR owns (delete or keep as each line says)

- S12-75: ENABLE_SHEET_VIEWER flag. Evidence: `lib/sheet-viewer.ts:7, app/sheets/page.tsx:13`. (delete with the sheet viewer (D33))
- S12-76: ENABLE_ONBOARDING_ASSIGNMENTS flag. Evidence: `lib/onboarding/assignments-boundary.ts:80, app/workspace/[works (collapse into product (D33))

## Files

- `lib/*/gate.ts`
- `.env.example`
- `package.json`
- `package-lock.json`
- `lib/runtime.ts`

## Build

- BACKEND-REDUCTION F10 and F6: delete the 11 product `ENABLE_*` flags and the 2 dev-tool flags whose tools PR-R1 removed; merge the four `classifyXRuntime` copies into one; keep the `APP_ENV` trust check and `ENABLE_CONSENT_GATES` (D19, D33). Remove dependencies with no import left.

## Acceptance (you see)

- A fresh database with an empty `.env` (except database, auth secret and storage) opens every canvas screen.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3818 against `app_prr3` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-R3/build/`.
- Parity (D32) on: `s01-roster.png`, `s01-profile-overview.png`, `s01-profile-plans.png`, `s01-profile-checkins.png`, `s01-profile-notes.png`, `s01-profile-onboarding.png`, `s02-messages.png`, `s02-thread.png`, `s02-thread-attachments.png`, `s02-notes-todos.png`, `s03-checkins-board.png`, `s03-add-extra.png`, `s03-checkin-review.png`, `s04-habit-editor.png`, `s04-template-habits.png`, `s05-templates.png`, `s05-template-editor.png`, `s05-tracker-setup.png`, `s05-client-setup.png`, `s06-mealplan-editor.png`, `s06-template-nutrition.png`, `s07-training-editor.png`, `s07-exercise-library.png`, `s08-builder.webp`, `s08-widget-gallery.png`, `s08-template-dashboard.png`, `s09-tracker-today.png`, `s09-tracker-week.png`, `s09-tracker-trends.png`, `s09-tracker-config.png`, `s10-appearance.png`, `s10-clients-studio.png`, `s10-mealplan-studio.png`, `s11-preferences.png`, `s11-client-preview.png`.
- Unit (D11, D14): The flag-gate tests of deleted flags go with them; the remaining gate tests pass.

## Report

Write `icm/05-build/reports/PR-R3.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
