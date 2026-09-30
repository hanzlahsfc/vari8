# S1-F orchestration implementation plan

Status: **implementation-ready plan only — no production code was written for
this document.** Basis: S1-F0 (crypto), S1-F1 (schema + sessionVersion), and
S1-F2A (tx-bound store primitives) are all independently PASS at `fb0713b`;
Aleks's final policy answers are recorded in `docs/product-decisions.md` #20–28.

Everything below is design for future, independently reviewable slices. Where a
decision remains open (email provider, product-facing owner name, rate-limit
mechanism, DENY-event volume, cross-workspace health-data sharing), the design
says so and does not fake one.

## 0. Accepted-risk record (do not soften)

- **Account enumeration via reset response.** Aleks approved that the public
  password-reset response deliberately differs depending on whether an account
  exists. This is an explicit product tradeoff — **not** a security best
  practice. Mitigations are still mandatory: per-IP and per-identifier rate
  limiting at the route layer, abuse monitoring, and minimized timing
  differences. The response may reveal **only existence** — never status, role,
  workspace membership, client status, or any other field.
- **Password minimum 10.** Explicit product decision, below the current
  15-character recommendation for password-only authentication. Recorded, not
  silently overridden; no composition rules compensate for it.

## 1. Slice sequence

One oversized change would be unreviewable; the work splits by dependency:

| Slice                             | Content                                                                                                                                                                                                                                                                                                                                                   | Blocks on                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **S1-F2B**                        | Account-security foundation: account-scoped audit schema + service path, password-policy validator, `sessionVersion`→JWT wiring, 30-day bounded token cleanup. No routes, no email. **Implemented 2026-09-30 (`3db9e6d`,`4bdf118`) — independent review pending.**                                                                                        | Nothing new                                            |
| **S1-F2C**                        | Workspace-invitation orchestration: authorization/RBAC, create/revoke/list, replacement invalidation, new- and existing-user acceptance, membership/profile transitions, workspace audit coupling, provider-neutral delivery output. **No public route. Implemented 2026-09-30 — independent review pending; record `docs/tasks/s1-f2c-invitations.md`.** | S1-F2B (audit + password policy)                       |
| **S1-F2D**                        | Password-reset orchestration: account-existence result, ACTIVE-only issuance, replacement, consume+hash+`sessionVersion`+sibling-revoke+account audit atomically, provider-neutral delivery. **No public route.**                                                                                                                                         | S1-F2B (audit, password policy, sessionVersion wiring) |
| **Routing slice (S1-H or later)** | HTTP routes/actions, real email provider + domain/sender config, per-IP/per-identifier rate limiting, final timing behavior, UI, E2E + exposure review.                                                                                                                                                                                                   | S1-F2C, S1-F2D, open provider questions                |

S1-F2B precedes both orchestration slices because both need account audit and
password policy; F2C and F2D are order-independent after that (this document
plans F2C first only because invitation flows gate real usage). No reordering
is justified by a technical constraint.

## 2. S1-F2B — account-security foundation

### 2.1 Account-scoped security audit (chosen design: §4.2(a) of the S1-F plan)

`AuditEvent.workspaceId` is `NOT NULL` today, but reset/login activity is
user/account-owned. **Chosen design:** keep `AuditEvent` as the single
append-only table and add a scope discriminator:

- `AuditEvent.scope`: new enum `WORKSPACE` | `ACCOUNT`, required, defaulting
  `WORKSPACE` on migration.
- `AuditEvent.workspaceId`: becomes **nullable**.
- `AuditEvent.subjectUserId`: new nullable FK → `User` (`onDelete: Restrict` —
  deleting a user must not silently erase its security history; erasure is a
  separate reviewed flow).
- Raw SQL CHECKs (migration, Prisma-invisible — `migrate deploy` required):
  - `scope = 'WORKSPACE'` ⇒ `workspaceId IS NOT NULL` and `subjectUserId IS NULL`;
  - `scope = 'ACCOUNT'` ⇒ `subjectUserId IS NOT NULL` and `workspaceId IS NULL`.
- **Backfill:** `UPDATE audit_event SET scope='WORKSPACE'` on deploy — every
  existing row keeps its workspace and is unaffected. Fully additive.
