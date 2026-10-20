# PR-W1 build: Wire identity, workspace and client home

Card slug `pr-w1-identity-home`. Board `vari8`. Track Wiring. Depends on PR-05, PR-01. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-w1-identity-home`, branch `beta/pr-w1-identity-home` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prw1` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3719. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-w1-identity-home && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-W1] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-W1] Wire identity, workspace and client home" --body-file icm/05-build/cards/pr-w1-identity-home.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-w1-identity-home --title "[PR-W1] Wire identity, workspace and client home" --body "Closes #<issue>. Card pr-w1-identity-home. Plan section PR-W1 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-w1-identity-home && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-w1-identity-home.md > /home/nexuslink/vari8-worktrees/pr-w1-identity-home.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prw1 LANE_PORT=3719 CARD=PR-W1 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-w1-identity-home.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-w1-identity-home.devin.log` and `pr-w1-identity-home.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W1` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

Owner ruling O9 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the server parent passes the viewer down; `getViewer()` stays server-side and the client shell does not fetch the session route for first paint.
Owner ruling O15 (owner, 2026-10-20, same source): no multi-workspace switcher; the shell keeps one workspace label showing the real workspace name.

## Matrix rows this PR closes

- S11-04: S11 PARTIAL: Single fixed "COACH WORKSPACE" container
- S11-18: S11 UNWIRED: The implied "me" client view: standalone tracker pinned to one client ("Maya Chen", STORAGE_KEY coaching-client-tracker-maya-v1)

## Files

- `app/page.tsx`
- `app/me/**`
- `lib/auth/viewer.ts`
- `components/canvas/ethereal/client-tracker/**`
- `scripts/seed/10-identity.seed.ts`

## Build

- Role-aware landing: staff land on `/coach`, a client lands on their own tracker (the canvas standalone tracker, S11-18) bound to their own `ClientProfile` through `getViewer()`.
- The single workspace container (S11-04) shows the viewer's real workspace name.
- Client accounts never reach `/coach` or `/ethereal` (server redirect, not UI hiding).

## Acceptance (you see)

- Coach and client sessions in two browser profiles reach their own views at both widths; a client typing `/coach` lands on `/me`.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3719 against `app_prw1` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-W1/build/`.
- Parity (D32) on: `s09-tracker-today.png`.
- Unit (D11, D14): One route-guard test: a client session requesting a staff route is redirected, a staff session is not. Bites.

## Report

Write `icm/05-build/reports/PR-W1.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
