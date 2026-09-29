# S1-E task record — metadata-only audit logging

Slice S1-E of Stage 1. **Audit only.** Adds the `AuditEvent` model and transactionally
coupled audit writes inside the existing S1-D consent and S1-C client-assignment
mutation services. No routes/actions/UI, health records, tokens, GDPR, storage, or
product formulas. S1-D is independently PASS (SWE-2 High, `3415812` + review-record
commit `27f9603`); this plan is written before any S1-E production code.

Sources: `docs/tasks/stage-1-plan.md` §5/§9 (S1-E row), `docs/security/consent-audit.md`
§2, `docs/security/authorization-model.md` (`auditLog` row), `docs/security/
data-ownership.md` (audit records owned by `Workspace`).

## Scope decision recorded up front

- Audit events are written **only inside the same Serializable transaction** as the
  business mutation they describe. An audit row therefore commits if and only if the
  mutation commits.
- An event is emitted **only when the mutation actually changes state**
  (`changed: true`). Idempotent no-change results (`changed: false`) and all denied or
  failed attempts produce **no** audit row. Rationale: the event must describe a
  committed mutation; a misleading row for a rejected/rolled-back/no-op attempt is
  worse than none. `consent-audit.md` §2's "every denied attempt" auditing is
  **deferred** to a later slice: denials happen before/outside the mutation
  transaction, and writing a `DENY` row inside the rolled-back transaction is
  impossible. Recording denial audit from untrusted callers also needs its own
  abuse/rate-limit thinking. Explicit non-goal for S1-E.
- `assertConsentMutationsExternallyExposable` /
  `assertAssignmentMutationsExternallyExposable` **keep throwing
  `audit_not_wired_for_external_use`**. Audit wiring is necessary but not sufficient
  for exposure: no route/action exists, and exposure additionally requires the S1-H
  routing slice plus independent review. The stale "until S1-E" comments are updated
  to reflect that audit is now wired while exposure remains closed.

## Files

- `db/schema.prisma` — `AuditAction`, `AuditResult`, `AuditEvent` + relations
  (`Workspace.auditEvents`, `User.auditEvents`, `ClientProfile.auditSubjectEvents`).
- `db/migrations/<ts>_stage1_audit_events/` — additive migration only.
- `lib/audit.ts` — event builder, metadata allowlist sanitizer (fail-closed),
  transaction-bound writer, owner-scoped bounded reader.
- `lib/consent.ts` — audit write inside `grantOwnConsent` / `revokeOwnConsent`
  transactions (comment updates only for the exposure assertion).
- `lib/workspace/clients.ts` — audit write inside `assignCoach` / `setPrimaryCoach` /
  `removeClientAssignment` transactions (comment update for the exposure assertion).
- `tests/unit/audit.test.ts`, `tests/integration/s1-e-audit.test.ts`,
  `tests/integration/s1-a-identity.test.ts` (expected table set gains `audit_event`).
- `docs/security/consent-audit.md` (mark §2 implemented), `docs/STATUS.md`,
  `TRACKER 2.0.md`, this record.

## Schema

`AuditEvent`: `id` TEXT cuid; `workspaceId` TEXT required FK → `workspace(id)`
`onDelete: Restrict` (tenant boundary; audit rows are never cascade-deleted);
`actorUserId` TEXT nullable FK → `users(id)` `onDelete: SetNull` (erasure nulls the
actor, keeps the structural row); `actorRole` `MemberRole?` (workspace role at event
time; null for non-member/system actors); `action` `AuditAction`; `resourceType` TEXT;
`resourceId` TEXT nullable; `subjectClientProfileId` TEXT nullable FK →
`client_profile(id)` `onDelete: SetNull` (subject nulled on erasure, row retained);
`result` `AuditResult`; `reason` TEXT nullable (structural codes only); `at`
timestamptz default now; `ip` TEXT nullable; `meta` JSONB nullable.

`AuditAction` = the reviewed closed set from `consent-audit.md`:
`READ CREATE UPDATE DELETE EXPORT GRANT REVOKE INVITE ASSIGN DENY LOGIN`.
`AuditResult` = `ALLOW | DENY`.

