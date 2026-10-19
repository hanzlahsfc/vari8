# PR-W5 build: Wire habits

Card slug `pr-w5-habits`. Board `vari8`. Track Wiring. Depends on PR-W0, PR-M7, PR-M4. Builder: Devin swe-2-max driven by yamato. Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-w5-habits`, branch `beta/pr-w5-habits` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prw5` on 127.0.0.1:5433 user `app`; dev port 3794. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-w5-habits && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-W5] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-W5] Wire habits" --body-file icm/05-build/cards/pr-w5-habits.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-w5-habits --title "[PR-W5] Wire habits" --body "Closes #<issue>. Card pr-w5-habits. Plan section PR-W5 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-w5-habits && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-w5-habits.md > /home/nexuslink/vari8-worktrees/pr-w5-habits.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prw5 LANE_PORT=3794 CARD=PR-W5 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-w5-habits.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-w5-habits.devin.log` and `pr-w5-habits.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W5` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S04-01: S04 UNCONFIGURED: Habits tab header: title, today's date line, "N of M checked today"
- S04-02: S04 UNCONFIGURED: Week strip, Mon-Sun, today highlighted
- S04-03: S04 UNCONFIGURED: Filter buttons All / To do / Done + filtered-empty block
- S04-04: S04 PARTIAL: Habit row: name, "frequency · goal" line, reason paragraph, state pill
- S04-05: S04 UNCONFIGURED: Done toggle button with animated check (Mark done / Undo)
- S04-06: S04 UNCONFIGURED: Empty states: "No habits set up / defined in client setup" and filtered-empty "Show all habits"
- S04-07: S04 PARTIAL: "Recorded completions" aside: per-habit cumulative completed count + frequency/goal + "dated habit history is not available" note
- S04-08: S04 PARTIAL: Coach habit manager: list with "{n} completions", add/edit form (name, frequency, goal, reason), archive to retiredHabits
- S04-10: S04 MISSING: "Include habit status in check-ins" toggle + check-in review row "Habit consistency X / 7 days"
- S04-11: S04 UNCONFIGURED: Plans-summary "Habits" module row (count, "Edit/Configure habits" nav) gated on setup.habits; disabled-state empty "Habit Tracker is not ena
- S04-12: S04 PARTIAL: Persisted canvas shape: CoachClient.habits[] + retiredHabits[] inside coach-desktop-mockup-v1 localStorage state
- S07-19: S07 UNWIRED: Habits editor card (shared file, habits surface overlap): name/frequency/goal/reason, retire to retiredHabits

## Files

- `components/canvas/data/habits.ts`
- `components/canvas/coach/habits-tab.tsx`
- app/api/v1/** routes the screen calls
- their tests

## Build

- Coach habit manager and the client's scheduled completion; recorded completions aside.
- Each screen keeps its exact markup; only the data provider and server calls change.
- The canvas demo data for this domain comes from the model PR's seed file; if a value the screen shows is missing, add it to that seed file in this PR.
- No `db/` edits (D34).

## Acceptance (you see)

- An unscheduled habit cannot be toggled; a scheduled one persists after reload; parity passes.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3794 against `app_prw5` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-W5/build/`.
- Parity (D32) on: `s04-habit-editor.png`, `s04-template-habits.png`.
- Unit (D11, D14): Only keep-category tests (D14) for rules this PR adds; the screen is proven live.

## Report

Write `icm/05-build/reports/PR-W5.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
