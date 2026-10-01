# S1-G — privacy / export / storage implementation plan

**Plan only. No production code, schema, migration, route, or UI in this task.**
Planning branch `feature/s1-g-privacy-storage-plan` off `main` `8369451`
(S1-F2D merged via PR #1; post-merge CI passed). Implementation begins only
after this plan is reviewed; the builder never self-grades.

**Revision 2 — scope narrowed after external review.** Review findings
established that every erasure path has an unresolved policy conflict, so
this slice now covers only the policy-independent parts: export, retention
policy-as-data, and the storage port. All erasure work is deferred (§5).

Sources: `docs/tasks/stage-1-plan.md` §7 + §9 (row S1-G),
`docs/security/data-ownership.md`, `docs/security/authorization-model.md`,
`docs/security/consent-audit.md`, `docs/product-decisions.md`,
`docs/open-questions.md`, and the merged S1-A…S1-F2D code. Anything not in
those sources is marked PROPOSED (needs review) or `TODO(human)` (not
implementable yet). Nothing below invents retention durations, storage
vendor/configuration, legal copy, export contents beyond the documented
allowlist mechanism, or deletion/anonymization behavior.

## 1. Scope

S1-G builds internal privacy/storage **services** only. It ships no route,
server action, UI, email, scheduled job, or external-provider integration.
Every entry point sits behind a fail-closed `assert*ExternallyExposable`
gate until the S1-H routing slice plus a fresh independent review.

In scope — the policy-independent parts of `stage-1-plan.md` §7:

1. **Export** — client-own export resolved from the actor (no client-id
   parameter on the own path); closed section allowlist + counts manifest;
   bounded pagination with explicit failure, never silent truncation;
   audited once. The `exportsErasure` matrix also grants owner `ws` and
   coach `asg` read scope, so a guarded per-client export for those roles
   is included (see §4 and the open flag in §10).
2. **Retention** — policy represented as data with `TODO(human)` durations;
   evaluation only. **No automatic cleanup job, scheduler, or cron.** The
   already-implemented 30-day terminal `access_token` cleanup (S1-F2B,
   founder-decided) is unchanged.
3. **Storage port** — provider-neutral object-storage abstraction: private
   bucket semantics, no ACLs, server-generated presigned GET with bounded
   TTL, keys prefixed by workspace + client. **No Supabase-specific APIs,
   no vendor SDK, no new dependency, no real backend.**

Explicitly OUT of scope for this slice (see §5):

- Client-data deletion, user-account anonymization, workspace
  anonymization, and their audit events — all blocked on unresolved
  `TODO(human)` policy, not on engineering.
- Routes/UI (S1-H), DENY-event auditing (documented as a routing-slice
  prerequisite), login auditing, platform-admin audit plumbing, health
  records and any health-module export (Stage 2+ — **no client-health
  persistence exists, so a complete client-health export is not possible;
  the export allowlist can only cover the client-owned rows that exist
  today**), email delivery, rate limiting, legal/policy copy, a real
  storage backend, workspace departure UX (membership/assignment removal
  already exists and revokes access without touching data), and any
  cross-workspace sharing.

## 2. Locked/documented vs. open

| Item                                                                                                                                                        | State                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Own export resolved from actor; section allowlist + counts manifest; audited once                                                                           | DOCUMENTED (`stage-1-plan.md` §7)                               |
| Retention = policy-as-data; **no automatic deletion job**                                                                                                   | DOCUMENTED mechanism; **all durations `TODO(human)`**           |
| Private bucket, no ACL, server presigned GET (short TTL), ws+client key prefix                                                                              | DOCUMENTED shape; **vendor/bucket/region/TTL `TODO(human)`**    |
| `exportsErasure` matrix: owner `ws/ws`, coach `asg/—`, client `own/own`, others denied                                                                      | LOCKED (`authorization-model.md`, `lib/auth/rbac.ts`)           |
| Consent grants are never deleted; `revokedAt` is the only permitted mutation                                                                                | LOCKED (`consent-audit.md` §1) — blocks client-profile deletion |
| Membership/assignment removal revokes access, data stays workspace-owned                                                                                    | IMPLEMENTED (S1-C/S1-F2C) — reused, not re-built                |
| access_token 30-day terminal cleanup                                                                                                                        | IMPLEMENTED (S1-F2B, founder decision #26) — unchanged          |
| Export JSON shape, section/field allowlist, per-section row bound, storage key format                                                                       | PROPOSED in §4/§7 — require review sign-off                     |
| Retention durations (all families + audit), storage vendor/config/TTL, legal/privacy copy, export download delivery, all erasure behavior, PED/HRT anything | `TODO(human)` — NOT implementable (§10)                         |

## 3. Files

New:

- `lib/gdpr/export.ts` — export assembly + allowlist + manifest + bounds.
- `lib/gdpr/retention.ts` — policy-as-data + evaluation (all durations unset).
- `lib/gdpr.ts` — fail-closed exposure assertions for the slice
  (`assertGdprExternallyExposable`, mirroring `lib/tokens.ts`).
- `lib/storage.ts` — provider-neutral storage port + fail-closed null backend.
- `tests/unit/gdpr-export.test.ts`, `tests/unit/retention.test.ts`,
  `tests/unit/storage.test.ts`.
- `tests/integration/s1-g-export.test.ts`,
  `tests/integration/s1-g-retention.test.ts`.
- `docs/tasks/s1-g-privacy-storage.md` (this file), `docs/STATUS.md`.

Touched:

- `lib/audit.ts` — extend the closed `AUDIT_RESOURCE_TYPES` allowlist with
  `"client_export"` only. `AuditAction` already carries `EXPORT`; the meta
  allowlist needs no new keys (`count` suffices for the manifest summary).
  No erasure audit resources are added — erasure is deferred (§5).
- **No schema or migration change.** Gate: `git diff 8369451 -- db/` must
  stay empty.

## 4. Export design (PROPOSED — contents need review sign-off)

```ts
exportOwnData(session: SessionLike, input: { workspaceId: string }, client?):
  Promise<ClientExportDocument>
exportClientData(session: SessionLike, input: { workspaceId: string; clientProfileId: string }, client?):
  Promise<ClientExportDocument>
```

- `exportOwnData` resolves the `ClientProfile` from `ctx.userId` inside the
  authorized workspace — the caller cannot name another client. It
  authorizes `exportsErasure/read` first; the `own` scope pins
  `client.userId === userId`.
- `exportClientData` authorizes `exportsErasure/read` and serves only the
  scopes the matrix grants: `workspace` (owner) and `assigned` (coach).
  `own` scope is rejected here (use `exportOwnData`); SUPPORT, assistant,
  platform-admin, and non-members deny structurally.
- Document (PROPOSED): `{ formatVersion, manifest, sections }` —
  `manifest.sections` maps each emitted section to its row count plus
  `totalRecords`; the audit event's timestamp covers generation time.
- Section allowlist — closed set, only existing client-owned tables
  (PROPOSED fields; the reviewer may shrink, never silently grow):

  | Section         | Rows                                        | Proposed fields                                       |
  | --------------- | ------------------------------------------- | ----------------------------------------------------- |
  | `clientProfile` | the one profile                             | `name`, `createdAt`                                   |
  | `consents`      | all `ConsentRecord` rows (grants + revokes) | `kind`, `version`, `grantedAt`, `revokedAt`, `source` |
  | `assignments`   | all `ClientAssignment` rows                 | `role`, `status`, `assignedAt`                        |

  Explicitly excluded: internal DB ids, `grantedByUserId`, coach/member
  ids and PII, `AuditEvent`, `AccessToken`/`targetEmail`, other clients,
  workspace internals, and every not-yet-existing health table. When Stage
  2 health tables land, each new export section is added to the allowlist
  deliberately and re-reviewed — the allowlist never iterates tables
  dynamically.

- **Resource bounds — no silent incompleteness.** Each section is read with
  explicit bounded pagination (id-cursor pages, `EXPORT_PAGE_SIZE` rows per
  query) and a hard per-section ceiling `EXPORT_SECTION_ROW_MAX`
  (engineering bound — PROPOSED value `100_000`, flagged for review; it is
  not a product retention or access policy). If a section would exceed the
  ceiling, the export throws `GdprError("export_too_large")` and returns
  **nothing** — a partial export is never produced and the audit event is
  not written. The manifest counts always equal the emitted rows by
  construction (counts are derived from the emitted arrays, not queried
  separately).
- Exactly one `EXPORT`/`client_export` WORKSPACE audit event per successful
  export, inside the same transaction as the reads,
  `subjectClientProfileId` set, `meta { count }` = total exported rows.
  Denied or `export_too_large` attempts write nothing (DENY auditing stays
  deferred to S1-H).
- Delivery is a returned document; no route, download URL, or file naming
  (`TODO(human)` for the S1-H surface).

## 5. Erasure — DEFERRED, not implemented in this slice

All three documented erasure paths are blocked on unresolved policy, so
this slice ships no erasure code:

1. **Client-data deletion is incompatible with the locked consent model.**
   `client_profile` has `Restrict` FKs from `consent_record` and
   `client_assignment`; deleting a client requires deleting its consent
   rows — but `consent-audit.md` §1 states grants are **never deleted**
   and `revokedAt` is the only permitted mutation. A policy-compatible
   design (e.g. anonymize-in-place consent shells vs. an approved
   retention exception) is `TODO(human)`; until it exists, client erasure
   stays out of scope.
2. **User-account anonymization can orphan a workspace.** Tombstoning the
   only `WORKSPACE_OWNER`'s account while their membership stays ACTIVE
   leaves a workspace with no functional owner. Safe handling
   (ownership transfer, sole-owner refusal, workspace disposition) is
   `TODO(human)`; the whole path is deferred, not just the owner case.
3. **Workspace anonymization has no resolved sequence.** It depends on
   client erasure (blocked above) and its transaction/storage ordering
   was flagged as ambiguous; deferred until both are designed and
   reviewed.

Recorded requirements for the future erasure design (from review):

- **Storage delete vs DB transaction are NOT atomic** — never claimed
  otherwise. The documented order (private objects removed before the DB
  transaction) means a DB failure after storage deletion leaves objects
  gone while rows remain. Required mitigations: `deletePrefix` must be
  **idempotent**; the erasure operation must be **safe to retry**
  end-to-end (a retry after a mid-failure completes correctly); any
  residual state must surface as a structural `erasure_failed` outcome,
  never a reported success.
- **Erasure audit records must not retain deleted client identifiers** in
  `resourceId` (consistent with `subject_client_profile_id` being
  SetNull'd on erasure): erasure events use `resourceId: null` or a
  non-client structural target only.
- Sole-owner/last-owner orphan checks and ownership-transfer policy are
  prerequisites for account anonymization.

## 6. Retention — policy as data, evaluation only

```ts
export const RETENTION_POLICY: Readonly<
  Record<RetentionFamily, { retainForMs: number | null }>
>;
export function retentionFamilies(): readonly RetentionFamily[];
export function evaluateRetention(
  now?: Date,
  policy = RETENTION_POLICY,
): { family: RetentionFamily; cutoff: Date }[]; // [] while any duration is null
```

- `RetentionFamily` enumerates the documented families (`clientProfile`,
  `consentRecord`, `auditEvent`, `accessToken`, future health families
  listed but unset). Every `retainForMs` is `null` = `TODO(human)` —
  **no duration is invented**.
- `evaluateRetention` returns the empty set whenever any evaluated family
  is unset, so nothing is ever "due". A separate
  `assertAutomaticRetentionConfigured(): never` fails closed — no job,
  cron, webhook, or startup hook may exist.
- The implemented 30-day `access_token` terminal cleanup (founder decision
  #26, S1-F2B `cleanupTerminalAccessTokens`) is the single decided
  duration and stays owned by that slice; the policy map references it
  read-only rather than duplicating the number.

## 7. Storage port — provider-neutral, fail closed

```ts
export type ObjectStorageBackend = {
  readonly name: string; // structural label, e.g. "none"
  presignGet(key: string, ttlSeconds: number): Promise<string>;
  deletePrefix(prefix: string): Promise<{ deleted: number }>;
};
export function clientObjectPrefix(
  workspaceId: string,
  clientProfileId: string,
): string;
export function assertClientObjectKey(
  key,
  workspaceId,
  clientProfileId,
): string;
export const nullObjectStorage: ObjectStorageBackend;
```

- Key scheme `workspace/<workspaceId>/client/<clientProfileId>/<objectId>`
  (PROPOSED format of the documented "prefixed by workspace + client").
  `assertClientObjectKey` fails closed: wrong prefix, `..`, absolute path,
  backslash, empty segment, or non-string → `StorageError("invalid_key")`.
- `nullObjectStorage.presignGet` throws `StorageError
("storage_not_configured")` — a presigned URL can never be minted before
  a vendor decision. `nullObjectStorage.deletePrefix` returns
  `{ deleted: 0 }`: no upload path or backend has ever existed, so no
  object can exist; this is a structural invariant, not a skipped step.
  `deletePrefix` is part of the port contract for the deferred erasure
  slice (§5): implementations must be idempotent and retry-safe, and any
  real backend's delete failure must abort the consumer's operation —
  storage deletion and DB mutation are **not** atomic and no design may
  claim they are.
- Presigned-GET TTL: caller supplies `ttlSeconds`; the port enforces an
  upper bound `PRESIGNED_GET_MAX_TTL_SECONDS`, **value `TODO(human)`** —
  until a backend exists nothing reaches it.
- No SDK, no ACL/public-url model, no Supabase API — verified by a grep
  gate (`rg -i "supabase" lib db tests` empty) and no new dependency.

## 8. Audit additions (PROPOSED — reviewer sign-off)

- `AUDIT_RESOURCE_TYPES` += `"client_export"` (existing closed-set
  convention).
- New event: `EXPORT`/`client_export`, once per successful export,
  `subjectClientProfileId` set, `meta { count }` only.
- No erasure events: erasure is deferred (§5). When it lands, its events
  must never place a deleted client identifier in `resourceId`.
- Denied export attempts write nothing — DENY auditing remains deferred to
  the routing slice per `consent-audit.md`.

## 9. RED tests, commands, acceptance

TDD per AGENTS/conductor: failing tests first, watch them fail, minimal
GREEN, mutation-check the load-bearing assertions, restore byte-exact.

Unit (fail before the modules exist):

- `tests/unit/storage.test.ts` — key/prefix validation rejections
  (traversal, foreign prefix, absolute, backslash, empty segment,
  non-string), null-backend presign → `storage_not_configured`,
  `deletePrefix` → `{deleted:0}`.
- `tests/unit/retention.test.ts` — every family unset →
  `evaluateRetention` `[]`; malformed policy rejected;
  `assertAutomaticRetentionConfigured` throws.
- `tests/unit/gdpr-export.test.ts` — manifest/count derivation, allowlist
  closure, page/ceiling bound arithmetic, structural error codes, exposure
  assertion throws.

Integration (fresh disposable PostgreSQL, synthetic fixtures only):

- `tests/integration/s1-g-export.test.ts` — own export content bounded to
  the allowlist; manifest counts equal emitted row counts; pagination
  correctness across multiple pages; a fixture over the section ceiling →
  `export_too_large`, empty result, no audit row; one EXPORT event in the
  same tx; cross-workspace / other-client / unassigned-coach / SUPPORT /
  assistant / platform-admin / non-ACTIVE denials; assigned-coach and
  owner paths per the matrix; non-allowlisted field canary absent.
- `tests/integration/s1-g-retention.test.ts` — seeded rows of each family
  evaluate as never-due.

Focused commands:
`npx vitest run tests/unit/{storage,retention,gdpr-export}.test.ts`;
`npm run test:integration -- tests/integration/s1-g-*.test.ts`.

Full gates (real exit codes recorded in STATUS): `git diff --check` 0;
`npm ci` 0; `npx prisma format`/`validate`/`generate`/`migrate deploy`/
`migrate status` 0; `npm run format:check`/`typecheck`/`lint`/`test` 0;
`npm run test:integration` 0; `npm run build` 0; `npm run test:e2e` 0;
`npm audit` (recorded; no force-fix).

Observable acceptance criteria:

- `git diff 8369451 -- db/` empty (no schema/migration).
- `rg -n "lib/gdpr|lib/storage" app/` empty — no route/UI import.
- `rg -i "supabase" lib db tests` empty — no vendor coupling.
- `rg -n "setInterval|cron|schedule" lib/gdpr lib/storage.ts` empty — no
  automatic cleanup.
- Exposure assertions throw (unit-pinned); all denials structural only.
- No `consent_record`/`client_assignment`/`client_profile`/`workspace_member`
  delete or anonymization code path exists anywhere in the slice
  (`rg -n "delete" lib/gdpr lib/storage.ts` reviewed to be only the port
  contract and tests).

Mutations to prove (each restored byte-exact): allowlist section bypass ·
manifest count skipped · audit outside tx · section ceiling not enforced
(silent truncation) · pagination stops at first page · retention returns
due with null duration · null-backend presign succeeds · TTL bound
unenforced · own-export accepts client-id param · cross-workspace scope
dropped.

## 10. Open items — `TODO(human)` / review decisions

Not implementable without human decisions (stay blocked):

1. Retention durations for every family, including audit retention period.
2. Storage vendor, bucket, region, credentials, encryption, exact presign
   TTL; no Supabase-specific APIs without an explicit decision + plan
   (`stage-1-plan.md` §8, product-decisions #10).
3. Legal copy: privacy notice/policy text, export cover text, erasure
   confirmation wording, PED/HRT anything.
4. Export delivery surface (download route, streaming/archive format,
   file naming) — S1-H + product decision.
5. **Erasure policy (blocks all erasure paths):**
   a. Consent-record disposition on client erasure — grants are never
   deleted today; delete vs anonymize-shell vs retention exception is
   a legal/policy call.
   b. Sole-owner handling — ownership transfer, refusal, or workspace
   disposition before any account anonymization.
   c. Workspace anonymization sequence — transaction/storage ordering and
   the client-erasure dependency.
   d. Erasure workflow UX: self-serve vs request/approval/cooling-off;
   who may initiate each erasure class operationally.
   e. Invite tokens whose `target_email` is an erased user/client email.
   f. Tombstone value formats, if in-place anonymization is approved.
6. Coach-initiated (`asg` read) client export — implemented per the locked
   matrix but flagged for product confirmation.
7. Pre-existing unresolved: DENY-audit volume, SUPPORT access policy,
   cross-workspace sharing, platform-admin health exceptions, i18n.

## 11. Rollback

No migration and no external state: rollback = revert the slice commits on
the feature branch. `git diff 8369451 -- db/` empty is a hard gate. The
storage port holds no data; the retention module deletes nothing; the
export service writes only one audit row per success inside the read
transaction. If a defect lands, `git revert` the scoped commits and re-run
the focused integration files — there is no shipped surface to soak.

## 12. Boundaries and review requirements

- No route/action/UI/email/provider/rate-limiter/schema/dependency/RLS/
  Supabase changes; nothing under `app/**` imports the new modules;
  `assertGdprExternallyExposable` / storage assertions fail closed.
- Health data has no product modules; nothing here may imply a complete
  client-health export is possible.
- No erasure or anonymization code of any kind (all paths deferred, §5).
- Prime Tracker (Marcel + Mike) untouched; synthetic fixtures only; no real
  health data in tests; `TRACKER 2.0.md` stays out of version control.
- Forbidden git ops per AGENTS: no `reset --hard`, `clean`, `checkout --
<path>`, `add -A`, force-push, PR, merge, or deploy.
- Independent review: a different model than the builder
  (`opencode-go/deepseek-v4.1-flash` via a separate `opencode run`
  session), read-only, fresh context, after all gates pass on the current
  tree; findings repaired by the builder and re-checked; fail-closed
  verdicts; capped rounds. The builder never approves its own work; the
  slice is not merged until its own gates pass on the current tree and
  review returns PASS. External exposure additionally requires S1-H
  routing + a fresh review.
- **This task stops at the pushed plan.** Implementation starts only after
  plan review.
