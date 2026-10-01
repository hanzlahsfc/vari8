# S1-G — privacy / export / storage implementation plan

**Plan only. No production code, schema, migration, route, or UI in this task.**
Planning branch `feature/s1-g-privacy-storage-plan` off `main` `8369451`
(S1-F2D merged via PR #1; post-merge CI passed). Implementation begins only
after this plan is reviewed; the builder never self-grades.

Sources: `docs/tasks/stage-1-plan.md` §7 + §9 (row S1-G),
`docs/security/data-ownership.md`, `docs/security/authorization-model.md`,
`docs/security/consent-audit.md`, `docs/product-decisions.md`,
`docs/open-questions.md`, and the merged S1-A…S1-F2D code. Anything not in
those sources is marked PROPOSED (needs review) or `TODO(human)` (not
implementable yet). Nothing below invents retention durations, storage
vendor/configuration, legal copy, export contents beyond the documented
allowlist mechanism, or deletion/anonymization behavior.

## 1. Scope

S1-G builds the internal privacy/storage **services**. It ships no route,
server action, UI, email, scheduled job, or external-provider integration.
Every entry point sits behind a fail-closed `assert*ExternallyExposable`
gate until the S1-H routing slice plus a fresh independent review.

In scope — exactly the documented `stage-1-plan.md` §7 items:

1. **Export** — client-own export resolved from the actor (no client-id
   parameter on the own path); closed section allowlist + counts manifest;
   audited once. The `exportsErasure` matrix also grants owner `ws` and
   coach `asg` read scope, so a guarded per-client export for those roles
   is included (see §4 and the open flag in §10).
2. **Erasure** — two explicit documented paths: **delete**
   (child-before-parent, private objects removed before the DB
   transaction) and **anonymize** an in-place shell (no hard-delete of the
   workspace). Audit identifiers nulled; structural audit rows retained.
3. **Retention** — policy represented as data with `TODO(human)` durations;
   evaluation only. **No automatic cleanup job, scheduler, or cron.** The
   already-implemented 30-day terminal `access_token` cleanup (S1-F2B,
   founder-decided) is unchanged.
4. **Storage port** — provider-neutral object-storage abstraction: private
   bucket semantics, no ACLs, server-generated presigned GET with bounded
   TTL, keys prefixed by workspace + client. **No Supabase-specific APIs,
   no vendor SDK, no new dependency.**

Out of scope: routes/UI (S1-H), DENY-event auditing (documented as a
routing-slice prerequisite), login auditing, platform-admin audit plumbing,
health-record tables and any health-module export (Stage 2+ — **no
client-health persistence exists, so a complete client-health export is not
possible; the export allowlist can only cover the client-owned rows that
exist today**), email delivery, rate limiting, legal/policy copy, a real
storage backend, workspace departure UX (membership/assignment removal
already exists and revokes access without touching data), and any
cross-workspace sharing.

## 2. Locked/documented vs. open

| Item                                                                                                                                                                                                                                                  | State                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Own export resolved from actor; section allowlist + counts manifest; audited once                                                                                                                                                                     | DOCUMENTED (`stage-1-plan.md` §7)                            |
| Delete vs anonymize = two explicit paths; child-before-parent; private objects before DB tx; in-place shell, no workspace hard-delete                                                                                                                 | DOCUMENTED (§7)                                              |
| Retention = policy-as-data; **no automatic deletion job**                                                                                                                                                                                             | DOCUMENTED mechanism; **all durations `TODO(human)`**        |
| Private bucket, no ACL, server presigned GET (short TTL), ws+client key prefix                                                                                                                                                                        | DOCUMENTED shape; **vendor/bucket/region/TTL `TODO(human)`** |
| `exportsErasure` matrix: owner `ws/ws`, coach `asg/—`, client `own/own`, SUPPORT/assistant/platform-admin denied                                                                                                                                      | LOCKED (`authorization-model.md`, `lib/auth/rbac.ts`)        |
| User-account erasure separate from client data; `actorUserId` nulled, structural audit rows retained                                                                                                                                                  | DOCUMENTED (§7, `consent-audit.md`)                          |
| Membership/assignment removal revokes access, data stays workspace-owned                                                                                                                                                                              | IMPLEMENTED (S1-C/S1-F2C) — reused, not re-built             |
| Export JSON shape, section/field allowlist, tombstone values, erasure audit event set, storage key format                                                                                                                                             | PROPOSED in §4–§7 — require review sign-off                  |
| Retention durations (all families + audit), storage vendor/config/TTL, legal/privacy copy, export download delivery, erasure UX (self-serve vs request/cooling-off), coach-export product intent, erased-user invite-email handling, PED/HRT anything | `TODO(human)` — NOT implementable (§10)                      |

## 3. Files

New:

- `lib/gdpr/export.ts` — export assembly + allowlist + manifest.
- `lib/gdpr/erasure.ts` — delete and anonymize paths.
- `lib/gdpr/retention.ts` — policy-as-data + evaluation (all durations unset).
- `lib/gdpr.ts` — fail-closed exposure assertions for the slice
  (`assertGdprExternallyExposable`, mirroring `lib/tokens.ts`).
- `lib/storage.ts` — provider-neutral storage port + fail-closed null backend.
- `tests/unit/gdpr-export.test.ts`, `tests/unit/erasure.test.ts`,
  `tests/unit/retention.test.ts`, `tests/unit/storage.test.ts`.
- `tests/integration/s1-g-export.test.ts`,
  `tests/integration/s1-g-erasure.test.ts`,
  `tests/integration/s1-g-retention.test.ts`.
- `docs/tasks/s1-g-privacy-storage.md` (this file), `docs/STATUS.md`.

Touched:

- `lib/audit.ts` — extend the closed `AUDIT_RESOURCE_TYPES` allowlist with
  the proposed event targets (`"client_profile"`, `"client_export"`,
  `"workspace"`, and — flagged — an account-scope `DELETE`/`user` pair for
  account anonymization; see §8). `AuditAction` already carries
  `EXPORT`/`DELETE`/`UPDATE`; the meta allowlist needs no new keys
  (`count` suffices for the manifest summary).
- **No schema or migration change.** Every needed FK behavior exists:
  `Restrict` on `consent_record`/`client_assignment`/`access_token`
  issuer/`audit_event.subject_user_id`, `Cascade` on `access_token.user_id`,
  `SetNull` on `audit_event.actor_user_id`/`subject_client_profile_id` and
  `client_profile.user_id`. Gate: `git diff 8369451 -- db/` must stay empty.

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
  `totalRecords`; `generatedAt` is omitted as redundant (the audit row
  carries the timestamp) unless reviewers prefer it inside the document.
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

- Exactly one `EXPORT`/`client_export` WORKSPACE audit event per export,
  inside the same transaction as the read, `subjectClientProfileId` set,
  `meta { count }` = total exported rows. Denied exports write nothing
  (DENY auditing stays deferred to S1-H).
- Delivery is a returned document; no route, download URL, or file naming
  (`TODO(human)` for the S1-H surface).

## 5. Erasure design

Two documented explicit paths. Both run the storage step **before** opening
the DB transaction (documented ordering), then one Serializable
transaction with the established bounded P2034/40001/40P01 retry.

### 5.1 Client-data deletion — `eraseClientData(session, { workspaceId, clientProfileId })`

- Authorize `exportsErasure/write`: owner (`workspace` scope) or the client
  themselves (`own` scope via a separate actor-resolved
  `eraseOwnClientData` — no client-id parameter). Coach/assistant/SUPPORT/
  platform-admin deny structurally.
- `storage.deleteClientObjects(workspaceId, clientProfileId)` first;
  failure aborts with zero DB writes. (Null backend: see §7.)
- Serializable tx, child-before-parent to satisfy `Restrict` FKs:
  1. re-authorize inside the tx (post-lock, per S1-F2C convention);
  2. delete `consent_record` rows (see open flag §10.6 — delete vs
     retain-anonymized);
  3. delete `client_assignment` rows;
  4. delete `client_profile` — `audit_event.subject_client_profile_id`
     SetNulls automatically;
  5. mark the client's `workspace_member` row `REMOVED` (PROPOSED — see
     §10.8); never delete the member row;
  6. unlink nothing else — a linked `User` is untouched (account erasure
     is a separate path);
  7. one `DELETE`/`client_profile` audit event, `meta { count }`, written
     before the profile row so the subject id is recorded once and then
     nulled by the cascade; audit failure rolls everything back.
