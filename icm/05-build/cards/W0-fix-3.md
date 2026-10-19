# W0 fix pass 3 (PR #67)

Delta re-verify 3 (`/home/nexuslink/.hermes/cache/scratch/pr67-verify-3.md`) passed 5 of 6 items. One item fails, and it matters: the program is not reproducible.

1. `tools/program_data.py` hard-codes `BETA` to the live beta path. Run from any other checkout, it writes into the live beta worktree.
2. Generated output differs from the committed tree in 66 files. The same 66 differ on `416b2cc`, so the drift predates fix 2. The cards were hand-edited after generation, which means the next regeneration silently undoes those edits.

## Orchestrator ruling

The generator is the single source of truth, and the committed files are its output.

1. **Derive the root from the script's own location** (`Path(__file__).resolve()`), with an optional `--root` override. Remove every absolute path to `/home/...` from `tools/`.
2. **Reconcile the 66 files.**
   - For each file, diff generated against committed.
   - If the committed hand edit is intended (an orchestrator ruling, fix 1 or 2 content, verifier-requested wording), move that content into `program_data.py` or the generator's inputs so generation reproduces it.
   - If it is stale, let generation overwrite it.
   - List all 66 in `icm/05-build/reports/W0-fix-3.md`, one line each: file, cause, resolution.
3. **Add a `--check` mode.**
   - It generates into a temp dir and exits 1 on any diff from the committed tree, naming the files.
   - Wire it into `tools/verify-local.sh`.
4. **Prove it.**
   - From a fresh detached worktree under the scratch dir: generation exits 0 and `--check` exits 0, the live beta worktree is byte-unchanged (compare `git status --porcelain` and its hash before and after), and the board sync dry run shows 0 diffs.
   - Then hand-edit one generated card in the temp worktree: `--check` exits 1 naming it.

## Rules

- Commit with explicit pathspecs.
- Push to `beta/w0-program`.
- Comment on PR #67.
- Do not merge, do not release the board, and no em dashes.
- Never commit `icm/05-build/ORCHESTRATOR-STATE.md`. The orchestrator owns it.
- The orchestrator appended one rule to `cards/PIPELINE-FOOTER.md`: run `npm run index` and `index:check` before every push, since PR #65 merged. That edit is intended. Make it part of the generator's inputs if the footer is generated, and commit it.
