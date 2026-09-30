# S1-F2D — password-reset orchestration plan

Internal services only — no route, action, UI, provider, URL, or rate limiter.
Feature branch `feature/s1-f2d-password-reset` off baseline `e2bffb4`.
Independent different-model review pending before any routing slice.

## Locked behavior (S1-F plan §2.8–2.10, founder/Aleks final)

- Existence oracle is ACCEPTED: `ACCOUNT_EXISTS` / `ACCOUNT_NOT_FOUND` only —
  never status/role/workspace/client detail. Every existing account —
  including INVITED/DEACTIVATED — returns `ACCOUNT_EXISTS`; only ACTIVE
  receives a token.
- 12-hour reset tokens (shared `ACCESS_TOKEN_TTL_MS`); replacement request
  revokes outstanding siblings; successful consume bumps `sessionVersion`
  once (invalidates all sessions incl. current), revokes siblings, audits.
- Password policy: existing `validatePasswordPolicy` + `hashPassword`
  (10–128 code points, NFC, no composition rules).

## Files

- `lib/auth/password-reset.ts` (new) — the service.
- `lib/audit.ts` — `resetStage` lives ONLY in the account-scope metadata set
  (`AccountAuditMeta`/`sanitizeAccountAuditMeta`), valid solely on
  `PASSWORD_RESET`/`access_token` events; never a global `AuditMeta` key.
- `tests/unit/password-reset.test.ts` (new), `tests/integration/s1-f2d-password-reset.test.ts` (new).
- `docs/tasks/s1-f2d-password-reset.md`, `docs/STATUS.md`.
- **No schema/migration change** — S1-F1/F2B supply AccessToken,
  sessionVersion, account audit + constraints.

## Contracts

```ts
requestPasswordReset(
  { email },
  options: { deliver: ResetDeliverySink },  // REQUIRED, runtime-validated
  client?,
): Promise<{ outcome: "ACCOUNT_EXISTS" | "ACCOUNT_NOT_FOUND" }>
// The public result is exactly { outcome } — it never carries delivery,
// email, raw token, expiry, status, IDs, role, or workspace data. The
// private payload ({ kind:"password_reset", to, rawToken, expiresAt }) goes
// to `deliver` exactly once, post-commit, outside the retry loop.
// Missing/non-function `deliver` → invalid_input BEFORE any DB work.

resetPasswordWithToken({ rawToken, password }, client?) =>
  { changed: true }   // success carries NO userId/email/token
```

`PasswordResetError` codes: `invalid_input | invalid_token |
account_ineligible | serialization_conflict | reset_failed |
resets_not_exposable`. `PasswordPolicyError`/`AuditError`/`TokenError`
propagate. No IDs/emails/tokens/passwords/SQL in messages.

## Request transaction ordering (one Serializable tx)

1. `SELECT id,status FROM users WHERE id=$1 FOR UPDATE` — the per-account
   serialization point AND the freshness barrier for concurrent user writes.
2. Re-read `status`; non-ACTIVE → return exists-outcome, zero mutations.
3. Locking scan of the account's active reset tokens (`... FOR UPDATE`) —
   coordinates existing rows only; concurrent winner's inserts committed
   after our snapshot are NOT visible here. The race is resolved by
   PostgreSQL SSI aborting the predicate-read/insert conflict → bounded
   retry → fresh snapshot.
4. Revoke those ids by PK (`updateMany id IN …`), issue one 12-hour token,
   write audit (`PASSWORD_RESET`/`access_token`/`{resetStage:"REQUESTED"}`,
   actorUserId null).
5. Commit the transaction first. Then invoke the REQUIRED `deliver` sink
   exactly once, outside the retry loop (delivery failure → `reset_failed`,
   never a replay). Then return only the existence outcome.
   Concurrent successful requests may each deliver one email — replacement
   semantics mean only the LATEST delivered link remains usable.

## Consume transaction ordering

1. Outside tx, in this order: `safeTokenHash` (structural token check —
   malformed input never reaches password work or the DB) →
   `validatePasswordPolicy` → `hashPassword`. A policy failure never opens a
   tx — no claim can have happened.
