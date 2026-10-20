# PR-R0 report - Merge the copied retry and boundary helpers

Card: `icm/05-build/cards/pr-r0-lib-dedupe.md` (`pr-r0-lib-dedupe`, board `vari8`, track Reduction).
Issue: #101. Draft PR: #102 against `Vari8-Beta`.
Depends on PR-05 and AUD-REDUCTION-VERIFY.

## Head

- Head SHA: `5ee4df0b3cc0f871581bd02b2673ee5dbf24e7f4`
- Merge base with `origin/Vari8-Beta`: `1b066e468051c37c3e3e93861545ed1f49425ed5`
- Diff vs base: 42 files changed, +763 / −824
- `db/` untouched (schema guard passed; see limitations for the one cherry-picked infra commit).

## What changed

- `lib/db.ts`: added `SerializedRetryOptions` and shared `withSerializedRetry(fn, options)` - parameterized `maxAttempts`, optional linear `backoffBaseMs`/`backoffCapMs`, optional `isRetryable` (defaults to the existing `isSerializationConflict`), `onExhausted` (final retryable error) and `onMiss` (non-retryable observer). Raw rethrow preserved when no `onExhausted` is given (dashboard semantics).
- `lib/boundary.ts` (new): shared closed-vocabulary machinery - `ClosedMessages<C>`, generic `SafeResult<C, T>`, `fail(messages, code, detail?)`, `failMessage(message)`, `mapError(error, mapping)` (denied → optional consent → domain → optional raw serialization → fallback), and feature-gate-first `guard(options, fn)` (returns `off()` before invoking work when disabled).
- 18 service files: local `withSerializedRetry` copies replaced by thin adapters over `lib/db.ts`. Per-service attempt counts (8/3/4), backoff bases (10/15/25 ms), caps (50/250 ms) and domain exhausted-error types (`TaskError`, `HabitError`, `MealPlanError`, `TrainingError`, `CheckInInstanceError`, `CheckInFormError`, onboarding/coaching errors) preserved. Special behavior kept: mealplan publish retries selected `P2002` unique conflicts; training classifies `P2002` into retryable publication conflict vs `state_conflict` and maps `P2028`/`P2024`/SQLSTATE `57014`/`55P03` to `service_unavailable` via `onMiss`; check-in tracker-context keeps its `meta.code` classifier via `isRetryable`; dashboard omits `onExhausted` to keep raw exhaustion.
- 16 boundary files: copied `CLOSED_MESSAGES`/`fail`/`mapError`/`guard` machinery replaced by adapters over `lib/boundary.ts`. Domain message tables, safe-result unions and exact strings stay local; feature-gate-first ordering preserved.

`lib/gdpr/export.ts` and `lib/workspace/invitations.ts` keep their own retry loops - outside the F8 enumerated set.

## Changed paths

- `lib/db.ts`, `lib/boundary.ts`
- Services: `lib/checkin/{forms,instances,schedules,tracker-context}.ts`, `lib/coaching/{client-setup,client-setup-transition,parameters,templates}.ts`, `lib/daily-entry/service.ts`, `lib/dashboard/service.ts`, `lib/habits/service.ts`, `lib/mealplan/service.ts`, `lib/onboarding/{assignments,forms,review,submissions}.ts`, `lib/tasks/service.ts`, `lib/trainingprogram/service.ts`
- Boundaries: `lib/{tasks,habits,dashboard,mealplan,trainingprogram}/boundary.ts`, `lib/checkin/{instances-boundary,forms-boundary}.ts`, `lib/coaching/{client-setup-boundary,client-setup-transition-boundary,parameters-boundary,templates-boundary}.ts`, `lib/daily-entry/boundary.ts`, `lib/onboarding/{assignments-boundary,forms-boundary,review-boundary,submissions-boundary}.ts`
- Generated: `docs/index/SYMBOLS.md`, `lib/AGENTS.md` (index regen for `lib/boundary.ts`)
- Reports: `icm/05-build/reports/PR-R0.md`
- Base-drift repair (cherry-picked, author Marcel Spatz): `icm/05-build/tools/program.py`, `icm/05-build/tools/program_data.py`, `icm/03-plan/output/PLAN.md` - commit `5ee4df0`, unblocks the generator check that fails at base (owner rulings O1–O16 were hand-appended to cards without generator source).

## Commands and exit codes

