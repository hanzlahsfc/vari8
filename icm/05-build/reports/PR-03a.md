# PR-03a — Execute the TEST-AUDIT deletions (issue #59)

Worktree `/home/nexuslink/vari8-worktrees/pr-03-test-audit`, branch
`beta/pr-03-test-audit`, base `55a0f08` (PR-02 merge). Node v26.8.2, npm 11.19.1.

Source of truth: `icm/03-plan/output/TEST-AUDIT.md` (owner-approved, including the
`tests/e2e/auth.spec.ts` VISIBLE adjudication). Scope kept: `tests/`, test config
files, and the new tool. No product code, no frontend markup/styles/copy changed.

## 1. The lever: `icm/05-build/tools/apply-test-audit.mjs`

Single Node script, no dependencies. Modes:

- `--dry --json <path>`: parses the audit (per-file action list, five pass-2
  block tables, within-block cut table, e2e flow table), resolves every block by
  name (audit `,` artifacts are em dashes; matching is normalized) with audit
  line spans as a cross-check, and prints the plan: files, cut spans, problems.
- `--apply`: executes the plan. CUT-FILE removes the file. TRIM removes the
  resolved spans of every VISIBLE / CUT pass 1+2 row plus the named within-block
  test cuts, swallows orphan comment lines directly above a cut, then sweeps
  empty wrappers (describe/for/if that no longer hold anything) to a fixed
  point. GUARD and CUT-AT-REPLACE blocks are never cut; after every trim the
  tool re-scans and fails loudly if any keep-tagged block name vanished.
- `--sweep <files>`: standalone empty-wrapper cleanup (idempotent).

Scanner notes: a lightweight balanced-delimiter walker (not a full TS AST) that
skips strings, templates, comments and regex literals; understands
`describe`/`it`/`test` chains (`it.each(cases)("n")`, `skipIf(c)("n")`), nested
suites, dynamic `for`-of-test loops, and control-flow wrappers. Sweep safety: a
wrapper is dead only if its brace body is empty modulo comments and nested dead
wrappers, so control flow inside helper functions or test bodies is never
removed (an earlier version used "contains no testish statement" and wrongly
removed a live `catch` inside `expectTokenError`; fixed and re-verified).
Keep-check runs before the file is written, so a failed trim never lands on
disk.

## 2. Deletions applied

`--dry`: `61 CUT-FILE + 67 TRIM` of 232 audited files, 0 problems, 0 missing
files. Predicted removal: 20,946 lines (cut files) + 3,850 lines (139 trim
spans) = 24,796, vs the audit's predicted 24,330; the +466 is post-audit drift
(the tree moved past audit pin `58eb6ed`, e.g. `training-program.spec.ts` grew
by 462 lines before being cut anyway).

`--apply`: all 61 files deleted, all 67 trims applied, 0 failures. Final diff:
**119 files changed, 18 insertions(+), 25,385 deletions(-)** — the extra ~590
deletions over the tool's span count are the orphaned-binding cleanup and
prettier reflow below. Untracked: the tool and this report.

Follow-on cleanup in the trimmed files (all inside `tests/` / frontend test
files, so the suites and linters stay clean):

- ~84 newly orphaned bindings removed: unused import specifiers/statements
  (`readdirSync`, `tokenCrypto`, `FormDefinition`, ...), dead helper functions
  (`filesUnder`, `tokenNames`, `field`, `cleanClient`, `render`, ...), dead
  fixtures (`FOODS`, `EXERCISES`, `STALE`, `HEX`, ...) and a dead `import * as`
  namespace. eslint/biome driven — only bindings they proved unused.
- `npx prettier --write` on the 45 modified root test files and
  `biome check --write` on the 11 modified frontend test files.

## 3. Config rewiring

