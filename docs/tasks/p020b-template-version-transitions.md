# P-020B — C2 template-version transitions: implementation record

Implementation task. Dev-gated review + execution of Coaching Template version
upgrades and rollbacks for existing Client Setups, per the binding P-020-R3
plan + P-020-R3.1 addendum and owner decisions #58–#62. Status: IN PROGRESS.

## Authorization and state

- Owner authorization: P-020B implementation only. No PR, merge, deploy,
  production enablement, settings changes, or unrelated work.
- Base: `origin/main` = `c790a6b11bc80243d60019608d5e6b361b5a5ab4`
  (P-020A merge commit; PR #20 merged; main CI 37768517147/113281978645 green).
- Branch: `feature/p020b-template-version-transitions`.
- Binding artifacts (SHA-256 verified, read to EOF):
  - P-020-R3 plan `035216896474c8cadf49c91a7dc4933895727cb5f521daad9aee4d543ded607b`
  - P-020-R3-R1 review `86c724c2407e118fa8130d9467c46d4bbf26b548bee625777ffd8abf5dc5b6c5`
  - P-020-R3.1 addendum `32d9479bf4f5916ec81d815383283dfc25a22c5698e748d3c5b610df28a89ca4`

## Implementation plan (written before code)

### Schema/migration — `db/migrations/<ts>_p020b_template_version_transitions/`

- Enum `PinTransitionKind` = {UPGRADE, ROLLBACK}.
- `client_setup_pin` + `supersedes_pin_id` TEXT NULL (unique), `transition_kind`
  enum NULL, `transition_summary` JSONB NULL.
- `UNIQUE(id, client_setup_id)` supporting target; composite FK
  `(supersedes_pin_id, client_setup_id) → client_setup_pin(id, client_setup_id)`
  (same-setup lineage) plus the plain `supersedes_pin_id → id` FK; both
  ON DELETE RESTRICT. `CHECK(supersedes_pin_id <> id)`.
- Coupled CHECK: all three lineage fields NULL or all non-NULL.
- Summary CHECKs: `jsonb_typeof='object'`; `schemaVersion` numeric = 1;
  `direction` ∈ {UPGRADE,ROLLBACK}; `transition_kind::text =
transition_summary->>'direction'`; `categories` object with the six required
  keys; each value a non-negative integer; `reasonCodes` array. Remaining shape
  (exact keys, closed reason union) is service-enforced.
- Prisma mirror: `supersedesPinId String? @unique`, self-relation
  `PinSupersession` onDelete Restrict, `transitionKind PinTransitionKind?`,
  `transitionSummary Json?`, `@@unique([id, clientSetupId])`.

### Modules

- `lib/coaching/client-setup-transition-gate.ts` —
  `isClientSetupTransitionsEnabled(transitions, clientSetup)`: both exact "1";
  `ClientSetupTransitionError` + closed code union.
- `lib/coaching/transition-diff.ts` — deterministic structural diff over two
  immutable `TemplateVersionDefinition` snapshots. Categories
  {removed(0), rebound(1), added(2), moved(3), required(4), display(5)} with
  explicit rank + `(rank, parameterKey, itemId, detail)` ordering; rebound =
  same itemId → different parameterId; moved = same item/section-position
  change; required = flag flip; display = label/helpText/group/title/section
  label; defensive semantic drift (kind/unit/scheme/options/validation) or
  malformed snapshot → `defective` (service fails closed); `diffHash` =
  versioned `C2-DIFF-v1` length-prefixed SHA-256.
- `lib/coaching/transition-impact.ts` — CanonicalCount (unsigned ASCII
  decimal, "0" allowed, no leading zeros, BigInt internally), canonical
  YYYY-MM-DD with zero⇒both-null/positive⇒both-present/earliest≤latest;
  closed unions ImpactReasonCode/ImpactRole/BlockedReasonCode with explicit
  rank tables; `DECLARED_CONSUMERS`/`PROVIDERS` (empty in production);
  `validateProviderSet` exact key-set equality + positive-int versions;
  `providerSetIdentity` = SHA-256("C2-PROVIDER-SET-v1" + manifest version +
  sorted tuples); `collectProviderImpacts` with provider-output validation and
  failure→blocked-code mapping; `canonicalProviderOutputsHash`.
- `lib/coaching/client-setup-transition.ts` — service:
  - `resolveTransitionPin` — positional pinIndex + rowFingerprint → pinId via
    the authorized ordered pin list (same contract as cancel).
  - `getTransitionTargets` — write-authorized per-row target discovery.
  - `reviewClientSetupTransition` — authorizeCollection(read) → resolve pin →
    authorize(clientSetups/write, client) BEFORE any output → ACTIVE pin →
    ACTIVE template → upgrade (server-selected latest) / rollback (positional
    earlier retained) → diff → P-020A eligibility on target → providers →
    internal review model + `C2-REVIEW-v1` fingerprint (binds actor memberId,
    ws/client, pin, current+target version, direction, upgrade-latest or
    rollback list+position, diffHash, eligibility, provider-set identity,
    canonical provider output, template status, confirm-required).
  - `executeClientSetupTransition` — pre-tx positional resolve → Serializable
    - retry → in-tx write authorize → advisory `csetup` lock → client_setup
      FU → coaching_template FU → active pin FU → re-resolve target → recompute
      diff/eligibility/providers/fingerprint → compare (mismatch →
      stale_selection, zero writes) → supersede old pin (SUPERSEDED + ending
      provenance) → insert new ACTIVE pin seq=max+1 with lineage/kind/summary →
      tx-bound audits (UPDATE old pin `v<current>`, CREATE new pin
      `v<target>` + `count` = structural warning count) → commit.
- `lib/coaching/client-setup-transition-boundary.ts` — gate check before any
  input binding; `serializeTransitionReview` is the SOLE browser serializer
  (strips pin/setup/version/template/parameter/member ids; keeps labels,
  parameterKey, categories, reason codes, fingerprint); stable error map.
- `app/.../client-setups/transition-actions.ts` — `loadTransitionTargets`,
  `reviewSetupTransition`, `executeSetupTransition`: transition gate →
  parent gate → session → bounded FormData → boundary.
- `setup-manager.tsx` + `transition-panel.tsx` — per-ACTIVE-row "Change
  version" (only when flag on + canWrite), target picker, mandatory review
  (incl. empty diffs), explicit confirm, blocked/stale states, honest
  zero-provider notice, role=alert errors, ≥44px targets.
- `.env.example`, `playwright.config.ts` (primary on, secondary off + third
  server for parent-on/transitions-off).

### Tests (RED first)

- `tests/unit/transition-diff.test.ts`, `transition-impact.test.ts`,
  `transition-review.test.ts`, `client-setup-transition-actions.test.ts`.
- `tests/integration/p020b-template-transitions.test.ts` — migration/DB
  invariants, authority matrix, upgrade/rollback/stale/race/audit/assignment.
- `tests/e2e/client-setup-transitions.spec.ts`.

## Exclusions (unchanged)

No DailyEntry schema/persistence/collection/UI; no C3/C4; no specialist-data
collection; no fake production providers; no automatic transitions; no
transition reasons/free text; no per-parameter visibility; no production
enablement; no deployment; no PR; no merge.

## Verification log

### RED evidence (tests written before implementation)

- HEAD `c790a6b11bc80243d60019608d5e6b361b5a5ab4` (base, clean tree + RED
  tests only); command
  `npx vitest run tests/unit/transition-diff.test.ts tests/unit/transition-impact.test.ts tests/unit/transition-review.test.ts tests/unit/client-setup-transition-actions.test.ts`
  → **exit 1** (`Cannot find module '../../lib/coaching/transition-diff'` /
  `transition-impact` / `client-setup-transition` / `transition-actions` —
  behavior absent). An earlier masked-pipeline run showed `EXIT=0`
  incorrectly and was discarded.
- RED test file SHAs (preserved): `transition-diff.test.ts`
  `c3b7935ebdbb262cf2960e0a358f5610981775ea3cc288095cac6075b8c08d69`;
  `transition-impact.test.ts`
  `b5d4556906376772b89a3981cfb0b68e3c3569596ff69e7f2589738de9c0d9c7`;
  `transition-review.test.ts`
  `4cef4c19c7ff001b271796f5f2bfda96d47bd9c79139c27d8ba7388d6bcbe34e`;
  `client-setup-transition-actions.test.ts`
  `015aa7b0dcc982715cb16f9fc77c95ab034cc4bfd730c35319cc87eb7d560031`.
- RED tasks record SHA:
  `9732fba2ff26433ea9e27183add4fe64fa2aa900bdd5dc15f7dbc0efed8573a2`.

### Gates (all on this branch, local docker `app-db-1`)

- Disposable PostgreSQL `p020b_it_1791461647`
  (`postgresql://app:app_dev_password@127.0.0.1:5433/p020b_it_1791461647`,
  created fresh for this run):
  `prisma migrate deploy` → exit 0, all migrations applied including
  `20261008180000_p020b_template_version_transitions`.
- `npx tsc --noEmit` → exit 0.
- `npx eslint <changed paths>` → exit 0 (0 errors, 0 warnings after fixes).
- `npx prettier --check` on changed files → clean; SQL/`.env` carry no
  prettier parser (unchanged convention).
- `npx prisma generate` / `prisma validate` → exit 0.
- Focused unit (4 P-020B files) → **63/63** pass, exit 0.
- Full unit `npx vitest run` → **886/886** pass, exit 0.
- Focused integration `p020b-template-transitions.test.ts` on the disposable
  DB → **20/20** pass, exit 0 (migration invariants, owner/assigned-coach
  upgrade, retained rollback, no-upgrade/no-earlier-version, archived
  template freeze, post-review publication stale, tampered/foreign-actor
  fingerprint stale, resubmission stale with zero writes, ineligible-target
  block, all denied roles before output, raw-ID stripping, synthetic provider
  impacts/failures/blocks/malformed output, literal lock-queue race (winner
  holds locks while loser's advisory request is queued), audit-failure
  rollback, flag-off zero writes via the real boundary).
- Full integration `npm run test:integration` on the disposable DB →
  **439/439** pass, exit 0.
- `npm run build` → exit 0.
- Focused E2E `tests/e2e/client-setup-transitions.spec.ts` → **11/11** pass,
  exit 0 (owner upgrade with audits/lineage, assigned-coach upgrade,
  rollback, mandatory empty-diff review, post-review publish stale alert
  with zero writes, ineligible-target block, denied roles, flag-off on
  :3102 with parent flag on, raw-ID absence, keyboard/focus, ≥44px touch
  targets, overflow at 1440/834/390).
- Full E2E `npx playwright test` → **238 passed / 12 skipped** (pre-existing
  `test.skip` flag-gated password-reset cases), exit 0.

### Iteration notes (failed runs preserved)

- First integration run: `PrismaClient` imported type-only → suite import
  error (exit 1); fixed.
- Second run: caller drafts missing `required` → `invalid_input` (exit 1);
  fixed in fixtures. Malformed-summary case had `schemaVersion: 2` shadowed
  by a spread (exit 1); fixed spread order.
- Third run: two-ACTIVE-pins schema test violated the pre-existing
  one-ACTIVE invariant → supersede the old pin first (correct real
  semantics); rollback fixture needed classification before v1 publish
  (v1 must be eligible as a rollback target); race test needed deterministic
  arrival order via the loser's workspaceMember-read barrier.
- First E2E run: 8/11 — transition panel never rendered its `error` state
  (real UI bug: stale/denied failures were silent) → fixed; support-role
  response assertion over-constrained → simplified to control-absence;
  keyboard test raced async target loading → await control visibility.

### Independent review + R2 cleanups

- Independent review (`opencode-go/deepseek-v4.1-flash`, P-020B-I1-R1,
  artifact SHA-256 `da0405bf2afca1e1226cec1a669c2caf86ee06d25ede9cbffe012713a6c34db6`):
  **PASS, no P0/P1/P2.** Three P3 notes:
  1. `transition-diff.ts` canonical ordering used `localeCompare` → repaired:
     explicit `compareCodeUnits` (code-unit `<`/`>`) for every tie-break
     field; RED regression proves the canonical diff/hash path succeeds
     identically while `localeCompare` is mocked to throw; no hash vector
     changed.
  2. The assigned-coach test compared only status/coach → strengthened to
     deep-compare the complete `ClientAssignment` row (all persisted
     columns) and the total row count before/after transition.
  3. Docs: builder full E2E = 238 passed / 12 skipped; the reviewer's
     full-E2E run hit a pre-existing `onboarding-forms.spec.ts:2209` flake
     (outside the P-020B diff, green on isolated rerun — no P-020B
     regression).
- R2 verification on new disposable PG `p020b_r2_1791466866`
  (`prisma migrate deploy` exit 0): `git diff --check` 0; `format:check` 0;
  `tsc --noEmit` 0; `eslint` 0; `prisma validate`/`generate` 0; focused unit
  (4 P-020B specs) **64/64** exit 0 (includes the new locale-independence
  regression — RED at `2f171ee` via a throwing `localeCompare` spy);
  focused integration **20/20** exit 0; full integration **439/439** exit 0;
  `next build` exit 0. Full unit + full E2E intentionally not rerun
  (canonical-ordering + test/docs-only delta; parent candidate and reviewer
  ran them; PR CI reruns all). Old builder DB `p020b_it_1791461647` dropped
  after verification — no other database touched.

### Live-on-merge versus gated

- Live on merge: schema columns/constraints, diff/provider/fingerprint
  library modules, service functions (flag-independent authorization).
- Gated behind `ENABLE_CLIENT_SETUP_TRANSITIONS === "1"` +
  `ENABLE_CLIENT_SETUP === "1"` (both exact-match): page wiring, server
  actions, and the browser boundary — off ⇒ hidden UI, actions refuse
  before session/FormData/DB/provider work (zero writes proven).
- Zero declared data consumers / zero production providers; provider-set
  identity `127e19f4365906f74aefb19bd1a20faa230a18df6e85166744f0705b93a90415`
  is valid only because no data-consuming feature exists. Nothing deployed.
