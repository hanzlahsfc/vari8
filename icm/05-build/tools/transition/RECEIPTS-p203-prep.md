# p452 #203 preparation receipts (no merge performed)

> Status: p450 preparation receipts were lost with local scratch state — marked MISSING,
> not reconstructed. p452 (this file) is the replacement preparation with a complete
> committed transcript and packaged capture.

- Lock: real `flock` on `.locks/Vari8-Beta.lock` — held.
- Revalidated live: #203 head `90c16bee63e2609ebc4f09e91459332390562464`, base `Vari8-Beta` tip `d1c4081022f2ac21070b28f284248fad2ef04839`.
- Test merge (isolated worktree `/tmp/p450-wt`, detached): merge tree `6fd7353e4734632c49c6d9e28427dd2c5c8a1556`.
- Disposable DB `app_p450` (refused-if-existing; created+dropped by this task).
- Fast gate: `tsc --noEmit` 0 · eslint 0 errors/81 warnings · unit tests pass · `next build` pass.
- Combined gate: real `node tools/parity/run.mjs` on the complete test-merge checkout +
  reviewed overlay (pinned `04902f1d:tools/parity` tree `f457065f…`, graft commit `946d404`,
  **0 non-overlay files touched** — `git diff HEAD~1 HEAD -- ':!tools/parity'` empty).
  Result: **canonical 70/70 PASS, strict 2 diagnostics** (known S03). Receipts `out/p450-run`.
- Dirty-input refusal proven: first run refused on untracked `_p450/` — check works.
- Baseline boundary: `tools/parity/baseline` tree `640f437595d870668ea6157376697b5b6b6c030c`
  IDENTICAL on base and after overlay. No `reference/active` path exists on base — nothing
  activated or repointed.
- Standalone #207 p437 evidence NOT counted as #203 proof — this capture ran against the
  actual #203 test-merge tree.
- Docker daemon down on this host (executor DB path unavailable — supervised path used
  postgres@5434 instead). Owner comment input still pending — merge step blocked on it.

## P462 — repaired-verifier capture + complete acceptance

- New capture under the frozen repaired verifier (`e8c7a74`): `p462-run` packaged as
  `p462-p203-prep` on `evidence/p452-p203` at descendant `0f9ca520…`; 241 artifacts,
  242 post-capture paths recorded.
- Fresh-clone `verify-combined` at `0f9ca52` → `verified:true`, canonical **70/70**,
  strict **68/70**, source `e8c7a74`/`d1c42bb…`/`1f606499…` — all assertions pass.
- Discriminating CLI negatives (5/5 in `verify-combined-cli.test.ts` on the evidence
  lineage): forged compat, wrong capture sha, material change, byte tamper.
- p452 preserved as historical at `c2202614` — material identity untouched.
- Runbook literal block: fixture-tested (`runbook-prep-block.test.ts`, 2/2) — correct
  head-into-base merge proves ancestors + feature presence; base-into-base fails.

## P466 — strict receipt schema

validated against exact key set + sha shapes before use; malformed/
missing/extra fields refuse; later vars (BASETIP/MERGETREE) assign only from validated
state under . Fresh locked validation/gates still required.

## P467/P468 — extracted-block acceptance suite repaired

- Defect found by the suite: #207 step was prose-only (no executable fence), and the
  prep block hardcoded scratch paths (`/tmp/p452-wt`, `/tmp/p452/state`) that collide
  with the real p452 worktree on this host — fixture execution deleted+restored it.
  Fixed: #207 given the same concrete fenced block as #206 (fresh lock, retarget,
  forward update, derived-head review stop); prep scratch vars made env-overridable
  (`${VAR:-default}`), identical for the operator.
- `runbook-all-blocks.test.ts` (8/8): literal blocks executed unchanged under stubs —
  #203 prep runs to the test-merge+ancestor checkpoint and persists a strict-validated
  receipt; #206 and #207 each reach their changed-head checkpoint (retarget +
  merge-base-in + push, head re-read live) with NO `gh pr merge` on derived heads; both
  stop at "not merged" when the prerequisite PR is OPEN; merge block refuses missing
  and stale-base receipts; at the simulated checkpoint `flock -x` precedes `gh pr merge`.
- `runbook-prep-block.test.ts` 2/2 unchanged.

## P469 — fixture isolation + final gates

