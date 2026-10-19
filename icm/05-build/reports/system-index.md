# system-index — generated system index for agentic navigation

Card `system-index`, issue #62. Worktree `/home/nexuslink/vari8-worktrees/system-index`,
branch `beta/system-index`, base `ea8f514` (origin/Vari8-Beta), PR #65. Node v26.7.0,
npm 11.19.1. Not merged: an independent verifier decides SHIP or FIX.
Head after fix pass 1: `8cda794` (this report and the verify report are the next commit).

## 1. What it does

One generator, `scripts/index/generate.ts`, writes five index documents and the missing
top-level `AGENTS.md` routers, deterministically. `npm run index` writes them;
`npm run index:check` generates into a temp directory and exits 1 on any drift.

| Deliverable | Output                                                                                                         | Source of truth                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Routes      | `docs/index/ROUTES.md`                                                                                         | `app/**` and `frontend/src/app/**` page/layout/route files                            |
| Symbols     | `docs/index/SYMBOLS.md`                                                                                        | TypeScript compiler API over `lib/**` and `frontend/src/lib/**`                       |
| Components  | `docs/index/COMPONENTS.md`                                                                                     | exported React components in `frontend/src/**` and the route entries that import them |
| Data model  | `docs/index/DATA-MODEL.md`                                                                                     | `db/schema.prisma` (48 models, 31 enums)                                              |
| Routers     | `AGENTS.md` in `app/`, `components/`, `db/`, `docs/`, `icm/`, `lib/`, `scripts/`, `spec/`, `tests/`, `themes/` | directory walk, 12 to 17 lines each, max 25 enforced                                  |
| Glossary    | `docs/index/GLOSSARY.md`                                                                                       | curated terms + F1 slice ids + live `ENABLE_*` reads                                  |

Usage is documented in `docs/index/README.md`; the repo-root `AGENTS.md` gained one
navigation line pointing at it. Detection notes that matter:

- `Rendered` is `client` when the file starts with the `use client` directive, `server`
  otherwise. `Auth (detected)` lists the guard helpers called by the route file or an
  ancestor layout, and says so when part of the chain came from a layout. This is textual
  detection: `lib/auth/route-guard.ts` remains the enforcement.
- Symbols prefer the declared source signature, fall back to a compiler-inferred type only
  when the string is self-contained, and drop `any`, unresolved and absolute-path types so a
  line never depends on the checkout. Long signatures are cut at 200 characters with a
  trailing `...`.
- Model fields appear in schema declaration order; models, enums, routes, modules, symbols,
  terms and routers are sorted by code point.

Robustness to new files: every inventory is discovered by walking the tree. A new route, a
new exported symbol, a new model or a new top-level directory changes the output on the next
run and fails `index:check` until the index is regenerated and committed.

## 2. Commits

| SHA           | Paths                                                                                                                                                                                           | What                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `51f7520`     | `scripts/index/generate.ts`, `scripts/index/glossary-seed.json`, `package.json`, `.prettierignore`                                                                                              | generator, seed, `index` and `index:check` scripts                          |
| `1207139`     | `docs/index/*`, ten `AGENTS.md` routers, `AGENTS.md`                                                                                                                                            | generated index and routers                                                 |
| `6cf181b`     | `tests/unit/system-index.test.ts`                                                                                                                                                               | 7 behaviour tests on the real repo                                          |
| `d50dd0e`     | `scripts/index/generate.ts`                                                                                                                                                                     | stable-sort assertion made independent of the comparator (found by proof E) |
| `2162774`     | `icm/05-build/reports/system-index.md`                                                                                                                                                          | this report                                                                 |
| `161bbc4`     | `scripts/index/generate.ts`, `docs/index/ROUTES.md`, report                                                                                                                                     | canvas section lists pages only and names the canvas root layout            |
| `dee5d4a`     | `icm/AGENTS.md`                                                                                                                                                                                 | regenerate the icm router after adding a file under `icm/`                  |
| `dff5fc5`     | `scripts/index/generate.ts`, `docs/index/SYMBOLS.md`                                                                                                                                            | tidy wrapped parameter lists in signatures                                  |
| `cec1ffe`     | `scripts/index/generate.ts`, report                                                                                                                                                             | fail loud when a router loses its generated markers (found by proof G)      |
| `566ebb6`     | `scripts/index/generate.ts`                                                                                                                                                                     | export only the test surface                                                |
| `8cda794`     | `scripts/index/generate.ts`, `docs/index/*`, `app/AGENTS.md`, `docs/AGENTS.md`, `icm/AGENTS.md`, `spec/AGENTS.md`, `tests/unit/system-index.test.ts`, `docs/index/README.md`, `.prettierignore` | fix pass 1 (F1 to F9) and seven regression tests                            |
| (this commit) | `icm/05-build/reports/system-index.md`, `icm/05-build/reports/system-index-verify.md`                                                                                                           | fix pass 1 section and the verifier's report                                |