2. Serializable tx: non-locking `findUnique(tokenHash)` to resolve `userId`
   (claim still enforces all predicates).
3. `users FOR UPDATE` (same `users → access_token` order as request — no
   deadlock cycle); require ACTIVE.
4. `claimAccessToken` (purpose + userId + unconsumed/unrevoked/unexpired
   conditional update — exactly one winner per token).
5. Sibling `FOR UPDATE` scan → revoke by PK.
6. `UPDATE users SET password_hash, session_version=session_version+1
WHERE id AND status='ACTIVE'` — conditional: status changed → fail closed.
7. Audit `PASSWORD_RESET`/`access_token`/`{resetStage:"COMPLETED"}` with
   `actorUserId = null` and `actorRole = null` — consumption is
   authenticated by the bearer token, not a user session. Any failure rolls
   back all effects.

## Concurrency correctness (real-PG proofs)

- Two concurrent requests for one user: the loser waits on the user row
  lock; its stale snapshot cannot see the winner's inserted token, but the
  SSI predicate-read/insert conflict aborts one transaction → bounded retry
  → fresh snapshot → revoke the visible winner's row → issue → exactly one
  active token.
- Concurrent consumes of the same token: conditional `updateMany` — one winner.
- Concurrent sibling consumes: both serialize on the user row lock; the loser
  retries with a fresh snapshot and finds its token revoked → `invalid_token`.
- User status flips mid-wait: `FOR UPDATE` hits 40001 (P2010) → bounded
  retry → fresh snapshot → deny. `MAX_ATTEMPTS = 8` with bounded backoff
  (`min(attempt·10, 50)`ms); only P2034 / P2010 carrying raw 40001·40P01
  retries; unrelated/malformed P2002 → `reset_failed` (never retried, never
  mislabeled `serialization_conflict`).

## Audit semantics (pinned)

- scope ACCOUNT, workspaceId NULL, subjectUserId = exact account.
- request: `resetStage:REQUESTED`, resourceId = issued token id, actor null.
- consume: `resetStage:COMPLETED`, resourceId = consumed token id,
  `actorUserId`/`actorRole` = null (bearer-token authentication, not a
  session). `resetStage` is valid ONLY on `PASSWORD_RESET`/`access_token`
  account events — the `user` resource carries no metadata, and workspace
  events reject it. No email/token/hash/password/URL/IP anywhere.

## Tests

Unit: error mapping, P2002 classifier, exposure assertion, structural codes.
Integration (fresh disposable PG): full request/consume matrix above,
sessionVersion bump, sibling revocation, rollback canaries, concurrent
request/consume races, non-ACTIVE consume denial, + Auth.js runtime suite:
pre-reset JWT → consume → `auth()` null, `/api/auth/session` null + cleared
cookie, old-password `authorizeCredentials` → null, new password → succeeds,
fresh JWT carries bumped `sv`, update-payload cannot resurrect.

## Mutations (≥16)

ACTIVE check removed · existence leaks status · replacement revocation
removed · users-row lock removed · purpose predicate removed ·
expiry/revoked/consumed predicate removed · password policy bypassed ·
sessionVersion increment removed · sibling revocation removed · audit removed
· audit outside tx · consume-time ACTIVE re-check removed · userId claim
scoping removed · raw token/password in audit · retry widened to blanket
P2002 · exposure assertion no-op.

## Boundaries

No routes/actions/UI/provider/domain/rate-limiter/schema changes; no `app/**`
import; `assertPasswordResetOrchestrationExternallyExposable` fails closed;
Prime Tracker untouched; no PR/deploy/force-push; S1-H not started.

---

## Implementation record (2026-10-01) — HISTORICAL — SUPERSEDED BY THE REPAIR RECORD

_The contract details below reflect the original submission. Two
independent reviews superseded parts of it (see the repair records below
and the corrected contract sections above)._

**Status: implemented on `feature/s1-f2d-password-reset`; local gates green;
independent different-model review pending.**

