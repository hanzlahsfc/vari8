# Parity harness: independent verification (PR #68, issue #61)

Verifier: urokodaki (Opus). Builder: Haiku. Date: 2026-10-19.
Worktree `/home/nexuslink/vari8-worktrees/parity-harness`, branch `beta/parity-harness`, HEAD `706fe2f9d31ca95f56bd3c95aa733a6e6f680864`.
Merge base `55a0f08`. `origin/Vari8-Beta` has since moved to `ea8f514` (PR #64, test-file deletions only, see section 5).
Nothing committed, pushed or merged. Every mutation was reverted and `git status --short` was empty after each one.
Logs and helper scripts: `/home/nexuslink/.hermes/profiles/urokodaki/cache/scratch/pr68/`.

## Verdict: FIX

The harness is deterministic. It catches a text change, a 1 px move and a 2 px move.
It does not catch a colour-token change under 17/255 per channel, even though that change repainted 58 of 70 screens.
One baseline screen (`s01-profile-checkins`, both viewports) pins the wrong state, so the profile Check-ins tab has no coverage.
Close F1 and F2, recapture the baseline, and it is a SHIP.

## 1. Code read

All of `tools/parity/capture.mjs` (297 lines), `compare.mjs` (268), `run.mjs` (89).

| Property               | Verdict   | Evidence                                                                                                           |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| Frozen clock           | PRESENT   | `capture.mjs:210` `page.clock.setFixedTime(2026-10-19T10:00+02:00)`, `timezoneId` at `:199`                        |
| Animations off         | PRESENT   | `capture.mjs:24-27` FREEZE_CSS, `reducedMotion: "reduce"` at `:202`, screenshot `animations: "disabled"` at `:226` |
| Fonts awaited          | PRESENT   | `capture.mjs:44` `document.fonts.ready`, plus 400 ms DOM-quiet window `:45-65`                                     |
| Fixed storage seed     | PRESENT   | `capture.mjs:22` empty seed, `localStorage.clear()` per document `:36`, fresh context per shot `:196`              |
| Seeded randomness      | PRESENT   | `capture.mjs:29-35` Math.random and crypto.randomUUID                                                              |
| Fixed viewport and DPR | PRESENT   | `capture.mjs:15-18`, `deviceScaleFactor: 1` at `:198`                                                              |
| Result                 | Bit-exact | 0 of 70 PNG sha256 differ between baseline and a clean run (section 2)                                             |
| Fails on 2 px move     | PRESENT   | Builder self-test; my 1 px test (3c) also fails                                                                    |
| Fails on colour change | PARTIAL   | Only above 16/255 per channel. `compare.mjs:15` `AA_TOLERANCE = 16`, applied per pixel at `:60`. See F1            |
| Catches 1 px border    | PARTIAL   | Added border: caught by geometry (box grows). Border colour tweak within 16/255: not caught (same cause as F1)     |
| Catches text change    | PRESENT   | Mutation 3a, 276 px changed on the screen that shows the label                                                     |

## 2. Clean runs

| Command                                                | Exit | Result                             |
| ------------------------------------------------------ | ---- | ---------------------------------- |
| `npm run parity` (run 1, 03:07:08 to 03:10:39)         | 0    | PASS, 70 of 70 `px=0 geom=0/0/0`   |
| `npm run parity` (run 2)                               | 0    | PASS, 70 of 70 `px=0 geom=0/0/0`   |
| `npm run parity` (run 3, after all mutations reverted) | 0    | PASS, 70 of 70 `px=0 geom=0/0/0`   |
| `node sha.mjs` (baseline vs run 3 sha256)              | 0    | `sha differs on 0 of 70`           |
| `node rawdiff.mjs` (tolerance 0, 4 screens)            | 0    | `changed: 0, maxDelta: 0` on all 4 |

Clean captures are bit-identical on this host. The 16/255 tolerance absorbs no noise here, it only hides changes.

## 3. Mutation tests (each reverted with `git checkout -- <file>`)

| #   | Mutation                                                                                                                         | File                                            | Exit  | Failed screens                            | Result                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | Text label `Overdue task` to `Overdue tasc`                                                                                      | `frontend/src/components/coach/clients.tsx:234` | 1     | `s01-roster@1440` (276 px, geom 0/0/0)    | Caught. `s01-roster@390` passed correctly: the Attention column is clipped inside the horizontal table scroller at 390, so the label is not on screen (checked by eye on `baseline/390/s01-roster.png`)                                                 |
| b   | Colour token `--cd-muted: #ababab` to `#a0a0a0` (delta 11, token used 211 times)                                                 | `frontend/src/components/coach/coach.css:15`    | **0** | none, 70 of 70 `px=0`                     | **Missed. FIX (F1).** The change did render: sha256 differs on 58 of 70 screens; raw diff at tolerance 0: `s01-roster@1440` 20646 px, `s01-roster@390` 13320 px, `s09-tracker-today@1440` 14214 px, `s11-preferences@1440` 48129 px, max delta 11 to 12 |
| c   | 1 px shift at 390 only: `@media (max-width: 500px) { .coach-root .cd-roster-toolbar { position: relative; top: 1px } }` appended | `frontend/src/components/coach/coach.css` (EOF) | 1     | `s01-roster@390` only (5088 px, 27 moved) | Caught, correct scope. 69 other screens ok                                                                                                                                                                                                              |

## 4. Ambiguous click steps

`node amb.mjs` on `tools/parity/baseline/manifest.json`: 70 screens, 0 failures, 0 page errors, **21 steps with more than one match** (count confirmed), 9 mobile label fallbacks.

Spot-checked 8 captures across 7 recipes (14 of the 21 ambiguous steps) against `icm/04-briefing/shots/` by eye. I built a side-by-side composite per pair with `pair.mjs` (reference left, capture right).

| Capture                      | Ambiguous step                            | Expected                                                 | Seen                                                 | Verdict             |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- | ------------------- |
| `s01-profile-checkins@1440`  | `Check-ins` (2 matches, span)             | Chloe Park profile, Check-ins tab ("Submission history") | Global Check-ins board (week calendar, all athletes) | **WRONG. FIX (F2)** |
| `s01-profile-checkins@390`   | `Check-ins` (2 matches, span)             | same                                                     | Global Check-ins board                               | **WRONG. FIX (F2)** |
| `s04-template-habits@1440`   | 7 tab labels (2 matches each, strong)     | as reference                                             | Matches reference (Untitled template, Tabs panel)    | OK. Note O4         |
| `s06-mealplan-editor@1440`   | `Create` (2, button)                      | Meal plan editor                                         | Matches                                              | OK                  |
| `s09-tracker-week@1440`      | `Preview` (3, button)                     | Client preview, Week view                                | Matches, Week active                                 | OK                  |
| `s09-tracker-trends@1440`    | `Preview` (3, button)                     | Client preview, Trends view                              | Matches, Trends active                               | OK                  |
| `s08-template-dashboard@390` | `02 Dashboard` to `Dashboard` (3, button) | Template editor, Dashboard tab                           | Matches, Dashboard tab active, mobile layout         | OK                  |
| `s06-template-nutrition@390` | `02 Dashboard` to `Dashboard` (3, button) | Template editor, Nutrition tab                           | Matches, Nutrition tab active                        | OK                  |

Cause of F2: the sidebar nav item `Check-ins` (`frontend/src/components/coach/coach-app.tsx:35`) comes before the profile tab `Check-ins` (`frontend/src/components/coach/clients.tsx:373`) in DOM order, and `capture.mjs:128` takes the first interactive match. The builder report predicted this risk ("would just pin the wrong state"). Here it happened.
Not checked: the other 7 ambiguous steps (`s04-template-habits@390`, `s05-tracker-setup@390` (builder checked it by eye), `s06-mealplan-editor@390`, `s09-tracker-today@390`, `s09-tracker-today@1440`, `s09-tracker-week@390`, `s09-tracker-trends@390`).

## 5. Scope, size, secrets

| Check               | Command                                                                                                                                                  | Exit   | Result                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No frontend change  | `git diff origin/Vari8-Beta...HEAD --stat -- frontend`                                                                                                   | 0      | empty; `--name-only \| grep -c ^frontend/` gives 0                                                                                                                                                 |
| Baseline size       | `du -sb tools/parity/baseline`; `git ls-tree -r -l HEAD tools/parity/baseline`                                                                           | 0      | 11989025 bytes (12.0 MB), under 30 MB                                                                                                                                                              |
| Secrets             | `git diff origin/Vari8-Beta...HEAD` (PNG and gz excluded) grep for key, token, password, bearer, sk-, ghp_, AKIA, private key, DATABASE_URL, postgres:// | grep 1 | no match. Captures show demo data only (`chloe.park@example.com`)                                                                                                                                  |
| Other changed files | `git diff ... -- package.json .gitignore`                                                                                                                | 0      | one `parity` script; `/tools/parity/out/` ignored                                                                                                                                                  |
| Base drift          | `git log 55a0f08..origin/Vari8-Beta`                                                                                                                     | 0      | PR #64: deletes test and `.checks.mjs` files only; none imported by any `.ts`/`.tsx` (grep empty). Baseline stays valid. `git merge-tree --write-tree origin/Vari8-Beta HEAD` exit 0, merges clean |
| Server cleanup      | `ss -ltn \| grep -c 3630`; `pgrep -af 'next dev'`                                                                                                        | 0      | 0 listeners; no `next dev` process left. `frontend/AGENTS.md` restored (status clean)                                                                                                              |

## Findings

### F1 (FIX) Colour changes under 17/255 per channel pass the gate

`tools/parity/compare.mjs:15` sets `AA_TOLERANCE = 16`, and `:60` applies it per pixel with `MAX_DIFF_PIXELS = 0` (`:16`). A uniform token shift of 11 repainted 58 screens and the gate said PASS.
What breaks: a wiring PR can drift a theme token, a border colour or a muted text shade and still pass.
Close: set the default tolerance to 0 (clean runs here are bit-exact). Keep an env override such as `PARITY_AA_TOLERANCE` for other hosts. Acceptance: mutation 3b (`--cd-muted` to `#a0a0a0`) exits 1, and two clean runs still exit 0.

### F2 (FIX) `s01-profile-checkins` pins the global Check-ins board, not the profile tab

`tools/parity/capture.mjs:121-128`: first interactive match wins. The click lands on the sidebar nav, not the profile tab. Both viewports are affected.
What breaks: the profile Check-ins tab (`clients.tsx:542`) has no coverage, and this screen duplicates `s03-checkins-board`.
Close: give the step an explicit scope (for example a selector or `role=tab` within the profile tab list), or fail when `matches > 1` unless the recipe names a scope. Then recapture with `--update-baseline`. Acceptance: `baseline/{1440,390}/s01-profile-checkins.png` shows the "Submission history" panel under Chloe Park, as in `icm/04-briefing/shots/s01-profile-checkins.png`.

### Observations (P2, not blocking)

- O1 `run.mjs:43-54`: no check that port 3630 is free. If another server already listens there, `waitForHttp` succeeds against it and the gate captures the wrong app. Fail fast if the port is taken.
- O2 `run.mjs:57`: `--update-baseline` deletes the baseline before capturing. A failed capture leaves a partial baseline (the exit is 1, but the files are gone). Capture to a temp dir and swap on success.
- O3 Pixel coverage stops at the viewport of inner scrollers. At 390, `s01-roster` clips its Attention column inside the table scroller, and changes there that keep the box size are invisible (mutation 3a). The 390 capture is also 762 px wide (document overflow), which is a canvas layout fact, not a harness defect.
- O4 `s04-template-habits`: the reference and the capture both show the Tabs panel, not the Habits tab editor. The harness reproduces the reference faithfully. Whether the recipe in `icm/04-briefing/shots/index.json` is the intended one is a briefing question.
- O5 The compare does not check that the current click log (label, match count) equals the baseline's. A recipe that starts resolving to a different element shows up only through pixels.

## Commands run (verifier)

`npm run parity` x6 (clean, clean, mutation a, mutation b, mutation c, clean after revert: exits 0, 0, 1, 0, 1, 0). Helper scripts in the scratch dir: `amb.mjs`, `sha.mjs`, `rawdiff.mjs`, `pair.mjs`. Each read-only against the worktree.
