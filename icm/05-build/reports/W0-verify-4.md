# PR #67 delta re-verify, round 4 (head 2c0799b)

Verdict: **FIX** (narrow). Items 1, 2, 4, 5, 6, 7, 8 PASS. Item 3 PASS on the mutation check, FAIL on the unknown-file check as specified.

Scope: head `origin/beta/w0-program` = `2c0799b` (fixes `db286dd`, `94fdb35`, `c6c5cf8`, footer `2c0799b`, on `1bc14c6`). Detached worktree `pr67v4/wt`, removed with `git worktree remove --force` and `git worktree prune`; `git worktree list` shows no pr67v4 entry. Scripts and outputs in `pr67v4/`. Nothing committed, pushed, released or posted.

Live beta (`/home/nexuslink/vari8-worktrees/beta`), before and after:
- `git status --porcelain` sha256 `577457aa...995d1b` both times, 5 entries both times, same entries.
- Content hash (all files except `.git` and `__pycache__`) changed: `06d8e744...` before, `9ebb8652...` after. I never wrote in that tree (only `git status`, `git rev-parse`, `find`, `stat`, `git fetch`). By mtime, the writes inside my window are `icm/05-build/reports/W0-fix-3.md` (04:45:48), `icm/05-build/BLACKBOARD.md` (04:45:49) and `icm/05-build/ORCHESTRATOR-STATE.md` (04:47:49), all orchestrator writes. I did not take per-file before-hashes, so this is attribution by mtime, not proof. The same thing happened in round 3.
- Side effects on the shared repo `04_PROJECTS/Vari8/.git`: `git fetch origin` (updates remote-tracking refs only) and the worktree add/remove above.

## Per item

| # | Item | Result | Evidence (commands, exit codes) |
|---|---|---|---|
| 1 | No absolute `/home` path in `tools/`; root from location; `--root` accepted | **PASS** | `grep -rn '/home/' icm/05-build/tools` rc **1** (zero hits). `program_data.py:16` `ROOT = Path(os.environ.get("PROGRAM_ROOT") or Path(__file__).resolve().parents[3])`. `generate.py:110` `--root` default `TOOLS.parents[2]`. Machine paths live in `icm/05-build/program-config.json` (outside `tools/`, by design). `paths.sh` derives `REPO_ROOT` from `BASH_SOURCE`. |
| 2 | Generator runs from worktree; `git status` zero; `--check` exit 0 | **PASS** | `python3 icm/05-build/tools/generate.py` rc **0** (`gen-run.out`: `"problems": []`, "generated in place"). `git status --porcelain \| wc -l` = **0**. `generate.py --check` rc **0**: "154 generated files match the committed tree". Prettier 3.9.9 matches `package-lock.json` pin. |
| 3a | Hand-edit one card + one ledger row: `--check` exit 1 naming both; restore | **PASS** | Appended a line to `cards/gate-clean.md`, edited `coverage-ledger.csv`. `--check` rc **1**: `differs icm/05-build/cards/gate-clean.md`, `differs icm/05-build/coverage-ledger.csv` (`mut1.out`). `git checkout --` restore; `git status` 0 lines; `--check` rc **0** (`mut1-restore.out`). |
| 3b | Unknown file in generated cards dir: `--check` names it as stale | **FAIL** (as specified) | (i) `cards/zz-unknown.md` NOT in `cards/.generated`: `--check` rc **0**, "154 generated files match" (`unk-nomanifest.out`). Silent. (ii) Same file listed in `.generated`: rc **1**, `stale    icm/05-build/cards/zz-unknown.md (committed, no longer generated)` (`unk-manifest.out`). Restored; `--check` rc **0** (`final-check.out`). Cause: `check()` only compares the manifest set, so a file never in the manifest is not checked. Design gap, not a regression. `cards/` also holds hand-written files (`PIPELINE-FOOTER.md`, and in the live beta untracked `W0-fix-1..3.md` and `PR-03a.md`), so a naive "every file in cards/ must be generated" rule needs an allowlist. |
| 4 | 8 sampled reconciled files: hand-edit content survived regeneration | **PASS** | Across all 66 files in `W0-fix-3.md` (parsed from the table, `list66.txt`): `git diff --stat 1bc14c6 2c0799b -- <66>` = **1 file** changed (`PROGRAM.md`). The other 65 are byte-identical to `1bc14c6`, so regeneration reproduced the committed bytes. Ignoring whitespace and blank lines, the only content change is `PROGRAM.md`: the PR-01 checkpoint text (`PR-01 waits for PR-P1 merge and merges at 05:35`), which is the intended fix. Sample (8): |

Sample detail (item 4):