- Incident (disclosed above) repaired for real: every executed block now runs behind
  a `GUARD` preamble — refuses (exit 5) unless WT/STATE/DB/FIX are set, WT is a
  non-existent path under the mkdtemp fixture root, STATE under it. Sentinel
  regression (2 tests): omitted scratch paths refuse before ANY command runs
  (`called` empty — /tmp/p452-wt never reached), and foreign/pre-existing WT
  (`/tmp/p452-wt`, an existing fixture dir, `/tmp`) refuse identically on any host.
  p452-wt restoration verified via `git restore` → clean status, `tools/parity`
  intact, HEAD `d677df4` unchanged.
- Suite: `runbook-all-blocks.test.ts` 10/10; `runbook-prep-block.test.ts` 2/2.
- `integrate-transition` full-suite timeout resolved at the cause: the executor
  spawned ~18 `node -e` cold-starts just for manifest field reads — all converted
  to `jq` (already a hard prerequisite), preserving null/false semantics; only
  `transition-check.mjs` (the real validator) still uses node. Heaviest test
  5130ms → ~3300ms standalone; file-scoped `testTimeout: 20_000` added with
  justification comment. `npm run test` unmasked: **1294/1294 pass**.
- Formatting: 6 of the 8 failing files are hash-pinned p452 evidence (every byte
  recorded in `artifact-sha256.txt`/`artifact-index.json`) — reformatting would
  invalidate the verified capture, so `icm/05-build/tools/transition/p452/` is
  excluded in `.prettierignore` with the hash-pin reason (same class as the
  existing `spec/` and `tools/parity/baseline/manifest.json` entries — not a
  green-shopping exclusion). The 2 branch-owned files were formatted.
  `npm run format:check` now fully green.
- Lint provenance proven, not assumed: 81 warnings remain, ALL in files
  byte-identical to merge-base `d1c408102` (canvas trees, icm/03-plan tool,
  lib/dashboard, tests/integration). The 9 branch-introduced warnings
  (runbook-prep-block, transition-identity, identity.mjs) were fixed — dead
  imports/params removed, `tree` now asserts a distinct merge tree.

## P471 — safeguards moved into the published runbook + real receipt contract

- Shared /tmp defaults REMOVED from the runbook. `SCRATCH` is a required input
  (`${SCRATCH:?}` — omitted input refuses), canonicalized (parent resolved
  `cd -P`), symlink destinations refuse, existing dirs must carry this task's
  `.task-owned` sentinel bound to the canonical path or the block refuses
  untouched. `task_owned()` in the runbook re-verifies every destructive
  target before `rm -rf` — inside scratch, non-symlink, sentinel intact.
  Tests execute the RUNBOOK's own prelude/function text (extracted slices),
  not a harness guard: omitted SCRATCH, existing-unowned, foreign sentinel,
  symlinked scratch, and task_owned alias/foreign/dead-sentinel cases all
  refuse with `called` empty / files intact.
- Receipt contract made real. Prep parses gate counts from the capture's own
  `proposed-{canonical,strict}.json` receipts (no more hardcoded 70/68), fails
  (exit 5) before writing any receipt when gates are red, and persists a
  `transition-prep-v2` receipt: `head`, `base`, `baseTip`, `mergeTree`,
  `toolBundle` (commit/path/tree), `gates` (runId + expected/observed counts)
  - a sha256 integrity sidecar. The merge block loads and strictly validates
    it itself — digest first, then exact key set, schema/PR/branch identity,
    SHA shapes, bundle identity, gate counts — and derives HEADSHA/BASETIP/
    MERGETREE/BUNDLE_*/RUN_ID from it; no env injection. It then re-verifies
    live (head/base/state + base tip) and re-runs the literal test-merge,
    ancestors, fast gate and combined capture — fresh gates are literal commands
    bound to the receipt's run identity; a persisted receipt is never permission.
- Mutation matrix (each against a receipt produced by REALLY executing prep):
  tampered-no-redigest → digest refusal; forged head → live headRefOid check;
  forged baseTip → stale-refusal; forged mergeTree → fresh test-merge
  disproves pre-merge; extra field → schema; missing gates → schema; failed
  gate counts → schema; missing file/sidecar → refuse; moved base → live
  refusal on an untampered receipt. All refuse before any `gh pr merge` stub.
- Formatting narrowed: dir-wide `p452/` ignore replaced by 5 exact pinned-evidence
  entries (capture manifest + 4 gate receipts — all sha256-pinned).
  `d32-capture-adapter.mjs` is executable tooling — NOT exempted; it was
  formatted and its pins honestly updated: adapter sha256 fd6a9a99 → 3e270620,
  artifact-index.json sha256 354003d3 → dff68046 (both records updated
  consistently; `shasum -a 256 -c artifact-sha256.txt` → 248/248 OK).
