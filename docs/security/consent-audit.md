# Consent and audit design (Stage 1)

Concrete, testable designs for versioned health-data consent and metadata-only audit logging.
Consent is implemented in S1-D (migration `20260929150000_stage1_versioned_consent`,
independently reviewed **PASS** by SWE-2 High at `3415812`); the metadata-only audit
logger is implemented in S1-E (migrations `20260929160000_stage1_audit_events` +
`20260929170000_stage1_audit_read_index`, `lib/audit.ts`; gates green, independently
reviewed **PASS** by `opencode-go/deepseek-v4.1-flash` on repaired `9f02983`, range
`3415812..9f02983`, record `80caad0`). Reuses Prime State's
**patterns** only (consent versioning, audit field shape, log redaction); not its
product kinds/values.

## 1. Consent

### Model

`ConsentRecord` (history-preserving, **not strictly append-only**), owned by a `ClientProfile`.
Grants are never deleted; **revocation is the one permitted mutation** (`revokedAt` null →
timestamp). No other grant field may change. A revoked grant permits a later re-grant as a new
row. A raw partial unique index enforces at most one unrevoked row per
`(client_profile_id, kind, version)`.

| Field             | Type               | Notes                                                                               |
| ----------------- | ------------------ | ----------------------------------------------------------------------------------- |
| `id`              | String (`TEXT`)    | generated application ID uses CUID semantics                                        |
| `clientProfileId` | String (`TEXT`) FK | required owner; `ClientProfile.id` uses CUID semantics                              |
| `kind`            | enum               | `PRIVACY_NOTICE`, `HEALTH_DATA`, `CYCLE`, `PHOTOS`, `BLOODWORK`, `PED_HRT`_(gated)_ |
| `version`         | string             | exact accepted version (e.g. `"2026-09-29"`); compared exactly                      |
| `grantedAt`       | timestamptz        |                                                                                     |
| `revokedAt`       | timestamptz?       | null while active                                                                   |
| `grantedByUserId` | String (`TEXT`)?   | actor; `User.id` uses CUID semantics; nullable                                      |
| `source`          | enum               | `CLIENT_SELF` \| `COACH_ATTESTED` (offline) — _offline policy TODO(human)_          |

The only uniqueness constraint is the **raw partial unique index**
`consent_record_active_version_key` on `(client_profile_id, kind, version) WHERE revoked_at IS NULL`
(Prisma cannot model partial indexes, so it lives in the migration only, guarded by a regression
test). There is deliberately no four-column `(clientProfileId, kind, version, grantedAt)` unique
constraint: it is unnecessary beside the partial active-version index, and the stale documentation
that listed it did not describe the actual enforcement.

Rules:

- **Who grants:** the client (own) by default. Coach-attested offline consent is allowed only
  with an explicit policy (`TODO(human)`) and must record `source` + actor.
- **Versioning:** a stored version is valid only for its exact `version`; a new notice version
  invalidates older grants (they no longer satisfy `hasConsent(kind, currentVersion)`).
- **Revocation:** sets `revokedAt` on active rows of that kind (all versions); rows are never
  deleted. Future reads/writes requiring that kind fail closed; historical records are retained.
- **Re-grant:** writes a new row; history preserved.

### Which operations require consent (role + assignment must also pass)

**Default rule: every client health read/write requires `PRIVACY_NOTICE` + `HEALTH_DATA`.**
Module-specific consents are additional. Consent is evaluated **after** role/assignment
authorization succeeds (both must pass). The `consent` resource itself is client-only
(`own/own`, see the authorization matrix); grant/revoke are audited.

