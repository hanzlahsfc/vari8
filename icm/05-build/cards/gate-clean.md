# GATE-CLEAN: Ship-all and cleanup check

Run from `/home/nexuslink/vari8-worktrees/beta` after `git pull --ff-only origin Vari8-Beta`. Ship-all and cleanup rule (orchestrator, 02:35). Every check must hold; fix what a merge card left behind, then report the command outputs on this card:

- `gh pr list -R hanzlahsfc/The-great-tracker- --state open` lists no program PR, and `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --state open` is empty.
- `git branch -r` shows only main, FRONTEND, TRACKER, Vari8-Beta and branches that existed before the program (record the pre-program list from `icm/05-build/RUNBOOK.md`).
- `git worktree list` shows only the root checkout and `/home/nexuslink/vari8-worktrees/beta`; run `git worktree prune` after removals. `/home/nexuslink/vari8-worktrees/_evidence` stays (outside git).
- `docker exec vari8-db-1 psql -U app -d postgres -Atc "select datname from pg_database where datname like 'app_%'"` shows only `app_dev`.
