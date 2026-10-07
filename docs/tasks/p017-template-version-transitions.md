# P-017 — C2 template-version transitions: planning + decision record

Documentation-only task. This record captures the C2 planning history, the
independent reviews, and the owner's five approved product rules. **C2
implementation is deferred and unauthorized** — see "Timing" below.

## Verified starting state (2026-10-08)

- `origin/main` = `e7fd73b73a8af47b6d1a6c03576c707634be089a` — the P-016 C1
  merge commit (PR #16, MERGED; merge parents `767f19d` + `ded2c5e`).
- Main CI run `37645144594` — `verify` SUCCESS on the merge commit.
- Remote branches: `main` only. Protection: strict `verify`,
  `enforce_admins`, force-push/deletion blocked. Nothing deployed.
- Worktree clean; docs branch created from exact `origin/main`.

## Merged C1 foundation (from `origin/main`)

- `ClientSetup` stable per-(workspace, client) aggregate; `ClientSetupPin`
  append-only assignment/version-pin history; one ACTIVE pin per setup via a
  partial unique index; `SUPERSEDED` schema-reserved; provenance CHECK;
  same-workspace and version∈template∈workspace composite FKs.
- `clientSetups` RBAC: owner workspace; coach assigned read/write (any ACTIVE
  assigned coach, D-11); assistant assigned read-only; client/support/
  platform-admin denied incl. dual-role.
- Serializable mutation transactions; advisory key `csetup:{ws}:{client}`;
  in-transaction authorization; tx-bound audits (`client_setup_pin`).
- Positional-index + SHA-256 list-fingerprint browser selection contract —
  no raw IDs in DOM values or display-safe props (P-016-R2).
- Feature gate `ENABLE_CLIENT_SETUP=1` (exact match); plural route
  `/workspace/[workspaceId]/client-setups`.

## Planning and review history

1. **P-017 (initial plan, SWE-2 High)** — recommended: upgrade to latest
   published only; rollback to any earlier retained version; Option-A frozen
   archive; mandatory bound structural review; `supersedesPinId` lineage +
   idempotent-replay framing; optional transition reason; `sha256` review
   token; `transitionKind`/`transitionSummary` on the pin; **implement now**;
   second gate `ENABLE_CLIENT_SETUP_TRANSITIONS`.
2. **P-017-R1 — independent review** (`opencode-go/deepseek-v4.1-flash`) —
   **CONDITIONAL PASS** with blockers: replay/double-submit semantics were
   overstated (post-commit resubmission is stale, not idempotent success;
   `supersedesPinId` is lineage, not an idempotency key; no client-supplied
   op key); free-text `transition_reason` ahead of D-10/legal classification;
   diff canonicalization keyed on `parameterId` instead of stable `itemId`/
   `sectionId` with ambiguous serialization; authorization must precede
   selection resolution; missing coupled schema invariants (triple-null/
   three-non-NULL, same-setup FK, `<>id`, summary shape, direction
   consistency); audit interpretation overstated (two events do not
   distinguish a transition from cancel-then-assign); unspecified
   empty-target states; "implement now" premature before a data consumer;
   tests lacked the repeat-submission stale invariant.
3. **P-017-R2** — corrected replacement plan incorporating every blocker
   (listed under "R2 corrections" below).
4. **P-017-R2-R1 — independent re-review** (`opencode-go/deepseek-v4.1-flash`)
   — **PASS**, no P0/P1/P2. The corrected plan was declared decision-ready.
5. **Owner approval** — the five-item package below approved verbatim.

## R2 corrections (adopted into the approved plan)

- Replay semantics: post-commit resubmission fails `stale_selection` with
  zero additional writes/audits; `supersedes_pin_id UNIQUE` is a lineage and
  anti-branching invariant, not an idempotency key; no client-supplied
  operation key; internal Serializable retries may rerun aborted attempts.
- Free-text transition reasons removed entirely — deferred until D-10
  retention/erasure/export and legal/data-classification policy is resolved.
- Diff canonicalization: sections identified by `sectionId`, items by
  `itemId`; `parameterId`/`parameterKey` demoted to item attributes;
  multiple items may reference one parameter; rebinding = field-replacement
  warning listing underlying semantic deltas; domain-separated,
  length-prefixed, versioned hash input.
- Authorization order: gate → session/collection authorization →
  caller-scoped list fetch → index/fingerprint resolution → in-transaction
  write authorization before any mutation; no selection-derived information
  returned before authorization succeeds.
- Schema invariants: nullable unique `supersedes_pin_id` with same-setup
  composite FK + `<> id` CHECK; nullable `transition_kind`
  (`UPGRADE`|`ROLLBACK`) and versioned `transition_summary` JSONB; coupled
  CHECK — initial-assignment pins carry all three NULL, transition pins all
  three non-NULL; direction vs versionSeq consistency enforced by the
  service; no `transition_reason` column.
- Audit honesty: the two tx-bound events (old-pin UPDATE + new-pin CREATE)
  do not alone distinguish a transition from cancel-then-assign — direction
  and lineage live in the pin records; audit-meta allowlist not widened; no
  IDs/labels/free text/answers in meta.
- Empty-target states specified; timing recommendation reversed to
  "approve rules now, implement before DailyEntry".

## Owner-approved decisions (#58–#62, product-decisions.md)

- **#58 Upgrade target** — upgrade moves only to the template's latest
  published version, server-selected; no arbitrary-newer selection;
  post-review publication invalidates the review; nothing automatic.
- **#59 Rollback target** — any earlier retained published version of the
  same template; previously-used not required; same-version never offered;
  never touches `ClientAssignment`.
- **#60 Archived-template transitions** — frozen; no new pins on archived
  templates; existing pins readable/cancellable per #51–#53; exit path =
  cancel then assign a different eligible template. Rejected alternative:
  rollback-only within the relationship.
- **#61 Mandatory structural review** — explicit review + confirmation
  before every transition, including empty diffs; bound to the exact pin,
  target version, and diff; stale fails closed; no internal IDs in
  browser-controlled values.
- **#62 Timing** — rules approved now; implementation deferred until
  immediately before DailyEntry or another first data-consuming slice; C1
  cancel-then-assign remains the interim path; the plan is revisited with
  the first consumer's data-aware rules; this approval authorizes no
  implementation work.

## Binding safety boundary

Free-text transition reasons are excluded from C2 — no column, summary
field, audit field, browser value, or UI input — until D-10 retention,
erasure, export, and legal/data-classification policy is resolved. D-10 is
not resolved here.

## Engineering constraints (recorded, not owner decisions)

Atomic ACTIVE→SUPERSEDED + one successor ACTIVE pin; `supersedesPinId`
lineage/anti-branching only; stale post-commit resubmission; `itemId`/
`sectionId` diff identity; multi-item-per-parameter support; authorization
before selection resolution; #54 visibility unchanged; `clientSetups` RBAC
unchanged; structural-only audit metadata; layered
`ENABLE_CLIENT_SETUP_TRANSITIONS=1` gate; versioned domain-separated
canonical hash; closed-allowlist versioned `transition_summary`; PG +
real-browser evidence with focused pure-logic unit tests. These authorize
nothing by themselves.

## Exclusions and unresolved decisions

Excluded: cross-template atomic replacement; automatic/batch/scheduled
transitions; C3 variants; C4 per-parameter visibility; DailyEntry;
measurements; data/unit conversion; formulas; PRGRSS seed/CALORIES;
plan/target values; client-facing setup; transition reasons; real-client
data; deployment. Unresolved: D-10, D-12 (override handling on repin), and
the future data-aware blocking-rule revision.

## Status

Planning and decision closure complete. No code, schema, tests, PR, merge,
or deployment exist or are authorized for C2. Next gate: independent
different-model review of this docs branch → PR → `verify` CI → separate
merge approval.
