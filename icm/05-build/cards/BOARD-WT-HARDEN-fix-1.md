# BOARD-WT-HARDEN fix 1: one missing selftest case

PR #82, branch `beta/board-worktree-hardening`, worktree `/home/nexuslink/vari8-worktrees/board-worktree-hardening`. Verifier report: `/home/nexuslink/vari8-worktrees/_verify/pr82-verify.md` (SHIP with one coverage gap).

Gap: no `board_selftest.py` case covers "branch `beta/<slug>` already exists AND `git worktree add` fails". A mutation that makes the cleanup also delete a pre-existing ref leaves the selftest 20/20 green.

Do exactly this:

1. Add one case to `icm/05-build/tools/board_selftest.py`: pre-create `beta/<slug>` at a known sha, make the worktree path unusable so `worktree add` fails, run release, assert the card stays blocked, exit is non-zero, and `beta/<slug>` still exists at the same sha.
2. Prove it discriminates: temporarily change the cleanup in `board.py` to delete the ref unconditionally, run the selftest, see your new case red, restore `board.py` byte-identical (compare sha256 before and after). Put both outputs in the report.
3. No change to `board.py` itself.
4. Append a "Fix 1" section to `icm/05-build/reports/BOARD-WT-HARDEN.md`, commit both files plus this card with explicit pathspecs, run `npm run index` and confirm `npm run index:check` exits 0 (commit regenerated routers if any), push.

Follow `icm/05-build/cards/PIPELINE-FOOTER.md`. Never write docs/STATUS.md. End with a clean worktree.
