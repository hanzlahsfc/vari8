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