Built exactly per plan: `lib/auth/password-reset.ts`
(`requestPasswordReset` / `resetPasswordWithToken` /
`assertPasswordResetOrchestrationExternallyExposable`), one closed
`resetStage` meta key in `lib/audit.ts`, 5 unit + 16 real-PG integration
tests (incl. the real Auth.js `auth()`/`handlers` pipeline).

Evidence highlights:

- Concurrent requests (3-way) → exactly one active token; concurrent
  same-token consumes → one winner; concurrent sibling consumes → one reset,
  one `sessionVersion` bump.
- Deactivation committed while a request waits on the user row lock →
  40001 → bounded retry → `ACCOUNT_EXISTS` with zero rows.
- Forced audit failure inside the tx → revocation rolled back, prior token
  stays active.
- Real pipeline: pre-reset JWT authenticates → consume → `auth()` null,
  `/api/auth/session` null + cookie cleared; old password → generic null,
  new password signs in with `sv=1`; client update payload cannot resurrect.

Mutation results (restored byte-exact, shasum-verified): ACTIVE re-check (2
fails) · status leak in outcome (3) · request sibling revocation (2) ·
users-row lock (1) · claim purpose predicate (1, via the shared-primitive
F2A suite) · expiry/consumed predicates (3) · password policy bypass (1) ·
sessionVersion increment (4) · consume sibling revocation (1) · audit
removed (1) · audit outside tx (7) · ACTIVE re-check + conditional update
(1) · email in audit meta (2) · blanket-P2002 retry (1 unit) · exposure
no-op (2).

Two deliberate-survivor notes (kept as defense-in-depth, documented):

- Removing `FOR UPDATE` from the request sibling scan alone does not regress
  — the Serializable predicate-read↔insert conflict already aborts one of
  the concurrent txs; the lock converts aborts into waits (fewer retries).
- Removing `userId` from the claim call does not regress — the bound user is
  resolved FROM the claimed row, so the param cannot widen scope; kept
  anyway as an explicit invariant.

No schema or migration change was needed. No routes/UI/provider/URL/rate
limiter added; nothing under `app/**` imports the service.

---

## Repair plan — independent DeepSeek FAIL (2026-10-01) — HISTORICAL (implemented; partially superseded by the second repair)

Second review FAILed the slice on documentation/test/production issues.
Repairs, all test-first:

1. **Correct the FOR UPDATE visibility claim.** A locking read does NOT see
   concurrent INSERTs that committed after the tx snapshot — correctness
   comes from PostgreSQL SSI aborting the predicate-read↔insert conflict,
   with bounded retry supplying a fresh snapshot. Row locks coordinate
   existing rows and preserve lock order only. Fix comments in
   `lib/auth/password-reset.ts`, this record, STATUS, and any rg hits.
2. **Validate token before password work.** Order: `safeTokenHash` →
   `validatePasswordPolicy` → `hashPassword` → tx. Malformed token + bad
   password → `invalid_token`; malformed token never reaches scrypt.
3. **Injected delivery sink** (superseded — the sink became REQUIRED in the
   second repair; the original plan made it optional). `requestPasswordReset` returns ONLY
   `{outcome:"ACCOUNT_EXISTS"}` / `{outcome:"ACCOUNT_NOT_FOUND"}` — never a
   `delivery` property. New param `deliver?: (payload)=>Promise<void>` fires
   exactly once, post-commit, outside the retry loop; its failure →
   `reset_failed`; never called for missing/ineligible/failed issuance.
4. **Audit attribution.** COMPLETED events: `actorUserId=null`,
   `actorRole=null`, `subjectUserId=account`, scope ACCOUNT — bearer-token
   consumption is not an authenticated user session. Real-PG regression.
5. **Bounded retry headroom.** `MAX_ATTEMPTS = 8` + small deterministic
   backoff (`min(attempt*10, 50)` ms). Retries still only P2034 / raw
   40001·40P01. Proven by repeated 3-way and 8-way same-account bursts —
   exactly one active token per burst, no deadlock, no `serialization_conflict`
   rejections. Route-layer rate limiting stays deferred (documented).