- **Read paths:** `listAuditEvents` keeps filtering `workspaceId = ?`; account
  rows are unreachable through workspace listings because
  `WORKSPACE`-scope requires non-null `workspaceId`. A new account-scoped
  listing keyed on `subjectUserId` (+ `at` for ordering) is added only for the
  security-log consumer; index `(subjectUserId, at)` — no workspace-scoped
  index changes.
- **Service-path changes required (not optional):** today's audit writer is
  closed — `AUDIT_RESOURCE_TYPES` = `["consent", "client_assignment"]`,
  `buildAuditEvent` hardcodes `result/ip/reason` and requires a non-empty
  `context.workspaceId`. S1-F2B must extend it deliberately: new resource
  types (e.g. `access_token`, `user`), an `AuditAction` value for reset
  (`PASSWORD_RESET` — it does **not** exist in the enum today), an
  account-scoped write path that takes a `subjectUserId` context instead of a
  workspace context, and result/ip fields sourced by policy where used.
- **Metadata rules (unchanged + extended):** never email, token material or
  hashes, passwords, reset URLs, raw IPs without policy, or health values.
- Rejected alternative: a separate `AccountAuditEvent` table. It duplicates the
  audit machinery and creates a second compliance surface for no benefit — one
  table with a discriminator keeps single-table ordering and one redaction
  contract. Fabricating a workspace for account events remains forbidden.

### 2.2 Password policy module (new `lib/password-policy.ts`)

- Minimum **10 Unicode code points** (count via code-point iteration, not
  UTF-16 units — `String.length` would miscount astral characters).
- Maximum **128 characters** — the implementation brief requires the maximum
  to accommodate long passphrases and be at least 64 characters; 128 satisfies
  that with margin and gives a finite ceiling that bounds scrypt CPU/memory
  per call (scrypt cost is roughly linear in input length at fixed
  parameters; unbounded input is a DoS vector). This is an engineering
  ceiling, not a founder decision; if it ever proves insufficient for
  passphrase UX it can be revisited upward.
- **No** composition requirements, no silent trimming or case folding, no
  normalization of the stored password — verification must be exact.
- Unicode handling: normalize to **NFC** before length check and before
  hashing, so identical user intent across input methods (macOS NFD file
  dialogs, browsers, mobile keyboards) produces the same stored credential.
  NFC-only; no NFKC (would fold look-alike characters and change user intent).
  Count length on the NFC form.
- Spaces and all printable characters allowed, interior or leading/trailing —
  a passphrase like `correct horse battery staple ` differs from
  `correct horse battery staple`; only the user's exact bytes (post-NFC) are
  hashed.
- Hashing stays on existing `lib/password.ts` scrypt — unchanged.
- Errors are structural codes (`password_too_short`, `password_too_long`);
  no password content, hints, or entropy commentary in errors/logs/audit.
- No breach/HIBP check — not approved.

### 2.3 `sessionVersion` → JWT wiring (real revocation, not cosmetic)

Design for `auth.ts`/`auth.config.ts` (implementation is S1-F2B):

- **Issue:** on credentials authorize, embed `token.sv = user.sessionVersion`
  into the JWT.
- **Verify:** at the trusted session boundary, re-read the user's `status` +
  `sessionVersion` from the database and reject/empty the session when
  `token.sv !== current.sessionVersion` or the user is not `ACTIVE`. Placement
  caveat: the `session` callback currently lives in `auth.config.ts`, which is
  deliberately edge-safe and must **not** import Prisma — so the DB-read check
  belongs in `auth.ts`'s callbacks (the Node-side config that already holds
  the provider and database lookup) or a server-side session-check helper
  invoked there; `auth.config.ts` stays import-free. Never trust a
  session-carried version without a fresh DB read — that is the entire point
  of the mechanism.
- **DB-cost assessment:** one indexed primary-key read per authenticated
  request. This is acceptable at current scale and is the honest cost of
  revocable JWTs. Caching the version (even short-TTL) reintroduces a
  revocation lag and is **not** planned; if load ever requires it, the
  tradeoff must be explicitly reviewed, not silently added.