Head at the time of writing: `566ebb6`. No dependency was added: `tsx` and `typescript` were
already dev dependencies, and the generator uses only Node stdlib otherwise. The branch head
after fix pass 1 is the report commit above.

## 3. Proofs

Each proof is a command a reviewer can rerun. All were run on this worktree.

**A. Two consecutive runs, zero diff.** `npm run index` twice, then `git diff`:
2 runs, `git diff | wc -l` = 0 both times, `git status --short` empty. Removing a probe
route and regenerating also converged back to the committed bytes (proof C, step 3).

**B. One changed exported signature fails the check.** In `lib/db.ts`,
`isSerializationConflict(error: unknown): boolean` gained a second parameter:

```
npm run index:check
index:check FAILED (1 problem)
  drifted: docs/index/SYMBOLS.md at line 784
    on disk: - `export function isSerializationConflict(error: unknown): boolean`
    generated: - `export function isSerializationConflict(error: unknown, retryBudget = 1): boolean`
EXIT=1
```

After `git restore --source=HEAD lib/db.ts`: `index:check OK`, exit 0.

**C. A new file drifts the index, regenerating fixes it.** Adding
`app/index-probe/[probeId]/page.tsx`:

```
npm run index:check
index:check FAILED (2 problems)
  drifted: app/AGENTS.md at line 5            (109 files -> 110 files)
  drifted: docs/index/ROUTES.md at line 7     (46 backend pages -> 47)
EXIT=1
```

`npm run index` then lists `| `/index-probe/[probeId]` | ... page.tsx | server | none detected |`
and `index:check` exits 0. Deleting the probe, regenerating and checking again: exit 0 and a
clean `git status`, so the generator converges on the previous state.

**D. The committed test bites.** Breaking route-group handling in the generator (route groups
no longer dropped from the path):

```
npx vitest run tests/unit/system-index.test.ts
FAIL > derives route paths the way the App Router does
  expected '/(tracker)/workspace/[workspaceId]/da...' to be '/workspace/[workspaceId]/daily'
FAIL > lists a route group page under its real path with the guard it calls
Tests  2 failed | 5 passed (7)
```

Reverted: `Tests 7 passed (7)`.

**E. The stable-sort assertion bites.** `cmp` flipped to descending order makes generation
refuse instead of writing an unsorted index: `npm run index` exit 1 with
`...: output is not stable-sorted at index 1: ...`. The first attempt at this proof passed
silently because the assertion used the same comparator it was checking; commit `d50dd0e`
makes `assertSorted` compare code points directly.

**F. Hand-written router text survives.** Appending a note below the markers in `lib/AGENTS.md`
and running `npm run index` leaves the note in place, leaves the generated block untouched, and
`index:check` still exits 0. `git diff --stat lib/AGENTS.md` shows only the two added lines, so
editing the hand-written region is not drift.

**G. A router whose markers were deleted is reported, not silently dropped.** Stripping both
markers from `themes/AGENTS.md`: `index:check` exit 1 with
`themes/AGENTS.md exists without the generated markers; add them or delete the file`. The first
implementation silently stopped managing such a file, because it used the marker itself to decide
whether the directory was generator-managed; `routerTargets` now also recognises the generated
heading. The check reports the same way whether the file was deleted or its markers were.

Proofs B, C, D and E each mutated a real file and restored it with
`git restore --source=HEAD <path>`. None of those paths appear in the diff (`git diff --name-only
55a0f08..HEAD` shows no `db/`, `lib/` or `app/api/` source file).

## 4. Gates

Measured on the merged HEAD (base `55a0f08` plus merge of `origin/Vari8-Beta` at
`ea8f514`, PR-03a test-audit deletions included). The pre-merge baseline recorded in
`icm/05-build/reports/PR-02.md` was 105 unit test files / 1308 tests and 5 to 16 lint
warnings; PR-03a removed tests and two warning sites, which is where the lower numbers below
come from. This card's own delta is its seven unit tests.

