# PR #67 delta re-verify, round 3 (head 1bc14c6)

Verdict: **FIX** (narrow). Items 1, 2, 3, 5, 6 PASS. Item 4 FAIL: `program.py` hard-codes the live beta root, and its output does not reproduce the committed tree. The zero-diff part is pre-existing (identical at 416b2cc), not introduced by fix pass 2.

Scope: head `origin/beta/w0-program` = `1bc14c6` (fixes `cdaea4d`, `162ea70`, `1bc14c6` on `416b2cc`). Detached worktree `pr67v3/wt`, removed after the run (`git worktree list` shows no pr67v3 entry). Scripts and outputs in `pr67v3/`. Nothing committed, pushed or released. Live beta was never written by me. Its `git status` hash changed during the run because the orchestrator edited `ORCHESTRATOR-STATE.md` (04:24:53) and `cards/PIPELINE-FOOTER.md` (04:23:41), so its status is not my doing.

## Per item

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | gate-clean names PR-133 with a concrete check; ledger row points at it | **PASS** | `cards/gate-clean.md` adds a PR-133 check: `gh pr list`/`gh pr view --json comments` must show `SHIP <PR-id> <sha>` from a verifier whose model differs from the builder's, table written to `_evidence/GATE-CLEAN/pr-133.md`, 404 on branch protection reported, not failed. Ledger row (csv parsed): `readiness-p0`, `PR-133`, `build_card=gate-clean`. `verify_map2.py` rc 0: `PR-133 PARTIAL -> GATE-CLEAN build=gate-clean ... OK`; `grep -c PR-133 cards/gate-clean.md` = 1. |
| 2 | `board.py --release` fails closed on missing / malformed `parents`; open-parent card stays blocked | **PASS** | Own stub `hermes` (`pr67v3/stub3/hermes`), own graph and ids (`pr67v3/drive3.py`), real `tools/board.py` from the worktree. 1. Mixed set (A missing key, B string value, C valid all done, D open parent), `--release`: **rc 3**, stderr names A and B, zero unblock calls, C still blocked. 2. Same set, `--release --dry-run`: **rc 3**, nothing listed. 3. A alone + C: **rc 3**, zero unblocks. 4. B alone + C: **rc 3**, zero unblocks. 5. C + D (healthy): **rc 0**, C released (blocked to todo), D still blocked. Note: one bad card stops the whole release run, C included. That is what the code does by design. |
| 3 | PR-01 build has `PR-P1:merge` as a parent in graph.json and on the board; graph acyclic (own check) | **PASS** | `graph.json`: `PR-01:build` parents = `[PR-02:merge, PR-P1:merge]` (was `[PR-02:merge]` at 416b2cc). Own DFS cycle check (`check_graph3.py`), rc 0: 146 nodes, 0 missing parents, 0 cycles; `PR-P1:merge` does not depend on `PR-01:build`. Live board, read-only `hermes kanban --board vari8 show t_782cda21 --json` rc 0: status `blocked`, parents `t_0c04b9fa` (PR-02:merge) and `t_527e2d14` (PR-P1:merge), equal to graph. `board.py --sync --dry-run` (prints only) rc not captured (background run), output `sync vari8: {'body': 0, 'model': 0, 'link': 0, 'unlink': 0}`, stderr empty: 0 diffs vs graph. |
| 4 | `program.py` runs from the worktree, exits 0, zero diff to committed files; no hard-coded live path | **FAIL** | (a) Hard-coded root: `tools/program_data.py:8-9` `WT = "/home/nexuslink/vari8-worktrees"`, `BETA = f"{WT}/beta"`. No env or argv override in `program_data.py` or `program.py`. `program.py` writes `OUT = {BETA}/icm/05-build`, and its docstring (line 3) hard-codes the live path. Running it from the worktree as documented writes into the live beta. I did not run it unpatched. (b) Sandbox run: copy of `icm/` in `pr67v3/gen/beta`, `BETA` overridden in the copy, `python3 icm/05-build/tools/program.py` rc **0**, JSON `problems: []` (`gen-run.out`). (c) Zero diff: `diff -r -x __pycache__` generated vs worktree = **66 files differ**: 57 cards differ only by blank lines; 6 cards differ in text (`gate-clean.md` root path text, `pr-r1-delete-superseded.md:65` `*transition*` vs `_transition_`, `pr-w3-templates-setup(-verify).md`, `pr-w7-nutrition(-verify).md`); `timeline.md`, `POST-BETA-INFRA.md` (table content); `program_data.py` (my path edit). (d) Pre-existing: the same 66-file set results from running the generator on `416b2cc` against its own committed tree. Fix pass 2 neither caused nor fixed it. |
| 5 | No regression of the 11 round-1 rulings; round-2 scripts re-run from `pr67v2/` against the new head | **PASS** | Scripts run from `pr67v2/` with `pr67v2/wt` retargeted to `pr67v3/wt` (`sed` on the fly). See the ruling table below. |
| 6 | `git diff 416b2cc..1bc14c6` touches only icm/ and program tools; 0 em dashes added; no secrets | **PASS** | `git diff --stat`: 64 files, 482 insertions, 296 deletions. Paths outside `icm/`: 0. Program tools touched: `icm/05-build/tools/{board.py, board_selftest.py, program.py, program_data.py}`. Added lines containing U+2014: 0 of 482. Secret patterns (provider keys, GitHub/AWS tokens, private-key blocks, DB URL credentials, password/secret/token assignments) on added lines: 0 hits. `app_dev_password` appears only as prose (a reviewer note that the literal exists in history; no value). |

