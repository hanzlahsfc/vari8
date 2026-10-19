# PR-R0 build: Merge the copied retry and boundary helpers

Card slug `pr-r0-lib-dedupe`. Board `vari8`. Track Reduction. Depends on PR-05, AUD-REDUCTION-VERIFY. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-r0-lib-dedupe`, branch `beta/pr-r0-lib-dedupe` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prr0` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3734. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-r0-lib-dedupe && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-R0] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-R0] Merge the copied retry and boundary helpers" --body-file icm/05-build/cards/pr-r0-lib-dedupe.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-r0-lib-dedupe --title "[PR-R0] Merge the copied retry and boundary helpers" --body "Closes #<issue>. Card pr-r0-lib-dedupe. Plan section PR-R0 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-r0-lib-dedupe && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-r0-lib-dedupe.md > /home/nexuslink/vari8-worktrees/pr-r0-lib-dedupe.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prr0 LANE_PORT=3734 CARD=PR-R0 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-r0-lib-dedupe.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-r0-lib-dedupe.devin.log` and `pr-r0-lib-dedupe.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/kakashi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/kakashi/skills/systematic-debugging/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/codebase-design/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-R0` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Backend orphans this PR owns (delete or keep as each line says)

- S12-43: Prisma client singleton. Evidence: `lib/db.ts:1`. (keep; Prisma singleton, PR-R0 moves the shared retry helper into it (not R1 work))

## Files

- `lib/db.ts`
- `lib/boundary.ts`
- the 18 service files with `withSerializedRetry` copies
- the 16 `lib/*/boundary.ts` files

## Build

- BACKEND-REDUCTION F8: one `withSerializedRetry` in `lib/db.ts` (the classifier already lives at `lib/db.ts:19`); delete the 18 copies and their constants.
- BACKEND-REDUCTION F9: one closed, non-disclosing error vocabulary in `lib/boundary.ts` (`CLOSED_MESSAGES`, `fail`, `mapError`, `guard`); delete the 16 copies. Keep every message string identical (R3-15, R3-19).
- Runs before the model wave so PR-M1 to PR-M9 edit the merged helpers, not the copies. No `db/` edits (D34).

## Acceptance (you see)

- About 650 lines out; every existing retry and boundary test passes unchanged.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3734 against `app_prr0` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-R0/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): Existing data-integrity and trust-boundary GUARD tests pass unchanged; none added.

## Report

Write `icm/05-build/reports/PR-R0.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