6. **Real CSRF update test.** Fetch a real CSRF token+cookie from
   `handlers.GET /api/auth/csrf`, POST `/api/auth/session` with it; assert
   200 + null body + cleared stale cookie + subsequent `auth()` null. The
   loose "null OR non-200" assertion is deleted.
7. **Scope `resetStage` to account audit.** Move it out of workspace
   `AuditMeta`/`META_VALIDATORS` into an account-only meta type +
   validator; `buildAuditEvent` rejects it; `buildAccountAuditEvent`
   accepts only `resetStage` ∈ REQUESTED|COMPLETED on
   PASSWORD_RESET/access_token.
8. **`safeTokenHash` narrowing.** `TokenError` → `invalid_token`; anything
   else → `reset_failed` (message/token never leaked). New regression test
   with a controlled crypto failure.

RED → GREEN → mutate-back per finding. All files restored byte-exact.
No schema/migration/route/UI/provider/domain/rate-limit changes.

## Repair record (2026-10-01) — HISTORICAL — SUPERSEDED BY THE SECOND REPAIR RECORD

All eight findings repaired on `feature/s1-f2d-password-reset`:

1. Comments/docs corrected — FOR UPDATE coordinates existing rows; SSI
   predicate-conflict aborts + bounded retry supply snapshot freshness.
2. `safeTokenHash` runs before password policy/scrypt — malformed token +
   bad password → `invalid_token`, zero hashing.
3. Public result is exactly `{outcome}` — private payload travels through an
   injected `deliver` sink, once, post-commit, outside the retry loop;
   delivery failure → `reset_failed` without replay.
4. COMPLETED audit: `actorUserId=null`, `actorRole=null` (bearer-token
   authentication), subjectUserId = account, scope ACCOUNT.
5. `MAX_ATTEMPTS = 8` + bounded backoff (`min(attempt*10, 50)`ms); 10-burst
   real-PG proof (5×8-way + 5×3-way): zero rejections, one active token per
   burst. Retries remain P2034/40001/40P01-only. Route-layer rate limiting
   still required before public exposure — deferred, unchanged.
6. Session-update test now uses a real CSRF token+cookie from the installed
   handler: 200, null body, stale cookie cleared, `auth()` stays null.
7. `resetStage` moved to `AccountAuditMeta` + `sanitizeAccountAuditMeta` —
   workspace audit construction rejects it; account reset audit accepts
   only REQUESTED|COMPLETED.
8. `safeTokenHash`: TokenError → `invalid_token`; unexpected → `reset_failed`
   (isolated unit test mocks `hashAccessToken` to throw).

RED evidence: 6/8 unit tests failed against the unrepaired implementation;
integration shape/actor/CSRF/audit tests failed as expected.

Mutation evidence (all caught, restored byte-exact): token-after-policy (1
unit) · delivery reintroduced into public result (12) · sink on ineligible
(1) · actor=account (1) · MAX_ATTEMPTS=3 (unit attempts pin + 8-way burst) ·
workspace resetStage (1) · safeTokenHash catch-all (1) · forged-CSRF (1).

**Status: repair implemented on the feature branch; gates green;
independent different-model re-review pending.**

---

## Second repair plan — after DeepSeek re-review FAIL (2026-10-01)

Final capped-loop repair. Three confirmed findings only; no architecture
broadening, no schema change.

1. **Active documentation contradicts the repaired contract.** The
   plan's "current contract" sections still describe the pre-repair API
   (delivery-in-result, optional sink wording, actor=account user, the
   superseded FOR UPDATE visibility claim, `MAX_ATTEMPTS` inconsistency).
   Rewrite the active sections; mark the first implementation record
   explicitly HISTORICAL — SUPERSEDED.
2. **Optional delivery sink permits silent token loss.** Make `deliver`
   a required runtime-validated dependency — missing/non-function →
   `invalid_input` thrown BEFORE any account lookup, transaction,
   revocation, issuance, or audit. Sink still runs exactly once, post-
   commit, outside the retry loop; failure → `reset_failed`, no replay.
   No separate existence-check service.
