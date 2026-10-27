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
