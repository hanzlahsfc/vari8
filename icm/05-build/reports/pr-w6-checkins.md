# PR-W6 check-ins: RUN52 repair report

Repair round on `beta/pr-w6-checkins` (PR #147) after the independent pre-verify
`PREVERIFY-RUN52-pr-w6-checkins.md` (head `c0b0291`). Base `Vari8-Beta` at `09b1424`.
Worktree `.worktrees/pr-w6-checkins`. Lane database `app_prw6` on `127.0.0.1:5433`
(migrated and seeded this round: `npx prisma migrate deploy`, `npm run seed:dev`),
dev server on 3970, parity on 3971. No `lib/`, `db/`, `frontend/`, CSS or
`docs/STATUS.md` change.

## What changed

`components/canvas/data/checkins.ts`

- **B1, cancelled rows came back as extras.** `loadCheckins` pushed every calendar
  row into `extras` without reading `item.state`. The remove handler cancels
  server-side and calls `reloadRange()`, so the chip it had just removed returned
  on that very reload. Fixed with `if (item.state === "CANCELLED") continue;`
  before the fold and the classification, which also keeps the row out of the
  `instances` map a cancel restores from. `InstanceItem.state` was already typed
  and already carried by the DTO (`lib/checkin/instances.ts:1197`); no server or
  interface change was needed.
- **B2, "Feedback sent" was unreachable after a reload.** `reviewedAt` was typed
  (`:98`) and never read, and the board status derives from `submission.response`
  (`model.ts:1038`), so every answered check-in rendered "Awaiting feedback" and
  counted into "N awaiting feedback". The submissions DTO does carry the field
  (verified live, see below), so the push block now maps it to
  `response: { text: "", changes: [], date: <reviewed local date> }`. The detail
  read still fills the real body when the review is opened.
- **MAJOR-3, range bounds.** `from`/`to` were `${date}T00:00:00Z`, which is 02:00
  Vienna in summer and 01:00 in winter, so a check-in due in the first hours of the
  first visible day was never read. Both bounds are now Vienna midnights through
  the repo's existing DST-aware `resolveLocalInstant` (`lib/checkin/timezone.ts`,
  imported, not edited), so no new dependency and no hand-rolled offset.
- **MAJOR-1, a failed client erased that athlete's rows.** `mergeCheckinLoad` (new,
  pure, exported for the unit test) merges per client: a client named in
  `loaded.failed` keeps its previous extras and submissions, everything else is
  replaced, and an open review's loaded answers survive the refresh.
  `check-ins.tsx` calls it and the old `mergeLoadedSubmissions` is gone.

`components/canvas/coach/check-ins.tsx`

- Uses `mergeCheckinLoad` and maps `loaded.failed` names to canvas client ids.
- **NEW BLOCKER found this round, not in the pre-verify: the first load never
  landed.** The effect set `loadedRange.current = key` _before_ fetching and
  dropped the result when `live` was already false. React's double-invoked dev
  effects clean the first run up, the retry then early-returns on the range guard,
  and the board stayed on the canvas demo state until the user moved the week.
  Proof before the fix: the first paint carried demo ids (`extra-emma`,
  `submission-emma`) and the remove button answered "This additional date could
  not be removed" because `instances.current` was empty; after clicking prev and
  next once, the same board carried `seed-m8-*` ids and the cancel worked. Fixed
  by marking the range read only once a load has been applied.

`tests/unit/checkins-provider-map.test.ts`

Four tests for the four rules a click cannot see, all with literal assertions:
cancelled rows are not extras, a reviewed submission reads as "Feedback sent"
(asserted through `eventsBetween`, the board's own status rule), the range query
carries Vienna midnights in both CEST (`2026-10-11T22:00:00.000Z`) and CET
(`2026-11-30T23:00:00.000Z`), and a failed client keeps its rows.

## Deferred

- **MAJOR-2 (cancelled recurring occurrences still project).** The projection in
  `components/canvas/coach/model.ts:eventsBetween` is date-based and `Schedule`
  has no exclusion, so a cancelled generated occurrence keeps painting as
  Scheduled. The fix needs a per-client cancelled-date set in the slice and a
  subtraction in `eventsBetween`, i.e. `model.ts`, which is not in this card's
  Files list. Latent today: the board only offers "Remove additional date" for
  rows that are not rule occurrences, so no UI path cancels a recurring
  occurrence yet. Recorded here rather than half-fixed.
- **B2 residual.** `reviewedAt` means the review was acknowledged, not that the
  feedback row was delivered. `sendFeedback` posts review then feedback; if the
  second POST fails, the board would read "Feedback sent" with an empty body. The
  honest field is a feedback-presence flag on the header DTO
  (`lib/checkin/instances.ts:1946`), which is outside this card's Files list and
  was explicitly out of scope for this round.
- **Pre-existing, unchanged:** the roster is `?limit=100` and matched by display
  name, so clients past 100 or with duplicate names never load; `dueTz` is
  ignored and every date is Vienna. Both predate this PR.

## Live evidence (app on 3970, lane `app_prw6`, owner account)

Playwright driver, screenshots under
`Vari8-evidence/scratch/pr-w6-checkins/shots/`.

Before the repair (head `c0b0291`, same lane and seed):

- Board first paint after login: demo state (`extras: ["extra-maya","extra-emma"]`,
  `submissions: ["submission-emma","submission-lily","submission-oliver"]`), and
  the remove handler refused before any HTTP call.
- After one prev/next so the server rows landed: removing `seed-m8-extra-emma`
  (DB `cancelled_at` set) reloaded and the chip came back as
  "Additional · Custom · Scheduled". 17 chips before and after.
- Week 5 to 11 Oct: Oliver Stone, 8 Oct, server `reviewedAt: 2026-10-09T08:30:00.000Z`,
  rendered "Awaiting feedback"; popover offered "Open review"; "3 awaiting feedback".

After the repair:

- Board first paint, no range move: 17 chips, server rows, pending 2.
- Remove Maya Patel's additional date: chip disappears, reload lands, chip stays
  gone (16 chips), toast "Additional date removed". DB `seed-m8-extra-maya`
  `cancelled_at` set, cancelled row not re-materialised.
- Week 5 to 11 Oct: Oliver Stone chip "Feedback sent", popover "Open feedback",
  "2 awaiting feedback".
- 390x844: same board, same statuses, same extras behaviour.
- Requests: `from=2026-10-11T22:00:00.000Z&to=2026-10-18T22:00:00.000Z`, i.e. Vienna
  midnights. With a probe row due `2026-10-11T22:30:00Z` (00:30 Vienna on 12 Oct),
  the old bound `from=2026-10-12T00:00:00Z` returned 2 of 3 rows and the new bound
  returned 3; the board rendered the 00:30 row as an additional date on 12 Oct.
  The probe row was deleted after the check.
- No 4xx/5xx on any `/api/v1` request in the browser session.

## Parity (D32)

`node tools/parity/run.mjs`, `PARITY_PORT=3971`, tolerance 0, run twice
(`parity.log`, `parity2.log`), plus a re-compare of the same capture at the
plan's declared app-wide budget (`PARITY_MAX_DIFF_PIXELS=400`,
`compare400.log`).