Indexes: `@@index([workspaceId, at])` — the only read path is tenant-scoped,
time-ordered listing. No other indexes in this slice (subject/actor lookup indexes
arrive with S1-G erasure if needed).

The migration is additive: CREATE TYPE ×2, CREATE TABLE, CREATE INDEX, three FK
ALTERs. **No DROP, no alteration of existing tables/indexes.** S1-A composite FKs,
`client_assignment_one_active_primary_key`, and `consent_record_active_version_key`
must remain (asserted by the existing integration tests).

`resourceId`/`resourceType`/`reason`/`ip` stay plain columns (no FK on `resourceId` —
it is polymorphic). `meta` is JSONB but is **write-side constrained** by the allowlist
below; the column is not a free-form blob.

## Audit-event ownership and tenant boundaries

- Owner: `Workspace` (`workspaceId` NOT NULL). Every row written inside a mutation
  transaction uses the **authorized** workspace id (the one validated against an
  ACTIVE membership by the S1-B guard), never a caller-claimed value.
- `actorUserId`/`actorRole` come from the `AuthorizationContext` produced inside the
  transaction (`context.userId`, `context.workspaceRole`), not from session fields or
  caller input.
- `subjectClientProfileId` is the validated `clientProfileId` (already proven to live
  in that workspace by `requireClientInWorkspace` before mutation).
- Reads: `listAuditEvents(session, { workspaceId, limit?, cursor? })` uses
  `authorizeCollection(session, { resource: "auditLog", action: "read", workspaceId })`
  and then requires `grantedScope === "workspace"` — owner-only today;
  `authorizeCollection` already rejects `platform` scope, so PLATFORM_ADMIN audit
  access stays deferred until a platform path exists (matrix allows it, plumbing does
  not). Query `where` is `workspaceId`-constrained; `id`-ascending cursor pagination;
  default 25, max 100 via `normalizeLimit`.

## Allowed metadata (`meta`)

Write path: `buildAuditEvent` accepts a typed `AuditMeta` and `sanitizeAuditMeta`
re-enforces it at runtime — **allowlist fail-closed**, not denylist best-effort.

Allowed keys (closed set), all optional, flat values only:

| Key       | Type               | Use                                         |
| --------- | ------------------ | ------------------------------------------- |
| `kind`    | `ConsentKind`      | consent grant/revoke kind                   |
| `version` | string (≤ 64)      | policy version string (e.g. `test-v1`)      |
| `changed` | boolean            | mutation outcome flag                       |
| `count`   | integer (≥ 0)      | rows affected (e.g. revoke across versions) |
| `role`    | `AssignmentRole`   | assignment post-state role                  |
| `status`  | `AssignmentStatus` | assignment post-state status                |

Runtime rules: any other key → `AuditError("audit_metadata_forbidden")`; values must
be string/boolean/integer matching the table (no objects, arrays, null-prototype
objects, or floats); strings additionally rejected when they contain `@`, exceed the
bound, or match a forbidden-shape pattern (JWT/`Bearer`/hex-token-like). Nested or
array values are rejected outright — `meta` never carries blobs.

**Forbidden — must never appear in any audit field** (`meta` or column abuse):
health readings or values, protocol/consent text, note bodies, client or user names,
emails, passwords, credentials, tokens, secrets, file contents, presigned URLs,
request bodies/payloads, or arbitrary caller-supplied objects. `reason` and
`resourceType` accept only module-defined structural codes (e.g.
`consent`/`client_assignment`).

## Transactional coupling

`lib/audit.ts` exports `writeAuditEvent(tx: Prisma.TransactionClient, ...)`. It takes
the **transaction client type only** — there is no non-transactional overload and no
no-op/best-effort logger, so audit cannot silently run outside the mutation
transaction or swallow errors.

Inside each existing Serializable mutation transaction, **after** the business write
succeeds and **only** on the `changed: true` path:

