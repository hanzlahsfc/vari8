# PR-03B build: Fix the react-hooks v6 findings

Card slug `pr-03-react-hooks`. Board `vari8`. Track Foundation. Depends on none. Builder: devin/swe-2-max, outside the graph. Issue #60.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-03-react-hooks`, branch `beta/pr-03-react-hooks` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_pr03b` on 127.0.0.1:5433 user `app`; dev port 3710. May touch `db/`: no; the local check fails if `db/` changes.

## State

In flight outside the graph: issue #60, worktree `/home/nexuslink/vari8-worktrees/pr-03-react-hooks`, branch `beta/pr-03-react-hooks`, builder devin/swe-2-max. The orchestrator completes this card (`hermes kanban --board vari8 complete <id>`) when the builder exits with its PR open; the verify card then runs. The sections below are the program's acceptance contract for that PR.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-03B` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Files

- the 11 finding sites listed in `icm/05-build/reports/PR-02.md` section E2
- `eslint.config.mjs`

## Build

- In flight outside the graph (Devin, itachi gear, issue #60, card `PR-03b`).
- Fix each finding at the root cause; set the four rules back to `error`; lint exits 0 with zero react-hooks findings.
- Canvas markup and styles stay byte-identical except where a hook fix requires it; each case named in the report.

## Acceptance (you see)

- Lint exits 0 with the four rules at `error`; before and after screenshots at 1440 and 390 show no visual change on every touched screen.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3710 against `app_pr03b` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-03B/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): None needed; behavior-preserving, proven by screenshots and the existing suites.

## Report

Write `icm/05-build/reports/PR-03B.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