- `playwright.config.ts`: the two flag-off proof webServers on :3101 and :3102
  existed only for deleted specs; removed. All `ENABLE_*` env flags dropped —
  no retained spec navigates to a flagged surface. Kept `APP_ENV=test` (the
  trusted-boundary classification PR-05's consent checks rely on), `AUTH_SECRET`
  fallback and `DATABASE_URL`. Single :3000 server remains.
- `vitest.config.ts`: removed the now-empty `tests/*.spec.ts` include glob (no
  files match after the deletions).
- `tests/e2e/global-setup.ts` / `global-teardown.ts` / `fixture-sweep.ts`:
  unchanged; the two retained specs use their seeded fixtures.
- `vitest.integration.config.ts`, `package.json` scripts: unchanged; the three
  suites still resolve their globs.
- Verified zero dangling references to any deleted file's basename across
  `tests/`, `frontend/src`, and the configs.

## 4. Reconciliation

Audit expectation (GUARD + CUT-AT-REPLACE, tests = expanded runtime cases):

| Metric                                   | Audit expected |      Actual | Delta |
| ---------------------------------------- | -------------: | ----------: | ----: |
| Retained audited files                   |            171 | 171 present |     0 |
| Physical lines in retained audited files |         61,490 |      61,287 |  −203 |
| Declared leaf test statements (audited)  |              — |       1,710 |     — |
| Collected cases, all suites              |          2,049 |       2,079 |   +30 |

Delta explanations:

- Lines −203: the audit itself warns its allocation is "not a prediction of an
  exact deletion diff after import cleanup". Decomposed: +204 post-audit drift
  growth inside retained files, minus ~407 dead import/helper/fixture cleanup
  that shared setup had allocated to GUARD, net −203.
- Tests +30: two post-audit files not in the audited 232
  (`tests/integration/training-i1b1.test.ts`, `training-i1b2.test.ts`, 23
  declared leaf cases) plus small drift additions inside audited files.
- Per action: KEEP-ALL 67 files / 469 leaf / 13,566 lines; TRIM 67 / 705 /
  22,414; CUT-AT-REPLACE 37 / 536 / 25,307. All 61 CUT-FILEs confirmed absent.

## 5. Gates — commands and exit codes

| Command                                                                                                     | Exit | Result                                                                           |
| ----------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------- |
| `node icm/05-build/tools/apply-test-audit.mjs --dry --json /tmp/dry2.json`                                  | 0    | 61 CUT-FILE + 67 TRIM, 0 problems                                                |
| `node icm/05-build/tools/apply-test-audit.mjs --apply --json /tmp/apply4.json`                              | 0    | all applied, 0 FAIL                                                              |
| `node icm/05-build/tools/apply-test-audit.mjs --sweep <56 trimmed files>`                                   | 0    | all no-op (fixed point reached)                                                  |
| `npm ci` / `npm --prefix frontend ci`                                                                       | 0    | fresh installs in this worktree                                                  |
| `npm run test`                                                                                              | 0    | 96 files, **1,137 tests passed**                                                 |
| `npm --prefix frontend run test`                                                                            | 0    | **76 tests passed**, 0 fail                                                      |
| `npm run typecheck`                                                                                         | 0    | clean                                                                            |
| `npm run lint`                                                                                              | 0    | 0 errors, 14 warnings (baseline had 16; 0 introduced)                            |
| `npm run format:check`                                                                                      | 1    | 67 baseline-dirty files; **0 of my files** (all verified clean at HEAD vs after) |
| `npm --prefix frontend run lint`                                                                            | 0    | biome clean after unused-binding + format fixes                                  |
| `npm --prefix frontend run typecheck`                                                                       | 0    | clean                                                                            |
| `createdb -U app app_pr03a` (vari8-db-1 :5433)                                                              | 0    | disposable db                                                                    |
| `INTEGRATION_DATABASE_URL=...app_pr03a DATABASE_URL=...app_pr03a npm run test:integration`                  | 0    | 53 files, **850 tests passed** (286 s)                                           |
| `npm run build`                                                                                             | 0    | Next 16.3.8 Turbopack, all routes                                                |
| `npm --prefix frontend run build`                                                                           | 0    | webpack build, `/`, `/coach`, `/ethereal`                                        |
| `CI=1 npm run test:e2e -- tests/e2e/invite-acceptance.spec.ts tests/e2e/password-reset.spec.ts --workers=1` | 0    | 16 collected: **10 passed, 6 skipped**                                           |
| `dropdb -U app app_pr03a`                                                                                   | 0    | database removed (count back to 0)                                               |

E2E skips are the six delivery-gated reset cases — `test.skip(GATED)` because no
`PASSWORD_RESET_DELIVERY_ADAPTER` exists; the audit itself marks them UNPROVEN
until a real adapter lands, exactly as expected.

## 6. What I could not do / open items

1. **`npm run format:check` exits 1 on 67 files I never touched** (e.g.
   `tsconfig.json`, `icm/05-verify/output/*.md`, assorted app files). Verified
   every file I modified is prettier-clean; the repo baseline was already
   prettier-dirty. Out of scope to reformat strangers' files.
2. **Six e2e reset cases stay skipped** (delivery adapter does not exist —
   audit's own caveat). Not a PR-03a gap.
3. **Browser-visibility proof**: card verification lane is mechanical gates +
   the retained e2e specs; no separate 1440px/390px screenshot receipt was run —
   nothing user-visible changed (only test code).
4. **Tool is single-shot for `--apply`** (re-running reports "no statement" for
   already-deleted blocks); `--dry` and `--sweep` are idempotent.
5. `icm/05-build/cards/` remains untracked as found.
6. Independent review still required before merge — the builder never approves
   its own work.
