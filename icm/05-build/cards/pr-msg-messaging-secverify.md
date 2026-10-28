# PR-MSG security verify: Messaging: domain, routes and the three canvas screens

Card slug `pr-msg-messaging-secverify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-msg-messaging-secverify` (local branch `beta/pr-msg-messaging-secverify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-MSG/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/vari8 --head beta/pr-msg-messaging --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-msg-messaging-secverify && git fetch origin && git checkout --detach origin/beta/pr-msg-messaging`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-MSG && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prmsg LANE_PORT=3780 CARD=PR-MSG icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-MSG/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3780 with a fresh `app_verify_prmsg` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-MSG/<role>-<width>.png`.
4. Parity (D32) on `s02-messages.png`, `s02-thread.png`, `s02-thread-attachments.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-MSG/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/vari8 --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-MSG/verdict.md`, where the first line is `SHIP PR-MSG <head sha>` or `FIX PR-MSG <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prmsg`, leave the worktree clean.

## Acceptance to check

- Coach and client exchange text, a voice note, a document and an image in two browser profiles; unread counts and the read check update; parity passes on the three screens.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-MSG` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S01-04: S01 MISSING: Nav count badges: pending check-ins and unread messages
- S01-30: S01 MISSING: Per-client "Allow priority flags" toggle (priority messages)
- S01-38: S01 MISSING: Store slices: messages + drafts + media attachments (owned by messages surface)
- S02-01: S02 MISSING: Conversations panel: search, All/Unread/Flagged tabs, per-client rows (avatar, name, last-message time, excerpt or "Draft:" prefix, unread b
- S02-02: S02 PARTIAL: Chat header: back button, avatar, athlete name + "label · phase" link to profile, thread-search toggle, context-panel toggle
- S02-03: S02 MISSING: Thread search bar + match count inside a conversation
- S02-04: S02 MISSING: Message thread: date dividers, text bubbles by sender, attachments via MediaCard, context links, per-message time, empty state
- S02-05: S02 CONFLICT: Read state: unread badges, auto mark-read on open, per-message "read" indicator with check icon on coach messages
- S02-06: S02 MISSING: Priority flag: flag toggle on client messages, priority bubble label, per-athlete priorityMessages permission + context-panel display; manag
- S02-07: S02 MISSING: Composer: textarea, Enter to send / Shift+Enter newline, Send button, per-client draft persistence (text + attachments + link survive naviga
- S02-09: S02 CONFLICT: Context links in composer and bubbles: "Link nutrition plan", "Link training program", "Link latest check-in", rendered as in-bubble nav but
- S02-10: S02 MISSING: Emoji picker (fixed 8-emoji grid inserting into draft)
- S02-11: S02 MISSING: Reusable replies menu (3 hardcoded SNIPPETS appended to draft)
- S02-12: S02 CONFLICT: Voice note button + dialog using DemoRecorder kind="voice" (synthesized demo wav, attach to draft)
- S02-13: S02 MISSING: "New message" scroll pill + per-thread scroll-position memory
- S02-14: S02 PARTIAL: AthleteContext side panel: avatar, name, "phase · Week n", next check-in + Open calendar, assigned template + tab count, priority permission
- S02-15: S02 MISSING: Coach availability caption under the Messages title ("Weekdays · 09:00–18:00")
- S02-16: S02 MISSING: Welcome/empty states: "A conversation, with the whole picture" panel and "Say hello to {name}" empty thread
- S02-26: S02 MISSING: Persisted workspace shape: messages, drafts, notes, todos, media metadata under localStorage key "coach-desktop-mockup-v1"; blobs are sessio
- V3-L1-Message: S02 MISSING: Message type has no backend model
- S03-20: S03 CONFLICT: Feedback lands in the client conversation as a message with links; "View in conversation"
- S11-13: S11 MISSING: Two-party chat: messages from "client"
- S11-14: S11 MISSING: Per-client permission toggle "Allow this client to flag a message for coach attention"

## Security focus

Run the security diff scan on the PR diff: authorization on every new route (D15 table), trust-boundary validation, token and upload handling, secrets in code or logs, audit metadata free of bodies. Findings rated by severity with file and line.
