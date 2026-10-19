# PR-X1 build: Build the system index generator and the first index

Card slug `system-index`. Board `vari8`. Track Index. Depends on none. Builder: deepseek-v4.1-flash, outside the graph. Issue #62.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/system-index`, branch `beta/system-index` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prx1` on 127.0.0.1:5433 user `app`; dev port 3821. May touch `db/`: no; the local check fails if `db/` changes.

## State

In flight outside the graph: issue #62, worktree `/home/nexuslink/vari8-worktrees/system-index`, branch `beta/system-index`, builder deepseek-v4.1-flash. The orchestrator completes this card (`hermes kanban --board vari8 complete <id>`) when the builder exits with its PR open; the verify card then runs. The sections below are the program's acceptance contract for that PR.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-X1` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Files

- scripts/index/generate.ts and glossary-seed.json (in flight)
- AGENTS.md routers per directory (generated)
- `docs/index/SYMBOLS.md`
- `docs/index/ROUTES.md`
- `docs/index/DATA-MODEL.md`
- `docs/index/GLOSSARY.md`
- `docs/index/README.md`
- package.json (scripts `index`, `index:check` only)
- `tests/unit/system-index.test.ts`

## Build

- In flight outside the graph (ds4f, tenten gear, issue #62). Acceptance contract: `icm/05-build/SYSTEM-INDEX-SPEC.md` (deterministic generator, per-directory routers, symbol and route maps, glossary, check mode). Its verifier checks the generator against the spec, not the content of a tree that is still moving.

## Acceptance (you see)

- `npm run index` twice produces no diff; `npm run index:check` fails after a route is added without rebuilding.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3821 against `app_prx1` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-X1/build/`.
- Parity (D32) on: none.
- Unit (D11, D14): None needed; the determinism and staleness checks are the proof.

## Report

Write `icm/05-build/reports/PR-X1.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
