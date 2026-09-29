# Consent and audit design (Stage 1)

Concrete, testable designs for versioned health-data consent and metadata-only audit logging.
Consent is implemented in S1-D (migration `20260929150000_stage1_versioned_consent`,
independently reviewed **PASS** by SWE-2 High at `3415812`); the metadata-only audit
logger is implemented in S1-E (migration `20260929160000_stage1_audit_events`,
`lib/audit.ts`; gates green, **independent review pending**). Reuses Prime State's
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

| Field                    | Notes                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `actorUserId`            | nullable (system/erased actor may be null)                                         |
| `actorRole`              | workspace role at event time                                                       |
| `workspaceId`            | tenant                                                                             |
| `action`                 | `READ, CREATE, UPDATE, DELETE, EXPORT, GRANT, REVOKE, INVITE, ASSIGN, DENY, LOGIN` |
| `resourceType`           | e.g. `daily_entry`, `consent`, `membership`                                        |
| `resourceId`             | nullable                                                                           |
| `subjectClientProfileId` | nullable (subject)                                                                 |
| `result`                 | `ALLOW` \| `DENY`                                                                  |
| `reason`                 | structural only (e.g. `unassigned`, `no_consent`, `inactive`)                      |
| `at`                     | timestamptz                                                                        |
| `ip`                     | nullable                                                                           |
| `meta`                   | JSON of **structural** data only                                                   |

**Never** in `meta`: health values, note bodies, credentials, tokens, file contents, or
presigned URLs. A redaction deny-list (recursive key + value-shape patterns) applies to logs.

### What is audited

- Reads and writes of health resources (daily, cycle, nutrition, training, check-ins, bloodwork,
  PED/HRT, notes, media), batched per request where possible.
- Exports and erasures (with counts only).
- Consent grant/revoke/version changes. **Implemented in S1-E**: `GRANT`/`REVOKE`
  events commit inside the same Serializable transaction as the mutation (only for
  `changed: true`; idempotent and denied attempts write nothing).
- Membership/invitation changes and **client assignment changes**. **Implemented in
  S1-E**: `ASSIGN` (assign/reactivate) and `UPDATE` (set-primary, removal) events in
  the mutation transaction.
- **Every denied attempt** (role/assignment/consent/tenant), with `result: DENY` + reason.
  **Not yet implemented** — denials occur before/outside the mutation transaction, so
  they cannot share it; deferred to the routing slice with an abuse-volume policy
  (`TODO(human)`).
- Login outcomes (allow/deny; no existence oracle). Not yet implemented.

S1-E writes only `ALLOW` events describing committed mutations. `meta` is constrained
by a closed runtime allowlist (`kind`, `version`, `changed`, `count`, `role`,
`status`) — unknown keys and forbidden value shapes are rejected before write.
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

- Denied cross-workspace / unassigned / no-consent attempts each write one `DENY` audit row.
- Export/erasure/consent/assignment changes each write the expected audit action.
- Audit `meta` contains no health values, note bodies, tokens, credentials, or file contents
  (asserted with a synthetic leak canary).
- Erasure nulls actor/subject identifiers but preserves structural audit rows.
