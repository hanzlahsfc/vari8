# Test audit brief (TA lanes)

Owner rule `icm/03-plan/DECISIONS.md` D11: cut tests that only prove compilation, keep tests that prove behavior. The owner estimates about 75 percent of the suite is useless; your job is to check that file by file, not to confirm the estimate. D12: consent and health-data rules are parked, so testing them is not a reason to keep a file.

All paths under `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/` unless absolute. Load first with `skill_view` (Devin lanes read the files): `poteto-mode` (run as its `playbooks/investigation.md`), `principle-test-behavior-not-implementation`, `principle-prove-it-works`, `principle-build-the-lever`. Fallback path `/home/nexuslink/projects/cursor-plugins/pstack/skills/<name>/SKILL.md`.

## Source and scratch

Source commit `58eb6ed` (FRONTEND merged into main; branch `proto/merge-frontend`). Never edit `/home/nexuslink/vari8-worktrees/merge-proto`. Make your own copy: `git -C /home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8 worktree add --detach /home/nexuslink/.hermes/cache/scratch/vari8-ta/<lane> 58eb6ed`, then `npm ci` and `npx prisma generate` there. Bite checks happen only in that copy. Integration lanes: Postgres runs at `127.0.0.1:5433` (docker container `vari8-db-1`, user `app`, password and db from `.env.example`). Create your own database `app_ta_<lane>` with `docker exec vari8-db-1 createdb -U app app_ta_<lane>` and point `INTEGRATION_DATABASE_URL` at it; never touch `app_dev` or another lane's database. Run one test file at a time with a generous timeout. At the end remove your worktree (`git worktree remove --force`), drop your database (`dropdb`), and kill anything you started.

## Your file list

`icm/03-plan/output/TA/<list>.txt` (named in your task). Files are under `tests/unit/`, `tests/integration/`, `tests/e2e/` or (canvas list) the listed `frontend/` paths.

## Method per file

1. Read it. Name what it imports and what it asserts.
2. Classify with the rule (principle-test-behavior-not-implementation): KEEP only if it calls the code the way users or callers do, asserts literal expected results, and covers behavior a browser check would not easily see (formulas, date and timezone rules, validation at trust boundaries, token crypto, server-side permission enforcement, data integrity under concurrency). CUT if it is mock-only, asserts types or shapes, snapshots constants, re-tests the framework or a library, tests an implementation detail, duplicates another test, or would still pass if the imported functions returned `undefined`. MERGE if a few cases are worth keeping inside an otherwise CUT file (name the cases).
3. Bite check every KEEP and MERGE file: in your copy, break the code under test in one meaningful line (invert a condition, change a constant, return early), run that file alone, record whether it fails, restore. A KEEP whose bite check does not fail becomes CUT.
4. e2e files (if in your list): they target the old UI that the canvas replaces. Classify KEEP only for flows that survive the port unchanged (auth, invite, password reset); otherwise CUT-AT-PORT with the canvas surface that replaces it.

## Output

`icm/03-plan/output/TA/<lane>.md`, written incrementally:

- Summary: files and lines per verdict, and the CUT share in percent.
- Table `| file | lines | under test | asserts | verdict | rule | bite check (command, result) |`, one row per file.
- `## Could not check`.
- `## Self-check`: PASS or FAIL with evidence for (a) every file in your list has a row (give the count), (b) every KEEP and MERGE has a bite check that failed, (c) your copy and database removed, nothing left running, (d) no file outside `icm/03-plan/output/TA/` written.

Plain English, no long dashes. Never commit, push, or edit any tracked file.
