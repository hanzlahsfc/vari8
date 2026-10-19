# PR-MSG build: Messaging: domain, routes and the three canvas screens

Card slug `pr-msg-messaging`. Board `vari8`. Track Wiring. Depends on PR-MEDIA, PR-M2, PR-W0, PR-SV1. Builder: Devin swe-2-max driven by yamato. Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-msg-messaging`, branch `beta/pr-msg-messaging` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prmsg` on 127.0.0.1:5433 user `app`; dev port 3779. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-msg-messaging && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-MSG] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-MSG] Messaging: domain, routes and the three canvas screens" --body-file icm/05-build/cards/pr-msg-messaging.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-msg-messaging --title "[PR-MSG] Messaging: domain, routes and the three canvas screens" --body "Closes #<issue>. Card pr-msg-messaging. Plan section PR-MSG in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-msg-messaging && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-msg-messaging.md > /home/nexuslink/vari8-worktrees/pr-msg-messaging.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prmsg LANE_PORT=3779 CARD=PR-MSG icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-msg-messaging.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-msg-messaging.devin.log` and `pr-msg-messaging.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

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

## Files

- `lib/messages/**`
- `app/api/v1/messages/**`
- `components/canvas/data/messages.ts`
- `components/canvas/coach/messages*.tsx`
- `scripts/seed/50-messages.seed.ts`

## Build

- Conversations, messages, drafts, read state, unread counts, priority flags with the per-client permission, context links, thread search (D20).
- Wire the messages section, the thread and the attachment picker; nav badges and the roster unread filter read the server counts.
- Feedback sent from a check-in review lands in the conversation with its links (S03-20).
- Seed the canvas demo conversations so parity compares like with like.

## Acceptance (you see)

- Coach and client exchange text, a voice note, a document and an image in two browser profiles; unread counts and the read check update; parity passes on the three screens.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3779 against `app_prmsg` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-MSG/build/`.
- Parity (D32) on: `s02-messages.png`, `s02-thread.png`, `s02-thread-attachments.png`.
- Unit (D11, D14): Isolation guard (client sees only own conversation); exactly-once send with a client request id.

## Report

Write `icm/05-build/reports/PR-MSG.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
