# IIFYM actuals — issue #173 — slice 1 (schema-slot pending)

## Dependency (concrete)

- Stacks on **PR #114 head `7aef3044b4c1cf1646d7d5f778fb0878a7dd02cd`**
  (`beta/pr-m5-mealplan-payload`) — issue #173 declares "PR #114 for
  totals"; this slice reuses the 4/4/9 convention already reviewed in
  `lib/nutrition/math.ts` (`macroEnergyShares`, `iifymTargetNutrients`)
  without editing that reviewed file.
- **Migration slot: UNAVAILABLE** — `db/AGENTS.md` merge order: #162
  `supplement_plan` landed; **`20261022090000_auth_rotate` (#158, OPEN)
  retains the next schema slot**. No `schema.prisma` edit, no generated
  migration this slice. `NutritionLog` DDL is drafted in the plan below
  and lands only when #158 clears or the owner re-orders.

## Implemented (settled contract)

- `lib/nutrition/actuals.ts` — `MacroActuals` (independent nullable
  protein/carbs/fat), `deriveActualCalories` (4/4/9 over entered macros
  only; all-absent → `null`, entered zeros → `0`),
  `toNutritionLogRecord` (persisted shape incl. derived `calories`),
  `applyActualsPatch` (unsubmitted fields preserved; explicit `null` =
  not recorded — the mode-switch preservation rule at record level).
- `tests/unit/nutrition-actuals.test.ts` — 7 real-behavior tests:
  all-absent, entered zeros, protein-only, all-three, partial fat-only,
  record shape, patch preservation.

## Gates (Node 24.22.1, this worktree)

| cmd                                                   | exit                       |
| ----------------------------------------------------- | -------------------------- |
| `npx vitest run tests/unit/nutrition-actuals.test.ts` | 0 — **7/7**                |
| `npx prettier --check` both files                     | 0 (after --write)          |
| `npx eslint` both files                               | 0                          |
| `npm run typecheck`                                   | 0                          |
| `npm run index` + `index:check`                       | regenerated SYMBOLS.md, OK |

## Deferred to slice 2 (slot + #114 required)

## P498 — slot still held (slice 2 blocked)

- **Slot holder:** #158 `beta/auth-rotate` — `db/AGENTS.md` owner-decided
  merge order (#162 then #158) + `PR-SV5.md` "#158 retains the next
  schema slot". Verified live 2026-10-28: #158 OPEN, migration
  `20261022090000_auth_rotate` absent from `Vari8-Beta`.
- **Release dependency:** #158 merging, or an explicit owner re-order.
  Nothing else releases the reservation.
- **Retained work:** `actuals.ts` + 7 tests (all real behavior);
  slice-2 plan below ready unchanged once the slot frees.

## Slice 2 (blocked — drafted contract)

`NutritionLog` migration: three independent nullable `Float` columns
`protein`/`carbohydrate`/`fat`, derived `calories Float?` stored (never
entered), key `(workspaceId, clientProfileId, entryDate @db.Date)` —
unique per DailyEntry conventions; `saveNutritionLog` inside the daily-
entry transaction (`resolveOwnClient` + `withSerializedRetry`, consent
gate unchanged); coach read `listNutritionLogs(from, to)` under the
existing staff `checkinsCoachReviews`-style authorization + one audit
row; mode-switch persistence = no write on plan-mode change (entries
are independent of the plan-mode flag); foreign-workspace refuses via
the shared workspace-scope check — unresolved policy: none found;
authorization reuses existing dailyTracking/coach-review permission.

- `saveNutritionLog` service + daily-entry save path hook; API routes
  (client write, coach range read `from`/`to` with existing
  `checkinsCoachReviews`-style staff authz + `checkin_submission`-style
  audit); mode-switch persistence integration test; foreign-workspace
  refusal tests.

## Acceptance coverage map

| issue line                                 | slice 1        | slice 2             |
| ------------------------------------------ | -------------- | ------------------- |
| nullable independent macros, no kcal field | record shape ✓ | migration           |
| kcal 4/4/9 derived, partial day            | ✓ tested       | —                   |
| zeros → 0 not null                         | ✓ tested       | —                   |
| protein-only → 4p, others not-recorded     | ✓ tested       | —                   |
| mode switch keeps entries                  | patch rule ✓   | integration test    |
| coach date-range read                      | —              | service+route+authz |