- Second erasure of the same client → structural `client_not_accessible`,
  no side effects. Health tables don't exist yet; the deletion walker is a
  **closed ordered list**, not a schema scan — new client-owned tables are
  added explicitly with their own review, else `Restrict` fails closed.

### 5.2 User-account anonymization — `anonymizeUserAccount(session)`

- Account-scoped, not workspace-scoped: any `ACTIVE` authenticated user may
  erase their own account regardless of memberships (PROPOSED self-serve
  trigger; §10.7). In-place shell — the `User` row is never deleted, which
  keeps `access_token.created_by` (Restrict) and
  `audit_event.subject_user_id` (Restrict + ACCOUNT-scope CHECK) valid.
- Serializable tx: tombstone `email` (unique non-PII value derived from the
  user id — PROPOSED `erased+<id>@…`, §10.9), `name → null`, `passwordHash
→ unusable tombstone` (§10.9), `status → DEACTIVATED`,
  `sessionVersion + 1` (existing JWTs go stale — founder decision #18
  mechanism, already live);
  every `workspace_member` of the user → `REMOVED`;
  `client_profile.user_id → null` for profiles linked to the user (client
  data stays workspace-owned — documented);
  delete `access_token` rows owned by the user (ephemeral; in-place user
  means no Cascade — explicit delete), revoke outstanding invites the user
  issued (issuer row retained; `createdByUserId` keeps pointing at the
  shell);
  `audit_event.actor_user_id → null` where actor = the user;
  `subject_user_id` **stays** (ACCOUNT CHECK requires it — it references a
  tombstoned shell, not an identity);
  one account-scope erasure audit event (requires the flagged
  `ACCOUNT_AUDIT_ACTIONS`/`ACCOUNT_AUDIT_RESOURCES` widening in §8).