| Command | Exit |
|---|---|
| `npm ci` | 0 |
| `npx tsc --noEmit` (first pass) | 2 (six `unknown`-generic errors in guard adapters; fixed by pinning `mapError<T>`/`fail<T>`) |
| `npx tsc --noEmit` (after fix) | 0 |
| `npm run lint` | 0 (3 pre-existing warnings: `icm/03-plan/tools/plan-to-issues.mjs` `join`, `lib/dashboard/config-schema.ts` `bp`, `tests/integration/p025b-checkin-instances.test.ts` `fieldId`) |
| `npm run test` (parallel) | 137 (Vitest worker killed under load; resource kill, not a test failure) |
| `npm run test` (serialized, workers=1) | surfaced 2 stale-index failures only (index not yet regenerated) |
| `npm run index` | 0 |
| `npm run test` (full, after index regen) | 0 - 1147 tests pass |
| `npx prettier --check` on touched files | 1 (37 files) |
| `npx prettier --write` + re-check | 0 |
| `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prr0 LANE_PORT=3734 CARD=PR-R0 icm/05-build/tools/verify-local.sh` (first run) | 1 - program generator check failed: 16 card files drifted from generator output at base (owner-rulings hand-edit on base, commit `f5bf9f7` lineage) |
| `git cherry-pick 5ee4df0` (repair authored on another lane) + `program.py --check` | 0 - 154 files match |
| `verify-local.sh` (re-run, same env) | 0 - `VERIFY-LOCAL PASS` |
| `DB_FRESH_SKIP_CATALOGS=1 npm run db:fresh` (lane `app_prr0`) | 0 |
| credential-account insert for seed users (scratch script, password hashing identical to `lib/auth/signup.ts`) | 0 |
| `next dev --turbopack` on `127.0.0.1:3734` | served; stopped after evidence (port closed) |
| `node ./prr0-live-check.mjs` (first live run) | 0 exit but 13/16 - script assertion bugs (body-text asserts, navigation race), app behavior correct per server log |
| `node ./prr0-live-check.mjs` (fixed assertions) | 0 - 16/16 PASS |

## verify-local summary (exit 0)

```
head=5ee4df0b3cc0f871581bd02b2673ee5dbf24e7f4 base=1b066e468051c37c3e3e93861545ed1f49425ed5 node=v26.8.2 card=PR-R0 db=app_prr0 port=3734
PASS clean tree (0s)
WARN node: target 24 (D5), running v26.8.2; recorded, not certified
PASS schema guard (D34) (0s)
PASS program generator check (2s)
PASS npm ci (17s)
PASS prisma generate (2s)
PASS frontend npm ci (8s)
PASS format check (19s)
PASS typecheck (8s)
PASS frontend typecheck (9s)
PASS lint (14s)
PASS frontend lint (0s)
PASS unit tests (23s)
PASS frontend tests (1s)
PASS integration tests (583s)
PASS migrate deploy (1s)
PASS build (36s)
PASS frontend build (31s)
PASS e2e flow specs (serialized) (40s)
PASS parity regression (D32) (252s)
VERIFY-LOCAL PASS
```

## Live receipt (real Chromium, app on `127.0.0.1:3734`, lane DB `app_prr0`)

16/16 checks passed:

- signed-out `/login` renders; signed-out `GET /api/v1/workspaces/<ws>/clients` → 401; `GET .../session` → 401; signed-out staff page → `/login` redirect
- keyboard-only login (Tab to email, type, Tab, type, Enter) submits and lands on `/`
- owner: login → `/`; `/workspace/<ws>/clients` 200 renders; clients API 200
- coach: login → `/`; `/workspace/<ws>/clients` 200 renders
- client: login → `/`; `/workspace/<ws>/daily` 200 renders; `/workspace/<ws>/admin` → 403 (fails closed, `forbidden.tsx`)
- foreign-workspace staff: login → `/`; `canvas-demo` clients API → 403; staff page on foreign workspace → 403 (no data disclosed)

## Screenshots

Under `/home/nexuslink/vari8-worktrees/_evidence/PR-R0/build/`:

- `live-signedout-login@1440.png`
- `live-signedout-staffpage@1440.png` (post-redirect login)
- `live-owner-postlogin@1440.png`
- `live-owner-clients@1440.png`, `live-owner-clients@390.png`
- `live-coach-clients@1440.png`, `live-coach-clients@390.png`
- `live-client-home@1440.png`, `live-client-home@390.png`
- `live-client-daily@1440.png`
- `live-client-admin-denied@1440.png` (403 page)
- `live-foreign-denied@1440.png` (403 page)

## Parity (D32)

Parity regression inside the gate: `parity PASS: 0 problem(s), retried=0` - 35 screens `ok` at 1440 and the same 35 at 390 (report `tools/parity/out/report.html`). This card wires no new screens; D32 matrix rows: none.

## Matrix rows closed

None - foundation/tooling PR per the card.

## Could not do / notes

- Catalog imports skipped in live DB (`DB_FRESH_SKIP_CATALOGS=1`): catalog source files are not on this machine; catalog-dependent views ran on empty catalog data during live evidence.
- `/workspace/<id>/dashboard` returns 404 for every role in this environment because `ENABLE_CLIENT_DASHBOARD` is unset - closed behavior by design; staff/client surfaces were exercised through `/clients` and `/daily` instead.
- Node runtime `v26.8.2` vs gate target 24: recorded as a warning by the gate, not certified.
- Lane DB `app_prr0` was left populated after live evidence (fresh seed + credential accounts for owner/coach/client/foreign-staff); the gate recreates it on its next run.
- The first live-check run mis-asserted page bodies instead of status codes and raced the login redirect; assertions were corrected to status codes and a `waitForURL` - no app change was needed.