3. **`resetStage` accepted on `PASSWORD_RESET`/`user`.** Couple account
   metadata to the exact pair `PASSWORD_RESET`/`access_token` — type-level
   discriminated input + runtime check in `buildAccountAuditEvent`/
   `sanitizeAccountAuditMeta`. `PASSWORD_RESET`/`user` with no metadata
   keeps its existing accepted behavior.

Mandatory mutations: optional-`deliver` restored · runtime sink check
removed · `PASSWORD_RESET`/`user` + `resetStage` allowed · one stale active
doc statement reintroduced and caught by a documented rg gate.

## Second repair record (2026-10-01)

Second DeepSeek re-review FAIL → three repairs on
`feature/s1-f2d-password-reset`:

1. Active contract sections rewritten to match the implemented API
   (required sink, `{outcome}`-only result, token-first validation, SSI
   wording, `MAX_ATTEMPTS = 8`, null actor attribution, pair-coupled
   `resetStage`, concurrent-delivery semantics). Prior plan and record
   sections marked HISTORICAL — SUPERSEDED.
2. `deliver` is now a required runtime-validated dependency —
   missing/null/non-function → `invalid_input` before any lookup, tx,
   revocation, issuance, or audit. Sink still fires once post-commit
   outside the retry loop; failure → `reset_failed`, no replay.
3. `resetStage` coupled at type + runtime to `PASSWORD_RESET`/`access_token`
   only (discriminated `AccountAuditEventInput` + runtime check in
   `buildAccountAuditEvent`). `PASSWORD_RESET`/`user` without metadata
   remains accepted (S1-F2B behavior preserved).

Mutation evidence (all caught, byte-exact restores, shasum-verified):
optional `deliver`+default restored (1 unit) · runtime sink check removed
(1 unit) · `resetStage` on `PASSWORD_RESET`/`user` allowed (1 unit + 1
audit unit) · stale doc statement reintroduced and detected by the rg
contract-consistency gate (documented patterns: `delivery:`-in-result,
`actor = account user`, `Bounded attempts = 2`, `sees rows committed`,
`sees the winner` in a non-historical context).

Concurrency note (observed behavior, by design): concurrent successful
requests each deliver once; replacement revocation means only the latest
delivered link is usable. The one-active-token invariant is unchanged.

**Status: second repair implemented; gates green; final independent
different-model re-review pending.**

---

## Boundary-design plan — stable inputs (2026-10-01)

Post-repair hardening for TOCTOU-style input mutation. Two designs:

1. **Reset delivery — capture once.** `requestPasswordReset` reads
   `options.deliver` and `input.email` exactly once at entry inside a
   try/catch → throwing getters/proxies → `invalid_input` (no leak). The
   captured function is validated (`typeof === "function"` → else
   `invalid_input`, before any DB work) and invoked unconditionally
   (`deliver(payload)`, no `?.`) exactly once post-commit outside the
   retry loop; mid-transaction mutation of `options.deliver` cannot
   suppress delivery. Sink failure → `reset_failed`, no replay.
   Result stays exactly `{ outcome }`.
2. **Account audit — capture once.** `buildAccountAuditEvent` reads
   `action`/`resourceType`/`resourceId`/`meta` and the context fields once
   each inside a guarded block → throwing getters/proxies/enumeration →
   structural `AuditError` (`invalid_input` / `audit_metadata_forbidden`),
   never leaking the raw exception or input. Validation and row
   construction use only the captured values; the
   `resetStage`-only-on-`PASSWORD_RESET`/`access_token` coupling and the
   meta-free `PASSWORD_RESET`/`user` shape are preserved.

RED first: deferred-transaction unit tests flipping `options.deliver`
mid-flight, getter/proxy traps, single-read audit probes, and a real-PG
integration case where `options.deliver` is reassigned while the
transaction is pending — issuance + audit + one post-commit delivery.

