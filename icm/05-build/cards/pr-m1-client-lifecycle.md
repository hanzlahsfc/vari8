# PR-M1 build: Client profile, archive and retention services

Card slug `pr-m1-client-lifecycle`. Board `vari8`. Track Model. Depends on PR-M0, PR-R0. Builder: Devin swe-2-max driven by yamato. Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-m1-client-lifecycle`, branch `beta/pr-m1-client-lifecycle` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prm1` on 127.0.0.1:5433 user `app`; dev port 3737. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-m1-client-lifecycle && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-M1] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-M1] Client profile, archive and retention services" --body-file icm/05-build/cards/pr-m1-client-lifecycle.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-m1-client-lifecycle --title "[PR-M1] Client profile, archive and retention services" --body "Closes #<issue>. Card pr-m1-client-lifecycle. Plan section PR-M1 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-m1-client-lifecycle && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-m1-client-lifecycle.md > /home/nexuslink/vari8-worktrees/pr-m1-client-lifecycle.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prm1 LANE_PORT=3737 CARD=PR-M1 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-m1-client-lifecycle.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-m1-client-lifecycle.devin.log` and `pr-m1-client-lifecycle.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/gowther/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/gowther/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/spec-driven-implementation/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/sql-queries/SKILL.md`
- `/home/nexuslink/.hermes/profiles/gowther/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-M1` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Files

- `lib/workspace/clients.ts`
- `lib/workspace/roster-query.ts`
- `lib/workspace/retention.ts`
- `scripts/seed/20-clients.seed.ts`
- their tests

## Build

- Profile field reads and writes, archive, restore and retention-gated delete (D27), all through `authorize`.
- Delete is refused before the retention period ends and audited structurally after.
- Seed the canvas demo data for this domain (synthetic, values copied from the canvas demo state) in `scripts/seed/20-clients.seed.ts`, so the wiring PR's parity run compares like with like.
- No `db/` edits (D34).

## Acceptance (you see)

- Archiving hides a client from the roster query; delete before retention is refused.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3737 against `app_prm1` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-M1/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): Archive, restore and delete-after-retention against the real database; the retention boundary date is a literal case.

## Report

Write `icm/05-build/reports/PR-M1.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