| Operation                                                 | Required consents                                              |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| Daily tracking (weight, sleep, steps, cardio, biometrics) | `PRIVACY_NOTICE` + `HEALTH_DATA`                               |
| Nutrition / meal plans / target snapshots                 | above                                                          |
| Training plans & logs                                     | above                                                          |
| Check-ins & coach reviews                                 | above                                                          |
| Coach notes / client notes                                | above                                                          |
| Private media (progress photos, voice notes)              | above + `PHOTOS`                                               |
| Cycle data                                                | above + `CYCLE`                                                |
| Bloodwork upload/read                                     | above + `BLOODWORK`                                            |
| PED/HRT anything                                          | above + `PED_HRT`, **and** legal/policy sign-off (else denied) |

Combination order (fail closed):

1. session/platform status ACTIVE → 2. workspace membership ACTIVE → 3. role scope
   (own/assigned) → 4. consent check → 5. audit the outcome.

### Tests

- Consent is required for the mapped operations; without it, writes are denied and reads return
  no health data.
- A revoked consent blocks new operations immediately (existing rows preserved).
- A version bump invalidates prior grants.
- Consent never grants access by itself: an unassigned coach with matching consent is still denied.
- PED/HRT stays denied for everyone until the policy gate is approved.

Ownership/enforcement: `ConsentRecord` is owned by the `ClientProfile`; grants/revokes are
authored by the client (`own`). A coach cannot grant or revoke consent. Any coach-attested
offline consent path is `TODO(human)` and must be explicit and audited.

`TODO(human)`: exact consent kinds (cycle vs health-data granularity), offline coach-attested
consent policy, and the PED/HRT consent/policy text.

## 2. Audit logging

### Model (metadata-only)

`AuditEvent`:

| Field                    | Notes                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `scope`                  | `WORKSPACE` \| `ACCOUNT` (S1-F2B); ownership shape enforced by DB CHECKs                           |
| `actorUserId`            | nullable (system/erased actor may be null)                                                         |
| `actorRole`              | workspace role at event time                                                                       |
| `workspaceId`            | tenant — required for `WORKSPACE` rows, **null** for `ACCOUNT` rows (S1-F2B)                       |
| `subjectUserId`          | required for `ACCOUNT` rows (the user the security event belongs to); `Restrict`                   |
| `action`                 | `READ, CREATE, UPDATE, DELETE, EXPORT, GRANT, REVOKE, INVITE, ASSIGN, DENY, LOGIN, PASSWORD_RESET` |
| `resourceType`           | e.g. `daily_entry`, `consent`, `membership`                                                        |
| `resourceId`             | nullable                                                                                           |
| `subjectClientProfileId` | nullable (subject)                                                                                 |
| `result`                 | `ALLOW` \| `DENY`                                                                                  |
| `reason`                 | structural only (e.g. `unassigned`, `no_consent`, `inactive`)                                      |
| `at`                     | timestamptz                                                                                        |
| `ip`                     | nullable                                                                                           |
| `meta`                   | JSON of **structural** data only                                                                   |

**Never** in `meta`: health values, note bodies, credentials, tokens, file contents, or
presigned URLs. Enforcement is a **closed key allowlist** (not a denylist): only the
structural keys `kind`, `version`, `changed`, `count`, `role`, `status` are accepted —
each with a per-key type/shape validator — and every other key, including
`Object.prototype` member names (`constructor`, `toString`, `__proto__`, …), is rejected
with `audit_metadata_forbidden` before write. Value-shape patterns additionally reject
email/JWT/Bearer/hex-token-like strings and oversized values; enumeration or validator
exceptions normalize to the same structural error.

### What is audited

**S1-F2B scope rules** (enforced by named CHECK constraints
`audit_event_workspace_scope_shape` / `audit_event_account_scope_shape`):

- `WORKSPACE` rows: `workspaceId` required, `subjectUserId` must be null.
- `ACCOUNT` rows: `subjectUserId` required, `workspaceId` must be null — an
  account-owned security event can never fabricate a workspace, and never
  appears in workspace listings (`listAuditEvents` hard-filters
  `scope: WORKSPACE`).
