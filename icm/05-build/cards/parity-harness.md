# PR-P1 build: Build the visual parity harness and capture baselines

Card slug `parity-harness`. Board `vari8`. Track Foundation. Depends on none. Builder: claude-haiku-5-5, outside the graph. Issue #61.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/parity-harness`, branch `beta/parity-harness` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prp1` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3704. May touch `db/`: no; the local check fails if `db/` changes.

## State

In flight outside the graph: issue #61, worktree `/home/nexuslink/vari8-worktrees/parity-harness`, branch `beta/parity-harness`, builder claude-haiku-5-5. The orchestrator completes this card (`hermes kanban --board vari8 complete <id>`) when the builder exits with its PR open; the verify card then runs. The sections below are the program's acceptance contract for that PR.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-P1` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## Files

- tools/parity/run.mjs, capture.mjs, compare.mjs (in flight)
- `tools/parity/baseline/**`
- package.json (script `parity` only)
- .gitignore (`tools/parity/out/`)

## Build

- In flight outside the graph (builder claude-haiku-5-5, zenitsu gear, issue #61; verifier claude-opus-5-5 on urokodaki). Interface as built: `npm run parity` starts the canvas dev server on `PARITY_PORT` (default 3630) unless `PARITY_URL` points at a running app, captures every screen at 1440x900 and 390x844, compares with `tools/parity/baseline/`, writes `tools/parity/out/report.html`, stops the server; exit code is the comparison's. `npm run parity -- --update-baseline` recaptures. `verify-local.sh` calls it.
- Acceptance contract the verifier checks: the screen list comes from `icm/04-briefing/shots/index.json` (35 screens, route and click path each), not a hand list; clock frozen and animations off; the next-dev write to `frontend/AGENTS.md` is restored after the run.
- Pixel compare with a stated tolerance; masks only for the D32 truth-text table.
- The harness bites: a run against the baseline itself passes; a run after one CSS change fails on the changed screens only.

## Acceptance (you see)

- 70 baseline captures (35 screens x 2 widths) committed; the self-check passes and the mutated run fails exactly where it should.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3704 against `app_prp1` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-P1/build/`.
- Parity (D32) on: `s01-roster.png`, `s01-profile-overview.png`, `s01-profile-plans.png`, `s01-profile-checkins.png`, `s01-profile-notes.png`, `s01-profile-onboarding.png`, `s02-messages.png`, `s02-thread.png`, `s02-thread-attachments.png`, `s02-notes-todos.png`, `s03-checkins-board.png`, `s03-add-extra.png`, `s03-checkin-review.png`, `s04-habit-editor.png`, `s04-template-habits.png`, `s05-templates.png`, `s05-template-editor.png`, `s05-tracker-setup.png`, `s05-client-setup.png`, `s06-mealplan-editor.png`, `s06-template-nutrition.png`, `s07-training-editor.png`, `s07-exercise-library.png`, `s08-builder.webp`, `s08-widget-gallery.png`, `s08-template-dashboard.png`, `s09-tracker-today.png`, `s09-tracker-week.png`, `s09-tracker-trends.png`, `s09-tracker-config.png`, `s10-appearance.png`, `s10-clients-studio.png`, `s10-mealplan-studio.png`, `s11-preferences.png`, `s11-client-preview.png`.
- Unit (D11, D14): None needed, the harness is the proof tool; its bite check is the mutated-CSS run.

## Report

Write `icm/05-build/reports/PR-P1.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