- **Legacy JWTs (no `sv` claim):** treat as stale — force re-login. All
  current sessions are dev-only; a hard cutover is safe and avoids a
  two-mode validator.
- **Consume ordering (S1-F2D):** the reset transaction must increment
  `sessionVersion` in the same transaction as the password update and token
  consumption — the S1-F1 foundation already exists.
- Generic failure surface: stale sessions fail exactly like expired sessions
  (redirect to sign-in); the reason is never exposed to the client.
- Tests: unit (claim embed/compare), integration (increment → old session
  rejected, status flip → rejected, concurrent reset vs request), and E2E once
  routes exist.

### 2.4 30-day token cleanup

Approved bound: consumed **or** expired/revoked rows with the relevant
timestamp older than 30 days may be deleted.

- Predicate: `consumedAt < cutoff` OR (`revokedAt < cutoff`) OR
  (`expiresAt < cutoff AND consumedAt IS NULL`); active rows (unconsumed,
  unrevoked, unexpired) are **never** deleted — the predicate itself excludes
  them.
- Bounded batch: `DELETE` limited to N=1000 rows per call via a stable
  `(created_at, id)` cursor (or `ORDER BY id LIMIT N` — `id` is a Prisma
  `cuid()`/CUIDv1, unique; state it explicitly whichever lands); loop until
  0 — each batch is its own small transaction. No unbounded delete.
- Concurrency: the predicate re-evaluates rows that became active since —
  impossible by construction (a row cannot become un-consumed/un-expired), so
  cleanup is naturally safe under concurrent issuance and retryable.
- Placement: **opportunistic** — invoked inside orchestration service
  transactions' surrounding call (after commit, own transaction) on
  issuance paths, plus a documented hook for a future scheduled job. No cron
  infra exists; none is invented.
- Prerequisite note: `access_token` has `onDelete: Restrict` from
  Workspace/`createdBy` and `Cascade` from `user_id` — cleanup does not weaken
  workspace/user deletion prerequisites.
- RED/integration tests: expired/revoked/consumed rows older than 30d deleted;
  anything newer or active untouched; batch bound respected (seed >N rows →
  exactly N removed per call); repeat calls drain.

## 3. S1-F2C — workspace-invitation orchestration

### 3.1 Authorization

- Technical `WORKSPACE_OWNER` = workspace admin/head coach (name still open).
- Matrix: owner/admin invites COACH/ASSISTANT_COACH/CLIENT; COACH invites
  CLIENT only; ASSISTANT_COACH/CLIENT cannot invite; OWNER/SUPPORT invites do
  not exist.
- Implementation: **prefer a distinct authorization resource** for
  coach→client invitations (e.g. `clientInvitations`) rather than widening the
  existing `membersInvitations` write to coaches — broadening the staff-
  invitation permission is exactly the accidental-authorization failure this
  split prevents. `authorization-model.md` + `lib/auth/rbac.ts` change is part
  of S1-F2C and gets its own review.

### 3.2 Issue / replace (one Serializable transaction)

1. `authorize(actor, workspace, resource, "write")`.
2. Re-read workspace + actor membership state (SUSPENDED actors cannot invite).
3. `revokeMatchingInviteTokens(tx, {workspaceId, targetEmail, intendedRole})`
   — founder's replacement policy.
4. `issueWorkspaceInviteToken(...)` — hash-only, 12 h.
5. Account/workspace audit via the S1-F2B-extended writer — `scope:
WORKSPACE`, action `INVITE`, resource `access_token`, no email/token/hash
   in `meta` (email goes in the token row, not audit meta).
6. Commit. **Only after commit** does the raw token reach the delivery port.

### 3.3 Revocation

Workspace admin revokes an outstanding invitation: authorize + conditional
`revokedAt` update + workspace audit, in one transaction. Revoking a
consumed/expired token is a structural no-op outcome.

### 3.4 Acceptance — new user

Inside one Serializable transaction:

1. `claimAccessToken(tx, {rawToken, purpose: WORKSPACE_INVITE, workspaceId})`
   → `{ok:false}` indistinguishable on any failure.
2. `hashPassword` via the S1-F2B policy validator (name + password supplied
   by the invitee — self-onboarding, never coach-supplied).
