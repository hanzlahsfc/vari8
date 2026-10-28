# PR-03 build: Adopt Biome, TypeScript 7 and Turbopack

Card slug `pr-03-toolchain`. Board `vari8`. Track Foundation. Depends on PR-01, PR-03A, PR-03B. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-03-toolchain`, branch `beta/pr-03-toolchain` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_pr03` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3722. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-03-toolchain && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-03] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-03] Adopt Biome, TypeScript 7 and Turbopack" --body-file icm/05-build/cards/pr-03-toolchain.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-03-toolchain --title "[PR-03] Adopt Biome, TypeScript 7 and Turbopack" --body "Closes #<issue>. Card pr-03-toolchain. Plan section PR-03 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-03-toolchain && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-03-toolchain.md > /home/nexuslink/vari8-worktrees/pr-03-toolchain.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_pr03 LANE_PORT=3722 CARD=PR-03 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-03-toolchain.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-03-toolchain.devin.log` and `pr-03-toolchain.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/kakashi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/kakashi/skills/systematic-debugging/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/codebase-design/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-03` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Production-readiness P0 rows this PR owns (`icm/05-build/audits/PRODREADY-BASELINE.md`)

- PR-036: Secrets out of code, repo and chat history (PARTIAL): secret scan of the tree and full history in the local gate, plus a pre-commit secret hook
- PR-038: Every installed package exists and is the intended one (PARTIAL): package provenance review next to the dependency scan (PR-039)
- PR-039: Dependency scanning (MISSING): baseline owner
- PR-062: Deploy pipeline runs the tests (PARTIAL): baseline owner

## Files

- `package.json`
- `package-lock.json`
- `biome.json`
- `frontend/biome.json`
- `tsconfig.json`
- eslint.config.mjs (deleted)
- `.prettierrc`
- `.prettierignore`
- `playwright.config.ts`
- `scripts/verify-local.sh`

## Build

- Apply the P2 prototype (`d1b1668`, `ce2efed`) as one policy for root and canvas (D4a): canvas `recommended`, `organizeImports`, `noNextAsyncClientComponent`, `nursery/useReactCompiler` as warning. The react-hooks fixes already landed in PR-03B; keep them green under Biome.
- TypeScript 7 native as the only `typescript`; Turbopack for every build (drop `--webpack`); Node 24 in `.nvmrc` and engines.
- Prettier only for `*.md`, `*.yml`, `*.yaml`. The reformat is one mechanical commit produced by `npm run format`; the integrator re-runs it after any conflict instead of hand-merging format hunks.
- Make Playwright ports selectable by environment (`PLAYWRIGHT_PORT_BASE`) so verifier lanes stop sharing 3000, 3101 and 3102.
- Promote `icm/05-build/tools/verify-local.sh` to `scripts/verify-local.sh` (TEST-AUDIT 'Local gate per PR, D13') and point the icm tool at it.
- Workflows stay `workflow_dispatch` only (already done in `a9c0b2b`); confirm, do not re-add triggers.

## Acceptance (you see)

- One lint and format command passes, `tsc` exits 0, no `--webpack` anywhere, the parity check stays green on all 35 screens.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3722 against `app_pr03` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-03/build/`.
- Parity (D32) on: `s01-roster.png`, `s01-profile-overview.png`, `s01-profile-plans.png`, `s01-profile-checkins.png`, `s01-profile-notes.png`, `s01-profile-onboarding.png`, `s02-messages.png`, `s02-thread.png`, `s02-thread-attachments.png`, `s02-notes-todos.png`, `s03-checkins-board.png`, `s03-add-extra.png`, `s03-checkin-review.png`, `s04-habit-editor.png`, `s04-template-habits.png`, `s05-templates.png`, `s05-template-editor.png`, `s05-tracker-setup.png`, `s05-client-setup.png`, `s06-mealplan-editor.png`, `s06-template-nutrition.png`, `s07-training-editor.png`, `s07-exercise-library.png`, `s08-builder.webp`, `s08-widget-gallery.png`, `s08-template-dashboard.png`, `s09-tracker-today.png`, `s09-tracker-week.png`, `s09-tracker-trends.png`, `s09-tracker-config.png`, `s10-appearance.png`, `s10-clients-studio.png`, `s10-mealplan-studio.png`, `s11-preferences.png`, `s11-client-preview.png`.
- Unit (D11, D14): None needed, toolchain change proven by the full local gate and parity.

## Report

Write `icm/05-build/reports/PR-03.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
