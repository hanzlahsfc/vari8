# PR-W6 report: wire check-ins

Card `pr-w6-checkins`, issue #146. Branch `beta/pr-w6-checkins`, base `3148df3`
(Vari8-Beta). Worktree `.worktrees/pr-w6-checkins`. Lane DB `app_w6` (native
Postgres on 127.0.0.1:5433), dev port 3970, parity port 3971.

Status: **PARTIAL**. Every local mechanism gate passes at this head (see the repair
run table). 18 free rows and 2 partials are wired; the 12 `clients.tsx` rows are
untouched by design. The check-in _board_ screens match base structurally; the review
screen no longer does, because the parameter rows and the flagged note it drew were
fabricated demo values and have been removed (see the repair section). No parity claim
is made for that screen at this head.

## Repair: fabricated review samples removed, real tracker read wired

The first build left the review screen 79 elements and 237 px short of base
(`63 added, 79 removed`, page 2159 -> 1922). Cause was data, not markup: the board's
server mapping built each submission with `metrics: []` and `flags: []`, so
"Tracker & progress" lost its four stat rows and the flagged-notes panel fell back to
its empty line. Base drew both from the canvas seed.

The first repair for that was wrong. It added `samplePanels(type)`, which read
`seedState()` submissions and spread their `metrics` and `flags` into every real
submission. That put demo numbers and demo flagged notes into a real athlete's review,
where a coach reads them as that athlete's data. It was justified with "owner ruling
Q11" and "Q5"; neither says that. Q5 (`icm/03-plan/DECISIONS.md` D23) is "ship an empty
template library", Q11 (D29) is "nutrition totals and training volume are computed as
the canvas shows", and `DECISIONS.md:160` lets the **development seed** load the canvas demo set
into the _database_ for parity, which is not the client fabricating it from the seed.
`samplePanels` is deleted.

What the review panel draws now (`components/canvas/data/checkins.ts`,
`components/canvas/coach/check-ins.tsx`):

- A real submission is built with `metrics: []` and `flags: []`. Nothing is borrowed
  from the seed.
- Parameter rows come from the real read the branch already serves:
  `GET /api/v1/workspaces/:id/checkins/submissions/:id/tracker-context` for the
  submission's own check-in date (`loadTrackerContext`). Each returned value renders as
  the panel's existing stat row (label, display, unit).
- A 403 `not_available` (no `DailyEntry` for that date) or a failed read draws the
  panel's existing empty branch, the `cd-muted` line. The lane seed has no `daily_entry`
  rows at all, so on `app_w6` every review shows the empty line today.
- The flagged-notes panel has no column and no route, so it draws its existing empty
  line. No values are invented for it.
- S03-15 therefore stays **PARTIAL**, and honestly so: real values when the athlete
  recorded that date, empty otherwise. The parity claim for this screen is withdrawn
  (see the parity section); removing demo content is a deliberate visible change.

`loadSubmissionAnswers` no longer maps a `kind: "visual"` field into `answers`. The
media field was drawing a second, empty Q&A ("Progress visuals / 2 visuals") above the
visuals grid that already renders those media. `SubmissionField` now carries `kind`.

## What changed

Transport plus call sites. No markup, class or visible copy change on the
check-in screens; the canvas keeps Lilly's structure.

### New REST surface (`app/api/v1/workspaces/[workspaceId]/checkins/`)

| Route                                        | Methods   | Boundary function                                                          |
| -------------------------------------------- | --------- | -------------------------------------------------------------------------- |
| `_result.ts`                                 | -         | closed code -> HTTP status, `sessionOf(viewer)`, `readBody`                |
| `schedule-rules`                             | GET, POST | `listCheckInScheduleRulesForClient`, `createCheckInScheduleRuleFromAction` |
| `schedule-rules/[ruleId]/status`             | POST      | `setCheckInScheduleRuleStatusFromAction`                                   |
| `schedule-rules/[ruleId]/generate`           | POST      | `generateCheckInScheduleRuleInstancesFromAction`                           |
| `schedule-versions`                          | GET       | `listSchedulableVersionsForClient` (Q10: restore needs a version id)       |
| `instances`                                  | GET, POST | `readStaffCheckInCalendar`, `scheduleCheckInInstanceFromAction`            |
| `instances/[instanceId]/cancel`              | POST      | `cancelCheckInInstanceFromAction`                                          |
| `submissions`                                | GET       | `listStaffCheckInSubmissions`                                              |
| `submissions/[submissionId]`                 | GET       | `readStaffCheckInSubmissionDetail`                                         |
| `submissions/[submissionId]/tracker-context` | GET       | `readCheckInReviewTrackerContextFromAction`                                |
| `submissions/[submissionId]/review`          | POST      | `markCheckInSubmissionReviewedFromAction`                                  |
| `submissions/[submissionId]/feedback`        | POST      | `sendCheckInFeedbackFromAction`                                            |