3. Create `User` (status ACTIVE — invite possession is email verification),
   `WorkspaceMember` (`intendedRole`, ACTIVE), and for `CLIENT` invites the
   `ClientProfile` — plus `user_id` bound onto the consumed token row
   (S1-F1 CHECK permits `user_id` only when `consumed_at` is set).
4. Workspace-scoped `INVITE`/accept audit event.
5. Commit. Concurrent accepts: the atomic claim allows exactly one winner —
   the loser gets `{ok:false}`.

### 3.5 Acceptance — existing user

- Requires being signed in as the **exact invited email** (decided). The
  service re-reads the session user's email, normalizes via shared
  `normalizeEmail`, and compares to `token.targetEmail`.
- Same claim → new `WorkspaceMember` in the invited workspace → audit → commit.
  One `User` may hold memberships in many workspaces; `ClientProfile` is
  created per the invited workspace. **No health/client data crosses
  workspaces** — that remains a separate unapproved feature.
- Duplicate membership: ACTIVE duplicate → idempotent structural result (not
  an error path that could confuse the UI); SUSPENDED/REMOVED → **never
  silently restored**: the caller must have issued a fresh explicit invite —
  acceptance of that fresh invite is itself the explicit restoration and
  transitions the prior row (SUSPENDED/REMOVED → ACTIVE) in the same
  transaction. No path reactivates a membership without an unconsumed invite
  bound to the exact (workspace, email, role) tuple.
