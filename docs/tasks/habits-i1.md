# HABITS-I1 — real habit tracking + TL21/TL22 connection

**Contract:** `HABITS-P4-plan.md` (`59222875…`, 217 lines, SHA-256 verified) —
final self-contained plan; `HABITS-P4-R1` independent review (`361a71ce…`,
107 lines, PASS with four non-blocking P3s resolved below).
**Base:** `origin/main` `6b24def401ef2da4b1c6cf977725af9b85055b1e` (verified);
worktree `the-great-tracker-habits`, branch `feature/habits-i1`.
**Lily source:** `/private/tmp/lily-ui` @ `ccef621141…` (pinned, verified).

## Owner-approved rules (from contract, restated)

1. Client **Mark done / Undo** only — no separate Skip control (skipped is
   modelled; writer deferred).
2. **Weekday-set** schedules with start/end.
3. **Count-based** consistency only — never percentages/streaks.
4. Existing-habit schedule edits and archive take effect **tomorrow**
   (server-UTC).
5. **No hard product habit cap** — bounded projection is engineering only.
6. Creation `startDate ∈ [today, today+5y]` — no backdated enrollment; a habit
   is scheduled today iff the weekday rule + start/end include today.

## Owner choices recorded under this task (decision #110)

- **P3-1 resolved → raw-SQL coherence FK.** `Habit` uses the repo convention:
  single-column Prisma relation `clientProfile → ClientProfile(id)` plus a
  raw-SQL composite FK `(client_profile_id, workspace_id) →
client_profile(id, workspace_id)` in the migration. The reviewed plan's
  alternative (Prisma composite relation) was explicitly either/or; the repo
  convention is authoritative for coherence (mirrors `client_task`,
  `client_dashboard_layout`). The misleading "raw coherence composite FK"
  comment now describes the actual mechanism.
- **P3-3 resolved → relabelled, kept.** `Habit @@unique([id, workspaceId])`
  stays as the generic same-workspace identity target (repo convention;
  currently no composite child FK — honestly labelled, not claimed as a
  coherence target of `habit_logs`).
- **P3-4 resolved.** `HabitLogStatus` enum is defined in schema + migration:
  `DONE`, `SKIPPED` (uppercase per `ClientTaskStatus` convention). Absence of
  a log row = not logged; clear = delete.
- **Caller `weekdays=0` rejected at the service layer on every normal path**
  (create/edit). Only the archive operation writes a `0` boundary row.
- **Constraint table is provided for real** (P3-2): see "Schema/constraint
  table" below — no claimed table without contents.
- **RBAC `habits` cell mirrors `clientTasks`** (owner workspace, coach
  assigned, assistant read-assigned, client own, SUPPORT/PLATFORM_ADMIN
  denied) — with `habits` added to the real
  `PLATFORM_ADMIN_DENIED_RESOURCES` deny-set.
- **Audit vocabulary:** new resource types `habit`, `habit_log`. Meta gains
  `date` (`YYYY-MM-DD`-only structural) and `logStatus` (`DONE`/`CLEARED`) —
  the shared `status` vocabulary is deliberately NOT widened (P-024
  precedent). Habit archive events reuse the existing `status: "ARCHIVED"`.
- **TL22 period mapping:** `today`=1d, `7d`=7, `14d`=14, `4w`=28, `6w`=42,
  `8w`=56, `12w`=84; window `[to−(p−1), to]`, `to` = server-UTC today.
- **Weekday mask:** bit `i` = ISO weekday `isodow−1` (Mon=bit0 … Sun=bit6);
  callers supply 1..127.
- **Gate:** `ENABLE_CLIENT_DASHBOARD` reused (habit widgets live on the gated
  dashboard surfaces; staff habit panel lives on the gated editor page).
- **Log desired-state:** `desired: "DONE" | "CLEARED"` — explicit state, never
  a blind toggle; `CLEARED` deletes the row; replay converges idempotently.
  Staff roles can never write logs (own-scope only, enforced in-tx).

