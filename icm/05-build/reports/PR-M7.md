# PR-M7 report

Card `icm/05-build/cards/pr-m7-habits.md`, issue #117, PR #118.
Branch `beta/pr-m7-habits` off `origin/Vari8-Beta` merge-base `f00d37b`.

## What changed

- `lib/habits/frequency.ts` (new): the only translation between the
  canvas's free-text habit frequency and the `habit_schedules.weekdays`
  ISO bitmask (D34 leaves no column for the text). `weekdayMaskToFrequency`
  labels 127 "Daily", 31 "Weekdays", 96 "Weekends", any other live mask
  "N× per week" by day count; `frequencyToWeekdayMask` parses the canvas
  editor vocabulary ("Daily", "every day", "weekdays", "weekends",
  "weekly", "N× per week"/"N times per week") and returns null otherwise.
  "N× per week" maps to a canonical evenly-spaced day spread because the
  canvas text cannot carry which days.
- `lib/habits/service.ts`: optional bounded `reason` (trimmed, max 500
  code points per the repo helpText convention, `""` clears) on
  `createHabit`/`editHabit`, stored on the PR-M0 `habits.reason` column
  and exposed on `HabitView` and `TodayHabitView`. `HabitView` also gains
  the derived `frequency` label and `completed`, the all-time DONE-log
  count. New read `listHabitCompletions` returns the canvas "Recorded
  completions" cohort: every habit of the client, active and archived,
  with name/target/reason/frequency/completed; same authorization split
  as `habitConsistency` (staff via clientProfileId, client via own
  profile only).
- `lib/habits/boundary.ts`: `reason` passthrough on the create/edit
  action inputs and the new `readHabitCompletions` wrapper behind the
  same gate + closed vocabulary.
- `scripts/seed/32-habits.seed.ts`: canvas demo parity for this domain.
  Every canvas-demo client profile gets the exact canvas habit card
  ("Evening walk", Daily mask 127, goal "20 minutes", reason "Create a
  calm transition into the evening.", `completed: 5`) as one habit, one
  schedule boundary effective 30 days back, and five DONE log rows on
  the last five days before today (today stays unchecked, matching the
  canvas toggle state). Idempotent upserts.
- `tests/unit/habits-frequency.test.ts`: literal mappings both
  directions, closed-vocabulary rejections, and the card's date guard:
  Sunday/Monday ISO bits and mask coverage pinned under
  `TZ=Europe/Vienna`.
- `tests/integration/habits-completions.test.ts` (real PG): reason
  round-trip and bound, all-time completions across a Sunday→Monday
  week boundary, archived-habit count/frequency retention, TL21
  reason+frequency exposure, foreign-staff denial.
- `docs/index/SYMBOLS.md`: regenerated (`npm run index`, check exit 0).

## Commands and exit codes

- `npm ci --no-audit --no-fund` (root + frontend): 0
  (`build/npm-ci.log`).
- `npx prisma generate`: 0.
- `npm run typecheck`: 0 (`build/typecheck.log`).
- `npx vitest run tests/unit/habits-frequency.test.ts
tests/unit/habits-date.test.ts tests/unit/habits-boundary.test.ts`:
  0, 28 passed (`build/unit.log`).
- `npx vitest run --config vitest.integration.config.ts
tests/integration/habits-completions.test.ts` on lane DB `app_m7`:
  0, 5 passed (`build/integration-m7.log`).
- `npm run seed:dev` (lane DB `app_m7`, `DB_FRESH` not needed; run
  twice): 0 both runs. First run created 15 habits + 75 log rows;
  second run created 0 (idempotent).
- `npm run index` / `npm run index:check`: 0 / 0.
- Live: `npm run dev -- -p 3880` against `app_m7` with
  `ENABLE_CLIENT_DASHBOARD=1`; playwright chromium drove sign-out (fails
  closed to /login), owner sign-in (credential workaround, SEED-FIX not
  yet merged), staff client dashboard habits panel:
  `build/proof.log` exit 0, consistency text "5 of 7 done this week".
- Service transcript on the seeded lane DB:
  `build/completions-transcript.txt` shows the seeded habit exposing
  `reason`, `frequency: "Daily"`, `completed: 5` through
  `readStaffHabits` and `readHabitCompletions`.
- Gate `icm/05-build/tools/verify-local.sh`
  (BASE_SHA=merge-base, LANE_DB=app_m7, LANE_PORT=3880, CARD=PR-M7):
  see `pr-m7-habits.check.log`; exit code recorded below.

## Acceptance evidence

"You see: scheduled habits expose completion counts and reasons."

- `staff-habits-1440.png`, `staff-habits-390.png`: the staff habits
  panel on the real seeded app lists the scheduled habit with the
  weekly completion count ("5 of 7 done this week").
- `completions-transcript.txt`: the boundary reads expose the all-time
  completion count (5) and the reason text for the scheduled habit.
- `signed-out-1440.png`: signed-out access to the staff page fails
  closed to /login.

Parity (D32): no screen changes; the gate's parity step runs only when
the harness is on the branch.

## Matrix rows closed

None (foundation PR, per the card).

## Open items / deviations

- `reason` bound of 500 code points is a service-side choice (the
  schema column is unbounded TEXT; the canvas shows the text as a
  paragraph). Flagged for the verifier.
- The client dashboard route additionally needs a persisted layout
  (PR-M9 domain) before the client widget renders; the live proof uses
  the staff panel plus the boundary transcript instead. The client
  surface is proven by the integration tests.
- Sign-in used the standing-orders credential workaround (SEED-FIX
  pending): `scratch/live-user.ts` wrote the `accounts` row on the
  throwaway lane DB.