| Command                                          | Exit | Result                                                                                                                                                                                                                             |
| ------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                              | 0    | clean                                                                                                                                                                                                                              |
| `npm run lint`                                   | 0    | 0 errors, 14 warnings, all pre-existing in files this card does not touch                                                                                                                                                          |
| `npm run test`                                   | 0    | 97 files passed (97); 1144 tests passed (1144), including this card's 7                                                                                                                                                            |
| `npx vitest run tests/unit/system-index.test.ts` | 0    | 7 passed                                                                                                                                                                                                                           |
| `npm run build`                                  | 0    | `Next.js 16.3.8 (Turbopack)`, full route table printed                                                                                                                                                                             |
| `cd frontend && npm run build`                   | 0    | `○ /`, `○ /_not-found`, `○ /coach`, `○ /ethereal` prerendered                                                                                                                                                                      |
| `npm run index`                                  | 0    | wrote 4 docs and 10 routers                                                                                                                                                                                                        |
| `npm run index:check`                            | 0    | 5 index docs and all routers match                                                                                                                                                                                                 |
| `npm run test:integration`                       | 0    | 53 files, 850 tests passed on a disposable `app_sysindex` database on 127.0.0.1:5433 (created, `npx prisma migrate deploy`, run, then dropped; the only other databases on that server are `app_dev` and `app_pr05`, neither mine) |

The merge drifted two routers and no index document: `icm/AGENTS.md` (185 to 188 files) and
`tests/AGENTS.md` (214 to 157 files after PR-03a deleted tests). `npm run index:check` reported
exactly those two paths, `npm run index` fixed them, and the check then exited 0. Routes,
symbols and the data model were unchanged by PR-03a, so `docs/index/*` did not drift.

Canvas rule: no file under `frontend/src` and no markup, style or copy changed, so no
screenshots. The only `frontend/` change is a `.prettierignore` entry that keeps the
generated routers out of Prettier.

## 5. What I could not do / open items

1. **The F1 wiring spec is not in the repository.** `icm/02-gap-matrix/output/F1/WIRING-SPEC.md`
   lives in the root checkout and in the program worktree, so the glossary cannot read it at
   generation time. The 28 slice ids are extracted from it once into
   `scripts/index/glossary-seed.json` with the recorded sha256
   `e4341bc1d169a5a2745360102cceee63d22df97f01d86caccd8e9331bf7a8d92`, and the extraction is
   rerunnable with `--refresh-glossary --spec <file> --ref <path>`. If the spec is committed
   later, that flag keeps the seed current.
2. **Frontend symbols resolve `@/` against `frontend/src`.** Since fix pass 1 the canvas tree is
   compiled by its own program built from `frontend/tsconfig.json`, so `@/data/mock-data.json`
   resolves to `frontend/src/data/mock-data.json`. The 23 canvas symbols had no `@/`-dependent
   signature before, so the file's content did not change; the resolution is now correct.
3. **`index:check` needs the normal dev install** (`npm ci` and `npx prisma generate`), the
   same prerequisite as `npm run typecheck`, so the compiler can state inferred types.
4. **New top-level directories need one `.prettierignore` line** to stay out of `prettier
--check`; the generator creates the router itself without any edit.
5. **`DIR_PURPOSE`** in the generator holds the one-line purpose per directory. A directory
   whose role changes needs that line updated; the inventory around it is generated.
6. **No `docs/STATUS.md` change**, per the pipeline rule, and no change to any file under
   `db/`, `lib/` or `app/api/`. The two probe edits in proofs B and D were reverted with
   `git restore --source=HEAD`; the final diff touches none of them.
7. **Not merged.** PR #65 is open against `Vari8-Beta` for independent verification.

## 6. Fix pass 1

Addresses `icm/05-build/reports/system-index-verify.md` (verifier verdict: FIX). Base `ea8f514`;
head moved from `4d151e8` to `8cda794` for the code commit, this report follows. Every defect now
has a regression test in `tests/unit/system-index.test.ts` that was mutation-checked (reintroduce
the defect, observe red, revert, observe green).

