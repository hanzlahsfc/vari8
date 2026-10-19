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

| Command                                                    | Exit | Result                                                |
| ---------------------------------------------------------- | ---- | ----------------------------------------------------- |
| `npm run lint` (root)                                      | 0    | 16 warnings, all pre-existing, none in `tools/parity` |
| `npm run typecheck` (root)                                 | 0    | `tsc --noEmit` clean                                  |
| `npm run test` (root)                                      | 0    | vitest run                                            |
| `npm run build` (root)                                     | 0    | next build --turbopack                                |
| `cd frontend && npm run build`                             | 0    | next build --webpack; canvas builds unchanged         |
| `npx prettier --check README.md tools/parity package.json` | 0    | after `--write` on README (table row width)           |
| `npm run parity -- --update-baseline`                      | 0    | 70 screens, 0 failures                                |
| `npm run parity` (unchanged tree, run 1)                   | 0    | PASS, 0 problems, 70 of 70 ok                         |
| `npm run parity` (unchanged tree, run 2)                   | 0    | PASS, 0 problems, 70 of 70 ok                         |

## Self-test: a deliberate 2 px change is caught

Edit: `frontend/src/components/coach/coach.css`, rule `.coach-root .cd-roster-toolbar`, added `padding-bottom: 2px`.

| Command                                                   | Exit | Result                                                                                                                                             |
| --------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run parity`                                          | 1    | FAIL on `s01-roster@390` (38847 changed px, 340 moved elements) and `s01-roster@1440` (96768 changed px, 340 moved elements). Other 68 screens ok. |
| `git checkout -- frontend/src/components/coach/coach.css` | 0    | reverted, `git status` clean in `frontend/`                                                                                                        |
| `npm run parity` (after revert)                           | 0    | PASS, 70 of 70 ok                                                                                                                                  |
| `npm run parity` (final, after prettier)                  | 0    | PASS, 70 of 70 ok                                                                                                                                  |

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

## Fix pass 1

Answers the independent verdict FIX in `parity-harness-verify.md` (section "Findings", F1, F2, O2, O3). Fix commit
`20f53ae` on top of the merge `fffcdb3` (`origin/Vari8-Beta` at `ea8f514`, test-file deletions only, no canvas
component touched). Baseline recaptured from the production build of the untouched canvas.

### What changed

- **F1, tolerance.** `compare.mjs` default pixel tolerance is 0. `PARITY_AA_TOLERANCE` overrides it for other hosts.
- **F2, ambiguous steps (class fix).** `capture.mjs` `STEP_SCOPES` gives every recipe step that matches more than one
  element a scope: a container (`within`), optionally filtered by text (`containing`) or a target selector (`target`).
  `findAndCenter` throws if a step still matches more than one element, so the capture fails loudly. Result: 180 of 180
  steps across 70 captures resolve to exactly 1 element. 30 steps are scoped: the 21 that were ambiguous, and 9 that
  were unique at their viewport but get the same scope so the rule holds at both viewports.
- **O2, atomic baseline.** `run.mjs --update-baseline` captures into `tools/parity/out/baseline.tmp` and replaces
  `tools/parity/baseline` only when there are zero failures and 70 screens. Otherwise the committed baseline stays.
- **O3, inner scrollers.** Geometry rows now carry each element's own text. `compare.mjs` fails on text changes, so
  content inside scroll containers is covered even where no pixel shows it. At 390 px `s01-roster` clips its Attention
  column inside `.cd-table-scroll`; the proof is in the mutation table below.
- **Gate target.** `npm run parity` builds the canvas (`next build --webpack`) and serves it (`next start`). Dev mode is
  opt-in with `PARITY_DEV=1`. The baseline was recaptured from the production build.

### Ambiguous steps: seen vs expected (21 steps, 15 captures)

Each capture was compared with its briefing reference (`icm/04-briefing/shots/<stem>.png`, left) in a side-by-side
composite. "Previously pinned" is the old baseline's pixel hash for that capture.

| capture                    | ambiguous step(s)                                | expected (briefing)                                     | seen (new capture)                                             | match                      | vs previously pinned                         |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------- | -------------------------- | -------------------------------------------- |
| s01-profile-checkins@390   | Check-ins (2)                                    | Chloe Park profile, Check-ins tab, "Submission history" | same                                                           | yes                        | **changed** (was the global Check-ins board) |
| s01-profile-checkins@1440  | Check-ins (2)                                    | same                                                    | same                                                           | yes                        | **changed** (same cause)                     |
| s04-template-habits@390    | Dashboard (3)                                    | Template Tabs panel, toggles off                        | Tabs panel, toggles off, Nutrition toggle under the bottom nav | yes (Nutrition unverified) | **changed** (was the nav "Dashboard" button) |
| s04-template-habits@1440   | 7 toggles (2 each)                               | Tabs panel, toggles off                                 | same                                                           | yes                        | unchanged                                    |
| s05-tracker-setup@390      | 02 Dashboard to Dashboard (3), then 03 Tracker   | Tracker tab active                                      | Tracker tab active                                             | yes                        | unchanged                                    |
| s06-mealplan-editor@390    | Create (2)                                       | Meal plan, "Individual meal plan"                       | same                                                           | yes                        | unchanged                                    |
| s06-mealplan-editor@1440   | Create (2)                                       | same                                                    | same                                                           | yes                        | unchanged                                    |
| s06-template-nutrition@390 | 02 Dashboard to Dashboard (3), then 05 Nutrition | Nutrition tab active                                    | Nutrition tab active                                           | yes                        | unchanged                                    |
| s08-template-dashboard@390 | 02 Dashboard to Dashboard (3)                    | Dashboard tab active                                    | Dashboard tab active                                           | yes                        | unchanged                                    |
| s09-tracker-today@390      | Preview (3)                                      | Emma Anders, Strength & balance, Today                  | same                                                           | yes                        | unchanged                                    |
| s09-tracker-today@1440     | Preview (3)                                      | same                                                    | same                                                           | yes                        | unchanged                                    |
| s09-tracker-week@390       | Preview (3)                                      | Week view                                               | Week view                                                      | yes                        | unchanged                                    |
| s09-tracker-week@1440      | Preview (3)                                      | Week view                                               | Week view                                                      | yes                        | unchanged                                    |
| s09-tracker-trends@390     | Preview (3)                                      | Trends view                                             | Trends view                                                    | yes                        | unchanged                                    |
| s09-tracker-trends@1440    | Preview (3)                                      | Trends view                                             | Trends view                                                    | yes                        | unchanged                                    |

Notes:

- The Preview steps resolve to the Strength & balance card, the same card the old first-match picked, so those pins were
  already right and stay as they were.
- Captures marked unchanged are byte-identical to the previously pinned PNGs. The one vision reading that flagged
  chart digits on `s09-tracker-trends@1440` came from a small-text misread: the capture is byte-identical to the
  previously accepted one.
- The seven s04 toggle clicks produce no visible state change, and the reference shows the same all-off state. That is
  open item O4 from the verify report, unchanged by this pass.

### Mutation table (production build, each reverted with `git checkout -- <file>`)

| #   | Mutation                                                                                | Exit  | Failing screens (px / geom moved / text)                                    | Verifier, dev build, tol 16 |
| --- | --------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------- | --------------------------- |
| M1  | Text label `Overdue task` to `Overdue tasc`, `clients.tsx:234`                          | **1** | `s01-roster@390` (px 0, text 6); `s01-roster@1440` (px 306, text 6)         | exit 1, 1440 only           |
| M2  | Colour token `--cd-muted: #ababab` to `#a0a0a0`, `coach.css:15`                         | **1** | 58 of 70 screens (e.g. `s01-roster@390` px 13320; `@1440` px 20646), text 0 | exit 0, missed              |
| M3  | 1 px shift at 390 only (`top: 1px` in `@media (max-width: 500px)`), `coach.css` EOF     | **1** | `s01-roster@390` (px 7008, moved 27)                                        | exit 1, `s01-roster@390`    |
| O3  | Clipped-region mutation: `<th>Attention</th>` to `<th>Priority</th>`, `clients.tsx:175` | **1** | `s01-roster@390` (**px 0, text 1**); `s01-roster@1440` (px 266, text 1)     | not run                     |

