# PR-W6 report: wire check-ins

Card `pr-w6-checkins`, issue #146. Branch `beta/pr-w6-checkins`, base `3148df3`
(Vari8-Beta). Worktree `.worktrees/pr-w6-checkins`. Lane DB `app_w6` (native
Postgres on 127.0.0.1:5433), dev port 3970, parity port 3971.

Status: **PARTIAL**. Every local mechanism gate passes; parity does not (analysis
below, and it is not a check-ins regression). 18 free rows and 2 partials are
wired; the 12 `clients.tsx` rows are untouched by design.

## What changed

Transport plus call sites. No markup, class or visible copy change on the
check-in screens; the canvas keeps Lilly's structure.

### New REST surface (`app/api/v1/workspaces/[workspaceId]/checkins/`)

| Route | Methods | Boundary function |
|---|---|---|
| `_result.ts` | - | closed code -> HTTP status, `sessionOf(viewer)`, `readBody` |
| `schedule-rules` | GET, POST | `listCheckInScheduleRulesForClient`, `createCheckInScheduleRuleFromAction` |
| `schedule-rules/[ruleId]/status` | POST | `setCheckInScheduleRuleStatusFromAction` |
| `schedule-rules/[ruleId]/generate` | POST | `generateCheckInScheduleRuleInstancesFromAction` |
| `schedule-versions` | GET | `listSchedulableVersionsForClient` (Q10: restore needs a version id) |
| `instances` | GET, POST | `readStaffCheckInCalendar`, `scheduleCheckInInstanceFromAction` |
| `instances/[instanceId]/cancel` | POST | `cancelCheckInInstanceFromAction` |
| `submissions` | GET | `listStaffCheckInSubmissions` |
| `submissions/[submissionId]` | GET | `readStaffCheckInSubmissionDetail` |
| `submissions/[submissionId]/tracker-context` | GET | `readCheckInReviewTrackerContextFromAction` |
| `submissions/[submissionId]/review` | POST | `markCheckInSubmissionReviewedFromAction` |
| `submissions/[submissionId]/feedback` | POST | `sendCheckInFeedbackFromAction` |

Every route is `defineApiV1Route` with a Zod params/query/body schema and one
boundary call. `_result.ts` maps `denied`/`not_available` to 403,
`invalid_input` to 400, `already_submitted`/`consent_missing`/
`policy_not_configured`/`serialization_conflict`/`review_required`/
`idempotency_conflict` to 409. Failure bodies are `{ error: { code } }`, the
shape `components/canvas/data/http.ts` parses. No service function was invented;
every one exists at this base.

Capabilities are matrix cells that already exist: `plan.read` for check-in
schedule and calendar reads, `plan.write` for every staff write (denies CLIENT at
the edge, owner ruling O4), `clientData.read` for the submission reads. No new
capability, no `lib/auth` edit.

### Provider (`components/canvas/data/checkins.ts`)

`checkinsSlice` `extract`/`merge` are unchanged: the store hydration contract
does not move. Added on top:

- `loadCheckins` - per client, bounded calendar read + answer-free submission
  headers + schedule rules, folded into canvas shapes. A client the roster cannot
  resolve is reported in `failed`; a total failure throws so the board is left
  alone rather than blanked.
- `loadSubmissionAnswers` - the audited detail read (answers, media ids, sent
  body) for the open review.
- `cancelExtra` - cancel plus a restore callback that re-creates from the same
  form's latest published version.
- `sendFeedback` - review acknowledgement then feedback send with one
  `clientRequestId` per mounted review (the idempotency anchor).
- Pure helpers `foldScheduleRules`, `isRuleOccurrence`, `scheduleOn`,
  `weekdayIndex`, `viennaDate`, `recurringEventId`.

Mapping decisions that are inferences, not measured columns:
- origin: the staff instance DTO carries no origin column, so an instance is a
  recurring occurrence when its Europe/Vienna date matches the latest schedule
  segment in force, else Additional.
- type: no Full/Custom column (Q3), so a recurring occurrence renders Full and an
  additional date renders Custom, the labels the seed itself uses.

### Call sites (`components/canvas/coach/check-ins.tsx`)

- board: one range-scoped load effect; the visible range is shared with the
  render through `calendarRange`, so the read and the paint cannot disagree.
- "Remove additional date": server cancel with a real undo (re-create).
- review workspace: detail read that fills answers and visuals.
- "Submit feedback": review + send through `/api/v1`, then the existing local
  state update so the sent view appears immediately. A video-only draft stops
  with an honest toast because there is no video column (Q2).

## Commands and exit codes

Run from the worktree, `nice` on the heavy ones.

| Command | Exit |
|---|---|
| `npm ci` (root) | 0 |
| `npm ci` (frontend) | 0 |
| `npm run index` | 0 |
| `npm run index:check` | 0 |
| `npx prettier --check .` | 0 |
| `npm run typecheck` | 0 |
| `npm run lint` | 0 (0 errors, 80 pre-existing warnings) |
| `npm run test` | 0 (99 files, 1122 tests) |
| `npm run test:integration` (app_w6_it) | 0 (63 files, 879 tests) |
| `npm run build` (root, NODE_ENV unset) | 0 |
| `npm --prefix frontend run build` | 0 |
| `APP_ENV=test ENABLE_CHECK_INS=1 PARITY_PORT=3971 npm run parity` | 1 |