| Service                  | Action   | resourceType        | meta                      |
| ------------------------ | -------- | ------------------- | ------------------------- |
| `grantOwnConsent`        | `GRANT`  | `consent`           | `kind`, `version`         |
| `revokeOwnConsent`       | `REVOKE` | `consent`           | `kind`, `count`           |
| `assignCoach`            | `ASSIGN` | `client_assignment` | `role`, `status`          |
| `setPrimaryCoach`        | `UPDATE` | `client_assignment` | `role: PRIMARY`, `status` |
| `removeClientAssignment` | `UPDATE` | `client_assignment` | `role`, `status: REMOVED` |

Plus `resourceId` (created/updated row id), `subjectClientProfileId`, `result: ALLOW`.

- If `writeAuditEvent` throws (allowlist violation, DB error), the whole transaction
  rolls back: **no audit ⇒ no mutation** (`consent_conflict`/`audit_failed`-style
  structural error to the caller — exact code set: `audit_write_failed` mapped from
  unexpected errors, `audit_metadata_forbidden` for allowlist violations).
- The grant P2002-recovery path returns `changed:false` and writes nothing; the race
  winner's own transaction already wrote the `GRANT` row. Denials (RBAC,
  `requireClientInWorkspace`, PED/HRT, source policy, `policy_not_configured`,
  `consent_missing`, uniqueness conflicts) occur before any audit write or abort the
  transaction — **zero** audit rows.
- `updateMany`-based revoke uses the returned `count` for both `changed` and
  `meta.count`.

## Default-deny and rollback behavior

- Auditing is not optional and not best-effort: every `changed:true` mutation commits
  with its event or not at all. There is no flag to disable it and no code path that
  swallows `AuditError`.
- If audit creation fails, the business mutation rolls back (same transaction).
- If the business write fails (P2002 class, serialization), no success event exists.
- Rollback strategy for the slice itself: revert the S1-E commits; the migration is
  additive so the audit table may also simply be left unused — no down-migration
  against existing data is required for reversal of code.

## Retention / open policy (no invented decisions)

- `TODO(human)`: audit retention period (per `consent-audit.md` §2 — no duration
  invented here); whether `SUPPORT` may read audit for triage; erasure-time nulling of
  `actorUserId`/`subjectClientProfileId` is schema-enabled (`SetNull`) but the erasure
  flow itself is S1-G.
- `DENY`-result rows for unauthorized attempts: deferred (see Scope decision) —
  `TODO(human)` on abuse-volume policy for unauthenticated/cross-tenant probes.

## RED tests (written and observed failing before production code)

Unit (`tests/unit/audit.test.ts`): allowlist accepts each legal key; rejects unknown
keys, nested objects/arrays, oversized strings, `@`-bearing strings, token-like
shapes, and every forbidden-name key (`password`, `token`, `secret`, `email`, `name`,
`note`, `body`, `payload`, `request`, `value`, `health`); `buildAuditEvent` shape;
writer requires a transaction client; consent/assignment services propagate audit
failure (mocked tx where `auditEvent.create` throws ⇒ service rejects).

Integration (`tests/integration/s1-e-audit.test.ts`, real PostgreSQL):

1. Successful grant commits consent row **and** one `GRANT`/`ALLOW` event with correct
   `workspaceId`, `actorUserId`, `actorRole = CLIENT`, `subjectClientProfileId`,
   `meta {kind, version}`.
2. Revoke commits one `REVOKE` event with `meta {kind, count}`.
3. assign / setPrimary / remove each commit their event (`ASSIGN`, `UPDATE`,
   `UPDATE`+`status:REMOVED`).
4. Forced audit failure (proxy tx whose `auditEvent.create` throws) ⇒ service
   rejects; `consent_record` count stays 0; `audit_event` count stays 0.
5. Failed business mutation (e.g. unauthorized caller, `PED_HRT` grant, invalid kind)
   ⇒ zero audit rows and zero consent rows.
6. Cross-workspace attempts (wrong workspace id, member of B targeting client in A)
   ⇒ `AccessDeniedError`, zero mutations, zero audit rows.