### 5.3 Workspace anonymization — `anonymizeWorkspace(session, { workspaceId })`

- Owner-only (`exportsErasure/write`, `workspace` scope). In-place shell —
  the workspace row is never hard-deleted (`audit_event.workspace_id` is
  Restrict-bound to it).
- Serializable tx: run §5.1 deletion for every `client_profile` in the
  workspace; every `workspace_member` → `REMOVED`; revoke outstanding
  `WORKSPACE_INVITE` tokens then delete all workspace `access_token` rows
  (removes `target_email` PII now, not after 30 days — PROPOSED, §10.10);
  tombstone `name`/`slug` (unique non-PII values, §10.9), `status →
SUSPENDED`; audit rows retained untouched; one `UPDATE`/`workspace`
  audit event, `meta { count }`.

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
  #26, S1-F2B `cleanupTerminalAccessTokens`) is the single decided duration
  and stays owned by that slice; the policy map references it read-only
  rather than duplicating the number.

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
  object can exist; this is a structural invariant, not a skipped step —
  the erasure flow still calls the port first, and any real backend's
  delete failure must abort erasure (pinned by a throwing-spy test).
- Presigned-GET TTL: caller supplies `ttlSeconds`; the port enforces an
  upper bound `PRESIGNED_GET_MAX_TTL_SECONDS`, **value `TODO(human)`** —
  until a backend exists nothing reaches it.
- No SDK, no ACL/public-url model, no Supabase API — verified by a grep
  gate (`rg -i "supabase" lib db tests` empty) and no new dependency.

## 8. Audit additions (PROPOSED — reviewer sign-off)

- `AUDIT_RESOURCE_TYPES` += `"client_export"`, `"client_profile"`,
  `"workspace"` (existing closed-set convention).
- New events: `EXPORT`/`client_export` (per export), `DELETE`/
  `client_profile` (per client erasure), `UPDATE`/`workspace`
  (workspace anonymization), each `subjectClientProfileId`-scoped where
  applicable, `meta { count }` only.
- User anonymization needs one ACCOUNT-scope event → widen
  `ACCOUNT_AUDIT_ACTIONS`/`ACCOUNT_AUDIT_RESOURCES` to admit `DELETE`/`user`
  (or a dedicated erasure marker — exact shape is a review decision). The
  S1-F2B CHECK constraints already permit it (`subjectUserId` = the erased
  user, `workspaceId` null).
- Denied export/erasure attempts write nothing — DENY auditing remains
  deferred to the routing slice per `consent-audit.md`.

## 9. RED tests, commands, acceptance

TDD per AGENTS/conductor: failing tests first, watch them fail, minimal
GREEN, mutation-check the load-bearing assertions, restore byte-exact.

Unit (fail before the modules exist):

- `tests/unit/storage.test.ts` — key/prefix validation rejections, null
  backend presign → `storage_not_configured`, deletePrefix → `{deleted:0}`.
- `tests/unit/retention.test.ts` — every family unset → `evaluateRetention`
  `[]`; malformed policy rejected; `assertAutomaticRetentionConfigured`
  throws.
- `tests/unit/gdpr-export.test.ts` — manifest/count derivation, allowlist
  closure, structural error codes, exposure assertion throws.
