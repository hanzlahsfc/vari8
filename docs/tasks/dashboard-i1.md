# DASHBOARD-I1 — Persisted coach-configured client dashboards

Approved contract: DASHBOARD-P3 (sha `371d4183…`, independently reviewed
`f81dd795` PASS). Decision **#108** records the owner-approved rules.

## Sequence

1. `db/schema.prisma` `ClientDashboardLayout` + migration (composite
   coherence FKs, RESTRICT).
2. `lib/dashboard/config-schema.ts` — bounded allowlist validation
   (unit RED-first).
3. `lib/auth/{rbac,guard}.ts` `clientDashboards` + deny-set;
   `lib/dashboard/{gate,service,boundary}.ts`; `ENABLE_CLIENT_DASHBOARD`.
4. Integration spec (roles/CAS/revocation/subset/audit) RED→GREEN.
5. Staff editor route + autosave action + client read route
   (server-filtered subset, reconcile-per-breakpoint).
6. E2E + gates + mutation battery.

## I1-R2 repair (review `f683f6ea`, CONDITIONAL PASS → repaired)

- **P2-1** corrected: migration `20261013120000_dashboard_i1_timestamptz`
  alters `created_at`/`updated_at` to `TIMESTAMPTZ(6)`; the drift guard
  spec now proves the type. The I1 "zero drift" claim was false
  (builder report corrected in the R2 report).
- **P2-2** editor completed: breakpoint tabs + per-bp initialize,
  drag/resize canvas (commits on gesture end), per-widget settings
  panel bound to the same allowlists, client preview via the server
  projection, existing controls + undo/redo preserved.
- **P2-3** `beforeunload` guard while edits are pending; dialog
  exercised in E2E (debounce window + in-flight covered by `pending()`).
- **P3s:** depth≤6 explicit; labels keys ⊆ fields; CREATE vs UPDATE
  audit; client projection re-packs; deterministic assignment-removal
  race (barrier-held FOR UPDATE); denied reconciliation shows denied;
  bounded editor retry/backoff; isolated 24-widget cap test.
- Process disposition unchanged: the I1 suite remains tests-after-code;
  no owner exception claimed (recorded as pending).