| ID  | Fix                                                                                                                                                                                                                                                                                                                                            | Where                                                   | Regression test                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| F1  | `SKIP_DIRS` split into `ALWAYS_SKIP` (build output, skipped at any depth) and `TOP_LEVEL_SKIP` (data dirs, skipped only directly under the repository root) behind `shouldSkip`. `app/sheets/` and `spec/sheets/` are inventoried again. ROUTES went 46 to 48 backend pages; `app/AGENTS.md` 109 to 111 files; `spec/AGENTS.md` 5 to 27 files. | `scripts/index/generate.ts`                             | `F1: indexes a route-segment directory such as app/sheets`         |
| F2  | `symbolsOf` emits one line per name from `checker.getExportsOfModule`, with `reexportSyms` covering `export { X } from`, `export type { X } from`, `export { X }` and `export * from` and naming the source module. SYMBOLS went 118 to 119 modules and 1114 to 1161 symbols; `frontend/src/lib/utils.ts` (`cn`) is listed.                    | `scripts/index/generate.ts`                             | `F2: indexes re-exports and matches an independent compiler count` |
| F3  | Canvas symbols are built by a second program whose options come from `frontend/tsconfig.json`, so `@/*` resolves to `frontend/src` (`@/data/mock-data.json` resolves to `frontend/src/data/mock-data.json`).                                                                                                                                   | `scripts/index/generate.ts`                             | `F3: resolves @/ in the canvas tree against frontend/src`          |
| F4  | `DIR_PURPOSE.icm` reads "Read the repo-root `CONTEXT.md` first". The root `CONTEXT.md` exists; `icm/CONTEXT.md` never did.                                                                                                                                                                                                                     | `scripts/index/generate.ts`, `icm/AGENTS.md`            | `F4: points the icm router at a file that exists`                  |
| F5  | `countFiles` and `generatedRegion` exclude the files the generator writes into `docs/index`, so `docs/AGENTS.md` counts 83 files and `index/ (1)` whether or not the index has been generated.                                                                                                                                                 | `scripts/index/generate.ts`                             | `F5: keeps generated docs out of the docs/ router count`           |
| F7  | `GUARD_RE` also matches `auth(`, `getSession(` and `getServerSession(`; the `/invite` row reads `auth` instead of `none detected`.                                                                                                                                                                                                             | `scripts/index/generate.ts`                             | `F7: treats auth() and getSession() as a session read`             |
| F8  | Header base and head refreshed; this section added.                                                                                                                                                                                                                                                                                            | this report                                             | n/a                                                                |
| F9  | New `docs/index/COMPONENTS.md` lists every exported React component in `frontend/src` (112 components in 67 files) with the canvas route entries that import each. `ClientRoster` resolves to `frontend/src/components/ethereal/clients/client-roster.tsx` (`/`, `/ethereal`).                                                                 | `scripts/index/generate.ts`, `docs/index/COMPONENTS.md` | `F9: names the canvas component behind a screen element`           |

F6 (the out-of-scope `tests/unit/system-index.test.ts`): kept in this PR by parent decision; that
file is now the regression suite for every item above.

Code commit: `8cda794`. This report and the verify report are the next commit.

### Gates (fix pass 1)

