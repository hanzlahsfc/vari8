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
3. Locking scan of the account's active reset tokens
   (`... FOR UPDATE`) — locking reads see rows committed after our snapshot,
   so a winner's fresh token is never missed by a waiter's stale snapshot.
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
