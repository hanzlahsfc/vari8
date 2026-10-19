# PR-W2 verify: Wire the roster and the client profile

Card slug `pr-w2-roster-profile-verify`. Independent verifier on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-w2-roster-profile-verify` (local branch `beta/pr-w2-roster-profile-verify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-W2/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/The-great-tracker- --head beta/pr-w2-roster-profile --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-w2-roster-profile-verify && git fetch origin && git checkout --detach origin/beta/pr-w2-roster-profile`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-W2 && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prw2 LANE_PORT=3786 CARD=PR-W2 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-W2/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3786 with a fresh `app_verify_prw2` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-W2/<role>-<width>.png`.
4. Parity (D32) on `s01-roster.png`, `s01-profile-overview.png`, `s01-profile-plans.png`, `s01-profile-checkins.png`, `s01-profile-onboarding.png`, `s10-clients-studio.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-W2/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/The-great-tracker- --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-W2/verdict.md`, where the first line is `SHIP PR-W2 <head sha>` or `FIX PR-W2 <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prw2`, leave the worktree clean.

## Acceptance to check

- Seed the demo clients, archive one, reload: it leaves the roster and restores from the toast; parity passes on the profile screens.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W2` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-11: S01 MISSING: Toast notice with Undo action
- S01-14: S01 PARTIAL: Client roster list: all non-archived clients with avatar, name, label, phase/week, assignment, next check-in, attention signals
- S01-15: S01 MISSING: Roster search box (matches name, label, phase, assigned template name)
- S01-16: S01 MISSING: Roster filter select: All athletes / Needs attention / Unread messages
- S01-17: S01 MISSING: Roster sort select: Name / Attention / Next check-in
- S01-18: S01 MISSING: Table vs card view toggle
- S01-19: S01 PARTIAL: Roster columns "Assigned template" and "Next check-in", card "Coaching since"
- S01-21: S01 MISSING: Client edit/archive: canvas stores archived (consumed by roster/messages/notes filters) and name; no edit UI drawn
- S01-22: S01 PARTIAL: Client profile header: avatar, name, label, phase, week, email, coaching since, height cm, next check-in summary
- S01-23: S01 PARTIAL: Profile header actions: "Check-in calendar" and "Open chat" with unread count
- S01-24: S01 PARTIAL: Profile tab bar: Overview / Plans / Check-ins / Notes & tasks / Onboarding (via ?tab=)
- S01-25: S01 UNCONFIGURED: Overview "Client setup" card: current bodyweight stat
- S01-33: S01 PARTIAL: Client-assigned tasks: add (dueDate = today+7 fixed), list with checkbox, overdue/completed counts
- S01-35: S01 UNCONFIGURED: Onboarding tab: submitted onboarding Q&A retained with the profile
- V1-C6: S01 MISSING: Empty roster state, “No athletes match” with Clear filters
- V1-C7: S01 MISSING: Athlete not found state with Back to athletes
- S10-19: S10 UNWIRED: Clients studio page: roster (search, signals, attention), client profile editor, per-client tracker preview, onboarding invitation drafts, r
- S11-05: S11 PARTIAL: Client roster of "your athletes" (card/table list with phase, week, unread, overdue tasks, check-in state)
- S11-06: S11 PARTIAL: Client identity fields on profile header (email, coaching since, height)
- S11-11: S11 UNCONFIGURED: Client tasks assigned by coach, completed by client (due dates, open/overdue/complete)
- S11-15: S11 UNCONFIGURED: "Submitted onboarding" tab, client-submitted Q&A retained on the profile, coach reads them
- S11-21: S11 PARTIAL: Archived clients hidden from the roster

## Backend orphans this PR owns (delete or keep as each line says)

- S12-13: Onboarding form library + create/edit/preview. Evidence: `app/workspace/[workspaceId]/onboarding/forms/page.ts (keep; serves the canvas onboarding tab)
- S12-14: Onboarding form CRUD server actions. Evidence: `app/workspace/[workspaceId]/onboarding/actions.ts:158`. (keep; serves the canvas onboarding tab)
- S12-15: Onboarding form assignments + actions. Evidence: `app/workspace/[workspaceId]/onboarding/assignments/page.tsx: (keep; serves the canvas onboarding tab)
- S12-16: Staff onboarding-submission review. Evidence: `app/workspace/[workspaceId]/clients/[clientProfileId]/onboardin (keep; serves the canvas onboarding tab)
- S12-59: Onboarding form service. Evidence: `lib/onboarding/forms.ts:126`. (keep; serves the canvas onboarding tab)
- S12-60: Onboarding form boundary. Evidence: `lib/onboarding/forms-boundary.ts:1`. (keep; serves the canvas onboarding tab)
- S12-61: Onboarding assignment service. Evidence: `lib/onboarding/assignments.ts:237`. (keep; serves the canvas onboarding tab)
- S12-62: Onboarding assignment boundary. Evidence: `lib/onboarding/assignments-boundary.ts:80`. (keep; serves the canvas onboarding tab)
- S12-63: Onboarding assignment gate. Evidence: `lib/onboarding/assignments-gate.ts:1`. (keep; serves the canvas onboarding tab)
- S12-64: Onboarding submission review service. Evidence: `lib/onboarding/review.ts:379`. (keep; serves the canvas onboarding tab)
- S12-65: Onboarding review boundary. Evidence: `lib/onboarding/review-boundary.ts:83`. (keep; serves the canvas onboarding tab)

## Production-readiness P0 rows this PR owns (`icm/05-build/audits/PRODREADY-BASELINE.md`)

- PR-025: Apostrophes in names (UNVERIFIED): live probe: create a client named Siobhan O'Brien-Nunez with accents, view the profile and every list
