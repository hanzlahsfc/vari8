# W0 fix pass 2 (PR #67)

The re-verify (Haiku, shikamaru gear) passed 9 of the 11 rulings. Three narrow items remain. Full report: `/home/nexuslink/.hermes/cache/scratch/pr67-verify-2.md`.

Fix each item in `program_data.py` or the tools, regenerate through `program.py`, sync the board, commit with explicit pathspecs and push to `beta/w0-program`. Then post a short PR comment listing each item with its commit. Do not merge and do not release the board.

1. **PR-133 is mapped to `gate-clean`, but `cards/gate-clean.md` never mentions it.** Add PR-133 to the gate-clean card body with a concrete check, so the ledger mapping is true.
2. **`tools/board.py:194` treats a missing `parents` key as "no parents" and would release the card.** Make it fail closed: a missing or malformed `parents` key is an error, exit non-zero, and nothing is released. Add one check in your tooling self-test that proves this.
3. **PR-01 has only PR-02 as a parent, but it edits the PR-P1 parity harness** to point it at the root app. Orchestrator ruling: add `PR-P1:merge` as a parent of the PR-01 build card. That way the canvas takeover always runs against the finished, verified harness.

Done means:

- `program.py` exits 0.
- The graph is acyclic.
- The board check reports 0 diffs.
- `icm/05-build/reports/W0-fix-2.md` has a line for each item.
