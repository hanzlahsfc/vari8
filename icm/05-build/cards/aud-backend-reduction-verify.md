# AUD-REDUCTION-VERIFY: Verify the backend reduction audit before the reduction PRs use it

Independent check of `icm/05-build/BACKEND-REDUCTION.md` (built on claude-haiku-5-5) on claude-opus-5-5. Worktree `/home/nexuslink/vari8-worktrees/aud-backend-reduction-verify`, detached at `origin/Vari8-Beta`. Read only; no product edits.

1. For every finding F1 to F13 re-run the caller census it cites (or an equivalent `rg`/`git grep` over `app/`, `lib/`, `scripts/`, `components/`, `tests/`) and record the command, the count and PASS or FAIL against the audit's claim.
2. Check the import closure of the catalog importers (`lib/nutrition/source.ts`, `lib/exercise/source.ts`, `lib/nutrition/import.ts`, `lib/exercise/import.ts`): every `lib/extraction/*` module in it must be absent from PR-R1's delete list (the program lead found `databases.ts` and `css.ts` in the closure at 03:20; the audit names only `contracts`, `normalize`, `parse`).
3. Check the line counts the audit claims per finding within 10 percent.
4. Write `/home/nexuslink/vari8-worktrees/_evidence/AUD-REDUCTION/verify.md` with the table and a first line `SHIP AUD-REDUCTION` or `FIX AUD-REDUCTION`. On FIX, list the PR-R0, PR-R1, PR-R2 or PR-R3 card text that must change; the program lead regenerates the cards. Complete this card with the verdict line.
