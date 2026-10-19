# PR-03b fix pass 1 (PR #63, issue #60)

The independent verifier (Haiku, shinobu gear) returned FIX. Read its report first: `icm/05-build/reports/PR-03b-verify.md`. Gates and e2e are green. Three hunks need a fix. Work in `/home/nexuslink/vari8-worktrees/pr-03-react-hooks` on branch `beta/pr-03-react-hooks`.

## Fix

1. **`dashboard-editor`: the `latestConfig` ref is synced in an effect.**
   - The problem: `mutate` and `setRect` can commit from a stale base before the effect flushes, so a pointer edit can revert an async reload.
   - The fix: read the current config at the point of use, for example `slot.latestConfig` or the setter's functional form, and drop the ref, so that no window remains in which the ref is stale.
   - Proof: show with a short note or test that a reload landing between a pointer down and its commit is not reverted.
2. **`checkin-calendar`: the keyed result.** A new `load` identity must reset to the loading state during a refetch, exactly as on base `55a0f08`. Put `load` (or what it is derived from) into the key or check. The builder report claims "same loading surface"; it must be true for every path, not only range changes.
3. **`feedback-thread`: the success effect.**
   - The async IIFE with no `await` dodges the lint rule, and the setState still runs synchronously in the effect.
   - Fix it at the root: move the success consequences into the submit or action path (as in finding 1 of your report), or derive the state, with no effect setState.
   - No IIFE wrappers and no disable comments.
4. **`tests/e2e/checkin-instances.spec.ts:644`: the harness race (`Route is already handled`).**
   - It fails on base too, and it is the only runtime check of the submission-panel hunk.
   - Fix only the race in the test, for example `page.unroute` before re-routing, or `route.fallback`. Do not change what it asserts.
   - Then that spec must pass on your branch.

## Then

- Merge the latest `origin/Vari8-Beta` (now `ea8f514`, PR-03a, which deleted many tests) into your branch, and resolve any conflict.
- Re-run every gate, in this order:
  1. `npm run typecheck`
  2. `npm run lint` (the four rules at error, zero react-hooks findings)
  3. `npm run test`
  4. `npm run build`
  5. `cd frontend && npm run build`
  6. the 7 e2e specs the verifier ran, on your own DB `app_pr03b` at 127.0.0.1:5433
- Do not touch anything under `frontend/`.
- Commit the verifier report and the evidence folder `icm/05-build/evidence/PR-03b-verify/` as they are, with explicit pathspecs.
- Update `icm/05-build/reports/PR-03b.md` with a "Fix pass 1" section: each item, its commit, and the gate exit codes. Correct the "same loading surface" claim.
- Push, and post a PR comment summarising the fix pass. Do not merge.