- Inviter authorization and workspace state are re-read at acceptance time
  (the reviewed S1-F plan invariant: fresh DB reads at consumption). Consistent
  with that invariant and its recorded test ("invite accepted only while
  inviter's authorization is still valid — revoked-owner case"), an invite
  whose issuer has lost invitation authorization is rejected at acceptance.
  Whether the system should also proactively revoke outstanding invites of a
  removed issuer is a documented `TODO(human)` sub-question — no decision is
  encoded here.

## 4. S1-F2D — password-reset orchestration

### 4.1 Request (account-existence result)

1. `normalizeEmail` → `User` lookup.
2. Return an explicit structural result: `ACCOUNT_EXISTS` vs
   `ACCOUNT_NOT_FOUND` — the approved different-response behavior. Nothing
   else is revealed: INVITED/DEACTIVATED/suspended memberships are folded into
   the result without distinction.
3. Only `ACTIVE` users proceed: `revokeUserResetTokens` + `issuePasswordResetToken`
   (12 h) + account-scoped audit (`scope: ACCOUNT`, `subjectUserId`) in one
   Serializable transaction.
4. Post-commit only: raw token to the delivery port.
5. Rate limiting belongs to the routing slice (mechanism open); the service
   records enough (account audit + timestamps) for abuse monitoring.

### 4.2 Consume (one Serializable transaction)

`claimAccessToken(tx, {rawToken, purpose: "PASSWORD_RESET", userId})` →
validate new password via policy → `update(passwordHash)` →
`sessionVersion + 1` → `revokeUserResetTokens` (siblings) → consumed row
already set by claim → account-scoped `PASSWORD_RESET` audit event (new
`AuditAction` value added by S1-F2B) → commit.
Two concurrent consumes: the conditional claim yields exactly one winner; the
loser fails structurally. No workspace is fabricated; no password or token
appears in audit or logs.

### 4.3 Post-reset behavior

`sessionVersion` bump + S1-F2B JWT wiring ⇒ every pre-reset JWT is stale —
the founder's "log out other devices" requirement. The current session also
goes stale (intended: sign in again with the new password).

## 5. Delivery port (provider-neutral)

- Interface: `TokenDelivery.send({ to: normalizedEmail, kind: "invite" |
"passwordReset", payload: { workspaceName?, tokenUrl? }, rawContext })` —
  minimal structural payload; the exact shape is fixed in S1-F2B review.
- The **raw token enters the delivery boundary only**, post-commit; it is
  never persisted or logged by the port.
- **No URL construction** until product domain/base URL exists — services
  emit token + metadata; route/delivery layer composes the link once a domain
  is configured. Until then the provider, sender, and domain are absent
  config → production fails closed; fakes exist only in tests.
- Failure semantics: email send happens **after** the DB commit (DB and SMTP
  cannot share a transaction). A send failure is a surfaced delivery failure —
  the token remains valid for its TTL and the user/admin can re-issue (which
  revokes the first). No "sent" flag is faked onto the row; delivery state is
  not modeled in the token table.
- Replacement/retry is always explicit (re-request → revoke+issue), never an
  automatic resend loop.

## 6. Account-enumeration mitigations (routing slice)

Respecting the approved different-message policy:

- Per-IP and per-identifier (normalized email) rate limiting — mechanism open
  (Redis-backed or DB counter; decide at routing review).
- Abuse metrics/alerts — counters only; never tokens, emails in cleartext
  beyond the normalized lookup key, or passwords.
- Response payload: existence bit only — no status/role/workspace/client
  fields, no timing oracle beyond existence (password-hash simulation for
  not-found users is optional but must not regress into leaking).
- No other endpoint may expose existence — sign-in stays generic
  (`CredentialsSignin` unchanged); invite acceptance reveals nothing beyond
  token validity.

## 7. Test & review requirements per slice

| Slice   | Required evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1-F2B  | RED on absent behavior; unit (policy bounds, NFC, JWT sv embed/compare); integration on fresh PG (scope CHECKs, workspace rows unreachable via account events + vice versa, cleanup bounds/cursor/drain, session invalidation post-bump); concurrency (parallel claims/cleanup); rollback (audit+mutation atomicity); mutation proofs (CHECK removal, predicate removal, TTL, sv comparison); full gates.                                                                |
| S1-F2C  | RED first; authorization matrix tests incl. denied roles; Serializable revoke+issue atomicity (failure mid-tx leaves no token); acceptance new/existing; suspended/removed → explicit restoration only via fresh invite; duplicate-membership idempotence; cross-workspace denial; concurrent accept = 1 winner; audit rows present + leak-free meta; no-leak canaries (raw token in no column/log); mutation proofs (each authorize call, each scope predicate); gates. |
| S1-F2D  | Same shape as F2C plus: existence-result unit/integration tests; ACTIVE-only issuance; consume atomics incl. `sessionVersion` bump visible in DB; sibling-revoke; concurrent consume = 1; stale-JWT rejection exercised through the wired auth path; mutation proofs.                                                                                                                                                                                                    |
| Routing | HTTP contract tests; rate-limit behavior tests; provider fake; timing-similarity smoke; real-browser E2E incl. mobile widths; exposure review + `assertTokenFlowsExternallyExposable` updated only when the review approves.                                                                                                                                                                                                                                             |

Every slice: disposable PostgreSQL, real migration deploys, restored
byte-for-byte mutations, no realistic secrets in fixtures, and **independent
different-model review before the next slice starts**.

## 8. Plan-review record

A fresh-context consistency review (same model family as the drafter — **not**
counted as independent review) checked every referenced symbol, enum, field,
and attribution against the tree. Findings fixed in this draft:

- `PASSWORD_RESET` did not exist in `AuditAction` — now planned as an S1-F2B
  enum addition; the audit writer's closed resource-type set and workspace-
  required context are documented as required service-path changes.
- A mislabeled cross-reference (§4.2 lives in the S1-F plan, not the S1-E
  record) corrected.
- An unrecorded claim that issuer removal does not invalidate invites —
  contradicted the reviewed plan invariant — corrected to the re-check + a
  `TODO(human)` sub-question.
- The session-boundary design moved off `auth.config.ts` (deliberately
  Prisma-free/edge-safe) to `auth.ts`'s Node-side callbacks.
- `id` mislabeled cuid2 (it is Prisma `cuid()`); ≥64-char requirement
  re-attributed to the implementation brief, not the founder.
- A `claimAccessToken` signature shorthand corrected to the real shape.

## 9. What this plan deliberately does not include

- No production code, schema diff, or migration.
- No chosen email vendor, sender, or domain.
- No rate-limit mechanism selection.
- No standalone `EMAIL_VERIFICATION` flow.
- No cross-workspace health-data sharing.
- No DENY-event volume policy.
- No product-facing rename of `WORKSPACE_OWNER`.