## File sequence

1. `tests/unit/habits-date.test.ts` — RED: grammar/bounds/leap/UTC±/mask.
2. `tests/unit/habits-rbac.test.ts` — RED: `habits` matrix cells + deny-set
   - `resolveScope` coverage for all roles.
3. `tests/unit/dashboard-config-habits.test.ts` — RED: TL21/TL22 connected
   catalogue, `fields` cap/foreign handling at config layer.
4. `tests/integration/habits-schema.test.ts` — RED: tables, enum,
   uniqueness, CHECKs, FK coherence, DATE/TIMESTAMPTZ types, boundary
   uniqueness, composite coherence.
5. `tests/integration/habits.test.ts` — RED: full service matrix.
6. `db/schema.prisma` — `HabitLogStatus`, `Habit`, `HabitSchedule`,
   `HabitLog` + backrelations (`ClientProfile.habits`, `Workspace.habits`,
   `User.habitLogs`, `Habit.schedules`, `Habit.logs`).
7. `db/migrations/20261015000000_habits/migration.sql` — tables, enum,
   indexes, composite coherence FK, CHECKs (see table below).
8. `tests/integration/s1-a-identity.test.ts` — table allowlist += 3 tables.
9. `lib/auth/rbac.ts` — `habits` resource + cell.
10. `lib/auth/guard.ts` — `habits` ∈ `PLATFORM_ADMIN_DENIED_RESOURCES`.
11. `lib/audit.ts` — `habit`, `habit_log` resource types + `date`/`logStatus`
    meta keys.
12. `lib/habits/date.ts` — `serverTodayUtc`, `parseHabitStartDate`,
    `parseHabitEndDate`, `shiftDateUtc`, `utcWeekdayBit`, `parseWeekdayMask`
    (rejects 0), `periodDays`, `formatHabitDate`.
13. `lib/habits/service.ts` — `createHabit`, `editHabit`, `archiveHabit`,
    `setHabitLog`, `listStaffHabits`, `listTodayHabits` (TL21),
    `habitConsistency` (TL22); `habit:`-then-`member:` advisory order,
    member FOR UPDATE, post-lock authorize, profile FOR UPDATE, row CAS;
    `withSerializedRetry` on P2034; serializable txs; audit on changed
    ALLOW only.
14. `lib/habits/boundary.ts` — gate-first, closed result vocabulary,
    `fields` ID resolution (foreign/missing dropped).
15. `lib/dashboard/config-schema.ts` — `CONNECTED_KINDS += TL21/TL22`;
    catalogue `connected: true`.
16. `app/(tracker)/workspace/[workspaceId]/dashboard/actions.ts` —
    `readMyTodayHabits`, `readMyHabitConsistency`, `setMyHabitLog`.
17. `app/(tracker)/workspace/[workspaceId]/dashboard/habits-widget.tsx`
    (TL21 client adapter — Mark done/Undo) and
    `habit-consistency.tsx` (TL22 read-only counts).
18. `app/(tracker)/workspace/[workspaceId]/dashboard/page.tsx` — TL21/TL22
    adapters wired.
19. `app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/actions.ts`
    — staff `createHabit`/`editHabit`/`archiveHabit`/`readHabits` +
    `readHabitChoices` (editor picker universe).
20. `…/dashboard/habits-panel.tsx` — staff create/edit/archive surface.
21. `…/dashboard/page.tsx` — mount `HabitsPanel`, load habit choices, pass
    to `DashboardEditor`.
22. `…/dashboard/dashboard-editor.tsx` — TL21/TL22 `fields` habit picker
    (checkboxes over non-archived habits) replacing the free-text input
    for those kinds only.
23. `tests/e2e/habits.spec.ts` — staff journey + client journeys at
    1440/834/390, light + dark, flag-off proof.
