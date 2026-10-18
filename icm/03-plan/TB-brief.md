# Test audit pass 2 brief (TB lanes): bite check per describe block

Owner rule `icm/03-plan/DECISIONS.md` D11: keep tests that prove behavior, cut the rest. D12: consent and health-data rules are parked, so testing them is not a reason to keep anything. Pass 1 (`icm/03-plan/output/TA/*.md`) kept 170 files after breaking one line per file. That proves a file has at least one test that bites, not that the whole file earns its place: in one lane only 12 percent of the tests in kept files failed. This pass judges every `describe` block on its own.

All paths under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/` unless absolute. Load first with `skill_view` (Devin lanes read the files under `/home/nexuslink/projects/cursor-plugins/pstack/skills/<name>/SKILL.md`): `principle-test-behavior-not-implementation`, `principle-prove-it-works`, `principle-build-the-lever`.

## Source and scratch

Source commit `58eb6ed`. Never edit `/home/nexuslink/vari8-worktrees/merge-proto`. Own copy: `git -C /home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8 worktree add --detach /home/nexuslink/.hermes/cache/scratch/vari8-tb/<lane> 58eb6ed`, then `npm ci` and `npx prisma generate` (and `npm ci` in `frontend/` for canvas files). Integration files: Postgres at `127.0.0.1:5433` (container `vari8-db-1`, user `app`, password and db name from `.env.example`); `docker exec vari8-db-1 createdb -U app app_tb_<lane>` and point `INTEGRATION_DATABASE_URL` at it; never touch another database. At the end remove the worktree (`git worktree remove --force`), `dropdb` your database, kill what you started.

## File list

`icm/03-plan/output/TA/<list>.txt`, one `path<TAB>pass-1 verdict` per line. The pass-1 report row for each file (in `TA/TA-U00.md`, `TA-U01.md`, `TA-U02.md`, `I00.md`, `TA-I01.md`, `TA-CE.md`) names what it tests; reuse it.

## Method per file

1. Run the file alone once as a baseline. Record test count.
2. List every top-level `describe` block (a file with no `describe` counts as one block). Nested blocks count under their top-level parent unless they target different code; then split them.
3. Per block, classify first by reading: CUT on sight if it only checks types or shapes, snapshots constants, re-tests the framework or a library, is mock-only, or duplicates another block. These need no mutation.
4. Every block not cut on sight: make one meaningful mutation in the code that block targets (invert a condition, change a boundary, return early, drop a write), run the file, record which tests failed, restore. Use a lever script that asserts the mutation target string occurs exactly once and restores with `git checkout --`. The block is KEEP only if at least one of its own tests failed. Otherwise CUT.
5. Count tests and lines per block (lines from the `describe(` line to its closing).

## Output

`icm/03-plan/output/TA/<lane>.md`, written incrementally:

- Summary: blocks, tests and lines per verdict, and the CUT share by tests and by lines.
- Table `| file | block | lines | tests | target | verdict | reason or mutation | failed tests |`, one row per block.
- Per file, one line: `KEEP-ALL`, `TRIM (keep blocks ...)`, or `CUT-FILE`.
- `## Could not check` and `## Self-check`: PASS or FAIL with evidence for (a) every file in the list has its blocks listed (count files and blocks), (b) every KEEP block has a mutation that failed one of its own tests, (c) worktree and database removed, nothing left running, (d) nothing written outside `icm/03-plan/output/TA/`.

Plain English, no long dashes. Never commit, push, or edit a tracked file.
