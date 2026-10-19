# PR-W4 build: Wire the client tracker, trends and roadmap

Card slug `pr-w4-tracker`. Board `vari8`. Track Wiring. Depends on PR-W0, PR-SV2, PR-M3, PR-M4. Builder: Devin swe-2-max driven by yamato. Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-w4-tracker`, branch `beta/pr-w4-tracker` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prw4` on 127.0.0.1:5433 user `app`; dev port 3791. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-w4-tracker && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-W4] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-W4] Wire the client tracker, trends and roadmap" --body-file icm/05-build/cards/pr-w4-tracker.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-w4-tracker --title "[PR-W4] Wire the client tracker, trends and roadmap" --body "Closes #<issue>. Card pr-w4-tracker. Plan section PR-W4 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-w4-tracker && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-w4-tracker.md > /home/nexuslink/vari8-worktrees/pr-w4-tracker.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prw4 LANE_PORT=3791 CARD=PR-W4 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-w4-tracker.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-w4-tracker.devin.log` and `pr-w4-tracker.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W4` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S07-17: S07 PARTIAL: Roadmap / Timeline tab: weekly rows (Mon-Sun), phase column + badge, per-metric cells (Weekly average / Trend / Adherence / Target vs actual
- S07-18: S07 MISSING: Goals editor (shared file): numeric field goals {fieldId, value, unit, date} feeding roadmap targets
- S09-01: S09 PARTIAL: Tracker shell: title, client name, "Log data"/"Coach notes" entry-mode switch, Configure button, Today/Week/Trends view switch, status line
- S09-02: S09 PARTIAL: Monday-first 7-day strip with per-day recorded dots, prev/next week, return-Today, "future date logging unavailable"
- S09-03: S09 PARTIAL: Edit-in-progress guard blocking date/view switches
- S09-04: S09 PARTIAL: Today heading: weekday/date + "N of M recorded" completion dot
- S09-05: S09 MISSING: Daily overview strip: up to 4 pinned metrics in configured order (summaryParameterIds / Variant.trackerHighlights)
- S09-06: S09 PARTIAL: Category grouping of fields (Weight basics, Nutrition, Sleep, ...) in template order, with per-group recorded counts
- S09-07: S09 UNCONFIGURED: Numeric measurement cell: read value, inline edit, min/max + decimals validation, canonical-unit storage
- S09-08: S09 PARTIAL: Rating cell: 1-10 / 1-5 select, word-labels display ("Low/Moderate/High", sleep "Poor/Okay/Good")
- S09-09: S09 UNCONFIGURED: Clearing a recorded value back to empty
- S09-10: S09 CONFLICT: Time fields (weigh-in time, bedtime, wake-time) with 12/24-hour editor
- S09-11: S09 UNCONFIGURED: Blood-pressure "118/76" single formatted field
- S09-12: S09 UNCONFIGURED: Free-text daily note / context note fields
- S09-13: S09 UNCONFIGURED: Single-choice field (select from configured options)
- S09-14: S09 PARTIAL: Multi-choice field with optional note ({choices[], note} JSON)
- S09-15: S09 PARTIAL: Location-rating composite ({location, rating 1-10})
- S09-16: S09 PARTIAL: Context field (answer Yes/No + context note)
- S09-18: S09 PARTIAL: Week view: transposed 7-day metric x date table, sticky labels, collapsible groups, per-metric summary cell (Average / Latest / Total / Most
- S09-19: S09 MISSING: Trends view: searchable metric picker (max 3), ranges 7/30/56/90/180 days, numeric line/bar charts, completion grids, dated text lists, late
- S09-20: S09 MISSING: "Coach notes" mode: coach-only comment popover per value, dot marker, "Coach note:" display under the field
- S09-21: S09 PARTIAL: Coach viewing a client's recorded tracker data (values, ratings, text)
- S09-22: S09 PARTIAL: Configured display units + conversions (kg/lb, cm/in, L/fl oz, kcal/kJ, degC/degF, mg/dL<->mmol/L, mg<->g, 12/24h)
- S09-23: S09 PARTIAL: TrackerConfig projected from assigned template (parameterIds order, cycleTrackingEnabled, fieldUnits, fieldOptions, ratingScales, energyUnit
- S09-24: S09 PARTIAL: Client preview shell: banner (avatar, name, "Assigned/Sample athlete . template", preview note), tab strip (Dashboard, Tracker, Timeline/Roa
- S09-25: S09 MISSING: Sample athlete + deterministic 56-day synthetic history for unassigned template preview
- S09-26: S09 PARTIAL: Persisted shapes: TrackerEntry[] {date, values{paramId:number}}, textValues Record<"date:paramId",string>, comments Record<"date:paramId",st
- S09-27: S09 MISSING: Weight trend arrow on the cell ("Up/Down X kg compared with the previous recorded weight")
- S09-28: S09 PARTIAL: State messaging: "No tracking fields configured", "Future date . logging unavailable", "Finish editing to change dates or views", "Updated"/
- V3-BWB15: S09 UNWIRED: SmoothTrend primitive exists without a product data path
- V3-CP06: S09 MISSING: Roadmap header and phase badge
- V3-CP07: S09 MISSING: Roadmap weekly table
- V3-CP08: S09 MISSING: Roadmap phase select per week
- V3-CO03: S09 CONFLICT: Tracker edits overwrite values without revision history
- R3-13: S09 CONFLICT: Calories as an ordinary entered parameter
- S10-18: S10 PARTIAL: Client tracker studio page: configurator (categories body/nutrition/recovery/movement, parameter pick, unit config, summary pick, rating sca
- S11-19: S11 UNCONFIGURED: Client logs own daily tracker entries and cell comments
- S09-17: CONFLICT (S09): Cycle tracking group. Wired like any parameter (D19).

## Files

- `components/canvas/data/tracker.ts`
- `components/canvas/coach/client-tracker-preview/**`
- `components/canvas/ethereal/client-tracker/**`
- tests: the PR-W4 CUT-AT-REPLACE blocks
- app/api/v1/** routes the screen calls
- their tests

## Build

- Today, Week, Trends and Roadmap from the server; every field kind including time and duration (D28) and cycle fields (D19); coach comments; revision history kept (#79); the tracker configurator studio page.
- Each screen keeps its exact markup; only the data provider and server calls change.
- The canvas demo data for this domain comes from the model PR's seed file; if a value the screen shows is missing, add it to that seed file in this PR.
- No `db/` edits (D34).

## Acceptance (you see)

- The client logs three days, reloads, and Week and Trends draw from the server; parity passes.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3791 against `app_prw4` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-W4/build/`.
- Parity (D32) on: `s09-tracker-today.png`, `s09-tracker-week.png`, `s09-tracker-trends.png`, `s09-tracker-config.png`.
- Unit (D11, D14): Only keep-category tests (D14) for rules this PR adds; the screen is proven live.

## Report

Write `icm/05-build/reports/PR-W4.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