Every route is `defineApiV1Route` with a Zod params/query/body schema and one
boundary call. `_result.ts` maps `denied`/`not_available` to 403,
`invalid_input` to 400, `already_submitted`/`consent_missing`/
`policy_not_configured`/`serialization_conflict`/`review_required`/
`idempotency_conflict` to 409. Failure bodies are `{ error: { code } }`, the
shape `components/canvas/data/http.ts` parses. No service function was invented;
every one exists at this base. `submissions/[submissionId]/tracker-context` now has a
client caller: `loadTrackerContext` in the review panel.

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
- `loadTrackerContext` - the explicit `DailyEntry` tracker read for one
  submission's check-in date; a missing entry is the route's 403 `not_available`
  and rejects, so the caller draws its empty branch.
- `cancelExtra` - cancel plus a restore callback that re-creates from the same
  form's latest published version.
- `sendFeedback` - review acknowledgement then feedback send with one
  `clientRequestId` per mounted review (the idempotency anchor).
- Pure helpers `foldScheduleRules` (ACTIVE rows only: the forward projection),
  `foldScheduleHistory` (every row: classification), `isRuleOccurrence`,
  `scheduleOn`, `weekdayIndex`, `viennaDate`, `recurringEventId`.

Mapping decisions that are inferences, not measured columns:

- origin: the staff instance DTO carries no origin column, so an instance is a
  recurring occurrence when its Europe/Vienna date matches the latest schedule
  segment in force, else Additional.
- type: no Full/Custom column (Q3), so a recurring occurrence renders Full and an
  additional date renders Custom, the labels the seed itself uses.
- lifecycle: the projection folds ACTIVE rules only, but classification folds
  every rule whatever its `status`. An instance generated under a since-PAUSED or
  ENDED rule is still that rule's occurrence; filtering by status while
  classifying turned its history into removable Custom rows with Custom chips.

### Call sites (`components/canvas/coach/check-ins.tsx`)

- board: one range-scoped load effect; the visible range is shared with the
  render through `calendarRange`, so the read and the paint cannot disagree. A
  `reload` counter in the effect dependencies is bumped after a cancel or a
  restore, so the undo actually re-fetches instead of just clearing the range ref.
- "Remove additional date": server cancel with a real undo (re-create), each side
  followed by a re-fetch.
- review workspace: detail read that fills answers and visuals, plus the tracker
  read that fills the parameter rows for the check-in date.
- "Submit feedback": review + send through `/api/v1`, then the existing local
  state update so the sent view appears immediately. A video-only draft stops
  with an honest toast because there is no video column (Q2).

## Commands and exit codes

Run from the worktree, `nice` on the heavy ones.

| Command                                                           | Exit                                   |
| ----------------------------------------------------------------- | -------------------------------------- |
| `npm ci` (root)                                                   | 0                                      |
| `npm ci` (frontend)                                               | 0                                      |
| `npm run index`                                                   | 0                                      |
| `npm run index:check`                                             | 0                                      |
| `npx prettier --check .`                                          | 0                                      |
| `npm run typecheck`                                               | 0                                      |
| `npm run lint`                                                    | 0 (0 errors, 80 pre-existing warnings) |
| `npm run test`                                                    | 0 (99 files, 1122 tests)               |
| `npm run test:integration` (app_w6_it)                            | 0 (63 files, 879 tests)                |
| `npm run build` (root, NODE_ENV unset)                            | 0                                      |
| `npm --prefix frontend run build`                                 | 0                                      |
| `APP_ENV=test ENABLE_CHECK_INS=1 PARITY_PORT=3971 npm run parity` | 1                                      |

