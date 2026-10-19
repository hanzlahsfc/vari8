# PR-T2 build: Delete the parked consent tests

Card slug `pr-t2-consent-test-cuts`. Board `vari8`. Track Foundation. Depends on PR-04, PR-03A. Builder: tenten (ds4f). Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-t2-consent-test-cuts`, branch `beta/pr-t2-consent-test-cuts` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prt2` on 127.0.0.1:5433 user `app`; dev port 3725. May touch `db/`: no; the local check fails if `db/` changes.

## Steps before the build

1. `cd /home/nexuslink/vari8-worktrees/pr-t2-consent-test-cuts && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-T2] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-T2] Delete the parked consent tests" --body-file icm/05-build/cards/pr-t2-consent-test-cuts.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-t2-consent-test-cuts --title "[PR-T2] Delete the parked consent tests" --body "Closes #<issue>. Card pr-t2-consent-test-cuts. Plan section PR-T2 in icm/03-plan/output/PLAN.md."`.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-T2` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## TEST-AUDIT actions this PR executes

- `tests/integration/s1-d-consent.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/coaching-classification-actions.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/consent.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/crosssheet.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/gdpr-export.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/parameter-classification-dom.test.tsx`: CUT-AT-REPLACE in PR-04.
- `tests/unit/redact.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/retention.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/source-data-policy.test.ts`: CUT-AT-REPLACE in PR-04.

## Files

- tests/** (the 9 PR-04 CUT-AT-REPLACE files and the PR-04 blocks)
- vitest.config.ts (drop the test-only `ENABLE_CONSENT_GATES`)

## Build

- Delete the 9 whole files and the PR-04 CUT-AT-REPLACE blocks the TEST-AUDIT lists, with the PR-03A lever (`icm/05-build/tools/apply-test-audit.mjs`), extended with a replace-PR filter if it lacks one.
- Remove the test-only `ENABLE_CONSENT_GATES=1` from `vitest.config.ts`.

## Acceptance (you see)

- Suites pass with gates parked; no consent assertion remains outside the parked code.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3725 against `app_prt2` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-T2/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): Kept suites pass.

## Report

Write `icm/05-build/reports/PR-T2.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
