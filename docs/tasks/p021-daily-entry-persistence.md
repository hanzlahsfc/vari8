# P-021 — Atomic dev-gated DailyEntry persistence + client logging slice

Status: implementation branch `feature/p021-daily-entry-persistence` (pushed,
no PR). Review chain: P-021 → R1 FAIL → R2 → R2-R1 CONDITIONAL PASS → R3 →
R3-R1 CONDITIONAL PASS → final membership-advisory amendment → owner
approval → P-021-I1 implementation.

## Scope and boundaries (binding)

- ONE atomic slice: schema + service + C2 impact provider + client form/history
  + dev gate. No mergeable intermediate state exposes writes without the
  provider.
- Client-authored writes only. No staff writes. No staff value/history view
  in v1 (safe narrowing — staff keep the structural shell).
- Development-gated: `ENABLE_DAILY_ENTRY` unset/off/invalid → shell
  preserved, persistence unavailable, save action refuses before
  session/FormData/DB work. `ENABLE_DAILY_ENTRY=1` AND
  `ENABLE_DAILY_PROTOTYPE=1` → "conflict": shell preserved, persistence
  unavailable (fail-safe).
- Production stays incapable of collecting values: the consent policy
  registry is unconfigured (`policy_not_configured`) and fails closed; the
  dev-only registry exists only when `ENABLE_DAILY_ENTRY=1`.
- No consent-grant UI. Fixed synthetic dev policy versions
  (`daily-entry-dev-privacy-v1` / `daily-entry-dev-health-v1`) — fixtures
  seed matching ConsentRecords.
- No C3, no C4, no formulas, no cycle/CALORIES inputs, no new dependencies,
  no fourth permanent Playwright server.

## Implementation

### Schema (`db/migrations/20261009230000_p021_daily_entry`)

- `daily_entry` — stable per-(workspace, client, entry_date) aggregate;
  `entry_date` is PostgreSQL `DATE`; unique `(workspace_id,
  client_profile_id, entry_date)`; nullable `current_revision_id`.
- `daily_entry_revision` — immutable append-only revision; unique `(id,
  daily_entry_id)` supporting the pointer FK; `(daily_entry_id, seq)` unique;
  `canonical_hash` binds pin + version + ordered params + canonical values.
- `daily_entry_revision_value` — typed nullable columns
  (`value_numeric` NUMERIC(30,8), `value_rating` INTEGER, `value_option_id`
  TEXT, `value_text` TEXT) with a kind-column CHECK requiring exactly the
  matching column non-null; unique `(revision_id, parameter_id)`; no
  item/section duplication (provenance derives from the immutable version
  definition).
- Composite same-workspace/same-client FKs throughout (Restrict): entry→
  ClientProfile; revision→entry(pin-aware, `(daily_entry_id, workspace_id,
  client_profile_id)`), revision→pin `(pin_id, workspace_id,
  template_version_id)` + `(pin_id, client_profile_id)`; value→revision
  `(revision_id, workspace_id)` + value→ParameterDefinition; creator-member
  provenance FKs `(created_by_member_id, workspace_id)` → `workspace_member
  (id, workspace_id)` on entry + revision.
- Pointer creation is two-step inside one transaction: entry with NULL
  pointer → revision/values → pointer update. Cross-entry pointer is
  impossible (`(current_revision_id, id)` → `revision(id, daily_entry_id)`).

### Canonicalization (`lib/daily-entry/canonical.ts`)

- Decimal: trim → raw regex `^[+-]?[0-9]+(?:[.,][0-9]+)?$` → raw fraction
  length check (reject >8 digits INCLUDING trailing zeros) → `,`→`.` →
  strip `+` → strip integer leading zeros → strip trailing fractional zeros
  → drop empty decimal point → all signed-zero forms → `0` → `abs < 10^22`
  bound checked on the canonical string before any PostgreSQL write (no
  JS `Number`, no silent rounding).
- Typed canonical form: MEASUREMENT `num:<decimal>`; RATING `int:<n>`;
  OPTION `opt:<optionOrdinal>`; TEXT `txt:<utf8>`; missing `abs`.
- Revision hash `DAILY-ENTRY-REV-v1`: tagged length-prefixed SHA-256 over
  workspace+client+date+pin+version+ordered snapshot (parameter identity,
  key, classification, kind, snapshot revision, immutable item/section
  provenance) + canonical values. Fixed synthetic digest pinned in unit
  tests.
- Form token `DAILY-ENTRY-FORM-v1`: same tagged encoding over workspace +
  client + entry date + pin + version + null/present current-revision tag +
  current revision id/hash + ordered parameter identity + positional
  selection fingerprint + session user id + current workspaceMemberId.
  Actor fields are server-derived consistency material only — never
  authorization; replay across user/replaced member row fails closed.

### Service (`lib/daily-entry/service.ts`)

Lock order inside the Serializable transaction (bounded retry, every retry
recomputes everything from fresh state):

1. `pg_advisory_xact_lock('csetup:{ws}:{client}')`
2. `pg_advisory_xact_lock('member:{ws}:{user}')`
3. WorkspaceMember row FOR UPDATE (authoritative write-time membership)
4. ClientProfile FOR UPDATE
5. ClientSetup FOR UPDATE
6. active ClientSetupPin FOR UPDATE
7. ConsentRecord rows FOR UPDATE in `kind` order + exact-version re-check
8. DailyEntry create-or-lock for the declared date
9. current revision inspect → token check → validate → canonical hash →
   dedup (identical → `no_op`, no revision, no audit)
