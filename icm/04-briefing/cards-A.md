# Vari8 briefing cards, lane A: shell and roster, messages, check-ins, habits

One card per screen group. Readiness counts are per surface, taken from the matrix rows in `icm/02-gap-matrix/output/viz/matrix.json` (round-3 rows included, rows tagged to a different surface excluded).

## Coach shell, client roster and client profile

Verdict: The backend has a scoped, audited roster and sub-pages for each client, but a client record holds only a name, so phase, week, archive state and attention need a bigger client model before the roster can match the screen.
Readiness: switch on 3 · connect 1 · reshape 21 · build 20 · your call 0
What works already:

- Client roster page, scoped and audited: owners see the workspace, coaches see assigned clients (`app/workspace/[workspaceId]/clients/page.tsx`, `lib/workspace/clients.ts`).
- Role-aware workspace shell with session check and navigation (`app/workspace/[workspaceId]/layout.tsx`, `components/workspace-nav.tsx`).
- Client sub-pages for check-ins, onboarding, daily entries, meal plan, training program and dashboard (`app/workspace/[workspaceId]/clients/[clientProfileId]/`).
  The real work:
- Grow the client record: label, phase, week, avatar, email, coaching-since, height and an archive flag on `ClientProfile` (`db/schema.prisma:290`, `lib/workspace/clients.ts`). Today it has id, workspace, user, name and timestamps only.
- Roster search, filter and sort. The list is ordered by id only (`lib/workspace/roster-query.ts`). "Needs attention" needs counts from pending check-ins, overdue tasks and unread messages. Keep the assigned-only coach scope (`lib/workspace/clients.ts:104-121`); the canvas shows every client.
- Switch on the flagged reads the roster and profile need: template assignment (`ENABLE_CLIENT_SETUP`), next check-in (`ENABLE_CHECK_INS`), bodyweight (`ENABLE_DAILY_ENTRY`). All three are commented out in `.env.example`.
  Blocked on you:
- Should a coach see only the clients assigned to them, or every client in the workspace? The canvas shows all; the backend shows assigned clients only. (Default: assigned only, the backend rule.)
  Start here: PR-W2 (roster and profile). Depends on PR-M1, PR-SV1, PR-SV4 and PR-W1 (the shell). First file: `frontend/src/components/coach/clients.tsx`.
  Screenshot: `/coach?section=clients` for the roster. Click a client row for the profile at `/coach?section=clients&client=<id>`, then the profile tabs.

## Messages and Notes & to-dos

Verdict: These are the furthest from the backend: there is no conversation, note, to-do or file model yet, and the chat and file parts wait on owner decisions.
Readiness: switch on 0 · connect 1 · reshape 3 · build 21 · your call 6
What works already:

- Staff feedback on a reviewed check-in, plain text and append-only. It is the nearest thing to a message today (`db/schema.prisma` model `CheckInFeedback`, `components/checkin/feedback-thread.tsx`).
- Tasks a coach assigns and a client completes, with undo (`lib/tasks/service.ts`).
- Permission rules for coach notes: coaches write on assigned clients, clients see nothing (`lib/auth/rbac.ts:212-219`).
  The real work:
- Messaging is a new domain: conversations, messages, read state, priority flags and drafts, limited to assigned coaches and audited. Nothing in `db/schema.prisma` yet; it needs a new `lib/messages/` service.
- Coach notes and coach-only to-dos need their own tables and service. Do not reuse client tasks for them: the client sees those and can tick them (`lib/tasks/service.ts`).
- Files: `lib/storage.ts` has no vendor and cannot create download links, and media retention is not set (`lib/gdpr/retention.ts:56`). Audio and video stay out until that is settled.
  Blocked on you:
- Approve text-only messaging for a first release, with plan links, attachments and voice held back? (Default: messaging stays hidden.)
- Should coaches see a read tick on messages the client has opened? (Default: no. The thread shows sent only.)
  Start here: PR-W10 (notes and appearance). Depends on PR-M2, PR-M3 (notes model) and PR-W1. First file: `frontend/src/components/coach/notes.tsx`. Messaging waits on its own PR and the decision above.
  Screenshot: `/coach?section=messages` for Messages (click a client row to open the thread). `/coach?section=notes` for Notes & to-dos.

## Check-ins: calendar and review

Verdict: Most of the check-in backend exists, but it sits behind a feature switch that is off in normal runs, and the calendar reads one athlete at a time, so the all-athletes board is new work.
Readiness: switch on 5 · connect 1 · reshape 14 · build 4 · your call 4
What works already:

- Per-client check-in calendar and review page, with consent-checked, audited reads (`app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/page.tsx`, `lib/checkin/instances-boundary.ts`).
- Recurring schedule rules, one-off extra dates and cancel, with audit and locking (`lib/checkin/schedules.ts`, `lib/checkin/instances.ts`).
- Client fill-in and submit flow, plus the staff feedback thread (`app/(tracker)/workspace/[workspaceId]/check-ins/`, `components/checkin/feedback-thread.tsx`).
  The real work:
- Switch the whole feature on: every check-in piece needs `ENABLE_CHECK_INS=1` and a dev or test runtime (`lib/checkin/forms-gate.ts:44-48`). Production stays closed by design.
- All-athletes calendar: the backend reads one client at a time (`lib/checkin/instances-boundary.ts:218-241`). A workspace-wide read is needed, and fan-out is still an open owner choice.
- Missing fields: a coach note on each date, origin and type labels, a rating answer type, a metrics checklist and a feedback draft (`db/schema.prisma` model `CheckInInstance`, `lib/checkin/forms.ts:50-89`).
  Blocked on you:
