# Parity harness: independent verification round 2 (PR #68, issue #61)

Verifier: urokodaki (Opus). Builder: Haiku (zenitsu gear). Date: 2026-10-19.
Worktree `/home/nexuslink/vari8-worktrees/parity-harness`, branch `beta/parity-harness`, HEAD `6b36bb0e4a435c1d3d72e5b4c53c3a5aaaf24995`.
Merge base with `origin/Vari8-Beta`: `8d82b57`. During this session `origin/Vari8-Beta` moved to `f02a6d6` (PR #67, icm docs and tools only, no `frontend/` change; `git merge-tree --write-tree origin/Vari8-Beta HEAD` exit 0).
Nothing committed or pushed. This file is untracked. Evidence root: `/home/nexuslink/.hermes/profiles/urokodaki/cache/scratch/pr68v2/` (below: `$E`).

## Verdict: FIX

F1 and F2 are closed, O2 holds, and the gate is bit-exact on an idle host (10 of 10 runs, plus a fresh build).
Two blockers remain, plus two smaller fixes:

1. **B1, determinism under load.** The run under CPU load failed (`s10-appearance@1440`, 2 px). Root cause found and a one-line fix proven (section 5).
2. **B2, foreign server on :3630.** The gate attaches to whatever answers on the port, compares that app, and prints `parity PASS` for a mutated tree. The exit code was 1 only because cleanup crashed (section 6).
3. **F3, fail-open env.** A non-numeric `PARITY_AA_TOLERANCE` or `PARITY_MAX_DIFF_PIXELS` turns the pixel check off.
4. **F4, paint inside clipped scrollers.** A colour change on an off-screen row inside a clipped scroller passes. I judge this a fix for a "no visual difference" gate, or else a written owner waiver plus a narrower README claim.

Separately, `typecheck` and the root `build` fail on HEAD. The cause is inherited from the base branch, not from this PR (section 7).

## Summary

| # | Item | Result |
|---|---|---|
| 1 | Tolerance 0 (F1) | PASS. Plus F3 (fail-open on invalid env) |
| 2 | Ambiguous clicks (F2) | PASS |
| 3 | Atomic baseline update (O2) | PASS |
| 4 | Inner scrollers (O3) | Text PASS. Paint FAIL (F4) |
| 5 | Determinism | FAIL (B1): 10 of 10 idle and fresh build pass; the run under load fails. Root cause and fix proven |
| 6 | Gate integrity | Prod default PASS, `PARITY_DEV=1` switch PASS, port handling FAIL (B2) |
| 7 | Gates on HEAD | lint, test, frontend build, index:check PASS. typecheck and root build FAIL (inherited from base) |
| 8 | Scope | PASS: no `frontend/` file in the diff |

## 1. Tolerance 0 (F1): PASS, with F3

Mutation driver `$E/mut.sh` applies one edit, runs `npm run parity`, and reverts in an `EXIT` trap (`git checkout -- <file>`). Summary in `$E/summary.txt`; per-run logs `$E/<ID>.log`.

| ID | Mutation | Exit | Result |
|---|---|---|---|
| M2 | `--cd-muted: #ababab` to `#a0a0a0`, `frontend/src/components/coach/coach.css:15` | 1 | 58 of 70 FAIL (for example `s11-preferences@1440` px 48129) |
| M2b | `--cd-muted: #ababab` to `#ababac` (blue channel +1, one token) | 1 | 58 of 70 FAIL (for example `s01-roster@390` px 7037, `s11-preferences@1440` px 5929). Caught |

- Default: `tools/parity/compare.mjs:17` `AA_TOLERANCE = Number(process.env.PARITY_AA_TOLERANCE ?? 0)`, applied at `:62` (`d > tol`). The variable exists and defaults to 0. PASS.
- **F3 (FIX), fail-open on invalid env.** `Number("abc")` is NaN, and `d > NaN` and `px.diff > NaN` are always false. Proof: I copied the baseline to `$E/swap1` and replaced `1440/s11-preferences.png` with `1440/s09-tracker-today.png` (same size, a different screen). Then I ran `node tools/parity/compare.mjs --current $E/swap1`:

  | Env | Exit | `s11-preferences@1440` |
  |---|---|---|
  | unset | 1 | FAIL px=1197007 |
  | `PARITY_AA_TOLERANCE=0` | 1 | FAIL px=1197007 |
  | `PARITY_AA_TOLERANCE=abc` | **0** | ok px=0 |
  | `PARITY_MAX_DIFF_PIXELS=abc` | **0** | ok px=1197007 |

  Logs: `$E/swap-*.log`. Close it: `compare.mjs:17-18` should throw unless the value is a finite integer of 0 or more. Acceptance: both `abc` runs exit 1 with a clear error.

## 2. Ambiguous clicks (F2): PASS

- Read: `tools/parity/capture.mjs:84-112` `STEP_SCOPES` (15 entries across 9 stems, which is 30 step instances over both viewports; applied at `:291`). Throw-on-multiple at `:180-184`: no match returns null (then the fallback label, then "click target not found"). More than one match throws `ambiguous click`. `captureAll` records the throw as a failure, and `run.mjs:94-98` exits 1 before any compare.
- Baseline manifest: 0 steps with more than one match, 0 page errors (`node $E/../pr68/amb.mjs`).
- Probe F2 (`$E/F2.driver.txt`): `frontend/src/components/coach/clients.tsx:373` tab list given a second `"Check-ins"`. Exit 1. `capture: 2 failure(s)`: `s01-profile-checkins@390` and `@1440`, both `ambiguous click "Check-ins": 2 matches inside its scope`. Reverted, status clean.
- PNGs viewed against `icm/04-briefing/shots/`:

  | Capture | Expected | Seen | Verdict |
  |---|---|---|---|
  | `baseline/1440/s01-profile-checkins.png` | Chloe Park, Check-ins tab, "Submission history" | same: tab active, "No submissions yet", "Open calendar" | PASS |
  | `baseline/390/s01-profile-checkins.png` | same, mobile | same, Check-ins tab active in the scrolled tab strip | PASS |
  | `baseline/390/s04-template-habits.png` | Untitled template, Tabs panel, 7 client-tab toggles off | same. The Nutrition row sits under the fixed bottom nav in the full-page shot | PASS (state matches the reference; see note) |

  Note: the seven toggle clicks change nothing visible, at both viewports and in the reference (O4 from round 1, a briefing question, unchanged).

## 3. Atomic baseline update (O2): PASS

`$E/o2.sh`: hashes every baseline file, starts `npm run parity -- --update-baseline`, waits for 3 `OK` captures, then sends SIGTERM to `node tools/parity/run.mjs`.

| Check | Before | After |
|---|---|---|
| sha256 over all baseline files | `f3f9a4c85edade3c` | `f3f9a4c85edade3c` |
| file count | 141 | 141 |
| `git status --short tools/parity/baseline` | empty | empty |
| `tools/parity/out/baseline.tmp` | n/a | partial (`390/` only) |
| listeners on :3630 after kill | n/a | 0, no `next` process left |

## 4. Inner scrollers (O3): text PASS, paint FAIL (F4)

The builder used the roster table scroller. I used a different one: the client-preview dialog's vertical scroller (`s09-tracker-week@390`, rows below about y 825 are clipped inside the dialog).

| ID | Mutation | Exit | Result |
|---|---|---|---|
| O3t | `"Energy outside gym"` to `"Energy outside gyn"`, `frontend/src/components/coach/model.ts:232` | 1 | 6 FAIL. `s09-tracker-week@390` **px 0, text 1** (caught by text alone); `s09-tracker-today@390` px 0, text 1; `s05-tracker-setup@390` px 40; three 1440 screens px 33 to 58 |
| O3c | Append to `week-view.css`: `@media (max-width: 500px) { .coach-root .ct-week-table tbody:last-of-type .ct-week-metric-label { color: #ff0000 } }` | **0** | PASS, 70 of 70 px 0. **Not caught** |

Positive control for O3c (`$E/o3c-control.sh`, `$E/o3c-probe.mjs`): I built and served the mutated canvas on :3631 and replayed the recipe. The last metric group ("Energy intake", "Protein intake") computes to `rgb(255, 0, 0)`, versus `rgb(244, 244, 244)` for the first label, with its top at y 1817 inside the 844 px viewport's dialog. After one scroll inside the dialog both labels are bright red (`$E/o3c-scrolled.png`). The change is visible to a user, and the gate passes it.

Disclosure: my control script's revert ran from `frontend/` with a repo-relative path and did not apply. I caught it on the next status check and reverted by hand (`git checkout -- frontend/src/components/coach/client-tracker-preview/week-view.css`, then `git status --short` empty). The script has been fixed since.

**F4, judgment.** This is a fix, not a waiver item by default. The README promises "exits 1 on any real change", and a paint change in a clipped region is a change a user sees after one scroll. Geometry and text cover layout and copy. Paint-only changes (colour, background, border colour, shadow, opacity, an icon swap with the same box) inside any clipped scroller pass. Cheapest close: add a few computed paint properties per row in `geometry()` (`capture.mjs:202-248`), for example `color`, `background-color`, `border-*-color`, `box-shadow`, `opacity`, `fill`, `stroke`, `background-image`, and compare them like text. Acceptance: O3c exits 1 on `s09-tracker-week@390`, and two clean runs still exit 0. If Marcel prefers to waive it, the README claim must name the limit.

## 5. Determinism: FAIL (B1), root cause found

Runs: `$E/det.sh`, logs `$E/det/run*.log`, table `$E/det/table.txt`. Production default, unchanged tree, full 70 captures each. Status was clean and :3630 free after every run.

| Run | Exit | Seconds | ok | Screens with any change | Result |
|---|---|---|---|---|---|
| 1 | 0 | 192 | 70 | 0 | PASS |
| 2 | 0 | 191 | 70 | 0 | PASS |
| 3 | 0 | 190 | 70 | 0 | PASS |
| 4 | 0 | 191 | 70 | 0 | PASS |
| 5 | 0 | 191 | 70 | 0 | PASS |
| 6 | 0 | 190 | 70 | 0 | PASS |
| 7 | 0 | 190 | 70 | 0 | PASS |
| 8 | 0 | 190 | 70 | 0 | PASS |
| 9 | 0 | 191 | 70 | 0 | PASS |
| 10 | 0 | 191 | 70 | 0 | PASS |
| fresh (`frontend/.next` moved to `$E/det/next-before-fresh`, not deleted) | 0 | 199 | 70 | 0 | PASS |
| load (16 busy-loop processes plus a looping `tsc --noEmit`; load1 2.15 at start, 19.70 at end) | **1** | 210 | 69 | 1 | **FAIL** `s10-appearance@1440 px=2 geom=0/0/0 text=0` |

Diagnosis (`$E/locate.mjs`, `$E/at.mjs`, `$E/repro.mjs`, `$E/repro.sh`, output `$E/repro2.txt`):

- The 2 pixels are (139, 806) `[103,103,103]` to `[102,102,102]` and (140, 806) `[39,38,38]` to `[38,37,37]`. They are anti-aliased edge pixels on the 1 px translucent circular border of the selected accent swatch (`fieldset[2] > button[1]`). That is `.eg-root .eg-ap-swatch[aria-pressed="true"]`, `frontend/src/components/ethereal/ethereal-appearance.css:239-263`. Zoom: `$E/s10load-zoom.png`.
- The element sits at a fractional position: `x 138.234375, y 784.90625`, size 31 by 31, scroll 0.
- Single-screen repro with the gate's exact context settings, 40 captures per condition, first and second screenshot of the same page:

  | Condition | First shot = baseline | Second shot differs from first |
  |---|---|---|
  | idle | 40 of 40 | 6 of 40 |
  | load | 37 of 40 | 17 of 40 (two bad hashes; a bad frame can repeat twice) |
  | load, `--disable-gpu` | 35 of 40 | 17 of 40 |
  | load, `--num-raster-threads=1` | 39 of 40 | 20 of 40 |
  | load, **`--disable-partial-raster`** | **40 of 40** | **0 of 40** |

- **Cause:** Chromium's partial raster re-rasterizes only the invalidated part of a tile. A sub-pixel-positioned anti-aliased border then rasterizes slightly differently depending on which rect was re-rastered. Idle, the gate's single first shot happens to land on the stable frame; load shifts the timing. "Retake until two shots match" would not fix this, because a bad frame can repeat.
- **Fix (proven):** `tools/parity/capture.mjs:252` `chromium.launch()` to `chromium.launch({ args: ["--disable-partial-raster"] })`. I applied it temporarily (`$E/fixload.sh`, reverted by trap, status clean after) and ran the full gate twice under the same 16-process load:

  | Run | Exit | ok | load1 | Result |
  |---|---|---|---|---|
  | fixload1 | 0 | 70 | 16.95 | PASS |
  | fixload2 | 0 | 70 | 17.01 | PASS |

  The flag does not change any baseline pixel (70 of 70 equal to the committed baseline), so no recapture is needed.
- Acceptance for the builder: apply the flag, then 10 idle runs and 3 loaded runs all exit 0, and the repro under load gives 40 of 40.
- Not reproduced: the builder's dev-server `s02-thread-attachments@390` 903 px flake. I saw no failure on that screen in 13 production runs. It is plausibly the same mechanism; the flag also covers it.

## 6. Gate integrity: prod default PASS, dev switch PASS, port FAIL (B2)

- Production by default: `run.mjs:56-70` runs `next build --webpack`, then `next start`. The `tools/parity/out/server.log` of a default run shows `Creating an optimized production build`, `Compiled successfully`, `Ready in 91ms`. PASS.
- `PARITY_DEV=1` (`run.mjs:22, 50-55`): its run shows `Compiling /coach ...` (dev on-demand compile) and no production build. Exit 1 with 6 FAIL against the production baseline (`$E/gates/dev-parity.log`; for example `s10-mealplan-studio@1440` px 62044). The switch works. Dev output is not comparable with the production baseline; the README should say so.
- **B2 (blocker), foreign server on :3630.** `$E/o1.sh`: I built the unmutated canvas from a copy outside the worktree (`$E/stale-fe`) and served it with `next start` on :3630. Then I applied M2 (fails 58 screens when gated correctly) and ran `npm run parity`. Result (`$E/o1.log`, `$E/o1.driver.txt`):
  - The gate's own `next start` died with `EADDRINUSE 127.0.0.1:3630` (`tools/parity/out/server.log:34`).
  - `waitForHttp` (`run.mjs:24-34, 71`) got 200 from the foreign server, and all 70 screens were captured from it: `ok` 70, `parity PASS: 0 problem(s)` for a tree with a 58-screen colour change.
  - The exit code was 1 only because `run.mjs:112` `process.kill(-server.pid)` threw `ESRCH` on the dead child and crashed. That skipped the `frontend/AGENTS.md` restore in the same `finally`. The report HTML says PASS.

  Close it: before spawning, fail if the port is already bound. After `waitForHttp`, confirm the child is alive and owns the port (or serve a per-run nonce and check it). Wrap the kill in try/catch so cleanup always runs. Acceptance: rerun `$E/o1.sh`; the gate exits 1 with a clear "port 3630 in use" message before any capture.
- Stale-server trigger: SIGTERM to `run.mjs` did not orphan the server (section 3). Any other stale `next start`, dev server or unrelated app on :3630 triggers it.

## 7. Gates on HEAD

Script `$E/gates.sh`, logs `$E/gates/<name>.log`, table `$E/gates/gates.txt`.

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | 0 errors, 3 warnings |
| `npm run typecheck` | **1** | 1 error: `icm/05-build/evidence/PR-03b-verify-3/probes/variant-mount-timing.dom.test.tsx(22,39) TS2307 Cannot find module './v3-deferred-thread'`. No error in `tools/parity` |
| `npm run test` | 0 | vitest run |
| `npm run build` | **1** | same TS2307 during type check |
| `cd frontend && npm run build` | 0 | static pages prerendered |
| `npm run index:check` | 0 | `6 index docs and all AGENTS.md routers match` |

Provenance of the red gate: the file came in with commit `8a21ad0` (PR-03b verify round 3) through the merge of `8d82b57`. It is present at `8d82b57` and at the current `origin/Vari8-Beta` (`f02a6d6`). The imported module `v3-deferred-thread` exists in neither tree (`git ls-tree -r origin/Vari8-Beta | grep -c v3-deferred-thread` gives 0). It is not in `20f53ae`, which is why the builder's report shows typecheck 0. **This is inherited from the base and not caused by PR #68**, but HEAD cannot merge green until the base is fixed. Route it to the PR-03b owner. The root `tsconfig.json` includes `**/*.tsx` and does not exclude `icm/`.

## 8. Scope: PASS

- `git diff origin/Vari8-Beta...HEAD --stat -- frontend`: empty, exit 0. The two-dot diff `origin/Vari8-Beta..HEAD -- frontend` also lists 0 files.
- Changed outside the baseline: `.gitignore`, `README.md`, the two icm reports, `package.json`, `tools/AGENTS.md`, `tools/parity/{capture,compare,run}.mjs`.
- Baseline: 11,926,994 bytes committed (under 30 MB).
- Secrets grep on the diff (PNG and gz excluded): 7 hits, all prose in the reports (the word "token" as in colour token). No credentials.

## Other notes (P2)

- `README.md` says "captured from `Vari8-Beta` at `55a0f08`". The baseline was recaptured on `fffcdb3` (builder report). Update it.
- `run.mjs:31` error text says "dev server did not answer" in production mode.
- O4 and O5 from round 1 are still open, as the builder states.

## End state

- `git status --short`: empty after every step and at the end (`$E/gates/gates.txt` last lines). The only new file is this untracked report.
- Ports: :3630 and :3631 have no listener. No `next start`, `next dev` or `next build` process, and no burner process left (`burners left: 0`).
- Left in scratch, not in the tree: `$E/det/next-before-fresh` (the moved `.next`, 422 MB) and `$E/stale-fe` (the stale-server copy). Delete them when this verify is accepted.
- `frontend/.next` in the worktree now holds the dev-run output from the last `PARITY_DEV=1` run. It is ignored and rebuilt by every default run.
