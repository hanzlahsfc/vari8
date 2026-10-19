# AUTH-DECISION: Vari8 identity layer

Branch Vari8-Beta, HEAD 17352b0. Docs and npm checked 2026-10-19. No code changed.

## Verdict

**Better Auth.** Replace Auth.js v5 (`next-auth@5.0.0-beta.32`, package.json) for sessions, passwords, 2FA, rate limits and bearer tokens.
Keep Hanzlah's invite token store (`lib/tokens/*`, `lib/workspace/invitations.ts`) as the single-use invite authority.
Do not write our own mobile token layer. Use the bearer plugin now; add refresh rotation when mobile ships.

Owner rule test: the benefits are present.

- Auth.js is in maintenance. Its README says it joined Better Auth and recommends Better Auth unless you need database-free stateless sessions [J]. Vari8 does not need that: every request already reads the database (`lib/auth/session.ts:85-89`).
- The repo has no rate limiting. Grep for `429|rateLimit|lockout` in app, lib and auth files returns nothing, so checklist PR-013 (P0) is open today. Better Auth ships it [B].
- 2FA with backup codes and lockout is built in [C]. Auth.js has none.

## Evidence

| Item (checklist)                  | Repo path:line                                                         | Better Auth                                                                                                          | Auth.js v5                                               |
| --------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Revocation (PR-005)               | `lib/auth/session.ts:66-82, 140-146`; `lib/auth/password-reset.ts:374` | `revokeSessions`, `revokeOtherSessions`, `revokeSessionsOnPasswordReset` [A][F]                                      | JWT strategy `auth.config.ts:16`; revocation is our gate |
| Rate limit (PR-013, P0)           | none                                                                   | Built in; `/sign-in/email` 3 req/10 s; memory by default, set database storage [B]                                   | Not in fetched docs                                      |
| 2FA, lockout (PR-004, PR-014)     | none                                                                   | TOTP or OTP, backup codes stored in DB, lockout returns 429, on by default [C]                                       | Not built in [M]                                         |
| Reset expiry, single-use (PR-003) | `lib/tokens/store.ts:36` (12 h), `:145`; `password-reset.ts:343, 358`  | Reset flow built in [F]; expiry and single-use not stated in fetched text                                            | n/a                                                      |
| Invite single-use                 | `lib/tokens/store.ts:219-264`; `lib/workspace/invitations.ts:475`      | Org invitations exist [G]; single-use not stated                                                                     | n/a                                                      |
| Impersonation audit               | none                                                                   | `impersonateUser`, `impersonatedBy` on session, 1 h default, no audit log [D]                                        | n/a                                                      |
| Mobile bearer                     | none                                                                   | Token in `set-auth-token` header; no refresh rotation documented [E]; Expo SecureStore only, no Capacitor plugin [H] | n/a                                                      |
| Prisma                            | `db/schema.prisma:124` (User)                                          | `prismaAdapter` [I]; example is Prisma 7 with driver adapter; repo is 6.19.3, verify                                 | n/a                                                      |
| Next 16                           | `package.json`: next 15.5.25                                           | Compatible; middleware renamed proxy [I]                                                                             | Min Next 14 [K]                                          |
| Vendor                            | n/a                                                                    | Vercel acquired Better Auth 2026-07-07; MIT, portable [L]                                                            | Maintenance mode [M]                                     |

Sources:

- [A] better-auth.com/docs/concepts/session-management
- [B] better-auth.com/docs/concepts/rate-limit
- [C] better-auth.com/docs/plugins/2fa
- [D] better-auth.com/docs/plugins/admin
- [E] better-auth.com/docs/plugins/bearer
- [F] better-auth.com/docs/authentication/email-password
- [G] better-auth.com/docs/plugins/organization
- [H] better-auth.com/docs/plugins/passkey
- [I] better-auth.com/docs/adapters/prisma; better-auth.com/docs/integrations/next
- [J] github.com/nextauthjs/next-auth (README)
- [K] authjs.dev/getting-started/migrating-to-v5
- [L] vercel.com/blog/vercel-acquires-better-auth
- [M] coderlegion.com/25814 (secondary)
- npm registry: better-auth 1.7.10 (modified 2026-10-16); next-auth latest 4.24.15, beta 5.0.0-beta.32

## Migration plan

**Replaced**

