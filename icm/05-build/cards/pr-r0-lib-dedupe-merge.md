# PR-R0 merge: integrate into Vari8-Beta

Card slug `pr-r0-lib-dedupe-merge`. Integration lead. Worktree `/home/nexuslink/vari8-worktrees/pr-r0-lib-dedupe-merge` (local branch `beta/pr-r0-lib-dedupe-merge`, never pushed).

1. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `cd /home/nexuslink/vari8-worktrees/pr-r0-lib-dedupe-merge && icm/05-build/tools/integrate.sh PR-R0 beta/pr-r0-lib-dedupe`. The script takes the integration lock; checks that every verifier comment on the PR says `SHIP PR-R0 <sha>` for the current head; test-merges the head with `origin/Vari8-Beta` and runs the fast gate (typecheck, lint, unit, build) on `app_merge_prr0`; then `gh pr merge --merge --match-head-commit <sha>`; closes the issue with a link to the PR; fast-forwards the beta worktree to `origin/Vari8-Beta`; deletes the remote and local branches and removes the builder and verifier worktrees (ship-all and cleanup rule).
2. Exit 3 (conflict with trunk) or a red fast gate: comment `FIX` on the PR with the output, `request-changes` the builder card, stop. The builder updates the branch; the verifier runs again on the new head.
3. Append the merge to the live log `/home/nexuslink/vari8-worktrees/_live/merge-log.md` (the script does it under the lock). Complete this card with the merge commit SHA.
