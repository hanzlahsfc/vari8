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

## Independent review — PASS (opencode-go/deepseek-v4.1-flash)

Read-only independent review of range `0d503b7..fb0713b` (HEAD
`fb0713bdc67ed2d855622d2045fc3744137b2cda`), each commit inspected separately
(`7a9336b` implementation, `fb0713b` docs). Independence basis: S1-F2A was built
by SWE-2 High; the reviewer `opencode-go/deepseek-v4.1-flash` is a different
model and did not build this slice. No files were modified during review; no
repair was made.

- **Transaction boundary.** Every state-changing primitive requires a caller
  `Prisma.TransactionClient`; `lib/tokens/store.ts` imports no global client and
  opens no transaction. Rollback proven on real PostgreSQL: a claim followed by a
  thrown error leaves `consumed_at` NULL; a failed-after-issue transaction leaves
  no row. The suite catches a global-client escape (builder mutation: 10
  failures). Caveat: `Prisma.TransactionClient` is `Omit<PrismaClient, …>`, so a
  full `PrismaClient` is structurally assignable to the parameter — the guarantee
  is convention + review, not a compile error (see observations).
- **Issuance.** S1-F0 `generateAccessToken()` used; only the canonical 64-hex
  SHA-256 digest reaches PostgreSQL (raw token absent from every stored column —
  `CAST(row AS text) LIKE '%raw%'` count `0`); expiry exactly `+12 h` under faked
  `Date`; invite/reset rows satisfy the S1-F1 CHECK shapes; RNG/DB failure fails
  closed with no partial row; surrounding rollback removes the issued row.
- **Email.** Issuance and revocation share `normalizedTargetEmail` →
  `normalizeEmail` (`lib/credentials.ts`), identical to credential login (trim +
  lowercase, no Gmail dot/plus rewriting); empty/non-string/>254 rejected
  structurally. No cycle or database coupling (credentials → `lib/password.ts`).
- **Replacement revocation.** Independently reproduced on real PostgreSQL: only
  the matching `(workspace, purpose, email, role, unconsumed, unrevoked,
unexpired)` invite was revoked; every other row byte-identical (cross-workspace,
  cross-email, cross-role, reset, consumed, already-revoked, expired all
  untouched). Reset revocation scoped to the exact user and purpose.
- **Atomic claim.** Conditional `updateMany` (digest + purpose + optional scope +
  `consumedAt/revokedAt IS NULL` + `expiresAt > now`) → `findUniqueOrThrow` for
  the exact locked row. Malformed input rejected before any DB work;
  `{ok:false}` indistinguishable across missing/wrong-purpose/expired/revoked/
  consumed; two concurrent claims produced exactly one success at Read Committed
  (one `P2034` at Serializable — propagates, never mislabeled); unexpected DB
  errors propagate.
- **Optional owner scope.** Omitted `workspaceId`/`userId` is a deliberate
  lookup behavior, not a tenant bypass; the returned record exposes
  `workspaceId`/`userId`/`targetEmail`/`intendedRole` so the orchestrator can
  revalidate ownership/current state. No route, app, or service imports the store
  (`grep`-verified), so no current exploit exists.
- **Inspection.** `inspectAccessToken` returns only `{valid, purpose,
expiresAt}`; malformed/missing/expired/revoked/consumed all returned
  `{valid:false}` on real PostgreSQL with no identity field.
- **Errors/leakage.** `TokenStoreError("invalid_input")` and
  `TokenError("token_invalid")` carry the code only — no raw token, digest,
  email, user/workspace id, or query parameters. Unexpected DB errors are not
  converted to an invalid-token result.
- **Exposure.** Both `assertTokenFlowsExternallyExposable` and
  `assertTokenPrimitivesExternallyExposable` fail closed; no email or fake
  delivery seam, no account/password/membership/profile/session/audit/RBAC
  mutation, no registration or cross-workspace sharing was added.
- **Test quality.** The 11 documented builder mutations target raw-token
  persistence, TTL, every claim/revoke predicate, read-then-unconditional-update,
  global-client escape, and secret-bearing errors; the critical database cases
  were independently reproduced (above) beyond the committed suite.

### Gates (reviewer-run, fresh disposable PostgreSQL databases, since dropped)

`git diff --check` 0; `npm ci` 0; `npx prisma format` 0 (no schema diff);
`validate` 0; `generate` 0; `migrate deploy` 0 (7 migrations); `migrate status` 0;
`format:check` 0; `typecheck` 0; `lint` 0; `npm run test` 0 (287 passed / 29
files); `test:integration` 0 (102 passed / 7 files, real PostgreSQL); `build` 0;
`test:e2e` 0 (21 passed). `npm audit`: 1 moderate + 4 high (unchanged advisories;
no `--force`).

### Non-blocking observations

- `Prisma.TransactionClient` does not structurally exclude a full `PrismaClient`;
  a future orchestrator could pass the global client and write outside its
  transaction. The module imports no global client itself, so this is a caller
  discipline item — construct the tx only from `$transaction`.
- The 12 h `expiresAt` uses the app clock while `created_at` defaults to the DB
  clock; if the DB clock were >12 h ahead of the app clock, the
  `expiry_after_creation` CHECK would reject the insert (fail-closed) — a
  clock-skew availability caveat, not a security defect.
- `normalizeEmail` lives in `lib/credentials.ts`; no cycle and no DB coupling, but
  a shared pure util would be a cleaner home.
- The losing Serializable claim surfaces `P2034`; the orchestrator must retry,
  consistent with "unexpected DB errors propagate."

## Status

**Independently reviewed PASS (`opencode-go/deepseek-v4.1-flash`, 2026-09-30) at
`fb0713b`.** S1-F2A is internal primitives only — no product flow, service,
authorization, audit coupling, delivery, route, UI, or external exposure. Full
S1-F remains blocked on the open `TODO(human)` items; orchestration services stay
blocked until those land and are separately reviewed.