| Command                                                | Exit    | Result                                                                                                                     |
| ------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run index`                                        | 0       | wrote 5 docs and 10 AGENTS.md routers                                                                                      |
| `npm run index` twice                                  | 0       | tree hash `4dd52f1a8e22c5e9c0ff5c901532b734e1048f030c9d0eecbe99573fb68c5919` identical after run 1 and run 2, so zero diff |
| `npm run index` after deleting all five generated docs | 0       | same tree hash; the deleted-docs state converges in one pass (F5)                                                          |
| `npm run index:check`                                  | 0       | 6 index docs and all AGENTS.md routers match                                                                               |
| `npx vitest run tests/unit/system-index.test.ts`       | 0       | 14 passed (7 pre-existing + 7 new)                                                                                         |
| `npm run typecheck`                                    | 0       | clean                                                                                                                      |
| `npm run lint`                                         | 0       | 0 errors, 14 warnings; none in the changed files                                                                           |
| `npm run test`                                         | 0       | 97 files passed (97), 1151 tests passed (1151)                                                                             |
| `npm run build`                                        | 0       | Next build, full route table printed                                                                                       |
| `cd frontend && npm run build`                         | 0       | `/`, `/_not-found`, `/coach`, `/ethereal` prerendered                                                                      |
| `npm run test:integration`                             | not run | needs the disposable DB on 127.0.0.1:5433; unchanged by this pass                                                          |

### Mutation checks (fix pass 1)

Each regression test was proved to bite: the defect was reintroduced, the test went red, the
defect reverted, the test went green.

| Defect reintroduced                              | Result          |
| ------------------------------------------------ | --------------- |
| `sheets` back in the always-skip set             | F1 red (exit 1) |
| `symbolsOf` back to statement-only export names  | F2 red (exit 1) |
| frontend program back to the root `@/*` paths    | F3 red (exit 1) |
| `icm/AGENTS.md` purpose back to `icm/CONTEXT.md` | F4 red (exit 1) |
| `countFiles` counting the generated docs again   | F5 red (exit 1) |
| `auth` dropped from `GUARD_RE`                   | F7 red (exit 1) |
| canvas root narrowed to `frontend/src/app`       | F9 red (exit 1) |

## 7. Fix pass 2

Addresses `icm/05-build/reports/system-index-verify-2.md` (verifier verdict: FIX, eight of ten
items pass) plus four orchestrator rulings. Base `ea8f514`; head before this pass `ef08c3e`.
One commit carries the code, the regenerated index, the verifier's report and this section.

### The four rulings

| #   | Ruling                                               | What changed                                                                                                                                                                                                                                                                        | Regression test                                                   |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Routers carry no volatile inventory                  | `generatedRegion` no longer emits `Contents: N files in N subdirectories` or the `Subdirectories:` list, and `dirsIn` is deleted. A router is now purpose, top-level entry files, read next. Routers run 10 to 13 lines, four shorter than before; the 25-line budget is unchanged. | `pass 2: a router carries no file count and no subdirectory list` |
| 2   | A layout's imports apply to every route beneath it   | `entryReach` walks from the route entry **and every ancestor `layout.tsx`**, so `app/layout.tsx`'s `MotionProvider` is listed `/, /coach, /ethereal`. This is the only row in the file whose routes changed.                                                                        | `pass 2: a layout's imports apply to every route beneath it`      |
| 3   | COMPONENTS.md grouped by canvas surface              | Rows sit under `## Coach surface (/coach)` and `## Ethereal surface (/, /ethereal)`; a component both surfaces reach is listed in both. Counts stay, because a new component must still fail `index:check`.                                                                         | `pass 2: COMPONENTS.md groups rows by canvas surface`             |
| 4   | N1: a missing hand-written index doc fails the check | `check()` is now `indexProblems()` plus the verdict print, and `indexProblems` reports `missing: docs/index/README.md` by existence. The generator never writes that file, so the byte comparison cannot see it.                                                                    | `pass 2: index:check reports a missing hand-written index doc`    |

Why the counts had to go: every router is regenerated text, and the count moved whenever a file
landed anywhere under a routed directory. `icm/` grows with every report, so a lane committing a
report broke `index:check` on a tree whose generator inputs had not changed. The entry-file line
is stable and is what an agent actually routes on.

### One-run convergence (F5), proven by construction

Deleting the whole generated directory and generating **once** now reproduces every generated
byte. The hash covers the five docs and all eleven routers (ten directories plus the root):

```
$ h() { cat docs/index/{COMPONENTS,DATA-MODEL,GLOSSARY,ROUTES,SYMBOLS}.md AGENTS.md */AGENTS.md | sha256sum; }
$ h
4542d331bec65c9ece42af6401c4d805c1979b8e8a9b922b05dad1dcd57e7645  -
$ rm -rf docs/index && npm run index          # exit 0, one run
$ h
4542d331bec65c9ece42af6401c4d805c1979b8e8a9b922b05dad1dcd57e7645  -
```

Then the requirement that motivated the ruling, a report committed under `icm/`:

```
$ echo '# probe' > icm/05-build/reports/f5-probe-N.md
$ npm run index:check                          # exit 0
$ rm icm/05-build/reports/f5-probe-N.md
$ npm run index:check                          # exit 0
```

Ruling 4 sharpens the delete sequence: `rm -rf docs/index` also removes the hand-written
`docs/index/README.md`, which no run can recreate. Ruling 1's literal sequence therefore ends at
exit 1 for exactly one reason, and ruling 4 says it must:

```
$ rm -rf docs/index && npm run index           # exit 0
$ npm run index:check
index:check FAILED (1 problem)
  missing: docs/index/README.md
