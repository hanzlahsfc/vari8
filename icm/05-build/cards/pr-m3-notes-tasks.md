# PR-M3 build: Coach notes, coach tasks and tracker comments

Card slug `pr-m3-notes-tasks`. Board `vari8`. Track Model. Depends on PR-M0, PR-R0. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-m3-notes-tasks`, branch `beta/pr-m3-notes-tasks` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prm3` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3743. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-m3-notes-tasks && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-M3] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-M3] Coach notes, coach tasks and tracker comments" --body-file icm/05-build/cards/pr-m3-notes-tasks.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-m3-notes-tasks --title "[PR-M3] Coach notes, coach tasks and tracker comments" --body "Closes #<issue>. Card pr-m3-notes-tasks. Plan section PR-M3 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-m3-notes-tasks && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-m3-notes-tasks.md > /home/nexuslink/vari8-worktrees/pr-m3-notes-tasks.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prm3 LANE_PORT=3743 CARD=PR-M3 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-m3-notes-tasks.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-m3-notes-tasks.devin.log` and `pr-m3-notes-tasks.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/gowther/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/gowther/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/spec-driven-implementation/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/sql-queries/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-M3` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

Owner ruling O7 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): the coach's tracker write path is comments only (TrackerComment); there is no coach entry logging.
Owner ruling O13 (owner, 2026-10-20, same source): general coaching notes are client-visible while private coach notes and coach to-dos stay staff-only (D26); the note model carries the two kinds.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Backend orphans this PR owns (delete or keep as each line says)

- S12-33: Metadata-only audit logger. Evidence: `lib/audit.ts:1`. (keep; structural audit for notes, tasks and messages)

## Files

- `lib/notes/**`
- `lib/coach-tasks/**`
- `lib/tracker-comments/**`
- `app/api/v1/notes/**`
- `app/api/v1/coach-tasks/**`
- `scripts/seed/22-notes.seed.ts`
- their tests

## Build

- Services for CoachNote, CoachTask and TrackerComment with structural audit (never bodies, D26).
- Seed the canvas demo data for this domain (synthetic, values copied from the canvas demo state) in `scripts/seed/22-notes.seed.ts`, so the wiring PR's parity run compares like with like.
- No `db/` edits (D34).

## Acceptance (you see)

- A client request to a coach note or coach task route gets 403; staff see them.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3743 against `app_prm3` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-M3/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): Isolation: client and foreign-workspace reads denied; audit metadata carries no body text.

## Report

Write `icm/05-build/reports/PR-M3.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
