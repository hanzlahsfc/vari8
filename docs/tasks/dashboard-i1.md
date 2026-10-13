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