- `subjectUserId` uses `Restrict` — deleting a user cannot silently erase its
  security history. Account writers go through a separate closed path
  (`writeAccountAuditEvent`): account allowlisted actions/resources only
  (`PASSWORD_RESET` over `user`/`access_token`), nullable actor for
  unauthenticated flows, same metadata allowlist, transaction-bound.
- `listAccountAuditEvents` is an internal repository primitive (subject-scoped,
  `scope: ACCOUNT`, default 25 / max 100, id cursor, minimal fields) — it is
  **not** a user-facing security log or an authorization claim.

**Implemented in S1-E** (the only events written today):

- Consent grant/revoke/version changes: `GRANT`/`REVOKE` events committed inside the
  same Serializable transaction as the mutation.
- Client assignment changes: `ASSIGN` (assign/reactivate) and `UPDATE` (set-primary,
  removal) events in the mutation transaction.
- Only `changed: true` outcomes produce events (`result: ALLOW`); idempotent
  `changed: false` calls — including `setPrimaryCoach` on the already-active sole
  primary — write no event. Denied/failed/cross-workspace attempts write no event.

**Deferred (required later, not silently dropped):**

| Requirement                                           | Why deferred                                                                                                                   | Prerequisite/slice                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| DENY events for denied attempts (role/consent/tenant) | Denials occur before/outside the mutation transaction; needs a post-denial write path plus abuse-volume policy (`TODO(human)`) | Routing slice (S1-H) — required before exposure |
| Login outcome auditing                                | No auth-flow instrumentation exists yet                                                                                        | Auth slice / S1-H                               |
| Platform-admin audit reads                            | Matrix permits it, but no platform session/plumbing exists                                                                     | Platform-admin path                             |
| Audit wrapper on `authorizeHealthOperation`           | No health resources exist yet to audit                                                                                         | Health slices (Stage 2+)                        |
| Health-resource read/write auditing                   | Same — no persisted health resources                                                                                           | Health slices (Stage 2+)                        |
| Retention period                                      | Human policy decision                                                                                                          | `TODO(human)`                                   |
| `SUPPORT` audit read for triage                       | Human policy decision                                                                                                          | `TODO(human)`                                   |

External exposure of any audited mutation additionally requires the routing slice and
a fresh independent review; `assert*ExternallyExposable` still fails closed.

S1-E writes only `ALLOW` events describing committed mutations. `meta` is constrained
by a closed runtime allowlist (`kind`, `version`, `changed`, `count`, `role`,
`status`) — every other key and forbidden value shapes are rejected before write.
Audit reads: `listAuditEvents` is workspace-owner scoped, bounded (default 25,
max 100, `id`-cursor); platform-admin read is matrix-permitted but has no plumbing
yet.

### Access & retention

- Audit reads: `OWNER` (workspace) and `PLATFORM_ADMIN` only (see matrix); metadata-only.
- Audit rows are retained independently of client erasure; on erasure, `actorUserId`/subject
  identifiers are nulled but the structural row remains.
- `TODO(human)`: audit retention period (no duration invented), and whether `SUPPORT` may read
  audit for triage.

### Tests

Implemented now (real PostgreSQL, `tests/integration/s1-e-audit.test.ts`):

- Successful consent/assignment mutations commit exactly one `ALLOW` event in the
  same transaction; forced audit failure rolls the mutation back; failed mutations,
  cross-workspace attempts, and idempotent `changed:false` calls write no event.
- Prototype-member metadata keys and a synthetic leak canary can never be persisted.
- Owner-scoped bounded `listAuditEvents` (default 25, max 100, `id` cursor).

Target end-state (deferred slices):

- Denied cross-workspace / unassigned / no-consent attempts each write one `DENY`
  audit row (lands with DENY auditing).
- Export/erasure audit actions (land with S1-G).
- Erasure nulls actor/subject identifiers but preserves structural audit rows (S1-G;
  schema is already `SetNull`-ready).
