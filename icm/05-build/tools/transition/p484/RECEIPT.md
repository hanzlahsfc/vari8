# P484 — fresh #206 combined proposed-reference verification (no merge)

- Source: #206 head `569485149ec83f911188442b95d83320aff7e96e`, tree
  `febf60b0a9b6c94c8f93afe2850dd7f87a2260c6`; base `a90eaf283f35`
  (ancestor of head — merge result already present).
- Lock: real shared `paths.sh` lock — `/tmp/vari8-worktrees/.locks/Vari8-Beta.lock`
  (canonical `VARI8_WORKTREES` seam; program-config `worktrees_root` is a
  Linux path unusable on macOS) — held through prep + gates.
- DB: disposable `app_p206` on `app-db-1` (postgres:16-alpine,
  127.0.0.1:5433→5432) — created and dropped by this invocation only.
- Runner: authorized pinned bundle `04902f1d:tools/parity` (tree `f457065f`)
  grafted into the isolated worktree — the manifest-sanctioned adaptation:
  #206 lacks the runner combined functionality (#207 supplies it).
  Reference `reference/proposed` tree identical under both commits
  (`71a5d286`) — zero product change. Tree kept clean for the runner's
  `snapshotSource` invariant via `skip-worktree` marks on tracked parity
  paths + `.git/info/exclude` for graft additions and capture output —
  no index/tracked bytes altered.
- Gates (Node 24.22.1 capture): format:check on #206's own tree PASS
  (24 failures here are graft-owned `reference/combined/` pinned bytes, not
  #206 content); index:check PASS; typecheck PASS; lint 0 errors / 82
  warnings on #206 tree (+1 graft-owned `d32-capture-adapter.mjs 'HERE'`
  = 83 total — 82nd warning: `lib/dashboard/config-schema.ts:1127:11
'fieldId' unused`); diff --check base→head 0; unit 1324/1324; build PASS.
- Combined gate: `PARITY_COMPARER=reference` —
  **canonical 70/70 PASS (0 problems), strict diagnostic 68 (2 problems,
  expected min 68), retried=0, exit 0.** Receipts in this directory;
  full capture under worktree `.parity-capture/` (task-owned scratch,
  `state-logs.tar` holds gate logs).
- Active baseline `tools/parity/baseline` tree `640f4375` — unchanged;
  default reference selection unchanged. No active-baseline claim made.
- Not a merge: #206 remains draft; authorization-record requirement
  still pending and unmet — reported, not bypassed.
