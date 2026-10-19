# PR-M8 build: Check-in fields, explicit generation and projection

Card slug `pr-m8-checkins`. Board `vari8`. Track Model. Depends on PR-M0, PR-R0. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-m8-checkins`, branch `beta/pr-m8-checkins` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prm8` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3758. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-m8-checkins && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-M8] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-M8] Check-in fields, explicit generation and projection" --body-file icm/05-build/cards/pr-m8-checkins.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-m8-checkins --title "[PR-M8] Check-in fields, explicit generation and projection" --body "Closes #<issue>. Card pr-m8-checkins. Plan section PR-M8 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-m8-checkins && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-m8-checkins.md > /home/nexuslink/vari8-worktrees/pr-m8-checkins.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prm8 LANE_PORT=3758 CARD=PR-M8 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-m8-checkins.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-m8-checkins.devin.log` and `pr-m8-checkins.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/gowther/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/gowther/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/spec-driven-implementation/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/sql-queries/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-M8` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Files

- `lib/checkin/**`
- `scripts/seed/33-checkins.seed.ts`
- their tests

## Build

- Coach note, rating answers, visual answers (media ids).
- Schedule save generates occurrences through T+56 (D30); a read-only projection returns later dates for the calendar.
- Seed the canvas demo data for this domain (synthetic, values copied from the canvas demo state) in `scripts/seed/33-checkins.seed.ts`, so the wiring PR's parity run compares like with like.
- No `db/` edits (D34).

## Acceptance (you see)

- Saving a schedule creates occurrences through T+56 only; the projection lists later dates without writing them.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3758 against `app_prm8` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-M8/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): Date guard: T+56 boundary and weekday rules in Europe/Vienna; no write from the projection.

## Report

Write `icm/05-build/reports/PR-M8.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