Mutations to prove: second `options.deliver` read (optional + direct),
second `input.meta` read, delivery validation removed.

Scope: `lib/auth/password-reset.ts`, `lib/audit.ts`, the two test files +
`tests/unit/audit.test.ts`, this record, `docs/STATUS.md`. No schema,
route, UI, provider, dependency, or Prime-Tracker change.

## Boundary-design record (2026-10-01)

Stable-input hardening implemented on `feature/s1-f2d-password-reset`:

1. `requestPasswordReset` reads `options.deliver` and `input.email` once
   each in a guarded block → trapped getters/proxies → `invalid_input`
   (message/input never leak). The captured function is invoked
   unconditionally once post-commit; mid-flight reassignment of
   `options.deliver` cannot suppress delivery. Sink failure →
   `reset_failed`, one commit, no replay. Residual limitation: a delivery
   function that itself fails after commit cannot retry the email — the
   token was already committed (documented, structural `reset_failed`
   is the surface; the user may simply request again).
2. `buildAccountAuditEvent` captures `subjectUserId`/`actorUserId`/
   `actorRole`/`action`/`resourceType`/`resourceId`/`meta` once each and
   validates + builds exclusively from the captures; trapped access →
   structural `AuditError` only. `resetStage` stays coupled to
   `PASSWORD_RESET`/`access_token`; meta-free `PASSWORD_RESET`/`user`
   preserved.

Mutation evidence (all caught, byte-exact restores): second
`options.deliver` read via `?.` (2 unit + 1 real-PG) · second read via
direct call (2 unit + 1 real-PG) · second `input.meta` read (1 unit) ·
delivery validation removed (1 unit).

**Status: boundary redesign implemented; gates green; independent
different-model re-review pending.**

## Account-audit optional-field validation repair plan (2026-10-01)

Base `ce01d95`; repair only the ACCOUNT builder. Captured `actorUserId`,
`actorRole`, and `resourceId` currently become null if a present value has
an invalid type. Preserve the single read of every context/input property.
For each optional capture, `undefined`/`null` maps to null; a present
`actorUserId` or `resourceId` must be a string, and a present `actorRole`
must be one of Prisma's five `MemberRole` values. Invalid values throw
`AuditError("invalid_input")` before `auditEvent.create`; no input or caught
exception appears in errors. Keep workspace audit and metadata rules intact.

1. RED in `tests/unit/audit.test.ts`: production builder rejects numeric/
   object actor IDs, `HACKER`/wrong-type roles, and numeric/object resource
   IDs; account writer calls no create for malformed captures. Pin valid
   strings and each MemberRole, and both missing/null optional values.
   `npx vitest run tests/unit/audit.test.ts` must fail on the three current
   silent-null branches, while prior getter/proxy/pair tests remain active.
2. GREEN in `lib/audit.ts`: validate captured values before constructing
   the row; construct it only from those values, using null only for
   missing/null options. Re-run the focused unit command: exit 0.
3. Mutate the three output branches one at a time back to silent null;
   each targeted RED test must fail, then restore the file byte-for-byte.
4. On a fresh disposable PostgreSQL database, run
   `npm run test:integration -- tests/integration/s1-f2b-account-audit.test.ts tests/integration/s1-f2d-password-reset.test.ts`, then full gates:
   `npm ci`, `npx prisma format`, `npx prisma validate`,
   `npx prisma generate`, `npx prisma migrate deploy`,
   `npx prisma migrate status`, `npm run format:check`,
   `npm run typecheck`, `npm run lint`, `npm run test`,
   `npm run test:integration`, `npm run build`, `npm run test:e2e`,
   `git diff --check`, `npm audit`. Record exit codes/counts and clean up
   only the disposable database. Existing E2E covers browser regressions;
   no reset browser route exists yet.
5. Update this record and `docs/STATUS.md`; scoped plan, repair/tests, and
   handoff commits only. Verify `origin/main` is unchanged, push the feature
   branch normally, and leave independent DeepSeek review pending. No PR,
   merge, deploy, schema, route, UI, provider, or dependency changes.
