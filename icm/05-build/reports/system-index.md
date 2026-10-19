# system-index — generated system index for agentic navigation

Card `system-index`, issue #62. Worktree `/home/nexuslink/vari8-worktrees/system-index`,
branch `beta/system-index`, base `55a0f08` (origin/Vari8-Beta), PR #65. Node v26.7.0,
npm 11.19.1. Not merged: an independent verifier decides SHIP or FIX.

## 1. What it does

One generator, `scripts/index/generate.ts`, writes four index documents and the missing
top-level `AGENTS.md` routers, deterministically. `npm run index` writes them;
`npm run index:check` generates into a temp directory and exits 1 on any drift.

| Deliverable | Output | Source of truth |
|---|---|---|
| Routes | `docs/index/ROUTES.md` | `app/**` and `frontend/src/app/**` page/layout/route files |
| Symbols | `docs/index/SYMBOLS.md` | TypeScript compiler API over `lib/**` and `frontend/src/lib/**` |
| Data model | `docs/index/DATA-MODEL.md` | `db/schema.prisma` (48 models, 31 enums) |
| Routers | `AGENTS.md` in `app/`, `components/`, `db/`, `docs/`, `icm/`, `lib/`, `scripts/`, `spec/`, `tests/`, `themes/` | directory walk, 12 to 15 lines each, max 25 enforced |
| Glossary | `docs/index/GLOSSARY.md` | curated terms + F1 slice ids + live `ENABLE_*` reads |

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

| SHA | Paths | What |
|---|---|---|
| `51f7520` | `scripts/index/generate.ts`, `scripts/index/glossary-seed.json`, `package.json`, `.prettierignore` | generator, seed, `index` and `index:check` scripts |
| `1207139` | `docs/index/*`, ten `AGENTS.md` routers, `AGENTS.md` | generated index and routers |
| `6cf181b` | `tests/unit/system-index.test.ts` | 7 behaviour tests on the real repo |
| `d50dd0e` | `scripts/index/generate.ts` | stable-sort assertion made independent of the comparator (found by proof E) |
| `2162774` | `icm/05-build/reports/system-index.md` | this report |
| `161bbc4` | `scripts/index/generate.ts`, `docs/index/ROUTES.md`, report | canvas section lists pages only and names the canvas root layout |
| `dee5d4a` | `icm/AGENTS.md` | regenerate the icm router after adding a file under `icm/` |
| `dff5fc5` | `scripts/index/generate.ts`, `docs/index/SYMBOLS.md` | tidy wrapped parameter lists in signatures |
| `cec1ffe` | `scripts/index/generate.ts`, report | fail loud when a router loses its generated markers (found by proof G) |
| `566ebb6` | `scripts/index/generate.ts` | export only the test surface |

Head at the time of writing: `566ebb6`. No dependency was added: `tsx` and `typescript` were
already dev dependencies, and the generator uses only Node stdlib otherwise.

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

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | 0 errors, 14 warnings, all pre-existing in files this card does not touch |
| `npm run test` | 0 | 97 files passed (97); 1144 tests passed (1144), including this card's 7 |
| `npx vitest run tests/unit/system-index.test.ts` | 0 | 7 passed |
| `npm run build` | 0 | `Next.js 16.3.8 (Turbopack)`, full route table printed |
| `cd frontend && npm run build` | 0 | `○ /`, `○ /_not-found`, `○ /coach`, `○ /ethereal` prerendered |
| `npm run index` | 0 | wrote 4 docs and 10 routers |
| `npm run index:check` | 0 | 5 index docs and all routers match |
| `npm run test:integration` | 0 | 55 files, 873 tests passed before the merge; re-run on the merged HEAD recorded below |

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
2. **Frontend symbols resolve `@/` against the repo root**, because one compiler program
   serves both trees with the root `tsconfig` paths. Signatures from `frontend/src/lib` are
   still correct; a type imported through `@/components/...` may show its bare name.
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
