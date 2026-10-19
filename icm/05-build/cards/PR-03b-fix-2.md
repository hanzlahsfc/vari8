# PR-03b fix pass 2 (PR #63, issue #60)

The re-verify (`icm/05-build/reports/PR-03b-verify-2.md`) returned FIX on one narrow point. Hunks 1 and 2 are proven by discriminating probes; do not touch them.

Hard rules:
- Never write `docs/STATUS.md`.
- Never touch `frontend/`.
- Commit with explicit pathspecs.
- Do not merge.

## Fix

**feedback-thread mount reconciliation.** The effect still calls `setNonce` and `setReconcile` synchronously inside `void (async () => { ... })()`. That is the same lint dodge round 1 flagged.

Restructure it so that:
- no setState runs synchronously in the effect body or in a wrapper that only exists to hide it;
- the "Checking…" note appears at the same moment as on base `55a0f08`.

Allowed patterns:
- derive the initial nonce and reconcile state during render (initial state or a lazy initializer);
- move the state into the awaited callback after a real `await`;
- use `useSyncExternalStore` if the source is external.

No `eslint-disable`, no IIFE, no `queueMicrotask` or `setTimeout` used as a dodge.

## Proof

- Keep the verifier's probes in `icm/05-build/evidence/PR-03b-verify-2/probes/` and run them. They must pass on your head.
- Add one mount-timing assertion: "Checking…" visible on the first commit after mount, as on base.
- Run `grep -n "async () =>" ` on the file and confirm no effect-level IIFE remains.
- Gates: typecheck, lint (0 react-hooks findings), test, build, and `cd frontend && npm run build`.
- Add a "Fix pass 2" section to `icm/05-build/reports/PR-03b.md`.
- Commit the verify-2 report and the evidence directory unchanged.
- Push, and comment on PR #63.
