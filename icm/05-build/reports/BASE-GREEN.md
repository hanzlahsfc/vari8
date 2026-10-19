# BASE-GREEN report

Issue #74, branch `beta/base-green`, PR #75 against `Vari8-Beta`. Worktree
`/home/nexuslink/vari8-worktrees/base-green`.

## Fix 1

Card: `icm/05-build/cards/BASE-GREEN-fix-1.md`. Verifier report:
`/home/nexuslink/.hermes/cache/scratch/pr75-verify.md` section 2 (FIX at
`7ac8830`). All 8 gates were already green; only content safety failed: the
Markdown reflow coerced literal `*` and `__` into emphasis markers at six sites
in five icm files. Each base literal is restored and wrapped in an inline code
span so the text is unambiguous and Prettier-stable; surrounding line content is
unchanged except table-cell padding redone by `prettier --write`.

### Sites fixed

| File (head line)             | Was                                              | Now                                                      |
| ---------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| TB1-w1.md:73                 | `/tmp/tb1-w1-_.log, /tmp/tb1-w1-_.out`           | `` `/tmp/tb1-w1-*.log`, `/tmp/tb1-w1-*.out` ``           |
| TB1-w4.md:18 (table cell)    | `spec/data/_.json + spec/sheets/_-database.json` | `` `spec/data/*.json` + `spec/sheets/*-database.json` `` |
| TB1.md:104 (table cell)      | same as above                                    | same as above                                            |
| TB1.md:191                   | `/tmp/tb1-lead-_.log and /tmp/tb1-w_-*.log`      | `` `/tmp/tb1-lead-*.log` and `/tmp/tb1-w*-*.log` ``      |
| TA-I01-w3.md:21 (table cell) | `**proto**`                                      | `` `__proto__` ``                                        |
| W0-verify-1.md:116           | `tools/**pycache**`                              | `` `tools/__pycache__` ``                                |

(Full paths: the four TA files are under `icm/03-plan/output/TA/`, the report
under `icm/05-build/reports/`.)

### Merge fallout

`git merge origin/Vari8-Beta` (043d877) auto-merged cleanly but brought in
`icm/05-build/cards/BOARD-WT-HARDEN.md` and
`icm/05-build/reports/BOARD-WT-HARDEN.md` unformatted upstream, so
`npx prettier --check .` exited 1 on the merged tree. Both were reformatted with
`npx prettier --write` (whitespace only: one blank line, table padding) and
committed as `b58303d`.

### Commands and exit codes

| Command                                                       | Exit | Note                                             |
| ------------------------------------------------------------- | ---- | ------------------------------------------------ |
| `npm ci` (log `/tmp/base-green-fix1-npm-ci.log`)              | 0    | real install, no node_modules symlinks           |
| `npx prettier --write` on the 5 touched files                 | 0    | only re-padded the 2 edited table rows           |
| `npx prettier --write` on a /tmp copy of each touched file    | 0    | `diff` vs worktree: all 5 byte-identical         |
| `npx prettier --check .` (pre-merge)                          | 0    | after also formatting the untracked card file    |
| `npm run typecheck`                                           | 0    |                                                  |
| `npm run lint`                                                | 0    |                                                  |
| `npm run test`                                                | 0    |                                                  |
| `npm run build`                                               | 0    |                                                  |
| `cd frontend && npm run build`                                | 0    |                                                  |
| `python3 icm/05-build/tools/generate.py --check`              | 0    |                                                  |
| `npm run index`                                               | 0    | no drift                                         |
| `npm run index:check`                                         | 0    |                                                  |
| `git merge origin/Vari8-Beta --no-edit` (043d877)             | 0    | ort merge, no conflicts                          |
| `npx prettier --check .` (post-merge, before doc reflow)      | 1    | the two BOARD-WT-HARDEN files, see Merge fallout |
| `npx prettier --check .` (post-merge, after doc reflow)       | 0    |                                                  |
| `npm run typecheck` (post-merge)                              | 0    |                                                  |
| `npm run lint` (post-merge)                                   | 0    |                                                  |
| `npm run test` (post-merge)                                   | 0    |                                                  |
| `npm run build` (post-merge)                                  | 0    |                                                  |
| `cd frontend && npm run build` (post-merge)                   | 0    |                                                  |
| `python3 icm/05-build/tools/generate.py --check` (post-merge) | 0    |                                                  |
| `npm run index` (post-merge)                                  | 0    |                                                  |
| `npm run index:check` (post-merge)                            | 0    |                                                  |

Gate logs: `/tmp/bg-fix1-gates/*.log` (pre-merge), `/tmp/bg-fix1-gates2/*.log`
(post-merge).

### Nothing else is mangled

Command (on final HEAD, post-merge):

```
git diff --word-diff=plain f02a6d6 HEAD -- '*.md'
```

All `[-removed-]{+added+}` pairs were extracted and each changed pair was tested
for `*` vs `_` equivalence. Relevant output (the only pairs where replacing `*`
with `_` makes the two sides equal):

```
'*also*'         -> '_also_'          (I00-w1.md, emphasis only, fine)
'*because*'      -> '_because_'       (I00-w3.md, emphasis only, fine)
'*because*'      -> '_because_'       (I00-w4.md, emphasis only, fine)
'*visible-text*' -> '_visible-text_'  (DB-SHOTS-report.md, emphasis only, fine)
```

528 changed pairs total; 4 remaining `*`/`_` substitutions, exactly the four
emphasis-only changes the report lists as fine. A residue check for `_` inside
path-like added tokens where the removed side had `*` found 0. The six restored
literals now appear as backtick-wrap-only pairs with `*`/`__` intact.

## Could not do

Nothing. All card steps completed.

## Commits on this branch for fix 1

- `2a14ea8` fix(icm): restore literal globs and identifiers mangled by the md reflow
- merge `043d877` origin/Vari8-Beta (ort, no conflicts)
- `b58303d` chore(icm): prettier --write BOARD-WT-HARDEN docs merged from Vari8-Beta