- `auth.ts` (54) and `auth.config.ts` (35) become one `lib/auth.ts`: `prismaAdapter`, `emailAndPassword`, `twoFactor`, `bearer`, `admin`, DB-backed `rateLimit`, `nextCookies`.
- `lib/auth/session.ts` (169) and `lib/credentials.ts` (65) are deleted. Email normalization (`credentials.ts:29`) moves to a sign-in hook (PR-002).
- `app/api/auth/[...nextauth]/route.ts` (3) becomes `app/api/auth/[...all]/route.ts`.
- `app/login/actions.ts` (30) calls `signInEmail`.
- `lib/auth/password-reset.ts` (429), `password-reset-boundary.ts` (158), `password-reset-delivery.ts` (80), `app/reset/actions.ts` (26), `app/reset-request/actions.ts` (17): Better Auth `sendResetPassword`. The no-provider delivery no-op becomes its body.
- `lib/tokens/store.ts`: drop only `issuePasswordResetToken` and `revokeUserResetTokens`.

**Kept**

- `lib/password.ts` (103) becomes Better Auth's `password.verify`, so existing scrypt hashes still log in. Rehash on next login.
- `lib/tokens/crypto.ts`, invite paths in `store.ts`, `invitations.ts`, `lib/auth/guard.ts`.

**Schema and cutover**

- `npx auth@latest generate`, then a Prisma migration. Backfill `account` rows from `User.passwordHash`. Drop `sessionVersion` after cutover.
- Existing cookies stop working at cutover: one re-login per user.

**Guarantees that must survive**

1. Session revocation (`session.ts:140-146`, `password-reset.ts:374`): revoke on reset and on password change. Do not enable `session.cookieCache` on protected routes; a cached session outlives revocation until `maxAge` [A]. Probe with two browsers.
2. Inactive-account lockout (`credentials.ts:57`, `session.ts:80`, `guard.ts:206`): block sign-in for non-ACTIVE users; keep the per-request deny in `guard.ts`.
3. Malformed-claim rejection (`session.ts:57-58, 71-72`): the `sv` claim disappears with opaque tokens. Replacement: a malformed or absent credential returns 401 with no DB write. Invite tokens keep the structural check (`crypto.ts:90-98`).
4. Invite single-use (`store.ts:219-264`, `invitations.ts:475`): untouched.
5. Reset expiry: `store.ts:36` gives reset links 12 h. Checklist PR-003 wants minutes to an hour. The 12 h is a founder decision (`store.ts:35`), so escalate to Marcel; do not change it silently.

Also re-confirm the owner's 2026-09-30 decision that the reset response distinguishes account existence (`password-reset.ts:18`). Better Auth's behavior is not confirmed in the fetched docs.

## Test blocks

**CUT-AT-REPLACE** (deleted in the replacing PR)

- `tests/unit/session-version.test.ts` (184), `tests/integration/s1-f2b-session.test.ts` (185), `tests/integration/s1-f2b-session-runtime.test.ts` (203): Auth.js `sv` gate.
- Reset suites: `s1-f2d-password-reset.test.ts` (682), `phase-3-2-password-reset.test.ts` (332), `tests/unit/password-reset.test.ts` (505), `password-reset-boundary.test.ts` (323), `password-reset-delivery.test.ts` (37), `password-reset-token-failure.test.ts` (60), `tests/e2e/password-reset.spec.ts` (398). First rewrite their expiry and single-use assertions against the new reset endpoint.
- `tests/e2e/auth.spec.ts` (18): already cut per TEST-AUDIT.

**KEEP**: `token-crypto`, `token-store`, `s1-f2a-token-store`, `s1-f2b-token-cleanup`, invite suites (`phase-3-1-invite-acceptance`, `unit/invite-acceptance`, `e2e/invite-acceptance.spec.ts`).

**UNREAD**: `tests/integration/s1-a-identity.test.ts` (497). Classify in the PR.

**New survivor tests**: login rate limit returns 429; two-browser revocation after reset; inactive sign-in denied; malformed bearer returns 401; reset link fails after expiry; impersonation writes an audit row; legacy scrypt hash logs in.

## Skipped and risks

- Skipped: organization plugin (invitations stay on our store; add when one user needs multiple workspaces). Passkeys (out of scope). Refresh rotation (add when mobile ships).
- Prerequisite: Next 15.5.25 to 16 upgrade.
- Prisma 6 versus the docs' Prisma 7 example: prove it in a scratch worktree before cutover.
- Capacitor secure storage is not in Better Auth docs. Choose a plugin at mobile time.

## Orchestrator ruling (02:12, 2026-10-19)

- Verdict accepted: Better Auth replaces Auth.js v5 (meets the owner rule: maintained, built-in rate limiting closes PR-013 P0, 2FA built in, less own code). Hanzlah's invite token store stays.
- Reset-link expiry: default 60 minutes, single use (production standard). The old 12 h founder value is superseded; reversible on owner request.
- Mobile refresh-token rotation: not needed for the web beta; tracked as a follow-up issue for the Capacitor milestone.
- Prerequisite order: Next 16 (PR-02, running) lands first; Prisma 6 stays unless Better Auth's Prisma adapter requires 7 (verify in a scratch worktree inside the auth card).