24. `docs/product-decisions.md` (#110) + `docs/STATUS.md`.

## Schema/constraint table (actual — P3-2)

| Table             | Constraint                                                                                                          | Mechanism               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `habits`          | PK `id`                                                                                                             | Prisma                  |
| `habits`          | `UNIQUE (id, workspace_id)`                                                                                         | Prisma `@@unique`       |
| `habits`          | `INDEX (workspace_id, client_profile_id)`                                                                           | Prisma `@@index`        |
| `habits`          | FK `workspace_id → workspace.id` RESTRICT                                                                           | Prisma relation         |
| `habits`          | FK `client_profile_id → client_profile.id` RESTRICT                                                                 | Prisma relation         |
| `habits`          | FK `(client_profile_id, workspace_id) → client_profile(id, workspace_id)` RESTRICT                                  | raw SQL coherence       |
| `habits`          | CHECK `btrim(name) <> ''` AND `length(btrim(name)) <= 120`                                                          | raw SQL                 |
| `habits`          | CHECK `btrim(target) <> ''` AND `length(btrim(target)) <= 120`                                                      | raw SQL                 |
| `habit_schedules` | PK `id`                                                                                                             | Prisma                  |
| `habit_schedules` | `UNIQUE (habit_id, effective_from)`                                                                                 | Prisma `@@unique`       |
| `habit_schedules` | FK `habit_id → habits.id` RESTRICT                                                                                  | Prisma relation         |
| `habit_schedules` | CHECK `weekdays BETWEEN 0 AND 127`                                                                                  | raw SQL                 |
| `habit_schedules` | CHECK `end_date IS NULL OR end_date >= effective_from`                                                              | raw SQL                 |
| `habit_logs`      | PK `id`                                                                                                             | Prisma                  |
| `habit_logs`      | `UNIQUE (habit_id, date)`                                                                                           | Prisma `@@unique`       |
| `habit_logs`      | FK `habit_id → habits.id` RESTRICT                                                                                  | Prisma relation         |
| `habit_logs`      | FK `logged_by_user_id → users.id` SET NULL                                                                          | Prisma relation         |
| enums             | `HabitLogStatus ∈ {DONE, SKIPPED}`                                                                                  | migration `CREATE TYPE` |
| types             | `effective_from`/`end_date`/`date` = `DATE`; `archived_at`/`logged_at`/`created_at`/`updated_at` = `TIMESTAMPTZ(6)` | DDL                     |

## Commands / expected results (per wave)

- `npx vitest run tests/unit/habits-date.test.ts` → fails to resolve
  `@/lib/habits/date` (RED); green after `lib/habits/date.ts`.
- `npx vitest run tests/unit/habits-rbac.test.ts tests/unit/dashboard-config-habits.test.ts`
  → RED on matrix cells/deny-set/connected kinds; green after lib edits.
- `INTEGRATION_DATABASE_URL=postgresql://app:app_dev_password@127.0.0.1:5433/habits_i1_integration
npx vitest run --config vitest.integration.config.ts tests/integration/habits-schema.test.ts`
  → RED (tables absent); green after `prisma migrate deploy`.
- Same DB, `tests/integration/habits.test.ts` → RED (service absent);
  green after implementation.
- `npx prisma validate`, `npx prisma generate`, fresh `migrate deploy`,
  `migrate diff` drift check → clean.
- `npm run typecheck && npm run lint && npm run format:check && npm run test`
  → green.
- `npm run build` + `npx playwright test tests/e2e/habits.spec.ts` → green.

## Acceptance (observable)

- Staff creates/edits/archives habits on the client dashboard editor page;
  the client sees TL21 (today's scheduled habits, Mark done/Undo) and TL22
  (count-based consistency) through dashboard widgets; TL22 aggregates the
  full authorized cohort (not the first page); archived habits retain
  period history; foreign `fields` IDs are dropped; dual-role platform
  admins are denied at every operation; denials and no-ops write no audit.

## Execution log (builder, NON-INDEPENDENT)

- RED committed first: `habits-date`/`habits-boundary`/`dashboard-config-habits`
  unit files + `habits`/`habits-schema`/`guard`/`rbac`/`s1-a-identity` changes —
  7 failures across 5 files (missing modules, RBAC 30→31, deny-set
  `invalid_resource`→`role_denied`, TL21/TL22 unconnected).
- Schema + migration `20261015000000_habits_i1`: `prisma validate` OK,
  `prisma generate` OK; `migrate deploy` on isolated DB
  `habits_i1_integration` applied; `habits-schema` 5/5 green;
  `s1-a-identity` 13/13 green (habit tables in the identity allowlist).
- `lib/habits/date.ts` — 16/16 unit green (grammar, `[today,today+5y]`,
  leap Mar-01 normalization, weekday bitmask, UTC-12/+14 pins).
- `habits` RBAC cell + `PLATFORM_ADMIN_DENIED_RESOURCES` — `rbac`/`guard`
  unit green incl. dual-role platform-admin denies (all five membership
  roles, read+write).
- `lib/habits/service.ts` + `lib/habits/boundary.ts` — integration
  `habits` 27/27 green on real PG: multi-habit, backdate/zero-mask
  rejection, historical preservation across edit/archive, same-day
  future upsert, concurrent DONE convergence (one winner/one no-op),
  same-revision edit conflict, audit rollback atomicity, >20 cohort
  TL22, fields subset/foreign drop, empty denominator, dual-role
  impersonation denial, revocation split.
- TL21/TL22 connected: config-schema `CONNECTED_KINDS` + catalogue;
  client dashboard page loads `readTodayHabits`/`readHabitConsistency`
  through the boundary with per-widget `fields`/`period`; widgets
  `ClientHabitsWidget` (Mark done/Undo only) + `ClientConsistencyWidget`
  (count text, no %). Staff `ClientHabitsPanel` (create/edit/archive,
  no client log controls) + editor habit picker bounded at 8.
- `tsc --noEmit` clean; unit 1181/98 files; integration 723/46 files.
- E2E spec `tests/e2e/habits.spec.ts` — pending full run.
- E2E round 2 — real bug found + fixed: a stored layout's `fields: []`
  (staff picked no subset) was validated to `[]` and filtered the whole
  cohort out; `validateFields` now maps empty→`null` ("all authorized")
  with regression asserts on `fields: []` for both TL21 and TL22.
  `ClientHabitsWidget` calls `router.refresh()` after a successful mark
  so server-rendered TL22 totals update. Spec hardened: habit-name
  assertions scoped to `client-habits` (names legitimately appear in
  TL22 consistency rows), theme drive via post-load `localStorage`
  writes (init scripts re-run on reload), and tests 2/3 are
  self-sufficient — a failed test restarts the worker and re-runs
  `beforeAll`/`afterAll`, so depending on another test's rows is unsafe.
  `npx playwright test tests/e2e/habits.spec.ts` → 6/6 pass (exit 0).
- Mutation sweep — 10 mutants, all killed, restores sha256-verified
  byte-identical: fields-empty (2), boundary `<` off-by-one (11),
  weekday mask ignored (3), own-scope management (1), unscheduled log
  (3), skipped create audit (2), zero mask accepted (1),
  boundary-at-today (4), skipped gate (2), non-own log write (1).
- Full E2E round 1 (393 tests): 371 pass / 4 fail. `client-home`
  failure was environmental (that spec uses a bare `new PrismaClient()`
  — needs `DATABASE_URL` in worker env; passes with it set). Three
  `client-dashboard` autosave/nav-guard tests failed reproducibly;
  control run on the base tree (`d279514` ≡ verified base `6b24def`)
  passed 19/19 → a real branch regression, not the documented flake.
- Regression mechanism + architectural fix: mount-time server-action
  POSTs (editor `readClientHabitChoices`, panel `readClientHabits` +
  `readClientHabitConsistency`) serialized on the same route ahead of
  the nav-guard's flushed layout save, and the added serialized
  boundary reads delayed hydration enough that a fill inside the
  debounce window could land before `onChange` attached — no pending
  slot, navigation proceeded, the edit was silently lost. Fix: the
  staff page streams the habit cohort inside `<Suspense>` and passes
  picker choices as a deferred promise resolved via `use()` only when
  a TL21/TL22 settings panel opens. Zero mount-time action POSTs;
  editor hydration restored to base latency. `client-dashboard`
  19/19 + `habits` 6/6 green after the fix.
- Independent read-only review (P4-R1 impl pass): NEEDS-FIXES — no
  P0/P1; one P2 + eight P3s. Repairs:
  - P2: `editHabit` validated `endDate` against `tomorrow` but could
    write at a later future boundary — a date between the two passed
    validation then violated `end_date >= effective_from`. Now
    rejected `invalid_input` after `boundaryDate` is computed;
    regression test (future-start habit, endDate inside the gap;
    control ≥ boundary accepted) green.
  - `withSerializedRetry`: final P2034 now maps to
    `serialization_conflict` (the trailing unreachable throw stays as
    a defensive default).
  - Migration: added `habits_revision_positive_chk` (`revision > 0`)
    per the contract constraint list.
  - `setHabitLog`: `lockProfile` FOR UPDATE added before the habit
    lock — same lock order as the management paths.
  - TL21: `listTodayHabits` now returns the server-UTC `date` it
    computed; the widget echoes it on mark/undo (browser clock no
    longer picks the log date). `hasMore` surfaced in TL21
    ("first page" hint) and the editor picker ("more exist" hint).
  - TL22 + staff consistency: `totals.scheduled === 0` renders the
    contracted "No scheduled days in this period." (never `0 of 0`).
  - Multi-statement reads (`listStaffHabits`, `listHabitChoices`,
    `listTodayHabits`, `habitConsistency`) now run at `RepeatableRead`
    — authorization and cohort reads share one snapshot.
  - `ClientHabitsWidget` re-syncs state from refreshed props so staff
    mutations that arrive via `router.refresh()` are reflected.
- Post-repair gates: `tsc --noEmit` clean; unit 1181/98; integration
  re-run on fresh `habits_i1_integration` (migration checksum changed
  by the CHECK addition) — 33/33 on the two habits files incl. the
  new P2 regression; `client-dashboard` 19/19, `habits` 6/6.
- Pre-existing harness defect (documented, not fixed — unrelated
  scope): E2E global teardown deletes `clientProfile` before
  `clientDashboardLayout`, tripping `client_dashboard_layout_…_fkey`
  when a profile row exists. FK-ordered sweep is the fix when someone
  owns it.
- Re-review of repair commit `7f40106` (independent, read-only): all 9
  repairs VERIFIED; one NEW defect flagged — reads at RepeatableRead can
  hit `could not serialize` (P2034) on the `lockMember` FOR UPDATE when
  a concurrent writer updates the member row, and read paths were not
  retried, so raw P2034 surfaced as `not_available`. Fixed: the four
  multi-statement reads are now wrapped in `withSerializedRetry`
  (transient conflicts retry, final failure → `serialization_conflict`),
  and `mapError` maps a raw P2034 → `serialization_conflict` as a
  backstop. `habits` integration 28/28 + boundary unit 5/5 re-green.
- Full E2E round 2 (`DATABASE_URL` exported so `client-home`'s bare
  PrismaClient works): 381 passed / 0 failed / 12 skipped of 393 —
  `client-dashboard` 19/19 and `habits` 6/6 included. Final
  `npm run build` green on the committed tree (`1ad6c11`).
  Branch = verified base `6b24def` + 7 commits; review candidate only.
