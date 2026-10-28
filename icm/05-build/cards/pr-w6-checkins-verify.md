# PR-W6 verify: Wire check-ins

Card slug `pr-w6-checkins-verify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-w6-checkins-verify` (local branch `beta/pr-w6-checkins-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-W6/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/vari8 --head beta/pr-w6-checkins --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-w6-checkins-verify && git fetch origin && git checkout --detach origin/beta/pr-w6-checkins`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-W6 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prw6 LANE_PORT=3798 CARD=PR-W6 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-W6/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3798 with a fresh `app_verify_prw6` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-W6/<role>-<width>.png`.
4. Parity (D32) on `s03-checkins-board.png`, `s03-add-extra.png`, `s03-checkin-review.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-W6/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/vari8 --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-W6/verdict.md`, where the first line is `SHIP PR-W6 <head sha>` or `FIX PR-W6 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prw6`, leave the worktree clean.

## Acceptance to check

- Two accounts complete schedule, submission, review and feedback; parity passes.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W6` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-28: S01 PARTIAL: "Coaching rhythm" weekday toggles: multi-day recurring schedule effective tomorrow, history retained
- S01-29: S01 PARTIAL: Additional dates list + Add/Reschedule dialog (athlete, date, type Full/Custom, note to athlete, duplicate guard)
- S01-34: S01 PARTIAL: Check-ins tab: submission history rows (date, type, note/answer preview, status, open review)
- S01-37: S01 PARTIAL: Store slices: submissions + reviewDrafts + extras + schedules (owned by check-ins surface)
- V2-WS04: S03 PARTIAL: Check-in schedule card in setup page
- S03-01: S03 MISSING: Coach "Check-ins" page shell, one workspace-wide board for all athletes
- S03-02: S03 PARTIAL: Calendar board: Week 7-column, Month grid, Agenda list, prev/next/Today, per-day add buttons; events for every athlete in range
- S03-03: S03 PARTIAL: Filters: Athlete select, Status select, "Europe/Vienna · Monday first" caption
- S03-04: S03 UNCONFIGURED: "N awaiting feedback" pending count
- S03-05: S03 PARTIAL: Event status values: Scheduled / Overdue / Awaiting feedback / Feedback sent
- S03-06: S03 PARTIAL: Event chip: athlete avatar + name, "origin · type" label
- S03-07: S03 PARTIAL: Event detail popover: "Check-in details", date, status, Origin, Update rows, extra note, Open review/feedback, Open conversation, View athle
- S03-08: S03 PARTIAL: "Add extra date" dialog: athlete, date (min today), "Requested update" Custom/Full, note to athlete, duplicate guard
- S03-09: S03 PARTIAL: Reschedule additional date / Remove additional date with undo toast
- S03-10: S03 PARTIAL: Recurring weekly check-in schedule: weekday toggles, effective from tomorrow, history retained
- S03-11: S03 CONFLICT: Recurring occurrences auto-appear on the calendar derived from the schedule, unbounded horizon
- S03-12: S03 UNCONFIGURED: Review workspace mount via route.review deep link
- S03-13: S03 PARTIAL: "In X's words" answer list + athlete note
- S03-14: S03 MISSING: Submitted visuals grid + lightbox dialog
- S03-15: S03 PARTIAL: "Tracker & progress" panel inside review: parameter values, habit consistency, 7-day entries table
- S03-16: S03 MISSING: Flagged training notes panel (exercise, set, date, note, open training setup)
- S03-17: S03 PARTIAL: Sent-feedback view: text, sent date, "Sent locally" caption
- S03-18: S03 CONFLICT: Video feedback: DemoRecorder attach + MediaCard in draft and sent feedback
- S03-19: S03 CONFLICT: Plan adjustments bundled with feedback: Nutrition/Training activated cards, "Changes included with feedback" list, "View updated client plan
- S03-21: S03 MISSING: Composer draft auto-kept per submission ("Draft kept automatically. Opening a review does not mark it answered.")
- S03-22: S03 PARTIAL: "Submit feedback" single click marks the submission answered and sends
- S03-23: S03 UNCONFIGURED: Client fills and submits the check-in questionnaire (implied data source; canvas draws no client UI)
- S03-24: S03 UNCONFIGURED: Submission history list on client profile "Check-ins" tab (cross-surface, drawn in clients.tsx)
- S03-25: S03 PARTIAL: Check-in question set per template variant: label, type, required, options
- V3-CP15: S03 UNCONFIGURED: Check-in form preview in client preview
- R3-15: S03 UNWIRED: Map ordinary server rejection and stale/conflict states to canvas messages (check-in and onboarding writes)
- S11-20: S11 UNCONFIGURED: Client check-in submission + coach's returned feedback (awaiting feedback / feedback sent)
