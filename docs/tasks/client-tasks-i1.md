# CLIENT-TASKS-I1 — real client tasks + CU03 connection

**Contract:** combined `CLIENT-TASKS-P2-plan.md` (`7296937e…`) +
`CLIENT-TASKS-P3-plan.md` (`241e59cc…`) — the latter is a delta; P2 carries
the full schema/file/test/revocation detail.
**Review:** `CLIENT-TASKS-P3-R1` (`52ea53e1…`, PASS).
**Owner rules (settled):** complete+undo allowed · cancelled hidden from
client, staff-retained · tasks survive assigning-coach removal and stay
completable by the client while the removed coach loses access · overdue is
computed display metadata · dashboard gate reused (`ENABLE_CLIENT_DASHBOARD`).
Recorded as decision #109 in `docs/product-decisions.md`.

## File sequence

1. `db/schema.prisma` — `ClientTaskStatus` enum + `ClientTask` model +
   backrelations (`ClientProfile.clientTasks`, `WorkspaceMember` assigner/
   canceller, `User` completer).
2. `db/migrations/20261014000000_client_tasks/migration.sql` — table,
   composite coherence FK, CHECKs, indexes.
3. `lib/auth/rbac.ts` — `clientTasks` resource + matrix cell.
4. `lib/auth/guard.ts` — `clientTasks` in `PLATFORM_ADMIN_DENIED_RESOURCES`.
5. `lib/tasks/date.ts` — `parseTaskDueDate` (strict, +5y UTC bound),
   `serverTodayUtc`, `formatTaskDueDate`.
6. `lib/tasks/service.ts` — assign/edit/cancel/setCompletion/listStaff/
   listOwn; `ctask:` advisory convention; operation-split inside tx.
7. `lib/tasks/boundary.ts` — gate + closed vocabulary.
8. Actions — staff assign/edit/cancel + client setCompletion.
9. `lib/dashboard/config-schema.ts` — `CONNECTED_KINDS += "CU03"`.
10. Client dashboard page — CU03 adapter (real tasks, Mark done/Undo).
11. Staff editor — task management section + read-only completion badges.
12. `docs/product-decisions.md` (#109) + `docs/STATUS.md`.
13. `tests/unit/client-tasks.test.ts` (date contract),
    `tests/integration/client-tasks.test.ts` (real-PG matrix),
    `tests/e2e/client-tasks.spec.ts` (browser flows at 1440/834/390).

## RED/mutation contract

RED before each wave (date parser → service → UI). Mutations: operation-gate
removal; widened `own` ownership; filter-after-limit; blind toggle;
audit-on-noop; missing date bound; removed post-lock recheck.

## R2 repair (2026-10-14, commit following `266077c`)

- **P1 fixed:** `clientTasks` added to `PLATFORM_ADMIN_DENIED_RESOURCES`
  in `lib/auth/guard.ts`. The R1 review reproduced that a PLATFORM_ADMIN
  with an ACTIVE workspace membership could manage tasks — the matrix
  cell only covers the no-membership path. The original candidate's
  claim that this deny-set entry was already present was inaccurate
  (the edit was a silent no-op); this is the correction — the earlier
  record is preserved as written, not rewritten as accurate.
- **Direct RED:** the reviewer's reproduction was re-run as a failing
  test — PLATFORM_ADMIN + ACTIVE WORKSPACE_OWNER membership assigned a
  task before the fix; both levels (unit guard 4 roles × read/write,
  integration all ops) now deny with zero task/audit rows.
- **Mutation:** removing only the new deny-set entry fails the dual-role
  tests (4 unit + 1 integration); restored byte-identically, green.
- **P3 fixed:** staff assign input `maxLength` 140→120 and the edit
  input gained `maxLength=120` to match the server contract (no schema
  or validation-policy change).
- **P3 disclosed, kept:** per-CU03-widget `readOwnClientTasks` query —
  correctness-neutral, deferred.
- **Separate process record:** the original integration RED used
  `not_available` stubs (a generic unimplemented failure), and parts of
  the implementation preceded some tests — a tests-after-code deviation
  reported as such, not relabelled as behavioral RED.