## Round-2 scripts re-run (item 5)

| Script | Exit | Result on 1bc14c6 |
|---|---|---|
| `verify_graph.py` | 0 | Same problem categories as round 2. One count moved: `body-shorthand-family` 9 to 58. Cause: fix commit `162ea70` adds `(claude-haiku-5-5)` to 49 verify cards. My regex (`\b(Haiku|opus|...)\b`) matches the hyphenated exact id. Exact ids are what ruling 3 requires, so this is a false positive of my script, not a regression. `route-merge-model` 44 as expected. |
| `verify_ledger2.py` | 0 | 38 P0 baseline rows, 38 `readiness-p0`, ids unique, 0 missing, 0 extra. |
| `verify_map.py` | 0 | 0 problems; 19 card-mapped gaps plus 10 POST-BETA-INFRA rows; U+2014 in ledger 0. |
| `verify_map2.py` | 0 | 21 card-mapped gaps, all OK, PR-133 included. |
| `drive_release.py` (step 1) | 0 | Dry run equals independent expectation: 2 releasable (`AUD-REDUCTION-VERIFY:decision`, `PR-04:build`). `PR-01:build` dropped out, as intended: its `PR-P1:merge` parent is open. 132 blocked on open parents; 0 unblocks with an open parent. |
| `drive_release2.py` (step 2) | 0 | Released `PR-04:verify`, `PR-04:secverify` (equal to expected); 0 open-parent unblocks; 130 still blocked. |

Ruling by ruling:

1. No Sonnet, merge cards and GATE-CLEAN on deepseek: **PASS**. 44 merge cards plus GATE-CLEAN on deepseek. Case-sensitive bare-family hits in cards: 0. One comment in `tools/program.py:589` says "no Sonnet anywhere on the board" (prose).
2. Haiku-built cards verified on Opus: **PASS**. Same-model pairs unchanged (none reported).
3. Exact model ids in card lines: **PASS**. `ds4f` and `devin/swe` in cards: 0.
4. Wiring cards descend from PR-05 and PR-P1: **PASS**. No `wiring-*` problem reported.
5. Board release checks parents itself: **PASS** (item 2 above, plus drive_release steps).
6. R1 cards do not dispose S12-43, S12-44, S12-48, S12-49, R3-17: **PASS**. `pr-r1-delete-superseded.md` lists S12-08 to 12, S12-45, S12-50 to 53 only.
7. Ledger one row per P0, mapped gaps, POST-BETA-INFRA exists: **PASS**. Item 1 above.
8. No default DB password literal: **PASS**. `integrate.sh` with `POSTGRES_PASSWORD` unset: rc **2**, message, no side effect. `verify-local.sh` with `BASE_SHA` and `LANE_DB` set and password unset: rc **2** with the FAIL message. Without `BASE_SHA`/`LANE_DB`, it exits 1 at its `:?` guards before the password check. `app_dev_password` literal in either script: 0.
9. No em dashes in coverage-ledger.csv: **PASS** (0 U+2014; 2 en dashes, allowed).
10. Orchestrator files tracked; `__pycache__` ignored: **PASS**. 4 orchestrator files tracked; tracked `__pycache__`: 0; `.gitignore:55` matches `tools/__pycache__/probe.pyc`.
11. PR-05 verify and secverify carry program contract checks: **PASS**. Section at line 19 of both cards.

## Fix needed (item 4 only)

- `tools/program_data.py` and `tools/program.py`: take the root from an env var, or from the file location, and fix the docstring. Today the generator can only write to the live beta.
- Pick the canonical side for the 66 files: regenerate and commit so the tree is the generator's fixed point, or change the generator to emit the committed text. Then re-run and confirm `diff -r` is empty. The card's "Done means" (exit 0 and 0 board diffs) passes on exit and board sync, but not on zero file diff.

Items 1, 2, 3, 5, 6 need no change.

## Files

- `pr67v3/check_graph3.py` (item 3 cycle and parents check)
- `pr67v3/drive3.py`, `pr67v3/stub3/hermes`, `pr67v3/board-proof/*` (item 2)
- `pr67v3/graph-check-new.txt` (verify_graph output), `pr67v3/gen/`, `pr67v3/gen-run.out`, `pr67v3/gen416-run.out` (item 4)
- `pr67v3/sync-dry.out` (board sync dry run)
- Round-2 scripts were run from `pr67v2/` with the path retargeted via `sed` on the fly; no edits to them.

No files were committed, pushed, or released. No PR comment posted (verify-only).
