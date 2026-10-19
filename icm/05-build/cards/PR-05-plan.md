# PR-05 build plan - Better Auth + /api/v1 foundation

Issue #58. Branch `beta/pr-05-auth-api`. Integration target `Vari8-Beta`.
Sources: `icm/05-build/AUTH-DECISION.md` (beta worktree), D1..D36, owner answers
1018, PLAN.md PR-05 row, TEST-AUDIT.md dispositions, PIPELINE-FOOTER.md.

## Design summary

Better Auth replaces Auth.js behind the existing seams. The stable contract that
all app code, guards, and services already consume is `session.user.id`; that
shape is preserved so ~19 action/page call sites keep working unchanged.

New modules:
- `lib/auth/server.ts` - the `betterAuth` instance: Prisma adapter, email+password
  with the existing `lib/password.ts` scrypt hash/verify, `bearer()`,
  `nextCookies()` (last), DB-backed `rateLimit`, `hooks.before` for the
  inactive-account lockout and the >=1-digit password rule at the auth boundary,
  `sendResetPassword` -> `lib/mail` dev adapter, `resetPasswordTokenExpiresIn:
  3600`, `revokeSessionsOnPasswordReset: true`.
- `lib/auth/viewer.ts` - `getViewer()`: session + ACTIVE user check -> the
  `{user:{id,...}}` shape callers use.
- `auth.ts` (root) - compat exports `auth()`, `signIn()` for the credentials
  form, `signOut()`; implemented on the Better Auth API.
- `app/api/auth/[...all]/route.ts` - `toNextJsHandler` (replaces `[...nextauth]`).
- `lib/email.ts` - `normalizeEmail` (moved from `lib/credentials.ts`).
- `lib/mail/index.ts` - delivery port; `dev-file` adapter writes JSONL to
  `var/mailbox.jsonl` (gitignored); `mailDeliveryConfigured()`; production fails
  closed.
- `lib/auth/password-reset-boundary.ts` - rewritten in place: same exported
  names (`getResetLinkState`, `requestPasswordResetFromForm`,
  `completePasswordReset`, `passwordResetMessage`,
  `passwordResetDeliveryConfigured`) so `app/reset*` pages keep working;
  internals call the Better Auth endpoints and peek the `verification` table.
- `lib/auth/roles.ts` - D15 closed union `Role = owner|coach|client`,
  capability table `Capability x Role -> "workspace"|"own"|"deny"`,
  `memberRoleToRole()` mapping (WORKSPACE_OWNER->owner, COACH->coach,
  CLIENT->client, everything else -> deny).
- `lib/api/v1.ts` - route helper: authenticate (cookie or bearer via
  `getSession`), ACTIVE check, Zod-validate params/query, resolve ACTIVE member
  of ACTIVE workspace + role, capability check, one service call, typed error
  JSON `{error:{code}}`: 401 `unauthenticated`, 403 `forbidden`,
  400 `invalid_input`, 500 `internal`.
- `lib/workspace/roster.ts` - `listWorkspaceClientRoster(ctx, input, client)`:
  staff-scope read over `client_profile` (id/name), cursor pagination.
- `app/api/v1/workspaces/[workspaceId]/clients/route.ts` - reference route.
- `lib/auth/signup.ts` + `app/signup/{page,actions,signup-form}.tsx` - coach
  self-signup: one tx creating User + credential Account + Workspace + owner
  WorkspaceMember, then sign-in.
- `tests/` additions named below.

Schema (`db/schema.prisma`, additive only):
- `User` gains `emailVerified Boolean @default(false)`, `image String?`, and
  `sessions`/`accounts` relations.
- New models `Session`, `Account`, `Verification`, `RateLimit` (snake-case
  `@@map`s: `sessions`, `accounts`, `verifications`, `rate_limit`).
- `password_hash`/`session_version` columns are kept so existing fixtures keep
  compiling; both are dead post-cutover and flagged for PR-R2 in the report.
- Migration `*_pr05_better_auth`: CREATE TABLEs + index + backfill `accounts`
  rows (`provider_id='credential'`, `account_id=user.id`, `password=
  password_hash`) for every existing user -> seeded coach signs in unchanged.

Deletions (after replacement tests pass):
- `auth.config.ts`, `lib/credentials.ts`, `lib/auth/session.ts`,
  `lib/auth/password-reset.ts`, `lib/auth/password-reset-delivery.ts`,
  `app/api/auth/[...nextauth]/`; prune `issuePasswordResetToken` /
  `revokeUserResetTokens` from `lib/tokens/store.ts`.
- `next-auth` dependency removed from package.json.

Rewires:
- `app/login/actions.ts` -> `auth.api.signInEmail`, generic failure message.
- `app/logout/actions.ts` -> `auth.api.signOut` + redirect `/login`.
- `app/reset*/` + `app/invite/page.tsx` unchanged except boundary internals.
- `lib/workspace/invitations.ts` new-user accept path also writes the credential
  `account` row and `emailVerified=true` (invite acceptance = verified, #20).
- `docs/security/authorization-model.md` regenerated from `lib/auth/roles.ts`.

Rate limiting: `rateLimit.storage="database"`, enabled always (not just prod);
`/sign-in/email` custom rule `{window: 60, max: 10}` so the card's literal
acceptance holds (10 wrong tries refused, 11th -> 429).

## Test surgery (TEST-AUDIT PR-05 scope)

- Whole-file deletes: the 24 integration files marked CUT-AT-REPLACE, plus
  `tests/unit/{session-version,credentials,rbac,guard,client-setup-rbac}.test.ts`
  where their subject code is deleted (`credentials.test.ts` is KEEP in the
  audit but its subject `authorizeCredentials` is deleted; the normalizeEmail
  block rewires to `lib/email.ts`).
- `tests/unit/password-reset*.test.ts` (4 files): deleted or rewritten against
  the new boundary (they test deleted internals).
- `tests/integration/{s1-f2b-session,s1-f2b-session-runtime,s1-f2d-password-reset,
  phase-3-2-password-reset}.test.ts`: audit says KEEP+REWIRE or CUT when auth is
  replaced - auth IS replaced, so these are deleted and replaced by a new
  `auth-flow.test.ts` covering reset 60-min expiry, single-use consume, session
  revocation, inactive lockout, and rate limiting against the live API handler.
- TRIM files: cut only the named PR-05 blocks, keeping the audit's GUARD blocks
  (isolation, single-use token, concurrency, date boundaries).
- New tests: `tests/unit/roles.test.ts` (table-driven matrix),
  `tests/integration/api-v1-clients.test.ts` (route called as a client; literal
  JSON; 200/403/401), `tests/integration/auth-flow.test.ts` (above),
  `tests/unit/password-reset-boundary.test.ts` rewritten.

## Live proof (port 3620, DB app_pr05)

Scripted HTTP: signup -> sign-in -> wrong password (401) -> 10 wrong attempts
then 11th (429) -> reset request -> mailbox file -> reset consume -> second use
(400 INVALID_TOKEN) -> expired token (400) -> change-password revokes other
session -> bearer `GET /api/v1/workspaces/:id/clients` 200 coach / 403 foreign
workspace / 401 no credentials -> root page renders signed-in.

## Gates

`npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:integration`
(DATABASE_URL -> app_pr05), `npm run build`, `cd frontend && npm run build`.
Then drop `app_pr05`.
