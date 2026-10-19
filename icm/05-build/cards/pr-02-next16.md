# PR-02 build: Upgrade root to Next 16.3 and React 19.3

Card slug `pr-02-next16`. Board `vari8`. Track Foundation. Depends on none. Builder: swe-2-max, outside the graph. Issue #57.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-02-next16`, branch `beta/pr-02-next16` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_pr02` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3701. May touch `db/`: no; the local check fails if `db/` changes.

## State

Shipped outside the graph as PR #57. This card exists for traceability and is completed at board creation.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-02` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Files

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `eslint.config.mjs`
- `next.config.ts`

## Build

- Shipped outside the graph: PR #57 merged into `Vari8-Beta` at `55a0f08` (02:19), verified by claude-haiku-5-5 (SHIP), branch and worktree cleaned. Folded in as a completed card.
- Root `next`, `react`, `react-dom` and types moved to the canvas versions; four react-hooks v6 rules downgraded to warn with 11 findings handed to PR-03B.

## Acceptance (you see)

- Root typecheck, lint, build and unit tests exit 0 on Next 16.3 and React 19.3; `frontend/` still builds; sign-in page answers 200.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3701 against `app_pr02` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-02/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): Existing suite at the same pass count, every difference explained in the report.

## Report

Write `icm/05-build/reports/PR-02.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
