# Parity harness: canvas visual-parity gate (issue #61)

Worktree `/home/nexuslink/vari8-worktrees/parity-harness`, branch `beta/parity-harness`, base `origin/Vari8-Beta` at `55a0f08`.
Not merged. Verdict is the independent verifier's call.

## What changed

- `tools/parity/capture.mjs`: renders the 35 shots from `icm/04-briefing/shots/index.json` at 1440x900 and 390x844 (70 captures). Replays each click path from a fresh context: `Europe/Vienna`, clock fixed at 2026-10-19T10:00+02:00, seeded `Math.random` and `crypto.randomUUID`, empty localStorage seed, animations, transitions and caret off, fonts awaited, DOM quiet 400 ms before the screenshot. Writes PNG, gzipped visible-element geometry, and `manifest.json` (per-screen click log, sha256, page errors).
- `tools/parity/compare.mjs`: per-screen pixel diff in Chromium canvas (per-channel tolerance 16/255 for anti-aliasing; any other changed pixel fails; size change fails). Geometry diff of visible elements: added, removed, or moved by more than 0.5 px. Writes `tools/parity/out/report.html` (baseline, current, red diff for failing screens). Exit 1 on any problem.
- `tools/parity/run.mjs`: `npm run parity`. Starts `next dev --webpack` on :3630, captures, compares, stops the server, restores `frontend/AGENTS.md` (Next rewrites it on start). `-- --update-baseline` recaptures.
- `tools/parity/baseline/`: 70 PNG (12 MB, under the 30 MB limit, so committed as images), 70 `.geom.json.gz` (0.3 MB), `manifest.json`.
- `package.json`: script `parity`. `README.md`: section "Visual parity gate". `.gitignore`: `/tools/parity/out/`.
- No file under `frontend/` or any canvas component is changed. The one temporary edit for the self-test was reverted (see below).

## Commands and exit codes

| Command | Exit | Result |
|---|---|---|
| `npm run lint` (root) | 0 | 16 warnings, all pre-existing, none in `tools/parity` |
| `npm run typecheck` (root) | 0 | `tsc --noEmit` clean |
| `npm run test` (root) | 0 | vitest run |
| `npm run build` (root) | 0 | next build --turbopack |
| `cd frontend && npm run build` | 0 | next build --webpack; canvas builds unchanged |
| `npx prettier --check README.md tools/parity package.json` | 0 | after `--write` on README (table row width) |
| `npm run parity -- --update-baseline` | 0 | 70 screens, 0 failures |
| `npm run parity` (unchanged tree, run 1) | 0 | PASS, 0 problems, 70 of 70 ok |
| `npm run parity` (unchanged tree, run 2) | 0 | PASS, 0 problems, 70 of 70 ok |

## Self-test: a deliberate 2 px change is caught

Edit: `frontend/src/components/coach/coach.css`, rule `.coach-root .cd-roster-toolbar`, added `padding-bottom: 2px`.

| Command | Exit | Result |
|---|---|---|
| `npm run parity` | 1 | FAIL on `s01-roster@390` (38847 changed px, 340 moved elements) and `s01-roster@1440` (96768 changed px, 340 moved elements). Other 68 screens ok. |
| `git checkout -- frontend/src/components/coach/coach.css` | 0 | reverted, `git status` clean in `frontend/` |
| `npm run parity` (after revert) | 0 | PASS, 70 of 70 ok |
| `npm run parity` (final, after prettier) | 0 | PASS, 70 of 70 ok |

Only `s01-roster` shows the toolbar, so only its two captures fail. The other screens pass, which is the expected scope of the change.

## Limits and what was not checked

- The click paths are desktop recipes. At 390 px, 9 clicks across 5 screens use a label fallback (`02 Dashboard` to `Dashboard`, `03 Tracker` to `Tracker`, `04 Timeline / Roadmap` to `Timeline / Roadmap`, `05 Nutrition` to `Nutrition`, `Training Program` to `Training`, `Workspace preferences for Liliana Mansfeld` to `Workspace preferences`). The fallback is used only at 390 and every clicked label is recorded in `manifest.json`.
- 21 click steps match more than one visible element. The first interactive match wins. I checked two 390 captures by eye (`s05-tracker-setup`: Tracker tab of the template editor; `s11-preferences`: Workspace preferences panel). The other captures were not visually checked. A wrong match would still be a stable baseline, so it would not fail the gate; it would just pin the wrong state.
- The recipes come from `icm/04-briefing/shots/index.json`, generated on the `merge-proto` tree at `58eb6ed`. All 70 click paths resolved on Beta, which is the only evidence that Beta has the same routes and labels.
- The baseline is machine-bound: Playwright 1.63 with Chromium 1243, this host's fonts and GPU path. A different machine will need its own `--update-baseline` before the gate means anything there.
- Captures run against the dev server, as briefed. The dev console logs React hydration warnings on some canvas screens (`tools/parity/out/next-dev.log`). They are pre-existing, come from the untouched canvas, and do not affect the captured pixels.
- Geometry keys are DOM paths. One inserted sibling reports every later element as moved. This is noisy but safe (it fails, never hides a change). Noted as a ponytail ceiling in `capture.mjs`.
- No database touched. No servers left running (port 3630 closed after the last run).

## Files

- New: `tools/parity/capture.mjs`, `tools/parity/compare.mjs`, `tools/parity/run.mjs`, `tools/parity/baseline/**`, `icm/05-build/reports/parity-harness.md`
- Changed: `package.json`, `README.md`, `.gitignore`