7. Idempotent grant (`changed:false`) and idempotent revoke (nothing active) ⇒ no new
   audit rows. Concurrent-grant loser (P2002 recovery / P2034) ⇒ exactly one `GRANT`
   row total for the pair.
8. `listAuditEvents`: owner lists own workspace only; owner-of-B cannot read A;
   coach/assistant/support/client denied; default 25/max 100 cursor pagination over
   ≥ 101 synthetic rows; no event field contains the canary value.
9. S1-A table-set assertion updated to include `audit_event`; raw-SQL constraint
   regressions (composite FKs, both partial indexes) still pass.

## Mutation testing (temporary, restored byte-for-byte)

- Remove the audit write from `grantOwnConsent` ⇒ test 1 fails.
- Bypass the meta allowlist ⇒ canary/forbidden-key tests fail.
- Write audit **outside** the transaction ⇒ rollback test 4 fails.
- Drop `workspaceId` from `listAuditEvents` `where` ⇒ cross-workspace test fails.
- Emit an audit row on a denied/failed path ⇒ tests 5/6 fail.

## Gate commands

`git diff --check`; `npm ci`; `npx prisma format`; `npx prisma validate`;
`npx prisma generate`; `npx prisma migrate deploy` + `npx prisma migrate status` on a
fresh disposable database; `npm run format:check`; `npm run typecheck`;
`npm run lint`; `npm run test`; `npm run test:integration` (real PostgreSQL);
`npm run build`; `npm run test:e2e`. Behavioral gate = the real-PostgreSQL audit
suite (S1-E adds no UI; no browser claims beyond the existing E2E regression suite).

## External-exposure boundary

No routes, server actions, API handlers, UI, or deployment. The `auditLog` read
service is library code only. Consent/assignment mutations remain unexposed; the
assertion helpers keep failing closed (comments updated). S1-E implementation does
**not** authorize exposure; that remains gated on S1-H routing work and a separate
independent review.

## Documentation updates required

`docs/security/consent-audit.md` §2 header (plan → implemented, note deferred DENY
auditing), `docs/STATUS.md`, `TRACKER 2.0.md` (§6 implemented list, §8 next action,
§12 entry), this record. Mark S1-E **implemented with gates green; independent
review pending** — never independently reviewed by the builder.

## Status

**Implemented then independently FAILED; repaired (builder: SWE-2 High); gates green;
independent re-review PENDING.**

### Independent review outcome (opencode-go/deepseek-v4.1-flash)

Reviewed range `3415812..b97c5b5`. Verdict: **FAIL** on four findings:

- **P1 — fail-open metadata allowlist.** `META_VALIDATORS` was a plain object; lookups
  for keys like `constructor`/`toString`/`valueOf`/`hasOwnProperty` resolved inherited
  `Object.prototype` functions, passed the `typeof === "function"` check, and were
  invoked as validators — returning truthy for nested/secret values and persisting
  them (reviewer reproduced a sensitive canary in `audit_event.meta`). Validator
  exceptions (e.g. bare `hasOwnProperty`) also leaked raw `TypeError`.
- **P2 — non-idempotent `setPrimaryCoach`.** Re-asserting an already-active PRIMARY
  returned `changed: true` and wrote a second `UPDATE` event with no state change.
- **P3 — documentation drift.** DENY auditing, login outcomes, platform-admin reads,
  health-operation auditing, and "recursive deny-list" wording did not match the
  implemented subset.
- **P4 — read-path index mismatch.** `listAuditEvents` orders/paginates by `id` under
  `workspaceId`, but only `(workspace_id, at)` existed.

### Repair plan (written before production changes)

**P1 — own-key-only allowlist**

- Replace the `META_VALIDATORS` object with a `Map` (intrinsically own-key lookup;
  `get` never traverses a prototype).
- Iterate `Object.entries(meta)`; a missing validator throws
  `AuditError("audit_metadata_forbidden")`.
- Wrap the iteration in `try/catch`: non-`AuditError` throws (getter throws,
  validator throws) normalize to `audit_metadata_forbidden` — no raw `TypeError`
  escapes.
