# P486 execution boundaries (P490 record)

## What the combined candidate proves

`f4527ae` (#206 head `5694851` + pinned bundle `04902f1d:tools/parity`)
passes the fresh combined proposed-reference gate: canonical 70/70,
strict diagnostic 68 (>=68), retried=0, plus all standard gates under
Node 24.22.1 (format/index/typecheck/lint 0err-83w/test **1340**/build/
diff-check). It proves a combined candidate — NOT #206-alone acceptance,
NOT a merge authorization.

## Which actual intermediate merge tree still needs verification

`5694851`'s own tree `febf60b` — the #206-on-Beta merge — was gate-tested
in the P482/P484 lanes; the combined gate ran on the composite candidate
`f4527ae`, not on `5694851` as-is. Acceptance of `5694851` for merge still
requires the authorization record plus any review the owner requires on
that exact tree.

## Canonical lock path (verified on this host)

`paths.sh` resolves `LOCKS=$VARI8_WORKTREES/.locks`; my invocations held
`/tmp/vari8-worktrees/.locks/Vari8-Beta.lock` through prep+gates.
`program-config.json` records `worktrees_root=/home/nexuslink/…`
(deployment machine; unmountable on macOS) — the `VARI8_WORKTREES`
override is the configured seam, reported exactly.

## Cross-task coordination — established vs unproven

Established: my invocations + the reviewed runbook/executor all derive
the lock via `paths.sh` → the same configured file. Unproven: whether
every other agent/task on this host sets `VARI8_WORKTREES` to the same
root — no other task's lock usage was observable. The claim is bounded
to the canonical derivation, not universal adoption.

## Remaining authorization record

`mergeAuthorization.pendingInput` requires a human-posted GitHub comment
recording the decision. The orchestrator-recorded comment `6453235842`
honestly does not satisfy the literal requirement. Still PENDING — no
bypass, no merge.
