# BOARD-WT-HARDEN: ensure_worktree fails closed

Issue #81, branch `beta/board-worktree-hardening`, worktree `/home/nexuslink/vari8-worktrees/board-worktree-hardening`.

Code: `icm/05-build/tools/board.py` (`ensure_worktree`, `release_once`), selftest `icm/05-build/tools/board_selftest.py`.

Two defects from the #78 verify:
1. A failed `git worktree add -b beta/<slug>` leaves an orphan `beta/<slug>` ref. A failed creation must leave no new local ref behind (delete only a ref this call created, never a pre-existing one).
2. `ensure_worktree` reuses any existing `<path>/.git` without checking it. Reuse only when that worktree is on `beta/<slug>`; otherwise fail closed (card stays blocked, non-zero exit, clear message naming path and actual branch).

Acceptance: two new `board_selftest.py` cases, one per defect, each red on the current code and green after; all existing cases still pass; `python3 icm/05-build/tools/generate.py --check` 0; `npm run index:check` 0. No hard-coded /home paths. Keep the diff small.

Follow `icm/05-build/cards/PIPELINE-FOOTER.md` in your worktree completely (it is in this branch). node_modules: run `npm ci` in your worktree root (and `cd frontend && npm ci` if you build frontend) in the background with a log; never symlink node_modules (Turbopack rejects it). Long commands run in the background writing logs; never block one tool call longer than 4 minutes. Never write docs/STATUS.md.
