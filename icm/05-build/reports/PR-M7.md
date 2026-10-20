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

## Mac gate run, 2026-10-20

Re-run on the macOS host, lane DB `app_wb_m7`, lane port 3930, worktree
`.worktrees/pr-m7-habits`. Merge base with `origin/Vari8-Beta`:
`bb3140111d9f02ab0fd7e2ecdf16a1732536c66e`. Head before this report
commit: `d5feee1ef1f86ada6cdd3ed38a8fc55957c53a77`.

### Branch state merged in this run

- `git merge --ff-only origin/beta/pr-m7-habits`: nothing to do, the
  local branch already contained the remote head. Recorded, not assumed:
  `git rev-list --left-right --count HEAD...origin/beta/pr-m7-habits`
  gave `33 0`.
- `git merge origin/Vari8-Beta` (11 new base commits, PR-M8 included):
  one conflict, `docs/index/SYMBOLS.md` counts line only. Resolved by
  taking the base line and regenerating the file with `npm run index`.

### Build failure and root cause

`npm run build` failed with exit 1 and two errors per canvas file:

```
./components/canvas/coach/appearance-controls.tsx
Module not found: Can't resolve 'lucide-react'
Module not found: Can't resolve 'motion/react'
```

Root cause: the packages were never installed. `package.json` and
`package-lock.json` both declare `lucide-react@1.52.0` and
`motion@14.0.0`, but `node_modules/` did not exist in this worktree, and
`npm ci` had been swallowed by a stray stub on `PATH`:
`/Users/marcelspatz/.hermes/cache/scratch/flagproof/npm`, a two-line
shell script (`#!/bin/sh` then `exit 0`), inherited from another lane.
It exited 0 with no output and installed nothing. With `PATH` sanitized
to `/opt/homebrew/bin` first, `npm ci` installed 767 packages, and
`npm run build` exited 0 with no source change. No application code was
at fault.

The same stub also explains the first gate failure: `npm run index` had
been run with no dependencies present, so four `lib/canvas/*` modules
were missing from `docs/index/SYMBOLS.md` (135 modules, 1336 symbols)
while the generator resolved 136 modules and 1346 symbols once packages
existed. `tests/unit/system-index.test.ts` caught the drift. Regenerated
index committed as `chore(PR-M7): regenerate the symbol index with the
canvas lib modules`.

### Cross-card defect repaired (blocks every lane)

`tests/integration/seed-credentials.test.ts` failed with
`PrismaClientKnownRequestError` from
`prisma.clientProfile.findFirstOrThrow({ workspaceId, userId })`:
the sign-in client had no profile.

Root cause: `scripts/seed/33-checkins.seed.ts` (PR-M8, commit `7ae4ec2`)
reassigned `clientProfile.userId` unconditionally for the demo check-in
clients, overwriting the profile that `00-workspace.seed.ts` had bound
to `SEED_CLIENT_EMAIL`. Seed modules run in name order, so `00` always
loses. Fixed at the root: the demo user is now bound only when the
profile has no owner (`updateMany` with `where: { id, userId: null }`).
The existing test is the proof: it failed before the change and passes
after it, 2 of 2, on a freshly created `app_wb_m7`.

### Commands and exit codes, this host

| Command                                                                                           | Exit           |
| ------------------------------------------------------------------------------------------------- | -------------- |
| `npm ci` (root), sanitized PATH                                                                   | 0              |
| `npm ci` (`frontend/`), sanitized PATH                                                            | 0              |
| `npm run index`                                                                                   | 0              |
| `npm run index:check`                                                                             | 0              |
| `npm run build` (before install)                                                                  | 1              |
| `npm run build` (after install)                                                                   | 0              |
| `npx vitest run --config vitest.integration.config.ts tests/integration/seed-credentials.test.ts` | 0, 2 passed    |
| `BASE_SHA=... LANE_DB=app_wb_m7 LANE_PORT=3930 CARD=PR-M7 icm/05-build/tools/verify-local.sh`     | 1, parity only |

Gate step results, verbatim from
`Vari8-evidence/WAVEB-LEAD/pr-m7-habits.check.log`:

```
PASS clean tree (0s)
WARN node: target 24 (D5), running v26.12.0; recorded, not certified
PASS schema guard (D34) (0s)
PASS program generator check (2s)
PASS npm ci (13s)
PASS prisma generate (1s)
PASS frontend npm ci (6s)
PASS format check (13s)
PASS typecheck (3s)
PASS frontend typecheck (3s)
PASS lint (16s)
PASS frontend lint (1s)
PASS unit tests (15s)
PASS frontend tests (1s)
PASS integration tests (130s)
PASS migrate deploy (0s)
PASS build (18s)
PASS frontend build (9s)
PASS e2e flow specs (serialized) (22s)
FAIL parity regression (D32) exit=1 (225s)
VERIFY-LOCAL FAIL
```

Parity detail: 70 screens compared, 70 pass, 70 fail (35 at 1440, 35 at
390), every failure `geom=0/0` and `text=0`, which means pixel-only
difference with no geometry or text change, spread across roster,
messages, check-ins, meal plan, preferences and previews. This branch
changes no path under `frontend/`, `components/` or `app/`
(`git diff --name-only origin/Vari8-Beta...HEAD` lists only
`docs/index/SYMBOLS.md`, `icm/05-build/reports/PR-M7.md`, `lib/habits/*`,
`scripts/seed/32-habits.seed.ts`, `scripts/seed/33-checkins.seed.ts`,
`tests/integration/habits-completions.test.ts`,
`tests/unit/habits-frequency.test.ts`). The card states "Parity (D32)
on: none", and `icm/05-build/tools/verify-local.sh` at merge base
`bb31401` has no `SKIP_PARITY` support (`grep -c SKIP_PARITY` returns 0).
The fix is PR #137 (`beta/harness-skip-parity`), open at the time of
this run.

### Acceptance, measured on this host

Command: `npx tsx` receipt calling `listHabitCompletions` against
`app_wb_m7` after `npx tsx scripts/seed/index.ts` (3 modules, 15 habits,
75 log rows). Script kept outside the repo at
`Vari8-evidence/WAVEB-LEAD/pr-m7-habits.acceptance.ts`, output at
`pr-m7-habits.acceptance.out.txt`:

```
STAFF view (owner) client=Emma Anders habits=1
{"name":"Evening walk","target":"20 minutes","frequency":"Daily","completed":5,"reason":"Create a calm transition into the evening.","archived":false}
CLIENT own view habits=1
[["Evening walk",5,"Create a calm transition into the evening."]]
```

Both the staff path (workspace-scoped owner) and the client own path
expose the all-time completion count 5 and the reason text. The
Sunday to Monday week boundary guard is covered by
`tests/integration/habits-completions.test.ts`, which passes in the gate.

### What I could not do on this host

- Run the gate to exit 0. Every step passes except parity, which the
  card exempts and the harness cannot skip until PR #137 merges. Not
  code under test, not repaired here.
- Node 24 certification: this host runs v26.12.0, so the gate records
  `WARN node` and does not certify. Same as the Linux run.
- New browser screenshots from this run. No shipped screen renders
  `reason` or `completed` yet; that is the wiring PR. Parity's own
  captures cover the canvas at 1440 and 390, and the acceptance is
  measured through the service the wiring will call.