Integration runs against a disposable `app_w6_it`, not the lane `app_w6`: every
existing integration file starts with a `TRUNCATE`, so running the suite on the
lane database would delete the seeded canvas data the live check and parity need.
`vitest.integration.config.ts` states that intent ("a dedicated disposable
database ... never the application/E2E database").

## Parity: FAIL, and what the failure is

`npm run parity` at tolerance 0 (the default when `PARITY_AA_TOLERANCE` is unset)
reports 70 problems: every one of the 35 screens at both widths. That is not a
check-ins regression: screens this card cannot influence (`s05-templates`,
`s10-*`, `s11-*`) fail the same way with `geometry: 0 added, 0 removed, N moved`
and 90k-2.4M changed pixels - a pure translation of the whole page, i.e. the
`tools/parity/baseline` images were captured in a different rendering environment
than this Mac produces today.

The check-in screens, measured in the same run:

| Screen | Changed px @1440 | Geometry @1440 |
|---|---|---|
| `s03-checkins-board` | 231082 | 0 added, 0 removed, 64 moved, 2 text |
| `s03-add-extra` | 956757 | 0 added, 0 removed, 67 moved, 2 text |
| `s03-checkin-review` | 985920 | 63 added, 79 removed, 57 moved, 4 text; page 2159 -> 1922 |

The board and the add-extra dialog show the same pure translation as untouched
screens, so those two carry no content delta of their own. The review screen is a
real content delta: the seeded form has three questions plus the athlete note, and
the tracker panel has no parameter list because the server detail DTO carries no
`metrics` (Q11 keeps those values demo). Matching the demo baseline there needs
the check-in seed to carry the canvas question set and a metrics selection, which
is a seed change plus a baseline recapture, not a transport change.

To reproduce: `APP_ENV=test ENABLE_CHECK_INS=1 PARITY_PORT=3971 npm run parity`
(check-ins fails closed in production, so without `APP_ENV=test` every route
answers 403 and the run never exercises this wiring). Report:
`tools/parity/out/report.html`.

## Live check (real browser, real server)

Dev server on 127.0.0.1:3970 with `APP_ENV=test ENABLE_CHECK_INS=1` against
`app_w6`, signed in as the seeded owner, driven with Playwright at 1440x900 and
390x844.

- Board renders 17 server-backed chips at both widths, including
  "EA Emma Anders Recurring · Full Awaiting feedback"; pending count
  "2 awaiting feedback".
- Chip popover opens; "Open review" opens the review workspace with the answers
  the server returned ("How did you feel this week?", "How was your training?",
  "Anything you would like me to know?", "Athlete note").
- Captured API traffic: `GET /checkins/schedule-rules`, `/instances`,
  `/submissions`, `/submissions/:id` all 200 on the lane database.
- Screenshots: `Vari8-evidence/scratch/pr-w6-checkins/shots/board-1440.png`,
  `board-390.png`, `popover-1440.png`, `review-1440.png`.

## Tests and bites (D11/D14: rules a click cannot see)

`tests/unit/checkins-provider-map.test.ts` - 7 tests: Mon+Wed projection (D, D+2,
D+7, D+9 and nothing else), paused/ended rules stop projecting, latest-segment
selection, Europe/Vienna date mapping, event-id key, closed-code status table.

`tests/integration/checkin-routes.test.ts` - 4 tests on real Postgres with real
bearer sessions: CLIENT is denied the one-off instance route with a closed 403 and
zero rows; no credentials is 401; a scheduled instance round-trips through the
calendar read with its `dueAt` and `coachNote`; rule create generates zero
instances and two parallel `generate` calls never double-create.

Bites run and observed red:

| Mutation | Red test | Observed |
|---|---|---|
| `WEEKDAY_INDEX.MONDAY` 0 -> 1 | projects a Mon+Wed rule | `expected [1] to deeply equal [0]` |
| drop `status !== "ACTIVE"` guard | drops paused and ended rules | fold returned the paused weekday |
| `STATUS.denied` 403 -> 200 | closed-code mapping | `expected 200 to be 403` |
| POST capability `plan.write` -> `own.write` | CLIENT denied with closed 403 | body `not_available`, not `forbidden` |
| GET calendar returns `{items: []}` | instance round-trip | `expected undefined to be '2026-10-26T09:00:00.000Z'` |
| create route also calls generate (D30) | create generates zero | `expected 8 to be +0` |

All six mutations were reverted and the suites re-run green.

## Not done, and why

- 12 matrix rows live in `components/canvas/coach/clients.tsx`, which this card
  must not edit while owner rulings D1 and D2 are open: S01-28, S03-10 (weekday
  toggles), S01-34 and S03-24 (Check-ins tab), S03-08 (Add extra dialog - the
  trigger opens it, the writing dialog is in that file), V2-WS04 (setup card),
  S03-16 (no server field, Q5), S03-18 (no column, Q2), S03-19 (no route, Q6),
  S03-23 (no client UI, O4), S03-25 (no variant column, Q4), V3-CP15.
- S01-29 stays partial: list and remove are wired, the reschedule dialog writes
  from `clients.tsx` (D1).
- S03-15 stays partial by ruling Q11: the tracker panel keeps sample values and
  the server detail carries no `metrics` list.
- S03-21 (draft auto-kept per submission) still keeps the draft in canvas storage;
  the server has no draft column.

## Files

- `app/api/v1/workspaces/[workspaceId]/checkins/**` (12 files, new)
- `components/canvas/data/checkins.ts`
- `components/canvas/coach/check-ins.tsx`
- `tests/unit/checkins-provider-map.test.ts`,
  `tests/integration/checkin-routes.test.ts`
- `docs/index/ROUTES.md` (regenerated)
