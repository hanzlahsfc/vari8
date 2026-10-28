# PR-T2 verify: Delete the parked consent tests

Card slug `pr-t2-consent-test-cuts-verify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-t2-consent-test-cuts-verify` (local branch `beta/pr-t2-consent-test-cuts-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-T2/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/vari8 --head beta/pr-t2-consent-test-cuts --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-t2-consent-test-cuts-verify && git fetch origin && git checkout --detach origin/beta/pr-t2-consent-test-cuts`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-T2 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prt2 LANE_PORT=3726 CARD=PR-T2 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-T2/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3726 with a fresh `app_verify_prt2` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-T2/<role>-<width>.png`.
4. Parity (D32) on none: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-T2/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/vari8 --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-T2/verdict.md`, where the first line is `SHIP PR-T2 <head sha>` or `FIX PR-T2 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prt2`, leave the worktree clean.

## Acceptance to check

- Suites pass with gates parked; no consent assertion remains outside the parked code.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-T2` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- none (foundation or tooling PR)

## TEST-AUDIT actions this PR executes

- `tests/integration/s1-d-consent.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/coaching-classification-actions.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/consent.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/crosssheet.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/gdpr-export.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/parameter-classification-dom.test.tsx`: CUT-AT-REPLACE in PR-04.
- `tests/unit/redact.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/retention.test.ts`: CUT-AT-REPLACE in PR-04.
- `tests/unit/source-data-policy.test.ts`: CUT-AT-REPLACE in PR-04.
