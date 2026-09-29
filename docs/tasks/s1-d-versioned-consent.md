# S1-D task record — versioned consent model and consent gates

Slice S1-D of Stage 1. **Consent only.** No routes/actions/UI, health records, audit tables,
tokens, GDPR, storage, Supabase, or product formulas.

## Files

- `db/schema.prisma` — `ConsentKind`, `ConsentSource`, `ConsentRecord` + relations.
- `db/migrations/<ts>_stage1_versioned_consent/` — migration incl. a raw partial unique index.
- `lib/consent.ts` — policy registry + consent services + protected-operation gate.
- `tests/unit/consent.test.ts`, `tests/integration/s1-d-consent.test.ts`.
- `docs/security/consent-audit.md` (reconcile "append-only" wording), `TRACKER 2.0.md`,
  `docs/STATUS.md`.

## Schema

`ConsentRecord`: `id`, `clientProfileId`, `kind`, `version`, `grantedAt` (timestamptz),
`revokedAt` (timestamptz, null), `grantedByUserId` (null), `source`. Required relation to
`ClientProfile` (`onDelete: Restrict`), optional relation to `User` (`onDelete: SetNull`), index
`(clientProfileId, kind, version, revokedAt)` for exact-version active lookup.

Raw SQL invariant: `CREATE UNIQUE INDEX ... ON consent_record(client_profile_id, kind, version)
WHERE revoked_at IS NULL` — at most one unrevoked row per (client, kind, version).

**History-preserving, not strictly append-only:** grants are never deleted; revocation is the one
permitted mutation (`revokedAt` null → timestamp). No other grant field may change. A revoked
grant permits a later re-grant as a new row.

## Policy versions

A trusted server-side `ConsentPolicyRegistry` supplies the current exact version per kind. The
**production default is unconfigured and fails closed**; tests inject synthetic versions
(e.g. `test-v1`). Callers cannot choose the version, source, or PED/HRT approval. Current grants
always use the registry version + `CLIENT_SELF`. `COACH_ATTESTED` is modeled but rejected until
the offline-consent policy is approved. `PED_HRT` stays fail-closed regardless of a stored row.

## Services (`lib/consent.ts`)

- `grantOwnConsent(session, { workspaceId, clientProfileId, kind })`
- `revokeOwnConsent(session, { workspaceId, clientProfileId, kind })`
- `readOwnConsentStatus(session, { workspaceId, clientProfileId })`
- `hasExactActiveConsent(rows, kind, version)` (pure)
- `authorizeHealthOperation(session, { resource, action, workspaceId, clientProfileId })`

Grant/revoke/read call the S1-B guard with resource `consent` (client `own` only) inside a
Serializable transaction with a tx-bound repo; consent lookups always include the workspace.
Idempotent grant (exact active row exists) and idempotent revoke (nothing active). Errors are
structural (`ConsentError` codes) with no ids/names/versions/values.

Authorization order for protected operations: user/workspace/membership → RBAC scope →
exact-version consent → (audit later in S1-E). Consent never grants authorization by itself.

## Protected mapping (closed)

base = `PRIVACY_NOTICE + HEALTH_DATA`.
`dailyTracking|mealPlans|trainingPlansLogs|checkinsCoachReviews|coachNotes|clientNotes` → base;
`privateMediaFiles` → base + `PHOTOS`; `cycleData` → base + `CYCLE`; `bloodwork` → base +
`BLOODWORK`; `pedHrt` → base + `PED_HRT` + separate unapproved gate (always denied for now).

## Audit boundary

No audit table/no-op logger. `assertConsentMutationsExternallyExposable()` throws
`audit_not_wired_for_external_use` until S1-E couples audit transactionally; no route/action may
expose consent mutations.

## RED tests

Unit: mapping completeness; exact-version match; missing version; revoked; version bump; base +
module extras; PED denial; unknown input; identifier-free errors; authorization-before-consent.
Integration (real PostgreSQL): self-grant; idempotent; racing invariant; revoke across versions;
re-grant new row; old version fails after bump; workspace isolation; owner/coach/assistant/
support/platform denial; unassigned coach denied despite consent; inactive user/member/workspace;
client deletion restricted while consent exists; actor deletion nulls `grantedByUserId` without
deleting history; partial-index regression; synthetic-only fixtures.

## Mutation checks

(1) drop `revokedAt IS NULL`; (2) accept old version; (3) remove workspace scoping; (4) bypass
RBAC; (5) drop the partial unique index. Restore exactly and re-run.

## Commands

`git diff --check`; `npm ci`; `npx prisma format`; `npx prisma validate`; `npx prisma generate`;
`migrate deploy`/`status`; `format:check`; `typecheck`; `lint`; `test`; `test:integration`;
`build`; `test:e2e`. Behavioral gate = real PostgreSQL consent suite (no UI/browser evidence).

## Rollback / non-goals

Revert the schema/migration + `lib/consent.ts` + tests. Non-goals: routes/actions/UI, health
records, audit persistence, tokens, GDPR, storage, food/exercise, PED/HRT behavior, RLS, Supabase,
i18n.
