# PR-R1 build: Delete what the canvas replaced

Card slug `pr-r1-delete-superseded`. Board `vari8`. Track Reduction. Depends on PR-W2, PR-W3, PR-W4, PR-W5, PR-W6, PR-W7, PR-W8, PR-W9, PR-W10, PR-MSG. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-r1-delete-superseded`, branch `beta/pr-r1-delete-superseded` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prr1` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3812. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-r1-delete-superseded && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-R1] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-R1] Delete what the canvas replaced" --body-file icm/05-build/cards/pr-r1-delete-superseded.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-r1-delete-superseded --title "[PR-R1] Delete what the canvas replaced" --body "Closes #<issue>. Card pr-r1-delete-superseded. Plan section PR-R1 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-r1-delete-superseded && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-r1-delete-superseded.md > /home/nexuslink/vari8-worktrees/pr-r1-delete-superseded.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prr1 LANE_PORT=3812 CARD=PR-R1 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-r1-delete-superseded.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-r1-delete-superseded.devin.log` and `pr-r1-delete-superseded.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/kakashi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/kakashi/skills/systematic-debugging/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/codebase-design/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-R1` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-13: S01 MISSING: Whole-state persistence: localStorage key coach-desktop-mockup-v1, isCoachState validation, migrate+normalize on hydrate

## Backend orphans this PR owns (delete or keep as each line says)

- S12-08: Raw workbook sheet index (dev tool). Evidence: `app/sheets/page.tsx:12`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-09: Raw workbook sheet detail (dev tool). Evidence: `app/sheets/[slug]/page.tsx:20`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-10: Workspace list (workspace picker). Evidence: `app/workspace/page.tsx:15`. (old UI page, delete after the canvas screen is wired (D33))
- S12-11: Owner-only workspace admin area. Evidence: `app/workspace/[workspaceId]/admin/page.tsx:12`. (old UI page, delete after the canvas screen is wired (D33))
- S12-12: Client coach-assignment panel + actions. Evidence: `app/workspace/[workspaceId]/clients/[clientProfileId]/coac (old UI page, delete after the canvas screen is wired (D33))
- S12-45: Extraction cross-sheet pass. Evidence: `lib/extraction/crosssheet.ts:1`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-50: Extraction redaction. Evidence: `lib/extraction/redact.ts:1`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-51: Extraction source loader. Evidence: `lib/extraction/source.ts:1`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-52: Extraction summaries. Evidence: `lib/extraction/summaries.ts:1`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- S12-53: Extraction theme. Evidence: `lib/extraction/theme.ts:1`. (delete when the census shows no runtime caller (D33, BACKEND-REDUCTION F5, F6))
- R3-16: Template-version upgrade, rollback, discovery, review and execute. Evidence: `lib/coaching/client-setup-transi (census then delete or keep (D33, BACKEND-REDUCTION F4, F6))
- R3-18: Client-task title and date editing, and cancellation. Evidence: `lib/tasks/service.ts:311,391`, `app/workspace (census then delete or keep (D33, BACKEND-REDUCTION F4, F6))
- R3-20: Dead duplicate sheetDisplayName helper. Evidence: `lib/catalog.ts:172-174`, live duplicate `lib/spec-artifacts (census then delete or keep (D33, BACKEND-REDUCTION F4, F6))
- R3-21: Public synthetic fixture library pages, not canvas catalog editors. Evidence: `app/library/foods/page.tsx:1-26 (census then delete or keep (D33, BACKEND-REDUCTION F4, F6))
- R3-22: Uncalled versionForWeek helper. Evidence: `lib/trainingprogram/weeks.ts:185-211`, no production caller (search (census then delete or keep (D33, BACKEND-REDUCTION F4, F6))

## Files

- app/workspace/** (UI pages)
- `app/(tracker)/**`
- `app/library/**`
- `app/sheets/**`
- `app/daily/**`
- components/** (old UI, keep `sign-out-button.tsx` if still used)
- `lib/extraction/{crosssheet,redact,source,summaries,theme}.ts`
- scripts/extract-sheets.ts and the `extract:sheets` script
- `lib/daily-prototype.ts`
- `lib/sheet-viewer.ts`
- `lib/catalog.ts`
- `lib/spec-artifacts.ts`
- lib/trainingprogram/weeks.ts (`versionForWeek`)
- lib/coaching/_transition_ (conditional, F4)
- components/canvas/data/*.ts (localStorage fallbacks, created by PR-01 and PR-W0)
- `frontend/**`
- tests that only covered deleted code

## Build

- Input: `icm/05-build/BACKEND-REDUCTION.md` (findings F1, F2, F4, F5, F6, F13; about 21,800 lines). Census first: for every candidate, a committed command output proving zero runtime callers (`icm/05-build/reports/PR-R1-census.txt`).
- Do not delete `lib/db.ts` or the extraction modules the catalog importers (`lib/nutrition/source.ts`, `lib/exercise/source.ts`) import directly or through `parse.ts`: `contracts.ts`, `databases.ts`, `normalize.ts`, `parse.ts`, `css.ts`. They are not R1 work; the census only confirms they still have callers. The parameter manager (`app/workspace/[workspaceId]/parameters/**`, `lib/coaching/parameters.ts`) also stays, although it sits under `app/workspace/**`: it waits for an owner answer.
- Delete the template-version transition subsystem (F4) only after confirming the canvas assign flow (S01-27 setup review) does not call `transition-diff`; otherwise keep it and say why.
- Delete the old backend UI replaced by canvas screens, the public fixture library pages, dead helpers and dead exported symbols (D33).
- Remove the localStorage fallbacks from the data providers (S01-13).
- Last step: after one final parity run against the committed baseline, delete `frontend/` and switch the harness to serve only the root app. The baseline images stay in `tools/parity/baseline/`.

## Acceptance (you see)

- Full local gate green; parity green on all 35 screens; the line count drop is reported per directory.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3812 against `app_prr1` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-R1/build/`.
- Parity (D32) on: `s01-roster.png`, `s01-profile-overview.png`, `s01-profile-plans.png`, `s01-profile-checkins.png`, `s01-profile-notes.png`, `s01-profile-onboarding.png`, `s02-messages.png`, `s02-thread.png`, `s02-thread-attachments.png`, `s02-notes-todos.png`, `s03-checkins-board.png`, `s03-add-extra.png`, `s03-checkin-review.png`, `s04-habit-editor.png`, `s04-template-habits.png`, `s05-templates.png`, `s05-template-editor.png`, `s05-tracker-setup.png`, `s05-client-setup.png`, `s06-mealplan-editor.png`, `s06-template-nutrition.png`, `s07-training-editor.png`, `s07-exercise-library.png`, `s08-builder.webp`, `s08-widget-gallery.png`, `s08-template-dashboard.png`, `s09-tracker-today.png`, `s09-tracker-week.png`, `s09-tracker-trends.png`, `s09-tracker-config.png`, `s10-appearance.png`, `s10-clients-studio.png`, `s10-mealplan-studio.png`, `s11-preferences.png`, `s11-client-preview.png`.
- Unit (D11, D14): Deleted code's tests deleted with it; GUARD tests of kept code untouched.

## Report

Write `icm/05-build/reports/PR-R1.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