- Build the clean object with `Object.defineProperty` (no `__proto__` setter
  semantics); an invalid key aborts before return, so no partial result can persist.
- Keep: flat values only, per-key type/shape validators, size bounds, forbidden
  value shapes (email/JWT/Bearer/hex-token), plain-or-null-prototype input check.

**P2 — `setPrimaryCoach` no-op detection (inside the Serializable tx)**

- Fetch the target assignment first (full `ASSIGNMENT_SELECT`).
- If it is already `role: PRIMARY` + `status: ACTIVE`, the partial unique index
  `client_assignment_one_active_primary_key` already guarantees it is the _sole_
  active primary — return `changed: false` with no writes and no audit event.
- Otherwise demote the other ACTIVE PRIMARY, upsert the row, write exactly one
  `UPDATE` event, `changed: true`. Concurrency stays structural (P2002 →
  `assignment_conflict`, P2034 → `serialization_conflict`).

**P3 — reconcile docs.** Update `consent-audit.md`, `s1-e-audit.md`, `STATUS.md`,
`TRACKER 2.0.md`: explicit deferred-items list (DENY events — denials happen
before/outside the mutation tx; login outcomes — no auth-flow instrumentation in
scope; platform-admin reads — no plumbing; health-operation audit wrapper — lands
with health slices; retention — `TODO(human)`; support access — `TODO(human)`);
idempotent `changed:false` writes no event; closed allowlist (not recursive
denylist); exposure assertions still fail closed.

**P4 — read index.** New additive migration adding `(workspace_id, id)` index
(`@@index([workspaceId, id])`), keep `(workspace_id, at)`; regression assertion that
all four indexes/constraints coexist; record a real `EXPLAIN` observation without
overclaiming.

RED intent: the new tests must fail against `b97c5b5` (P1 bypass + TypeError leak,
P2 duplicate event, P4 missing index), then pass after repair. Mutation checks:
prototype-chain lookup, accepting unknown keys, raw exception escape, unconditional
`changed:true`/audit, non-tx audit write, missing workspace predicate, missing
index regression assertion — each verified failing then restored byte-for-byte.

### Implementation evidence (pre-repair baseline, retained)

- Plan commit `45752bc`; schema/code/tests commit `87a4d0a`.
- RED evidence: `npx vitest run tests/unit/audit.test.ts` → exit 1 (module
  `../../lib/audit` absent); focused integration run → exit 1 (`audit_event`
  table absent, s1-a table-set test failed) on a fresh disposable database.
- Mutation evidence (each temporary edit restored byte-for-byte): removing the
  grant audit write → 3 integration failures; skipping meta value validators →
  11 unit failures; writing via the non-transaction client → 4 integration
  failures; dropping `workspaceId` from the list `where` → 1 integration
  failure; emitting REVOKE on a no-change path → 1 integration failure;
  removing the removal audit write → 1 integration failure.
- Gates on the final tree (disposable `s1e_final_db`, dropped after):
  `git diff --check` 0; `npm ci` 0; `prisma format` 0 (no diff); `validate` 0;
  `generate` 0; `migrate deploy` 0 (4 migrations); `migrate status` 0;
  `format:check` 0; `typecheck` 0; `lint` 0; `npm run test` 0 (239 passed);
  `test:integration` 0 (56 passed, real PostgreSQL — forced audit failure
  rolled back the grant; concurrent grants left one row + one GRANT event);
  `build` 0; `test:e2e` 0 (21 passed). `npm audit`: 1 moderate + 4 high
  (previously recorded advisories, unchanged; no `--force`).
- `prisma migrate diff` deployed-DB↔datamodel shows only the two known raw
  composite-FK DROPs (the documented S1-A drift hazard; constraints remain live,
  asserted by the S1-A regression tests).
- No route/action/UI/API exposure was added; `assert*ExternallyExposable` still
  fails closed. **S1-E is not independently reviewed** — a fresh different-model
  review is required before S1-F or any external exposure.
