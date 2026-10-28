# PR-D1 build: README, setup guide and infographics

Card slug `pr-d1-readme-setup`. Board `vari8`. Track Docs. Depends on PR-R3, PR-X1. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-d1-readme-setup`, branch `beta/pr-d1-readme-setup` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prd1` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3827. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-d1-readme-setup && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-D1] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-D1] README, setup guide and infographics" --body-file icm/05-build/cards/pr-d1-readme-setup.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-d1-readme-setup --title "[PR-D1] README, setup guide and infographics" --body "Closes #<issue>. Card pr-d1-readme-setup. Plan section PR-D1 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-d1-readme-setup && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-d1-readme-setup.md > /home/nexuslink/vari8-worktrees/pr-d1-readme-setup.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prd1 LANE_PORT=3827 CARD=PR-D1 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-d1-readme-setup.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-d1-readme-setup.devin.log` and `pr-d1-readme-setup.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/jiraiya/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/jiraiya/skills/technical-writing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/jiraiya/skills/writing-for-agents/SKILL.md`
- `/home/nexuslink/.hermes/profiles/jiraiya/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-D1` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Production-readiness P0 rows this PR owns (`icm/05-build/audits/PRODREADY-BASELINE.md`)

- PR-037: Rotate keys exposed to AI tools or configs (PARTIAL): key inventory and rotation procedure in `docs/setup.md`; real rotation needs production keys

## Files

- `README.md`
- `docs/setup.md`
- `docs/infographics/*.svg`
- `docs/architecture.html`

## Build

- Polished README: what Vari8 is, the screens, one-command local setup (`db:fresh`, `seed:dev`, dev server), roles, the local gate, the index.
- Infographics as hand-checked SVG: architecture (browser, api/v1, services, authorize, Prisma), request lifecycle, data model overview, setup steps, role matrix.
- A fresh clone on a clean database follows `docs/setup.md` to a signed-in canvas, recorded in the report.

## Acceptance (you see)

- A new reader goes from clone to the signed-in canvas with only the README and setup guide.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3827 against `app_prd1` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-D1/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): None needed; proven by the fresh-clone walkthrough.

## Report

Write `icm/05-build/reports/PR-D1.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
