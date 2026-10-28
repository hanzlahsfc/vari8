# P486 — explicit committed candidate combined verification

## Candidate (temporary verification branch, never pushed)

- Candidate commit `f4527ae70bb9722bf203019a5709491bcc3eebd0`, tree
  `899b72e08d7d128a76941e2313ee7e694c08aa19`, parent
  `5694851` (#206 head). Delta vs #206: `tools/parity` subtree replaced by
  authorized bundle `04902f1d:tools/parity` (tree `f457065f`, 746 files) +
  `.prettierignore` +3 lines (the bundle's own documented
  `reference/combined/` exclusion). All other files identical to `5694851`.
- NO skip-worktree/assume-unchanged/hidden replacements — every executed
  byte is a committed file; `snapshotSource` sees the real committed tree.
- Package commit `307e34ea` (packaging-only follow-up, explicit
  combined-run compatibility model; 242 post-capture paths recorded).

## Gates — ALL under Node 24.22.1 (path + version in each log)

format:check 0 | index:check 0 | typecheck 0 | lint 0 errors/83 warnings
(82 tree + 1 bundle-tooling `d32-capture-adapter.mjs 'HERE'`) |
test 1324+ | build 0 | diff --check a90eaf28..candidate 0

## Fresh combined capture (pinned runner, proposed reference)

canonical **70/70 (0 problems)** · strict diagnostic **68 (2 problems,
min 68)** · retried=0 · exit 0. Output under `_evidence/` — the project's
documented generated-output exclusion only.

## Clean-checkout verification

`verify-combined.mjs` at `307e34ea` in a fresh worktree:
`{"indexedArtifacts":241,"captureArtifacts":233,"canonical":{70,0},
"strict":{68,2},"verified":true}` — hash-pinned index + recomparison.

## Lock / environment

Canonical `paths.sh` seam: `VARI8_WORKTREES=/tmp/vari8-worktrees` →
`/tmp/vari8-worktrees/.locks/Vari8-Beta.lock` held through prep+gates.
LIMITATION: `program-config.json` records `worktrees_root` as
`/home/nexuslink/vari8-worktrees` — a deployment-machine path that cannot
exist on macOS (`mkdir: Operation not supported`). The `VARI8_WORKTREES`
override in paths.sh is the configured seam all tasks on this host use;
the lock path is reported exactly, not represented as the recorded value.

DB `app_p486` on app-db-1 (127.0.0.1:5433) — created and dropped by this
invocation only. Baseline `tools/parity/baseline` tree `640f4375`
unchanged; default selection untouched. This proves a combined candidate,
not #206-alone acceptance; merge authorization record remains pending.