Integration runs against a disposable `app_w6_it`, not the lane `app_w6`: every
existing integration file starts with a `TRUNCATE`, so running the suite on the
lane database would delete the seeded canvas data the live check and parity need.
`vitest.integration.config.ts` states that intent ("a dedicated disposable
database ... never the application/E2E database").

### Repair run (this head)

Same worktree, rerun after the repairs in this branch's last commit:

| Command                                                       | Exit                                   |
| ------------------------------------------------------------- | -------------------------------------- |
| `npx --no-install prettier --check .` (repo root)             | 0                                      |
| `npm run typecheck`                                           | 0                                      |
| `npm run lint`                                                | 0 (0 errors, 80 pre-existing warnings) |
| `npm run index`                                               | 0 (no file changed)                    |
| `npm run index:check`                                         | 0                                      |
| `npm run test` (the unit suite; this repo has no `test:unit`) | 0 (99 files, 1123 tests)               |
| `npm run test:integration` (app_w6_it)                        | 0 (63 files, 879 tests)                |

The integration run needs `INTEGRATION_DATABASE_URL` pointing at the disposable
database with the password **percent-encoded**. The Prisma CLI expands `${...}` in a
`DATABASE_URL` it reads (the lane password contains those characters), so a plain URL
reaches the server corrupted and every suite dies in `beforeAll` at
`prisma migrate deploy` with `P1000`. A runtime `PrismaClient` given the same URL through
the environment is unaffected, which is why only the CLI path bit.

## Parity: FAIL, and what the failure is

**Superseded.** The measurements in this section were taken on the previous head. The
first repair reached `0 added, 0 removed` on `s03-checkin-review` by injecting demo
values, so that number described a screen showing fabricated data. It no longer applies:
the parameter rows are now real (empty on the lane seed, which has no `daily_entry`
rows), and the review screen deliberately differs from base in exactly those rows. No
new parity run is claimed here; the card stays PARTIAL for that screen.

The general `npm run parity` failure mode below is still what that run shows.

`npm run parity` at tolerance 0 (the default when `PARITY_AA_TOLERANCE` is unset)
reports 70 problems: every one of the 35 screens at both widths. That is not a
check-ins regression: screens this card cannot influence (`s05-templates`,
`s10-*`, `s11-*`) fail the same way with `geometry: 0 added, 0 removed, N moved`
and 90k-2.4M changed pixels - a pure translation of the whole page, i.e. the
`tools/parity/baseline` images were captured in a different rendering environment
than this Mac produces today.

The check-in screens, measured in the same run:

| Screen               | Changed px @1440 | Geometry @1440                                           |
| -------------------- | ---------------- | -------------------------------------------------------- |
| `s03-checkins-board` | 232005           | 0 added, 0 removed, 62 moved, 2 text                     |
| `s03-add-extra`      | 958770           | 0 added, 0 removed, 66 moved, 2 text                     |
| `s03-checkin-review` | 587699           | 0 added, 0 removed, 127 moved, 6 text; page 2159 -> 2182 |

Before the repair the review row read, verbatim:

```text
s03-checkin-review@1440 /coach 985920 63/79 page size 1440,2159 -> 1440,1922; 985920 changed pixels; geometry: 63 added, 79 removed, 57 moved; text: 4 changed
s03-checkin-review@390 /coach 548946 63/79 page size 390,3103 -> 390,2836; 548946 changed pixels; geometry: 63 added, 79 removed, 69 moved; text: 4 changed
```

After:

```text
s03-checkin-review@1440 /coach 587699 0/0/127 page size 1440,2159 -> 1440,2182; 587699 changed pixels; geometry: 0 added, 0 removed, 127 moved; text: 6 changed
s03-checkin-review@390 /coach 266822 0/0/139 page size 390,3103 -> 390,3120; 266822 changed pixels; geometry: 0 added, 0 removed, 139 moved; text: 6 changed
```

What is left on that screen is content, not structure: the 6 text changes are the two
owner-ruled shell strings, the pending count (`2` -> `3`, the server has one more waiting
feedback), the rating display (`8 / 10, feeling stronger` -> `8 / 10`), the note heading
(`Athlete note` -> `Your note`, the server field label) and the video button caption. The
22.5 px taller page comes from the visuals captions: the server carries media ids
(`seed-m8-media-emma-1`), which wrap to two lines where base's `Front · 12 October` fit
on one. Both are honest server values; inventing captions to match the baseline would be
the guess Q11 forbids.

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

That pass belongs to the previous head. On the repaired head the review panel's tracker
rows were **not** re-driven in a browser; the evidence for them is static plus data:
`loadTrackerContext` calls the route with the submission's `entryDate`, and a psql count
on `app_w6` shows zero `daily_entry` rows, so the empty branch is what the lane database
produces today. The route itself is covered by
`tests/integration/p025d6-checkin-tracker-context.test.ts` (35 tests, green in the
integration run above).

## Tests and bites (D11/D14: rules a click cannot see)

`tests/unit/checkins-provider-map.test.ts` - 8 tests: Mon+Wed projection (D, D+2,
D+7, D+9 and nothing else), paused/ended rules stop projecting, a paused rule's
history still classifying as a rule occurrence, latest-segment selection, Europe/Vienna
date mapping, event-id key, closed-code status table.

The classification test is the one that keeps the lifecycle filter out of the
classification path: it asserts `isRuleOccurrence(foldScheduleHistory([PAUSED WED]), ...)`
is true. Re-adding a status filter inside `foldScheduleHistory` turns it red with
`expected false to be true`; the projection test still passes, because the filter is
supposed to live only in `foldScheduleRules`.

`tests/integration/checkin-routes.test.ts` - 4 tests on real Postgres with real
bearer sessions: CLIENT is denied the one-off instance route with a closed 403 and
zero rows; no credentials is 401; a scheduled instance round-trips through the
calendar read with its `dueAt` and `coachNote`; rule create generates zero
instances and two parallel `generate` calls never double-create.

Bites run and observed red:

| Mutation                                       | Red test                           | Observed                                              |
| ---------------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `WEEKDAY_INDEX.MONDAY` 0 -> 1                  | projects a Mon+Wed rule            | `expected [1] to deeply equal [0]`                    |
| drop the ACTIVE filter in `foldScheduleRules`  | drops paused and ended rules       | fold returned the paused weekday                      |
| add the ACTIVE filter to `foldScheduleHistory` | classifies a paused rule's history | `expected false to be true`                           |
| `STATUS.denied` 403 -> 200                     | closed-code mapping                | `expected 200 to be 403`                              |
| POST capability `plan.write` -> `own.write`    | CLIENT denied with closed 403      | body `not_available`, not `forbidden`                 |
| GET calendar returns `{items: []}`             | instance round-trip                | `expected undefined to be '2026-10-26T09:00:00.000Z'` |
| create route also calls generate (D30)         | create generates zero              | `expected 8 to be +0`                                 |

All mutations were reverted and the suites re-run green. The last classification bite
was run on this head: its red output was `expected false to be true`.

## Not done, and why

- 12 matrix rows live in `components/canvas/coach/clients.tsx`, which this card
  must not edit while owner rulings D1 and D2 are open: S01-28, S03-10 (weekday
  toggles), S01-34 and S03-24 (Check-ins tab), S03-08 (Add extra dialog - the
  trigger opens it, the writing dialog is in that file), V2-WS04 (setup card),
  S03-16 (no server field, Q5), S03-18 (no column, Q2), S03-19 (no route, Q6),
  S03-23 (no client UI, O4), S03-25 (no variant column, Q4), V3-CP15.
- S01-29 stays partial: list and remove are wired, the reschedule dialog writes
  from `clients.tsx` (D1).
- S03-15 stays PARTIAL: the tracker panel draws the athlete's real DailyEntry values for
  this check-in date when the explicit tracker read returns them, and its empty line when
  the route answers `not_available` (no entry for that date) or the read fails. On the
  lane seed there are no `daily_entry` rows, so it draws the empty line. It no longer
  draws the canvas demo numbers.
- S03-16 stays MISSING: there is no flagged-note column and no route, so the panel draws
  its empty line. It no longer draws base's demo card.
- S03-21 (draft auto-kept per submission) still keeps the draft in canvas storage;
  the server has no draft column.

## Files

- `app/api/v1/workspaces/[workspaceId]/checkins/**` (12 files, new)
- `components/canvas/data/checkins.ts`
- `components/canvas/coach/check-ins.tsx`
- `tests/unit/checkins-provider-map.test.ts`,
  `tests/integration/checkin-routes.test.ts`
- `docs/index/ROUTES.md` (regenerated)