EXIT=1
$ git restore docs/index/README.md && npm run index:check   # exit 0
```

The convergence claim is untouched: the README was the only missing byte, and the hash above
proves no generated file drifted. Rulings 1 and 4 cannot both hold literally on the same command
sequence. Both substances are proven here (zero generated drift after one run; the check names the
missing hand-written file). If a literal 0 on that sequence is required, the alternative is to
move the README out of `docs/index` and drop the N1 check.

### COMPONENTS.md (rulings 2 and 3)

- 112 components in 67 files, unchanged. 121 table rows, because 9 components are reachable from
  both surfaces and appear in both sections.
- 70 rows under `## Coach surface (/coach)`, 50 under `## Ethereal surface (/, /ethereal)`, 1
  under `## No canvas route` (`TrackerCell` in `ethereal/client-tracker/`, imported by no entry).
- `MotionProvider` is the only row whose route list changed: `/` to `/, /coach, /ethereal`.
- One read now resolves both screen questions:

```
$ awk '/^## /{s=$0} /roster|ClientsWorkspace/{print s" :: "$0}' docs/index/COMPONENTS.md
## Coach surface (`/coach`) :: | `ClientsWorkspace` | `frontend/src/components/coach/clients.tsx` | /coach |
## Ethereal surface (`/`, `/ethereal`) :: | `ClientRoster` | `frontend/src/components/ethereal/clients/client-roster.tsx` | /, /ethereal |
## Ethereal surface (`/`, `/ethereal`) :: | `ClientsWorkspace` | `frontend/src/components/ethereal/clients/clients-workspace.tsx` | /, /ethereal |

$ awk '/^## /{s=$0} /MealplanWorkspace|NutritionEditor/{print s" :: "$0}' docs/index/COMPONENTS.md
## Coach surface (`/coach`) :: | `NutritionEditor` | `frontend/src/components/coach/plans/nutrition/editor.tsx` | /coach |
## Ethereal surface (`/`, `/ethereal`) :: | `MealplanWorkspace` | `frontend/src/components/ethereal/mealplan/mealplan-workspace.tsx` | /, /ethereal |
```

### Gates (fix pass 2)

| Command                                          | Exit | Result                                                             |
| ------------------------------------------------ | ---- | ------------------------------------------------------------------ |
| `npm run index`                                  | 0    | wrote 5 docs and 10 AGENTS.md routers                              |
| `npm run index` twice                            | 0    | sha256 `4542d331...` identical after run 1 and run 2, so zero diff |
| `npm run index` after `rm -rf docs/index`        | 0    | same sha256 after a single run (F5)                                |
| `npm run index:check`                            | 0    | 6 index docs and all AGENTS.md routers match                       |
| `npx vitest run tests/unit/system-index.test.ts` | 0    | 18 passed (14 pre-existing + 4 pass-2 tests)                       |
| `npm run typecheck`                              | 0    | clean                                                              |
| `npm run lint`                                   | 0    | 0 errors, 14 warnings, none in the changed files                   |
| `npm run test`                                   | 0    | 97 files passed (97), 1155 tests passed (1155)                     |
| `npm run build`                                  | 0    | Next 16.3.8, full route table printed                              |
| `cd frontend && npm run build`                   | 0    | `/`, `/_not-found`, `/coach`, `/ethereal` prerendered              |

### Mutation checks (fix pass 2)

Each regression test was proved to bite: the defect was reintroduced, the test went red, the defect
reverted, the test went green.

| Defect reintroduced                                | Result       |
| -------------------------------------------------- | ------------ |
| `Contents: N files` line back in `generatedRegion` | red (exit 1) |
| layout roots not inherited (`reach([entry])`)      | red (exit 1) |
| coach section fed every component                  | red (exit 1) |
| `HAND_WRITTEN_INDEX` existence loop removed        | red (exit 1) |

After the last revert `scripts/index/generate.ts` was byte-identical to the fixed version. The
N1 test runs the generator twice, so it carries an explicit 30 s timeout; its measured runtime is
about 4.5 s, close enough to the 5 s default to flake under load, which it did once.

### Scope of this pass

`scripts/index/generate.ts`, `tests/unit/system-index.test.ts`, the five `docs/index` docs, the
ten directory routers, both `icm/05-build/reports/system-index*.md` files. No change under
`frontend/src`, `db/`, `lib/`, `app/`, and none to `docs/STATUS.md`.