- Result: exit 1, `70 problem(s)`, i.e. 35 screens at 1440 and 390, in every run
  and at both budgets. The failure is geometry, not noise: for
  `s03-checkins-board@1440` `geom=8/0/63` (8 elements added, 63 moved) and
  `px=270902`; `s03-add-extra@1440` `px=953214`, `s03-checkin-review@1440`
  `px=902432`. Untouched screens fail the same way (`s01-profile-checkins@1440`
  `px=221102`, `s04` to `s11` all red).
- Numbers are identical before and after the repair commits, and identical across
  both capture runs, so this diff adds no visual delta: it changes no markup, no
  `className`, no style, no token, and `git diff` touches only the data provider's
  logic, the load handler and the test file.
- Cause, as the plan already recorded: `tools/parity/baseline` was captured at
  `c783110` before #160, so the whole app is red at tolerance 0 and only reachable
  green through a baseline recapture, which is a separate card.
- Live check at both widths is the evidence for this PR's screens: 1440x900 and
  390x844 screenshots above, plus the parity capture itself rendering all three
  screens at both widths (`OK s03-*@1440`, `OK s03-*@390`).

## Commands and exit codes

| Command                                                                                                                                                                                  | Exit                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npx prisma migrate deploy` (lane `app_prw6`)                                                                                                                                            | 0                                                                                                                     |
| `npm run seed:dev`                                                                                                                                                                       | 0                                                                                                                     |
| `npx --no-install prettier --check components/canvas/data/checkins.ts components/canvas/coach/check-ins.tsx tests/unit/checkins-provider-map.test.ts` (after `--write` on the test file) | 0                                                                                                                     |
| `npx prettier --check .`                                                                                                                                                                 | 0                                                                                                                     |
| `npx tsc --noEmit`                                                                                                                                                                       | 0                                                                                                                     |
| `npx eslint .`                                                                                                                                                                           | 0 (0 errors, 80 pre-existing warnings)                                                                                |
| `npx eslint` on the three changed files                                                                                                                                                  | 0                                                                                                                     |
| `npm run index`                                                                                                                                                                          | 0                                                                                                                     |
| `npm run index:check`                                                                                                                                                                    | 0                                                                                                                     |
| `npx vitest run tests/unit/checkins-provider-map.test.ts`                                                                                                                                | 0 (12 tests)                                                                                                          |
| `npm test`                                                                                                                                                                               | 0 (99 files, 1127 tests)                                                                                              |
| `npm run build` with `NODE_ENV` unset                                                                                                                                                    | 0                                                                                                                     |
| `npm run build` with `NODE_ENV=development` exported                                                                                                                                     | 1 (Next refuses a non-standard NODE_ENV; the same build passes with it unset, so this was the lane env, not the diff) |
| `node tools/parity/run.mjs`                                                                                                                                                              | 1 (70 problems, stale baseline, see above)                                                                            |
| `node tools/parity/compare.mjs` at `PARITY_MAX_DIFF_PIXELS=400`                                                                                                                          | 1 (same 70)                                                                                                           |
| `bash mutate-check.sh` (mutation proof, scratch copy)                                                                                                                                    | 4 mutations, each turned exactly 1 test red                                                                           |

Mutation proof ran on a throwaway copy of `components/ lib/ tests/ app/` under
`Vari8-evidence/scratch/pr-w6-checkins/mutate` (node_modules symlinked to the
worktree only so vitest could resolve deps in that copy; nothing in the worktree
was mutated):

- drop the `CANCELLED` skip: 1 failed
- drop the `reviewedAt` mapping: 1 failed
- restore UTC range bounds: 1 failed
- replace the slice wholesale (no failed-client carry-over): 1 failed

## Still not verified here

- Two accounts driving the full schedule, submission, review and feedback loop
  end to end. This round drove one owner session on seeded data, which is enough
  to show the four repaired rules and not enough to close the card's acceptance.
- The client-side surfaces (`clients.tsx`, `S03-08` add-extra dialog write path)
  are untouched by this PR, as the plan recorded.
