# S1-F0 task record — token cryptography foundation

Slice **S1-F0** of Stage 1: a policy-neutral cryptographic prerequisite for S1-F
(workspace invitations / account recovery). It adds only the token-crypto
primitives — generation, canonical hashing, and strict input validation — that
every future token flow needs regardless of how the pending `TODO(human)`
decisions are answered.

**This is not S1-F.** No `AccessToken` model, no migration, no database table,
no invite creation/acceptance, no password-reset request/consumption, no
registration, no email verification, no membership/user-status change, no
client-profile linking, no role-selection logic, no expiry duration, no
resend/invalidation policy, no session revocation, no email provider, no rate
limiting, no audit integration, no routes/actions/UI/E2E. No `TODO(human)`
decision was answered or bypassed; the open questions in
`docs/open-questions.md` #16–27 still block full S1-F.

Sources: `docs/tasks/s1-f-invites-recovery-plan.md` §3 (proposed invariants —
hash-only storage, CSPRNG token material, no token leakage), `stage-1-plan.md`
§6 (`AccessToken` stores `tokenHash`, never raw), `lib/password.ts` (scrypt —
the separate, unchanged password-hashing mechanism).

## Files

- `lib/tokens/crypto.ts` — `generateAccessToken()`, `hashAccessToken()`,
  `TokenError`, and the `RawAccessToken` / `AccessTokenHash` /
  `GeneratedAccessToken` types.
- `tests/unit/token-crypto.test.ts` — 21 unit tests (pure, no DB).

No other production file was touched. `db/schema.prisma`, `db/migrations/**`,
routes, and all existing services are unchanged.

## Design

- **Generation:** `crypto.randomBytes(32)` → 256 bits of CSPRNG entropy,
  encoded as unpadded base64url → exactly 43 characters over
  `[A-Za-z0-9_-]` (URL-safe, single canonical encoding). No UUIDs, timestamps,
  `Math.random`, predictable IDs, or application secrets as token material. No
  injectable randomness seam exists (`generateAccessToken` takes zero
  parameters).
- **Hashing:** SHA-256 → 64-character lowercase hex digest — the only canonical
  storage representation. A fast digest is appropriate because the input is a
  uniformly random 256-bit value: brute force is bounded by the token space, so
  no work factor helps. Passwords stay on `lib/password.ts` scrypt — password
  hashing is a different problem (low-entropy human input needs a work factor)
  and is deliberately not reused for tokens.
- **Validation (before hashing):** the candidate must be a string, non-empty,
  ≤ 128 chars (conservative abuse bound), and match
  `^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$` — the strict canonical base64url
  form of 32 bytes (the 43rd character can only be one of the 16 indices
  ≡ 0 mod 4). Empty, truncated, extended, whitespace-bearing, wrong-alphabet,
  non-canonical-final-character, unicode, oversized, and non-string inputs all
  throw `TokenError("token_invalid")`. The error message is the code only;
  submitted input never appears in it.
- **Result boundary:** `generateAccessToken()` returns `{ rawToken, tokenHash }`
  — the raw token exists once, for a future delivery layer to send; only
  `tokenHash` may persist. No function retains raw tokens in module state;
  there is no module state at all and no logging.
- **Comparison helper:** intentionally **not** added. The planned consume path
  is an atomic DB lookup by the unique `tokenHash` column
  (`s1-f-invites-recovery-plan.md` §3/§4.1), so no in-process digest comparison
  is needed yet; adding dead code now would only widen the review surface.

## RED evidence

`npx vitest run tests/unit/token-crypto.test.ts` before `lib/tokens/crypto.ts`
existed → exit 1, module-resolution failure (`Cannot find module
'../../lib/tokens/crypto'`; 1 test file failed, no tests ran).

## Tests (24)

Generation: canonical 43-char base64url format; decoded length exactly 32 bytes
(≥ 256 bits) with base64url round-trip; result object is exactly
`{rawToken, tokenHash}` and `tokenHash === hashAccessToken(rawToken)`;
successive tokens differ; no console output of any kind.