10. revision + value inserts + pointer update + transaction-bound audit
    (`resourceType daily_entry`, action `daily_entry.save`, metadata
    `{changed: true, count: <changed parameters>}` — never values/dates/
    labels/hashes)

Reads: `loadDailyEntrySurface` resolves the client's own profile only,
re-checks consent (unlocked mirror of the write check), loads current
values + bounded append-only history rendered from the immutable version
definition; no staff read path exists.

### C2 provider (`lib/coaching/daily-entry-impact.ts` + `impact-consumers.ts`)

- Declared consumer `daily-entry` registered in the same atomic release;
  per-request factory composition replaces the permanently empty set, so
  provider-set identity changes and outstanding reviews stale correctly.
- Counts DISTINCT logical entries (`daily_entry` rows) touching the
  parameter — one entry/date counts once despite revisions; superseded-only
  evidence included; earliest/latest bounds use `entry_date`; unknown
  parameters fail closed (`affected_parameters_unknown`); output is
  parameterKey + reason/count/dates only — serializer strips every internal
  id before browser output.

### Routes / UI

- `/workspace/[workspaceId]/daily` moved to route group
  `app/(tracker)/workspace/[workspaceId]/daily/` with a dual-role layout:
  staff keep the full workspace chrome; an ACTIVE CLIENT member of an
  ACTIVE workspace gets a reduced chrome (Daily Tracker link only).
  Rationale: the pre-existing `/workspace/[workspaceId]/layout.tsx` is a
  staff-only shell (`workspaceSettings` denies CLIENT) — admitting clients
  there would have silently exposed catalog pages whose RBAC cells grant
  CLIENT read scope. The route group's URL is unchanged; every sibling
  page keeps its staff layout and guards.
- `app/(tracker)/.../daily/entry-actions.ts` — server action; mode gate
  (must resolve `persistent`) runs BEFORE `auth()`, before any FormData
  read — flag off/unset/invalid/conflict → generic unavailable failure.
- `daily-entry-panel.tsx` — snapshot-driven form (snapshot sections/items;
  arbitrary parameters are NOT forced into the nine source sections) +
  read-only history; positional ordinal inputs only; remounts on
  form-token change; role-alert errors; pending-disabled controls.
- `lib/daily-entry/boundary.ts` — single app-facing save surface; bounded
  input parsing; non-disclosing error mapping; no internal ids cross the
  boundary.
- `app/daily` prototype remains independently controlled by
  `ENABLE_DAILY_PROTOTYPE` — unchanged.

### Gate (`lib/daily-entry/gate.ts`)

`resolveDailyEntryMode(entry, prototype)`: `persistent` only when
entry==="1" AND prototype unset; `conflict` when both are exactly "1";
`off` otherwise. `dailyEntryConsentRegistry(enabled)` returns the fixed dev
registry only in persistent mode; production gets the unconfigured
fail-closed registry.

## RED-before-code evidence

Base `2d9bfc8`. Unit files `tests/unit/daily-entry-canonical.test.ts`,
`tests/unit/daily-entry-validate.test.ts` and
`tests/integration/p021-daily-entry.test.ts` were written first and failed
with module-not-found (exit 1) before implementation — natural missing-
implementation failures, no manufactured breakage. Disposable PostgreSQL:
`p021_impl_1` (Docker container `app-db-1`, created via `psql` inside the
container — local `createdb` unavailable).

## Test coverage

- Unit: full decimal table (raw-scale-before-normalization incl.
  `1.500000000` reject vs `1.50000000`→`1.5`, `±10^22` boundaries, comma
  separators, signs, exponent rejection), canonical typed/missing
  distinction, fixed SHA-256 vectors (canonical + token + cross-user +
  member-id binding), mode resolver.
- Integration (real PG, disposable DB): pointer FK direction incl.
  cross-entry pointer rejection; cross-workspace member/param FKs; creator
  member FK; value kind CHECK incl. unsupported-kind rejection; one value
  per parameter; DATE/cardinality; save lifecycle incl. no-op dedup, edit
  repoint, history render, stale token zero-writes, cross-user/replaced-
  membership replay, membership revocation, consent missing/revoked with
  retained history, unconfigured-registry fail-closed, staff deny,
  concurrent first-entry + concurrent saves (one winner, loser zero
  writes), date bounds + malformed inputs, distinct-entry provider counts.
- E2E (real browser): client save/reload-prefill/edit-revision/history at
  1440/834/390px, keyboard-complete, no horizontal overflow; staff/owner
  shell-only; conflict mode (primary server) — shell preserved,
  non-disclosing unavailable state; flag-off (:3101) — shell preserved, no
  affordances.

## Known limitations / deferred

- No staff value/history read path at all in v1 (intentional safe
  narrowing).
- No consent-grant UI — dev fixtures seed ConsentRecords directly;
  production policy registry remains unconfigured → production cannot
  collect values.
- No restoration, no deletion, no retention/erasure/export (D-10 gates).
- Membership suspension/removal/replacement paths do not exist yet — the
  `member:{ws}:{user}` advisory + row lock contract is bound NOW for any
  future mutation path (documented in `lib/daily-entry/service.ts`).
- Client layout admission covers ONLY the daily route group — the staff
  layout is unchanged.
- C3 variants, C4 per-parameter visibility: out of scope, not started.
