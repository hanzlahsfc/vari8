# GATE-CLEAN: Ship-all and cleanup check

Run from `/home/nexuslink/vari8-worktrees/beta` after `git pull --ff-only origin Vari8-Beta`. Ship-all and cleanup rule (orchestrator, 02:35). Every check must hold; fix what a merge card left behind, then report the command outputs on this card:

- `gh pr list -R hanzlahsfc/vari8 --state open` lists no program PR, and `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --state open` is empty.
- `git branch -r` shows only main, FRONTEND, TRACKER, Vari8-Beta and branches that existed before the program (record the pre-program list from `icm/05-build/RUNBOOK.md`).
- `git worktree list` shows only the root checkout and `/home/nexuslink/vari8-worktrees/beta`; run `git worktree prune` after removals. `/home/nexuslink/vari8-worktrees/_evidence` stays (outside git).
- `docker exec vari8-db-1 psql -U app -d postgres -Atc "select datname from pg_database where datname like 'app_%'"` shows only `app_dev`.

## Production-readiness P0 rows this card owns (`icm/05-build/audits/PRODREADY-BASELINE.md`)

- PR-133: Code review on every change (PARTIAL): every program PR carries a SHIP verdict from a model other than its builder's; branch protection is an owner call
  Check: for every program PR merged into `Vari8-Beta` (`gh pr list -R hanzlahsfc/vari8 --base Vari8-Beta --state merged --search 'merged:>=2026-10-19' --json number,title,headRefOid,mergeCommit`), `gh pr view <n> --json comments` contains a line `SHIP <PR-id> <sha>` whose sha is the PR's last head before the merge, posted by a verifier card whose model differs from the builder's (builder and verifier models from `icm/05-build/graph.json`). Write the table (PR, head sha, SHIP line found, verifier model, builder model) to `/home/nexuslink/vari8-worktrees/_evidence/GATE-CLEAN/pr-133.md`; any PR without a matching SHIP fails this card. Also record `gh api repos/hanzlahsfc/vari8/branches/Vari8-Beta/protection` (404 today); turning protection on is the owner's call, so a 404 is reported, not failed.