- Should check-in dates be generated on purpose by a coach, or appear by themselves from the weekly rule? The backend generates up to 56 days ahead, on request. (Default: on purpose, as the backend does now.)
- Should feedback stay text only, or may it carry a video and plan changes with links? (Default: text only.)
  Start here: PR-W6 (check-ins). Depends on PR-M8, PR-W3 (templates and setup) and PR-W1. First file: `frontend/src/components/coach/check-ins.tsx`.
  Screenshot: `/coach?section=check-ins` for the board. Click an event to open its review at `/coach?section=check-ins&review=<id>`.

## Habits tab

Verdict: This is the closest of the four: the habit backend and both client-dashboard widgets already run in development, so the gap is mostly the feature switch plus a few fields.
Readiness: switch on 7 · connect 0 · reshape 5 · build 1 · your call 0
What works already:

- Client's habits for today and the week's consistency, with mark done and undo, on the client dashboard (`app/(tracker)/workspace/[workspaceId]/dashboard/client-habits-widget.tsx`, `client-consistency-widget.tsx`).
- Habit service: create, edit and archive with version checks, and one logged state per habit per day (`lib/habits/service.ts`, `lib/habits/boundary.ts`, `db/schema.prisma` model `Habit`).
- Coach habit panel on the client dashboard, with a weekday picker and a reload when someone else changed the habit (`app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/client-habits-panel.tsx`).
  The real work:
- The feature gate: habits run only when `ENABLE_CLIENT_DASHBOARD` is `1` and the runtime is development or test (`lib/dashboard/gate.ts:17-22`). The flag is not in `.env.example`. Turning it on for real use is an owner call, not a code change.
- The canvas lets a client tick any habit today, but the backend logs only scheduled days (`lib/habits/service.ts:759-763`). Filter the list to today's habits, or disable the toggle on unscheduled ones.
- Missing fields: a reason line, a separate frequency and goal (the backend stores one target text, `db/schema.prisma` model `Habit`), and an all-time count per habit (the backend reads the last 12 weeks only, `lib/habits/date.ts:136-147`).
  Blocked on you:
- None. This screen has no conflict or roles rows. The gate above is still an owner call.
  Start here: PR-W5 (habits). Depends on PR-M7 (habit fields) and PR-W1. First file: `frontend/src/components/coach/habits-tab.tsx`.
  Screenshot: `/coach?section=clients`, open a client, click "Preview assigned tool", then the Habits tab. The tab only appears when the assigned template turns habits on.

## Self-check

Checked by script against `icm/02-gap-matrix/output/viz/matrix.json` and `icm/03-plan/output/PLAN.md`, and by hand against the surface files.

1. Readiness equals matrix counts for each card's surface: PASS.
   - Coach shell, roster and profile (surface S01): switch on 3, connect 1, reshape 21, build 20, your call 0. Total 45.
   - Messages and Notes & to-dos (S02): 0, 1, 3, 21, 6. Total 31.
   - Check-ins (S03): 5, 1, 14, 4, 4. Total 28.
   - Habits (S04): 7, 0, 5, 1, 0. Total 13.
   - Totals equal the row count for each surface. The per-surface files (F1 S01 to S04) show older, smaller totals (41, 26, 25, 13); matrix.json is the count source here.
2. Every "Start here" PR id exists in PLAN.md: PASS. Ids used: PR-W2, PR-W10, PR-W6, PR-W5, plus their dependencies (PR-M1, PR-M2, PR-M3, PR-M7, PR-M8, PR-SV1, PR-SV4, PR-W1, PR-W3). First files exist in the merge tree at 58eb6ed.
3. No internal ids in Verdict, What works already, or The real work: PASS (scanned for surface, row, round, decision and PR-style ids).
4. Each card has max 3 bullets under What works and The real work, and max 2 questions under Blocked on you: PASS.
5. "Blocked on you" traces to conflict or roles rows:
   - Coach shell: roles row R3-25 (workspace-wide roster or assigned scope). It is tagged to the roles group, so it is not in the 45 surface rows. Surface readiness stays 0 for "your call".
   - Messages and Notes: conflict rows S02-05, S02-08, S02-09, S02-12, S02-24, S02-25. Question 1 covers S02-08, S02-09, S02-12, S02-24, S02-25. Question 2 covers S02-05.
   - Check-ins: conflict rows S03-11 (question 1), S03-18, S03-19, S03-20 (question 2).
   - Habits: no conflict or roles rows. "None" is correct.
6. Known gaps, not blocking the cards:
   - Each card covers one surface, so the roster and profile share a card, and so do messages and notes. Screenshot lines name every route. Surfaces hold several screens each.
   - The counts include rows added after the per-surface files were written: S01 has four extra rows (V1-C6, V1-C7, V3-L1-CoachState, R3-1), S02 has five (V1-X2 and four V3-L1 rows), S03 has three (V2-WS04, V3-CP15, R3-15).
   - The matrix lists no parked consent rows for these four surfaces. S02-24 keeps its conflict status even though part of its reason is consent. Its question is phrased around storage and attachments, not consent.
