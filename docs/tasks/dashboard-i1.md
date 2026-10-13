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

## I1-R3 repair — in-app navigation guard (review `0179c46f`)

- Behavioral RED reproduced on the unmodified head: sidebar-link click
  inside the 500 ms debounce navigated silently and the edit was lost
  (beforeunload does not cover pushState routes).
- Implemented: capture-phase click interception on internal links while
  pending → preventDefault, flush now, `router.push` the stored href
  only after the save commits; failed/conflict/denied saves surface an
  explicit Leave-anyway/Stay prompt (queued + debounce cancelled on
  abandon; already-sent saves honestly may commit). popstate (Back/
  Forward) cannot be cancelled — the handler attempts `forward()`
  restore AND flushes immediately so the pending edit still commits in
  the same-document realm; documented as best-effort. `beforeunload`
  still covers document exits. Listeners removed on unmount.
- E2E: immediate-link, keyboard activation, unrelated-route residue,
  existing reload guard. Mutation (guard registration removed) → both
  nav tests fail; restored byte-identically.
