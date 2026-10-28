# PR-W6 build: Wire check-ins

Card slug `pr-w6-checkins`. Board `vari8`. Track Wiring. Depends on PR-W0, PR-M8, PR-M4, PR-MEDIA. Builder: Devin swe-2-max driven by yamato (driver deepseek-v4.1-flash). Issue created in driver step 2.
Repo `hanzlahsfc/vari8`. Worktree `/home/nexuslink/vari8-worktrees/pr-w6-checkins`, branch `beta/pr-w6-checkins` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prw6` on 127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first, RUNBOOK 'Local check'); dev port 3797. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-w6-checkins && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/vari8 --label vari8-beta --search "[PR-W6] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/vari8 --label vari8-beta --title "[PR-W6] Wire check-ins" --body-file icm/05-build/cards/pr-w6-checkins.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/vari8 --draft --base Vari8-Beta --head beta/pr-w6-checkins --title "[PR-W6] Wire check-ins" --body "Closes #<issue>. Card pr-w6-checkins. Plan section PR-W6 in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-w6-checkins && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-w6-checkins.md > /home/nexuslink/vari8-worktrees/pr-w6-checkins.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prw6 LANE_PORT=3797 CARD=PR-W6 icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-w6-checkins.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-w6-checkins.devin.log` and `pr-w6-checkins.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/itachi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/itachi/skills/codebase-precedent-research/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/how/SKILL.md`
- `/home/nexuslink/.hermes/profiles/itachi/skills/verification-before-completion/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/webapp-testing/SKILL.md`
- `/home/nexuslink/.hermes/profiles/zenitsu/skills/frontend-design/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-W6` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

Owner ruling O4 (owner, 2026-10-20, `icm/03-plan/output/WIRING-SPEC.md` "Owner rulings"): clients may not start a custom check-in; the client-side custom-start control is not wired and the server keeps CLIENT create denied on `checkinInstances`.

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

## Files

- `components/canvas/data/checkins.ts`
- `components/canvas/coach/check-ins.tsx`
- app/api/v1/** routes the screen calls
- their tests

## Build

- Board (week, month, agenda), filters, extra dates with timed restore, schedules with explicit generation and projection (D30), review workspace, visuals, video feedback, plan adjustments on explicit submit.
- Each screen keeps its exact markup; only the data provider and server calls change.
- The canvas demo data for this domain comes from the model PR's seed file; if a value the screen shows is missing, add it to that seed file in this PR.
- No `db/` edits (D34).

## Acceptance (you see)

- Two accounts complete schedule, submission, review and feedback; parity passes.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3797 against `app_prw6` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-W6/build/`.
- Parity (D32) on: `s03-checkins-board.png`, `s03-add-extra.png`, `s03-checkin-review.png`.
- Unit (D11, D14): Only keep-category tests (D14) for rules this PR adds; the screen is proven live.

## Report

Write `icm/05-build/reports/PR-W6.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