- `tests/unit/erasure.test.ts` — ordering plan, tombstone builders, error
  mapping, exposure assertion throws.

Integration (fresh disposable PostgreSQL, synthetic fixtures only):

- `tests/integration/s1-g-export.test.ts` — own export content bounded to
  the allowlist; manifest counts equal real row counts; one EXPORT event
  in the same tx; cross-workspace / other-client / unassigned-coach /
  SUPPORT / assistant / platform-admin / non-ACTIVE denials; assigned-coach
  and owner paths per the matrix; non-allowlisted field canary absent.
- `tests/integration/s1-g-erasure.test.ts` — delete path ordering (storage
  spy invoked before tx; throwing storage → zero DB writes); Restrict
  proofs; audit `subject_client_profile_id` nulled + rows retained;
  audit-failure rollback; second-erasure denial; user anonymization
  (tombstones, memberships REMOVED, tokens deleted/revoked, `actor_user_id`
  nulled, `subject_user_id` retained, pre-erasure JWT → `auth()` null);
  workspace anonymization (clients erased, invites revoked+deleted, shell
  retained, audit intact); concurrent export-vs-erase → Serializable retry.
- `tests/integration/s1-g-retention.test.ts` — seeded rows of each family
  evaluate as never-due.

Focused commands: `npx vitest run tests/unit/{storage,retention,gdpr-export,erasure}.test.ts`;
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
- `rg -n "setInterval|setTimeout|cron|schedule" lib/gdpr lib/storage.ts`
  empty — no automatic cleanup.
- Exposure assertions throw (unit-pinned); all denials structural only.

Mutations to prove (each restored byte-exact): allowlist section bypass ·
manifest count skipped · audit outside tx · storage-after-tx ordering ·
child-before-parent order violated (Restrict abort) · tombstone omitted ·
`sessionVersion` bump omitted · unlink of `client_profile.user_id` omitted
· retention returns due with null duration · null-backend presign succeeds
· TTL bound unenforced · own-export accepts client-id param ·
cross-workspace scope dropped · second erasure not denied.

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
5. Erasure workflow UX: immediate self-serve vs request/approval/cooling-
   off; who may initiate account/workspace erasure operationally.
6. On client erasure, are `ConsentRecord` rows deleted with the client or
   retained anonymized as a legal record? (Plan proposes delete; needs
   sign-off.)
7. Self-serve account erasure trigger conditions (e.g. outstanding
   memberships) — proposed minimal: any ACTIVE user, memberships → REMOVED.
8. Whether client erasure marks the client's `workspace_member` REMOVED
   (proposed) vs leaves it.
9. Tombstone value formats (`email`, `name`, `passwordHash`, workspace
   `name`/`slug`) — must stay unique and non-PII; exact format is a
   review decision, not silently chosen.
10. Invite tokens whose `target_email` is an erased user/client email —
    proposed: revoke outstanding + delete rows on workspace erasure.
11. Coach-initiated (`asg` read) client export — implemented per the locked
    matrix but flagged for product confirmation.
12. Pre-existing unresolved: DENY-audit volume, SUPPORT access policy,
    cross-workspace sharing, platform-admin health exceptions, i18n.

## 11. Rollback

No migration and no external state: rollback = revert the slice commits on
the feature branch. `git diff 8369451 -- db/` empty is a hard gate. The
storage port holds no data; the retention module deletes nothing. If a
defect lands, `git revert` the scoped commits and re-run the focused
integration files — there is no shipped surface to soak.

## 12. Boundaries and review requirements

- No route/action/UI/email/provider/rate-limiter/schema/dependency/RLS/
  Supabase changes; nothing under `app/**` imports the new modules;
  `assertGdprExternallyExposable` / storage assertions fail closed.
- Health data has no product modules; nothing here may imply a complete
  client-health export is possible.
- Prime Tracker (Marcel + Mike) untouched; synthetic fixtures only; no real
  health data in tests.
- Forbidden git ops per AGENTS: no `reset --hard`, `clean`, `checkout --
<path>`, `add -A`, force-push, PR, merge, or deploy.
- Independent review: a different model than the builder, read-only, fresh
  context, after all gates pass on the current tree; findings repaired by
  the builder and re-checked; fail-closed verdicts; capped rounds. The
  builder never approves its own work; the slice is not merged until its
  own gates pass on the current tree and review returns PASS. External
  exposure additionally requires S1-H routing + a fresh review.
- **This task stops at the pushed plan.** Implementation starts only after
  plan review.