M1 and O3 are the proof for O3. At 390 px the changed text sits in the clipped scroller, so pixels do not change
(`px 0`), and it is the text check alone that fails the screen.

### Clean runs and flake (the blocker)

- Clean run 1 on the dev server failed: `s02-thread-attachments@390 px=903 geom=0 text=0`. Clean run 2 passed.
- Reproduction failed. The same screen captured six times in isolation on the dev server gave identical sha256
  (`a6afddd1…`), equal to the baseline.
- **Root cause: not isolated.** The failure is pixel-only (zero geometry and text change), so it is paint-level, not
  layout. Caret was already hidden by `FREEZE_CSS` for inputs. Scrollbar, late image decode, and animation timing are
  unverified for this screen. I did not add decode waits or scrollbar gutter; there was no evidence they were the cause.
- **Mitigation:** the gate now runs against a production build, which removes dev-server compile, HMR, and overlay
  timing. The stability proof below is evidence for that setup, not proof that the flake is gone.

Stability proof, production build, unchanged tree, full 70 captures (`npm run parity` each, log in the scratch
directory):

| run | exit | result                     |
| --- | ---- | -------------------------- |
| 1   | 0    | PASS, 0 problems, 70 of 70 |
| 2   | 0    | PASS, 0 problems, 70 of 70 |
| 3   | 0    | PASS, 0 problems, 70 of 70 |
| 4   | 0    | PASS, 0 problems, 70 of 70 |
| 5   | 0    | PASS, 0 problems, 70 of 70 |

Five consecutive clean runs on the production build, with tolerance 0. Five runs do not prove the flake is gone. Open
item: if `s02-thread-attachments@390` fails on the production build again, the cause is still unknown.

### Baseline

- 70 PNGs, 70 `.geom.json.gz`, `manifest.json`, all under `tools/parity/baseline/`: **11,926,994 bytes (11.9 MB)**,
  under the 30 MB limit. All 70 screens captured, 0 failures, 180 of 180 steps at 1 match.
- Captured on the merge `fffcdb3` (base `ea8f514`), production build. Host-bound, as before.

### Gates (final tree, commit 20f53ae plus this report)

| Command                                                            | Exit | Result                                                       |
| ------------------------------------------------------------------ | ---- | ------------------------------------------------------------ |
| `npm run lint`                                                     | 0    | 0 errors, 14 warnings (pre-existing, none in `tools/parity`) |
| `npm run typecheck`                                                | 0    | `tsc --noEmit` clean                                         |
| `npm run test`                                                     | 0    | 96 files, 1137 tests passed                                  |
| `npm run build`                                                    | 0    | root build                                                   |
| `cd frontend && npm run build`                                     | 0    | canvas builds unchanged                                      |
| `npx prettier --check README.md tools/parity icm/05-build/reports` | 0    | clean                                                        |

### Not addressed in this pass

- O1 (port 3630 already in use is not detected): open.
- O4 (s04 toggles show no state change, same as reference): open.
- O5 (click log is not compared with the baseline's click log): open. The manifest now records the matched element's
  visible text (`seen`) and whether a scope applied (`scoped`), so a future compare can use them.
- The flake root cause (see above): open.
