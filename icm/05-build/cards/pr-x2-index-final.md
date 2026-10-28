# PR-X2 build: Rebuild the system index on the final tree

Card slug `pr-x2-index-final`. Board `vari8`. Track Index. Depends on PR-X1, PR-R2, PR-R3. Builder: shikamaru (deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-x2-index-final`, branch `beta/pr-x2-index-final` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prx2` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3824. May touch `db/`: no; the local check fails if `db/` changes.

## Steps before the build

1. `cd /home/nexuslink/vari8-worktrees/pr-x2-index-final && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-X2] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-X2] Rebuild the system index on the final tree" --body-file icm/05-build/cards/pr-x2-index-final.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-x2-index-final --title "[PR-X2] Rebuild the system index on the final tree" --body "Closes #<issue>. Card pr-x2-index-final. Plan section PR-X2 in icm/03-plan/output/PLAN.md."`.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-X2` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Files

- the generated index files only
- scripts/index/** (only to fix a spec gap found on the final tree)

## Build

- Run `npm run index` on the reduced tree, review the routers for dead paths, commit. Add `index:check` to `scripts/verify-local.sh` if PR-03 has not.

## Acceptance (you see)

- `npm run index:check` exits 0 on the final tree; every router names only paths that exist.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3824 against `app_prx2` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-X2/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): None needed.

## Report

Write `icm/05-build/reports/PR-X2.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