Hashing: deterministic; distinct tokens → distinct digests; 64-char lowercase
hex; digest never equals the raw token; generated tokens always pass
validation; a hardcoded known-answer vector pins the algorithm to SHA-256.
Rejection: empty string; whitespace (leading/trailing/interior,
tab, newline); off-alphabet characters (`+`, `/`, `!`, `=`, `.`, `@`);
truncated (42 chars / dropped first char); extended (44 chars); non-canonical
final characters (`B`, `a`, `z`, `-` in position 43 — only the 16 indices
≡ 0 mod 4 are producible); unicode/non-ASCII (surrogate pair, fullwidth);
oversized (1024/4096 chars); non-string input (`undefined`, `null`, number,
boolean, object, array, `Buffer`, boxed `String`). Error contents:
marker-bearing input produces `TokenError` with `code === "token_invalid"`
and `message === "token_invalid"` — never the submitted value.

Module boundary: every export is a function (no mutable module state);
`generateAccessToken.length === 0` and `hashAccessToken.length === 1` (no
injection seam); earlier results remain valid after later calls.

No uniqueness claims are made from the test sample — distinctness is asserted
as an observed property of two draws, not a probabilistic proof.

## Mutation evidence

Each mutation was applied temporarily, observed to fail, then reverted; the
pre-repair file was verified byte-identical afterward (`shasum` =
`115b335567875114c41e25f73712ca2ff8115946` before and after, 21/21 green). The
file was subsequently changed by the review repairs below — reverting the
tightened regex to `{43}` was itself mutation-checked (1 failure) before
committing the repair.

| Mutation                                          | Result                                             |
| ------------------------------------------------- | -------------------------------------------------- |
| `randomBytes` → `Buffer.alloc` (deterministic)    | 2 failures (tokens identical, digests identical)   |
| `TOKEN_BYTE_LENGTH` 32 → 16 (128 bits)            | 14 failures (generated token fails own validation) |
| `tokenHash: rawToken` (raw returned as its hash)  | 5 failures                                         |
| `TOKEN_PATTERN.test` check removed                | 5 failures                                         |
| Alphabet widened to allow `\s`                    | 1 failure (interior-whitespace token accepted)     |
| Error message includes the submitted input        | 8 failures (non-`TokenError`, marker leaks)        |
| Oversized accepted (max 8192 + unbounded `{43,}`) | 2 failures                                         |

## Gates

`git diff --check`; `npm ci`; `npm run format:check`; `npm run typecheck`;
`npm run lint`; `npm run test`; `npm run build`; `npm run test:e2e` — results
recorded in `docs/STATUS.md` and `TRACKER 2.0.md` for the committed tree. No
PostgreSQL integration or migration evidence exists because this slice touches
no database surface; any `db/` change would be a scope violation.

## Boundary reaffirmed

- Raw tokens are never stored, logged, serialized into errors, or placed in
  audit metadata; only the SHA-256 hex digest is persistable.
- Password hashing remains `lib/password.ts` scrypt — unchanged and unshared.
- Full S1-F remains **BLOCKED** on the unanswered Marcel/Aleks decisions
  (`docs/open-questions.md` #16–27; `s1-f-invites-recovery-plan.md` §2/§4.2).
- `product-decisions.md` and `open-questions.md` were not modified; nothing was
  marked resolved.

## Fresh-context review and repairs (same model — NOT independent)

A fresh-context read-only review (subagent, same model as builder — not a
diversity-satisfying independent review) returned **PASS WITH FINDINGS**:

- **F1 (LOW) — repaired.** `{43}` accepted all 64 alphabet chars in the final
  position, but base64url of 32 bytes can only emit the 16 indices ≡ 0 mod 4.
  Tightened to `^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$` + rejection tests for
  non-canonical final chars and acceptance of a canonical one. Reverting the
  tightening was mutation-checked: 1 test failure.
- **F2 (LOW) — repaired.** No test pinned the digest algorithm; a
  `sha256 → other-64-hex` mutation would have passed. Added a hardcoded
  known-answer test (`sha256("A"*43)`).
- **F3 (informational) — not adopted.** Branded `RawAccessToken`/`AccessTokenHash`
  types would make swaps compile errors, but plain documented aliases match
  this repo's conventions (`lib/password.ts`); recorded as a future option.
- **F4 (informational) — covered.** Added unicode/non-ASCII rejection tests
  (surrogate pair, fullwidth char, interior NBSP-class whitespace already
  covered by alphabet).

## Status

**Implemented; review repairs landed; gates green; independent different-model
review REQUIRED.** The fresh-context review above shares the builder's model
and is therefore **not** independent. Next action: independent different-model
review of S1-F0 while awaiting the S1-F product decisions.