- `git diff --check` base→head: 8 trailing-whitespace warnings, all in pinned
  p452 evidence logs introduced by earlier branch commits — this delta adds 0.

## P472 — whitespace closure + adapter provenance correction

- `git diff --check d1c40810..HEAD` exited 2 with 4 findings
  (`capture/receipts/server.log` ×3 lines, `prep.log` ×1) — all in pinned
  evidence logs. Corrected WITHOUT exemptions: original raw bytes preserved in
  `p452/raw-logs.tar` (sha256 `47321dd0…fe0b`, added to artifact-sha256.txt);
  in-place files are now labeled NORMALIZED copies (first-line label names the
  archive) with trailing whitespace stripped. Pins updated consistently:
  server.log 4a89c9f4→69e907da, prep.log 3b88ec21→d1d500e9, artifact-index.json
  entry updated, its own pin re-recorded. `shasum -a 256 -c` → 249/249 OK.
- Adapter provenance corrected: P471 formatted `d32-capture-adapter.mjs`, but
  the receipts that executed it pin `adapterSha256 fd6a9a99` in FOUR
  hash-pinned execution receipts — the formatted derivative (3e270620) was
  never executed. Restored the original executed bytes at the executed path
  and reverted artifact-index/sha256 records to their captured state
  (fd6a9a99 adapter, 354003d3 index); the package verifies byte-identical to
  its original capture. The adapter is now an exact pinned-evidence entry in
  .prettierignore (executed evidence, not exempted tooling — the formatted
  derivative exists only in history at b4428f8). No receipt was rewritten to
  imply the formatted bytes ran.
- `verifyPackage(capture)` (identity.mjs) → 242 files / 241 indexed, no
  unindexed extras, no missing entries — the applicable package verifier,
  not just shasum.

## P474 — published shell semantics + full receipt identity binding

