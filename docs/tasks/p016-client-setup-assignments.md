# P-016 — C1 client setup + template assignments (implementation record)

Scope: implement the approved C1 slice from `product-decisions.md` #49–#57 —
stable client-setup identity, one current template assignment per client,
initial latest-published version pin, cancellation, staff list/history UI,
approved RBAC, structural audits, and the development feature gate.

Out of scope (unchanged): C2 upgrade/rollback/repinning/`SUPERSEDED`
transitions in production code, archived-template rollback, C3 variants,
C4 parameter visibility, plan/target values, DailyEntry, client-facing
setup pages, onboarding submissions, retention/erasure implementation,
real-client data, and deployment.

## Decisions implemented (binding)

- **#49** — `ClientSetup` is the stable per-(workspace, client) aggregate,
  created on first assignment and reused forever after (never re-created on
  reassign, never statused). `ClientSetupPin` is the append-only assignment/
  version-pin history: one ACTIVE pin per setup (partial unique index),
  `(clientSetupId, seq)` uniqueness, seq = max+1 under lock.
- **#50** — assignment resolves the latest published
  `CoachingTemplateVersion` server-side at commit time; pins never move on
  later publication.
- **#51** — cancellation needs no target eligibility (archived template or
  ineligible client still cancels); terminal pins are never reused.
- **#52** — any currently ACTIVE assigned coach may manage; `clientSetups`
  never touches `ClientAssignment`.
- **#53** — only ACTIVE templates are assignable; archived pins stay
  effective and readable.
- **#54** — owner workspace scope; coach/assistant assignment-scoped
  (assistant read-only); client/support/platform-admin denied incl.
  dual-role; collection reads non-disclosing, mutations uniform
  `assignment_not_accessible` for denied/foreign/missing vs
  `assignment_not_active` only for authorized callers.
- **#55** — cross-template change = cancel + assign; no dedicated path.
- **#56** — user-facing terms: "Client Setup", "template assignment";
  "template version"; no parameter-key/variant vocabulary in the UI.
- **#57** — rows are client-associated operational metadata; audits are
  structural only; retention/erasure stays pending D-10 (no claims made).

## Files

New: `db/migrations/20261007170000_p016_client_setup_assignments/`,
`lib/coaching/client-setup-gate.ts`, `lib/coaching/client-setup.ts`,
`lib/coaching/client-setup-boundary.ts`,
`app/workspace/[workspaceId]/client-setup/{page,actions,setup-manager}.*`,
`tests/unit/client-setup{,-rbac,-actions,-boundary,-boundary-imports,-nav.dom}.test.ts*`,
`tests/integration/p016-client-setup.test.ts`,
`tests/e2e/client-setup.spec.ts`.

Modified: `db/schema.prisma` (enum + 2 models + back-relations),
`lib/auth/rbac.ts` (resource + row), `lib/auth/guard.ts`
(PLATFORM_ADMIN_DENIED_RESOURCES), `lib/auth/route-guard.ts`
(`requireClientSetupAccess`), `lib/audit.ts` (`client_setup_pin`),
`components/workspace-nav.tsx`, `.env.example`, `playwright.config.ts`,
`tests/unit/{rbac,playwright-config}.test.ts`, `docs/STATUS.md`.

## Concurrency protocol (mirrors reviewed P-013 service)

Serializable transaction + bounded P2034/P2010(40001,40P01) retry →
in-transaction authorization → `pg_advisory_xact_lock` on
`csetup:{workspace}:{client}` → aggregate row FOR UPDATE → template row
FOR UPDATE (serializes assign vs archive) → eligibility → insert under the
partial unique index (final authority). Cancel: non-locking immutable
lookup → authorize → same lock order → FOR UPDATE pin → single
ACTIVE→CANCELLED transition + transaction-bound audit.

## RED evidence (pre-implementation)

`npx vitest run` on the six new unit specs against `767f19d` →
10 failed / 6 passed: `clientSetups` unknown to RBAC (`resolveScope` →
undefined), `lib/coaching/client-setup{,-gate,-boundary}` and
`app/.../client-setup/actions` modules not found. The import-walker spec
passed trivially (regression guard only). Integration spec skipped without
`INTEGRATION_DATABASE_URL`.

## Local verification (this tree)

- `npx vitest run` (all): 70 files / 776 tests — PASS (exit 0).
- `npm run typecheck` / `lint` / `format:check` — all clean (exit 0).
- `npx prisma validate` / `prisma generate` — clean; `npm run build` —
  `/workspace/[workspaceId]/client-setup` compiled (exit 0).
- Integration + E2E need the disposable PostgreSQL — no local
  Docker/PG on this host; they run in the required `verify` CI job.

## Next gates

Independent different-model review → PR → `verify` CI (includes real-DB
integration + real-browser E2E) → separate merge approval. No PR, merge,
push to main, or deployment is authorized by this record.
