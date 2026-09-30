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
- `lib/audit.ts` — add one closed meta key `resetStage?: "REQUESTED" | "COMPLETED"`.
- `tests/unit/password-reset.test.ts` (new), `tests/integration/s1-f2d-password-reset.test.ts` (new).
- `docs/tasks/s1-f2d-password-reset.md`, `docs/STATUS.md`.
- **No schema/migration change** — S1-F1/F2B supply AccessToken,
  sessionVersion, account audit + constraints.

## Contracts

```ts
requestPasswordReset({ email }, client?) =>
  | { outcome: "ACCOUNT_NOT_FOUND" }                       // nothing else
  | { outcome: "ACCOUNT_EXISTS" }                          // non-ACTIVE: no delivery
  | { outcome: "ACCOUNT_EXISTS",
      delivery: { kind: "password_reset", to, rawToken, expiresAt } }

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
5. Post-commit: return existence outcome + private delivery payload.

## Consume transaction ordering

1. Outside tx: `validatePasswordPolicy` + `hashPassword` (policy failure never
   opens a tx — the claim cannot have happened).
2. Serializable tx: non-locking `findUnique(tokenHash)` to resolve `userId`
   (claim still enforces all predicates).
3. `users FOR UPDATE` (same `users → access_token` order as request — no
   deadlock cycle); require ACTIVE.
4. `claimAccessToken` (purpose + userId + unconsumed/unrevoked/unexpired
   conditional update — exactly one winner per token).
5. Sibling `FOR UPDATE` scan → revoke by PK.
6. `UPDATE users SET password_hash, session_version=session_version+1
WHERE id AND status='ACTIVE'` — conditional: status changed → fail closed.
7. Audit `PASSWORD_RESET`/`access_token`/`{resetStage:"COMPLETED"}`,
   actorUserId = the account user. Any failure rolls back all effects.

## Concurrency correctness (real-PG proofs)

- Two concurrent requests for one user: loser waits on the user row lock,
  then its locking token scan sees the winner's committed row → revokes →
  issues its own → exactly one active token.
- Concurrent consumes of the same token: conditional `updateMany` — one winner.
- Concurrent sibling consumes: both serialize on the user row lock; the loser
  retries with a fresh snapshot and finds its token revoked → `invalid_token`.
- User status flips mid-wait: `FOR UPDATE` hits 40001 (P2010) → bounded retry
  → fresh snapshot → deny. Bounded attempts = 2; only P2034 / raw 40001·40P01
  retry; unrelated/malformed P2002 → `reset_failed` (never retried, never
  mislabeled `serialization_conflict`).

## Audit semantics (pinned)

- scope ACCOUNT, workspaceId NULL, subjectUserId = exact account.
- request: `resetStage:REQUESTED`, resourceId = issued token id, actor null.
- consume: `resetStage:COMPLETED`, resourceId = consumed token id,
  actor = account user. No email/token/hash/password/URL/IP anywhere.

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

## Implementation record (2026-10-01)

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

## Repair plan — independent DeepSeek FAIL (2026-10-01)

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
3. **Injected delivery sink.** `requestPasswordReset` returns ONLY
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

## Repair record (2026-10-01)

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