- `set -euo pipefail` now lives INSIDE every independently executable fence
  (prep, merge, #206, #207). The fixture prepends nothing — extracted blocks
  run verbatim. Six propagation negatives prove the published semantics: fast
  gate (`npm run test`), combined capture (`npx run.mjs`) and piped command
  (`git archive | tar`) failures die before receipt issuance (prep) and
  before `gh pr merge` (merge block).
- Receipt now records `testMergeCommit` (the actual local test-merge commit)
  alongside `mergeTree`. The merge block resolves it (`cat-file -e`), asserts
  `rev-parse TMC^{tree} == mergeTree`, and proves the approved head AND base
  are ancestors — all after live revalidation, before fresh gates. Negatives:
  missing object, wrong commit/tree pair, unrelated commit — all refuse before
  `gh pr merge`; forged mergeTree is disproved by the commit/tree binding.
- Tool bundle bound for real: receipt `toolBundle` must equal the authorized
  `p203-p207.json` manifest identity (commit/path/treeSha) AND
  `git rev-parse "${commit}:${path}"` must resolve to the recorded tree.
  A forged tree with a recomputed digest refuses before gate execution or
  merge. The same resolution assertion now guards the prep-side overlay graft.
- `runSrc` executes extracted text with no injected `set` line; git stub gained
  real object semantics (GIT_TREES map, GIT_OBJECTS, GIT_ANCESTORS pairs) —
  refusal coverage is semantic, not "a command ran".
- Incidental race fixed: `integrate-transition.sh` writes `STATE_DIR` at
  repo-root `_transition/`; its test removed residue only before each run, so
  `system-index` occasionally scanned while the dir existed. The test now
  removes it immediately after every run (post-spawnSync); full suite green.

## P476 — executor test state isolated to per-fixture repo

- Review finding: the executor resolves `STATE_DIR` via stubbed
  `git rev-parse --show-toplevel` (`HERE_REAL`) — the test pointed it at the
  REAL checkout and `rmSync`'d `ROOT/_transition` before AND after every run:
  recursive deletion of shared state, plus a during-test race.
- Fixed via the existing seam — `HERE_REAL` now points at a per-fixture
  `repo/` dir inside the unique `mkdtemp` root; executor untouched (parked);
  both `rmSync(ROOT/_transition)` calls removed; `afterAll` cleanup targets
  only `fixtureDirs` (paths the fixture itself created).
- Regressions: (1) foreign `_transition` sentinel under a separate fixture is
  byte-intact after a run; (2) two runs' state dirs are disjoint —
  a second run neither reads, overwrites nor removes the first's files;
  (3) `ROOT/_transition` never exists. Suite: 27/27.

## Package accounting (corrected, p458)

`p452/capture/` contains 241 indexed artifacts + `artifact-index.json` + receipts/provenance files = **248 checksum-bearing entries** (241+7); earlier "246" claims were stale. Verified from fresh clone.

## Fresh-clone verification (p454)

- Clone of `beta/p443-transition-tools` at `aec83ab`: 246/246 `artifact-sha256.txt` entries OK.
- Overlay object proven remotely: `git fetch --depth 2 origin d677df41…` → commit `d677df4`,
  tree `193d057`, `tools/parity` subtree `f457065f` (pinned), single parent (ungrafted
  test-merge commit), `diff overlay^ overlay -- ':!tools/parity'` = 0 files.
- `verify-combined.mjs` (verifier extracted from the tagged overlay objects) verifies:
  artifact-index (241 files, every sha256), commit/tree matches provenance, material inputs
  clean. ONE check does not complete: `assertPostCaptureDelta` requires a DESCENDANT commit
  recording explicit post-capture receipt paths (the p4xx evidence-commit pattern) — the
  bare capture commit `d677df4` yields `[]` by definition. Reported plainly, not bypassed.
- Earlier failures (missing `server.log`/`prep.log` due to gitignore) corrected via
  force-add; raw `server.log` preserved as committed bytes.

## P479 — real shared lock, DB ownership, published-shell dirty probe

- Lock defect: `$STATE/Vari8-Beta.lock` differed per scratch root — not shared.
  Now every block sources `icm/05-build/tools/paths.sh` (canonical
  `LOCKS=$WT/.locks` — same file all tasks contend on; `paths.sh` sourced
  before `WT=` so its `WT` cannot clobber the block's worktree var).
  Regression: two invocations with different SCRATCH roots create+lock the
  SAME `.locks/Vari8-Beta.lock`; none under per-scratch state.
- DB defect: EXIT trap dropped `app_p203` even when the refuse-existing check
  fired — could destroy a pre-existing/foreign DB. Now `DB_CREATED=1` set
  only after this invocation's `docker exec createdb` succeeds; the trap drops
  only then. Verified container `app-db-1` (postgres:16-alpine,
  127.0.0.1:5433→5432); admin via `docker exec`; published port resolved via
  `docker inspect` — no hardcoded 5434, password env-only. Regression:
  pre-existing `app_p203` → exit 2, zero dropdb calls; owned DB dropped.
- Dirty probe defect: `(cd $WT && run.mjs)` under set -e either silently
  passed (stub) or aborted on real refusal. Now wrapped in `if` — expected
  refusal is explicit (`exit 5` only if ACCEPTED), then byte-identical
  restore proven; stdout records "dirty-state refusal confirmed".
- Authorization disposition: comment 6453235842 verified real
  (user `hanzlahsfc`) and honestly self-described as orchestrator-recorded —
  NOT the manifest-required manually-human-posted record. Integration stays
  BLOCKED on `mergeAuthorization.pendingInput`; no bypass performed.

## P492 — #206 merged under recorded chat authorization

- Authorization: `p203-p207.json` `mergeAuthorization` now records
  orchestrator-transmitted `issuecomment-6453235842` (true origin, not
  manually posted); pending-input record fulfilled; pending-refusal test
  injects the record itself (27/27).
- Lock: `/tmp/vari8-worktrees/.locks/Vari8-Beta.lock` held continuously
  through revalidation, gates, merge and post-merge verification.
- Gates on unmodified merge tree `5694851` (Node 24.22.1): format/index/
  typecheck/lint 0err-82w/test **1340/1340**/build/diff-check — all pass.
  Combined evidence: P486 composite `f4527ae` (product inputs proven
  identical — zero diff outside tools/parity + .prettierignore).
- MERGE `7d4c93c7fc0260e82870ea74fab3b5dec367abad`: P1=`a90eaf28`
  (validated Beta tip) P2=`5694851` (reviewed #206 head) TREE=`febf60b`
  (= tested). Baseline `640f4375` intact post-merge. Draft→ready→merge.
- STOP after #206. #207 untouched (base `beta/visual-reference-
  establishment` still `43b63ed`; next checkpoint = retarget to the new
  Beta tip + changed-head review).
