# PR-31 merge: integrate into Vari8-Beta

Card slug `pr-31-pwa-mobile-merge`. Integration lead. Worktree `/home/nexuslink/vari8-worktrees/pr-31-pwa-mobile-merge` (local branch `beta/pr-31-pwa-mobile-merge`, never pushed).

1. `cd /home/nexuslink/vari8-worktrees/pr-31-pwa-mobile-merge && icm/05-build/tools/integrate.sh PR-31 beta/pr-31-pwa-mobile`. The script takes the integration lock; checks that every verifier comment on the PR says `SHIP PR-31 <sha>` for the current head; test-merges the head with `origin/Vari8-Beta` and runs the fast gate (typecheck, lint, unit, build) on `app_merge_pr31`; then `gh pr merge --merge --match-head-commit <sha>`; closes the issue with a link to the PR; fast-forwards the beta worktree to `origin/Vari8-Beta`; deletes the remote and local branches and removes the builder and verifier worktrees (ship-all and cleanup rule).
2. Exit 3 (conflict with trunk) or a red fast gate: comment `FIX` on the PR with the output, `request-changes` the builder card, stop. The builder updates the branch; the verifier runs again on the new head.
3. Append the merge to the live log `/home/nexuslink/vari8-worktrees/_live/merge-log.md` (the script does it under the lock). Complete this card with the merge commit SHA.
