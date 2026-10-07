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
`app/workspace/[workspaceId]/client-setups/{page,actions,setup-manager}.*`,
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
`app/.../client-setups/actions` modules not found. The import-walker spec
passed trivially (regression guard only). Integration spec skipped without
`INTEGRATION_DATABASE_URL`.

## Gate-completion corrections (forward commits after `8fee131`)

The original implementation commit `8fee131` shipped the singular route
`/client-setup` (contract is plural `/client-setups`) and its report
claimed completion without real disposable-PostgreSQL or browser runs.
P-016-G1 corrected both in forward commits — `8fee131` is untouched:

- Route renamed to `app/.../client-setups/`; nav href, actions
  `revalidatePath`, docs, and all URL assertions use the plural path. The
  singular URL is covered by an explicit 404 E2E case.
- Integration spec extended 22→29 tests: audit-write rollback (zero
  mutation/audit), concurrent assign + assign-vs-archive + cancel races,
  no `SUPERSEDED` writes, cancellation after client deactivation,
  unassigned-coach denial, assistant scope collapse on removal,
  workspace-scoped mutation counts. Fixture/provenance calls corrected to
  satisfy the P-014 archive CHECK.
- `tests/integration/s1-a-identity.test.ts` table allowlist extended with
  the two approved tables (`client_setup`, `client_setup_pin`).
- E2E spec extended 7→13 tests: flag-off route+nav+zero-effect POST probe,
  singular-route 404, duplicate-name disambiguation, assigned/unassigned/
  revoked coach, assistant read-only, client/support/dual-role platform
  denials, archived readability + authorized cancellation, keyboard
  assign/cancel + alert focus, 44px touch targets, no-overflow at
  1440/834/390, no raw IDs. Each test seeds/cleans its own pin state via
  the real service (Playwright restarts workers after failures — no
  cross-test DB state is safe to share).

## Local verification (this tree, disposable infrastructure)

All suites executed locally against disposable databases on the repo's
own Compose PostgreSQL 16 (`app_integration_test`, `app_e2e`,
`app_p016_final`, `app_shadow` — all disposable, no shared data):

- `npx prisma generate` / `validate` — exit 0.
- `prisma migrate deploy` on fresh `app_p016_final` — 16/16 applied;
  `migrate status` — "up to date"; `migrate diff` migrations↔DB — no
  drift; schema.prisma↔migrations shows only the intentional raw-SQL
  composite-FK/GIN constructs (same footprint as P-013/P-014).
- `npx vitest run` (all): 70 files / 776 tests — PASS (exit 0, ~17.5s).
- `npm run typecheck` / `lint` / `format:check` — all clean (exit 0).
- Focused P-016 integration: **29 tests PASS** on real PG (~2s); full
  integration: **28 files / 385 tests PASS** (~50s).
- `npm run build` — `/workspace/[workspaceId]/client-setups` compiled
  (exit 0).
- Focused P-016 E2E (Chromium): **13 tests PASS** (~24s) covering the
  three form-factor checks at 1440/834/390; singular route 404 and
  flag-off 404/nav/POST-mutation checks included.
- Full E2E: **216 passed / 12 skipped / 0 failed** (~1.9m) — skips are the
  pre-existing gated password-reset block, unrelated to P-016.
- No CI run exists yet for this branch — all evidence above is local.

## P-016-R2 — ID-free browser selection contract (post-review repair)

Independent different-model review (`opencode-go/deepseek-v4.1-flash`) of
head `a757c9d` returned **PASS, no P0/P1/P2**, classifying internal IDs in
`<option value>` DOM selections as P3 — unless the original acceptance
criterion was hard. The orchestrator confirmed it is hard ("no internal
IDs as DOM option values; server-validated positional selections"), so a
forward-commit repair was required before PR creation. `8fee131` and
`a757c9d` are preserved; RED evidence: a new unit spec asserting the
id-free serialized contract + positional/fingerprint signatures failed 8
assertions against `a757c9d` before the implementation existed.

### Mechanism

- Server renders a deterministic authorized ordered list (clients
  `ORDER BY id`, templates `ORDER BY name, createdAt, id`, pins
  `ORDER BY id`) and computes `sha256` over the ordered internal id
  list(s) via `computeSelectionFingerprint` (node:crypto only).
- Serialized choices carry display labels + positional `index` + the
  fingerprint — no client/setup/pin/template/version/member ids.
- Forms submit bounded indices + fingerprint. The service re-fetches the
  authorized list(s), recomputes the fingerprint, and fails with
  `stale_selection` on mismatch or `invalid_input` on an out-of-range
  index under a matching fingerprint (tamper). Zero mutation, zero audit.
- Cancellation: rows expose an absolute `index` into the caller's
  authorized ordered pin list + `rowFingerprint`;
  `resolveCancelSelection` maps index→pin id server-side, then the
  unchanged cancel transaction runs. A changed list fails stale; a
  concurrent cancel surfaces `assignment_not_active`.
- The fingerprint is a consistency token, never authorization — every
  resolved identity is reauthorized and workspace-scoped.
- Documented P3 retained: the `?c=` keyset cursor is an opaque pin id in
  the authenticated staff URL/props (P-010/P-013 convention) — optional
  cursor-token hardening, not redesigned here.

### Evidence (repaired tree, disposable infrastructure)

- Unit: 796/796 (new `client-setup-selection.test.ts` — serialized-shape,
  index/fingerprint binding, stale/denied mapping; actions spec gains
  malformed/duplicate-index rejection cases).
- Integration: focused **42/42**, full **398/398** on real PG — includes
  client-list change, mid-flight archive, client ineligibility, coach
  scope revocation, cross-workspace fingerprint, tampered index,
  cancel-list change, concurrent-cancel no-change, and the full
  boundary index+fingerprint round-trip with zero-write assertions.
- E2E: focused **15/15**, full **218 passed / 12 skipped / 0 failed** —
  adds a DOM scan (positional option values, hex fingerprints only, no
  raw-id fields/data-attrs) and a stale-list journey asserting the
  refresh alert + zero writes. All prior journeys unchanged.

### Builder-report count correction

The R1-review candidate diff was **28 files / 11 test files** (the
builder reported 27/9). Count error only — no omitted scope.

## Next gates

Push `feature/p016-client-setup-assignments` (no PR) → PR creation →
`verify` CI → separate merge approval.
No PR, merge, push to main, or deployment is authorized by this record.
