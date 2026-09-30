# S1-F2A task record — internal transaction-bound token primitives

Slice **S1-F2A** of Stage 1: internal store primitives over the independently
reviewed S1-F1 schema. Future reviewed services compose these inside their own
Serializable transactions. **These are not services, not authorization
boundaries, and not exposable** — `assertTokenFlowsExternallyExposable` and the
new `assertTokenPrimitivesExternallyExposable` both remain fail-closed, and no
app/route file may import this module (grep-verified).

This slice encodes no unanswered decision: no invite acceptance, activation,
eligibility, password policy, email delivery, audit ownership, retention,
standalone verification, or rate limiting exists here.

## Module: `lib/tokens/store.ts`

Boundary contract: every state-changing primitive requires a caller-provided
`Prisma.TransactionClient` (type-enforced); nothing opens its own transaction
or imports `lib/db`. A caller aborting its transaction rolls the primitive's
writes back with it — proven by the rollback tests.

| Primitive                    | Signature (inside caller tx)                                      | Behavior                                                                                      |
| ---------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `issueWorkspaceInviteToken`  | `(tx, {workspaceId, targetEmail, intendedRole, createdByUserId})` | `generateAccessToken()`; stores digest only; purpose `WORKSPACE_INVITE`; expiry = now + TTL   |
| `issuePasswordResetToken`    | `(tx, {userId})`                                                  | digest only; `PASSWORD_RESET`; reset-shaped fields satisfy the DB CHECK                       |
| `revokeMatchingInviteTokens` | `(tx, {workspaceId, targetEmail, intendedRole})`                  | revokes only unconsumed/unrevoked/unexpired matching tuples                                   |
| `revokeUserResetTokens`      | `(tx, {userId})`                                                  | same active-only semantics, scoped to one user's resets                                       |
| `claimAccessToken`           | `(tx, {rawToken, purpose, workspaceId?, userId?})`                | conditional `updateMany` claim → at most one success; `{ok:false}` indistinguishable failures |
| `inspectAccessToken`         | `(db, rawToken)` (read-only; accepts client or tx)                | `{valid:false}` or `{valid:true, purpose, expiresAt}` — never identity fields                 |

- **Return shapes:** issue returns `{tokenId, rawToken, expiresAt}` — the raw
  token once, for the future delivery layer. Claim returns `{ok:true, token}`
  with only `{id, purpose, workspaceId, userId, targetEmail, intendedRole}` —
  the minimum an orchestrator needs to continue its transaction.
- **Errors:** `TokenStoreError("invalid_input")` — message is the code only,
  never the submitted value. Claim/inspection failures return structural
  results instead of throwing. Unexpected DB errors propagate — never
  misclassified as an invalid token.
- **Atomic claim:** `updateMany` conditioned on digest + purpose + caller scope
  - `consumedAt/revokedAt IS NULL` + `expiresAt > now`. The row lock serializes
    concurrent claims; the loser re-evaluates predicates and matches nothing.
- **Email:** reuses `normalizeEmail` from `lib/credentials.ts` (trim +
  lowercase) — identical to credential login; no provider-specific rewriting;
  empty/non-string/>254 rejected. Full internationalized-email policy stays
  open.
- **Clock:** production uses the real server clock; no caller may supply
  issuance or expiry times. Tests fake `Date` only (`vi.useFakeTimers({toFake:
["Date"]})`). `ACCESS_TOKEN_TTL_MS` is the single named 12-hour constant.

## Deferred by open decisions (not implemented)

Replacement orchestration (revoke+issue in one service transaction), invite
acceptance, reset consumption + `sessionVersion` bump, audit coupling (§4.2
undecided), retention cleanup — all remain for reviewed service slices.

## RED evidence

`npx vitest run tests/unit/token-store.test.ts` → exit 1 (module absent);
focused integration run on disposable `s1f2a_red` → exit 1 (module absent).

## Mutation evidence (each restored byte-for-byte; `shasum` verified)

| Mutation                                       | Failures                                     |
| ---------------------------------------------- | -------------------------------------------- |
| raw token stored instead of digest             | 10 (DB hash CHECK rejects)                   |
| TTL 12h → 1h                                   | 1                                            |
| claim: `revokedAt: null` removed               | 1                                            |
| claim: `consumedAt: null` removed              | 2                                            |
| claim: `expiresAt` predicate removed           | 1                                            |
| claim: `purpose` predicate removed             | 1 (after test strengthening — see below)     |
| invite-revoke: `workspaceId` predicate removed | 1 (cross-tenant row revoked)                 |
| reset-revoke: `userId` predicate removed       | 1                                            |
| claim → read-then-unconditional-update         | 4 (inactive rows claimable; race double-win) |
| global `prisma` client instead of supplied tx  | 10 (writes escaped to the wrong database)    |
| submitted value echoed in `invalid_input`      | 1                                            |

Test strengthening found mid-build: the wrong-purpose claim originally coupled
the purpose predicate with a differing `userId` scope, so removing the purpose
predicate was masked. The test now claims with the wrong purpose and _matching_
scope and asserts the row stays unconsumed — M6 then failed as required.

## Gates (fresh disposable `s1f2a_final`, dropped)

`git diff --check` 0 · `npm ci` 0 (audit 1 mod + 4 high, unchanged; no force) ·
`prisma format/validate/generate` 0 · `migrate deploy` 0 (7 migrations) ·
`migrate status` 0 · `format:check` 0 · `typecheck` 0 · `lint` 0 ·
`npm run test` 0 (287/29 files) · `test:integration` 0 (102/7 files, real PG) ·
`build` 0 · `test:e2e` 0 (21).

## Status

**S1-F2A internal primitives implemented; no product flow exists; independent
review required before any orchestration service.** Full S1-F remains blocked
on the open `TODO(human)` items.