| File | sonnet (ci) | exact ids seen | bare Haiku/Opus words | Other ruling check |
|---|---|---|---|---|
| `icm/03-plan/output/PLAN.md` | 0 | claude-haiku-5-5 (6), claude-opus-5-5 (2), deepseek-v4.1-flash (4) | 0 | byte-identical to 1bc14c6 |
| `icm/05-build/POST-BETA-INFRA.md` | 0 | none | 0 | PRODREADY 1; byte-identical |
| `icm/05-build/PROGRAM.md` | 0 | haiku 5, opus 2, deepseek 5, gpt-6.1-sol 1 | 0 | `PR-P1:merge` present (1); PR-01 text corrected (only changed file) |
| `cards/pr-01-canvas-takeover-verify.md` | 0 | claude-haiku-5-5 | 0 | verifier haiku, builder swe-2-max (different model): OK |
| `cards/pr-r1-delete-superseded.md` | 0 | deepseek-v4.1-flash | 0 | byte-identical |
| `cards/pr-w7-nutrition.md` | 0 | deepseek-v4.1-flash | 0 | byte-identical |
| `cards/pr-x2-index-final.md` | 0 | deepseek-v4.1-flash | 0 | byte-identical |
| `cards/parity-harness-verify.md` | 0 | claude-haiku-5-5, claude-opus-5-5 | 0 | Haiku builder (`parity-harness`), verifier claude-opus-5-5: ruling 2 holds |

Other rulings re-checked on 2c0799b: `graph.json` `PR-01:build` parents = `['PR-02:merge', 'PR-P1:merge']`; `verify_ledger2` 38 readiness-p0 rows, 38 distinct, none missing; `verify_map2` `PR-133 PARTIAL -> GATE-CLEAN ... OK`; `verify_graph` `sonnet_cards: 0`, `haiku_cards: 49`, `opus_cards: 4`.

| 5 | Round-2 and round-3 scripts re-run against 2c0799b | **PASS** | Copies with paths retargeted to `pr67v4/wt` (`pr67v4/r2/`, `pr67v4/r3/`, stubs copied; originals untouched). Round 2: `verify_graph.py <wt>/icm/05-build` rc **0**; `verify_ledger2.py` rc **0** (38 P0, 0 missing, 0 extra); `verify_map.py` rc **0** (0 problems, ledger U+2014 0); `verify_map2.py` rc **0** (PR-133 OK); `drive_release.py cli` rc **0** (dry run 2 releasable, expected True; release 2 unblocked, 0 open-parent unblocks); `drive_release2.py` rc **0** (`PR-04:secverify`, `PR-04:verify` = expected; 0 open-parent unblocks; 130 still blocked). Note: `drive_release.py` needs argv `cli`; without it, it exits 1 (IndexError). Round 3: `check_graph3.py <wt>` rc **0** (146 nodes, 0 missing parents, 0 cycles; `PR-01:build` depends transitively on `PR-P1:merge`; reverse false). `drive3.py` rc **0**: case 1 mixed `--release` rc **3**, names A and B, 0 unblock calls, C blocked; case 2 `--release --dry-run` rc **3**, nothing listed; case 3 A alone rc **3**, 0 unblocks; case 4 B alone rc **3**, 0 unblocks; case 5 healthy C + D rc **0**, C released, D blocked. Stub is `pr67v4/stub3/hermes`, state under `pr67v4/board-proof/`. |
| 6 | `board.py --sync --dry-run` against live vari8 from worktree: 0 diffs | **PASS** | `python3 icm/05-build/tools/board.py --sync --dry-run` rc **0**, `sync vari8: {'body': 0, 'model': 0, 'link': 0, 'unlink': 0}`, stderr empty (`sync-dry.out`). Dry run only, no write. (A first attempt hit the 60 s tool timeout, no output; the rerun with a 600 s timeout completed.) |
| 7 | PIPELINE-FOOTER carries the `index:check` rule | **PASS** | `icm/05-build/cards/PIPELINE-FOOTER.md:13`: "Since PR #65 (7072404): after merging origin/Vari8-Beta and before every push, run `npm run index` and make sure `npm run index:check` exits 0." Added by `2c0799b` (+2 lines). |
| 8 | `git diff 1bc14c6..2c0799b` only `icm/`; 0 em dashes added; no secrets | **PASS** | 16 files changed, 403 insertions, 66 deletions. Paths outside `icm/`: **0**. Added lines with U+2014: **0** (of 403). En dashes added: 0. Secret scan on added lines (provider keys, GitHub/AWS/Google/Slack tokens, private-key blocks, DB URLs with credentials, password/secret/token/api_key assignments): **0** hits. `:***` masked DB URLs in `icm/03-plan/output/TA/*` are pre-existing and masked. |

## Fix needed (item 3b only)

- `icm/05-build/tools/generate.py` `check()`: also flag files in `icm/05-build/cards/` that are neither in the new generated set nor on an explicit hand-written list (`PIPELINE-FOOTER.md`, `board-ids.tsv`, and the W0-fix cards if committed). Then re-run item 3b. Alternative if the allowlist is unwanted: document that `--check` covers only manifest entries, and drop the "names unknown files" expectation.
- Nothing else. Items 1, 2, 4 to 8 need no change.

## Files

- `pr67v4/gen-run.out`, `pr67v4/check-clean.out` (items 1, 2); `pr67v4/mut1.out`, `pr67v4/mut1-restore.out`, `pr67v4/unk-nomanifest.out`, `pr67v4/unk-manifest.out`, `pr67v4/final-check.out` (item 3)
- `pr67v4/list66.txt`, `pr67v4/content-diff66.txt` (item 4)
- `pr67v4/r2/*.out`, `pr67v4/r3/*.out`, `pr67v4/sync-dry.out` (items 5, 6)
- Added files are only under `pr67v4/` (scratch). No files in the live beta or the repo were changed by me.

No commits, pushes, board writes or PR comments.
