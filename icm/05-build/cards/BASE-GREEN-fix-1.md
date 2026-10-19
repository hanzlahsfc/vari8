# BASE-GREEN fix 1: restore literals the Markdown reflow mangled

PR #75, branch `beta/base-green`, worktree `/home/nexuslink/vari8-worktrees/base-green`, head `7ac8830`. Verifier report: `/home/nexuslink/.hermes/cache/scratch/pr75-verify.md` section 2 (FIX). All 8 gates are green; only content safety failed.

The Prettier pass turned literal text into emphasis markers in these sites (base is `f02a6d6`):

| File                                                      | Base text                                        | Head text           |
| --------------------------------------------------------- | ------------------------------------------------ | ------------------- |
| icm/03-plan/output/TA/TB1-w1.md (head :73)                | `/tmp/tb1-w1-*.log, /tmp/tb1-w1-*.out`           | `_` in place of `*` |
| icm/03-plan/output/TA/TB1-w4.md (head :18, table cell)    | `spec/data/*.json + spec/sheets/*-database.json` | `_` in place of `*` |
| icm/03-plan/output/TA/TB1.md (head :104, table cell)      | same as above                                    | same                |
| icm/03-plan/output/TA/TB1.md (head :191)                  | `/tmp/tb1-lead-*.log and /tmp/tb1-w*-*.log`      | `_` in place of `*` |
| icm/03-plan/output/TA/TA-I01-w3.md (head :21, table cell) | `__proto__`                                      | `**proto**`         |
| icm/05-build/reports/W0-verify-1.md (head :116)           | `tools/__pycache__`                              | `tools/**pycache**` |

Do exactly this:

1. At each site, restore the base literal and wrap it in backticks as inline code, so it is unambiguous and Prettier cannot reinterpret it. Keep the rest of the line as it is.
2. Run `npx prettier --check .` (exit 0) and confirm Prettier leaves your edits byte-identical (`npx prettier --write` on a copy of each touched file produces no diff).
3. Prove nothing else is mangled: `git diff --word-diff=plain f02a6d6 HEAD -- '*.md'` must show no remaining `*`/`_`/`__` substitutions inside literal paths, globs or identifiers other than the four emphasis-only changes the report lists as fine. Put the command and its relevant output in the report.
4. Gates: typecheck, lint, test, build, `cd frontend && npm run build`, `npx prettier --check .`, `python3 icm/05-build/tools/generate.py --check`, `npm run index` then `npm run index:check` (all exit 0). Run `npm ci` in the worktree first in the background with a log; never symlink node_modules.
5. Merge the latest `origin/Vari8-Beta` (it moved to `043d877`), resolve conflicts, re-run the gates, push.
6. Write `icm/05-build/reports/BASE-GREEN.md` (create if missing) with a "Fix 1" section: sites fixed, commands, exit codes. Commit with explicit pathspecs.

Follow `icm/05-build/cards/PIPELINE-FOOTER.md`. Never write `docs/STATUS.md`. End with a clean worktree.
