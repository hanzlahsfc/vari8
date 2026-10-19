# PR-W5 verify: Wire habits

Card slug `pr-w5-habits-verify`. Independent verifier on a different model than the builder (devin/swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-w5-habits-verify` (local branch `beta/pr-w5-habits-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-W5/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-w5-habits --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-w5-habits-verify && git fetch origin && git checkout --detach origin/beta/pr-w5-habits`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-W5 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prw5 LANE_PORT=3795 CARD=PR-W5 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-W5/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3795 with a fresh `app_verify_prw5` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-W5/<role>-<width>.png`.
4. Parity (D32) on `s04-habit-editor.png`, `s04-template-habits.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-W5/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-W5/verdict.md`, where the first line is `SHIP PR-W5 <head sha>` or `FIX PR-W5 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prw5`, leave the worktree clean.

## Acceptance to check

- An unscheduled habit cannot be toggled; a scheduled one persists after reload; parity passes.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W5` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S04-01: S04 UNCONFIGURED: Habits tab header: title, today's date line, "N of M checked today"
- S04-02: S04 UNCONFIGURED: Week strip, Mon-Sun, today highlighted
- S04-03: S04 UNCONFIGURED: Filter buttons All / To do / Done + filtered-empty block
- S04-04: S04 PARTIAL: Habit row: name, "frequency · goal" line, reason paragraph, state pill
- S04-05: S04 UNCONFIGURED: Done toggle button with animated check (Mark done / Undo)
- S04-06: S04 UNCONFIGURED: Empty states: "No habits set up / defined in client setup" and filtered-empty "Show all habits"
- S04-07: S04 PARTIAL: "Recorded completions" aside: per-habit cumulative completed count + frequency/goal + "dated habit history is not available" note
- S04-08: S04 PARTIAL: Coach habit manager: list with "{n} completions", add/edit form (name, frequency, goal, reason), archive to retiredHabits
- S04-10: S04 MISSING: "Include habit status in check-ins" toggle + check-in review row "Habit consistency X / 7 days"
- S04-11: S04 UNCONFIGURED: Plans-summary "Habits" module row (count, "Edit/Configure habits" nav) gated on setup.habits; disabled-state empty "Habit Tracker is not ena
- S04-12: S04 PARTIAL: Persisted canvas shape: CoachClient.habits[] + retiredHabits[] inside coach-desktop-mockup-v1 localStorage state
- S07-19: S07 UNWIRED: Habits editor card (shared file, habits surface overlap): name/frequency/goal/reason, retire to retiredHabits
