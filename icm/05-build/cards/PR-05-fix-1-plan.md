# PR-05 fix pass 1 — implementation plan

Worktree `/home/nexuslink/vari8-worktrees/pr-05-auth-api`, branch `beta/pr-05-auth-api`,
head `e68a2ef`. DB `app_pr05` @127.0.0.1:5433.

## Code changes

1. `lib/auth/rate-limit.ts` (new): atomic rolling-window `consumeRateLimit(key,{window,max})`
   on the shared `rate_limit` table (same store Better Auth writes). Keys:
   `acct:<purpose>:<sha256-hex of normalized email|userId>` and `ip:<purpose>:<ip>`.
   `resolveTrustedClientIp(headers)` reads only `process.env.AUTH_TRUSTED_IP_HEADER`;
   unset → null (no forwarding header trusted).
2. `lib/auth/server.ts`:
   - `verification: { storeIdentifier: "hashed" }` (F5/F3-verify).
   - `sendResetPassword`: link origin strictly `BETTER_AUTH_URL ?? AUTH_URL`, never
     request.url (F8); refuse when `!mailDeliveryConfigured()` (F9, belt for the hook).
   - `advanced.ipAddress`: `ipAddressHeaders: [AUTH_TRUSTED_IP_HEADER]` when set,
     else `disableIpTracking: true` (F2 — no spoofable bucket, no shared lockout).
   - `hooks.before`:
     a. `/request-password-reset` + `/reset-password`: refuse when mail delivery
     unconfigured, before any token write (F9).
     b. `/sign-in/email`: consume `acct:sign-in:<sha256(email)>` 10/60s plus
     `ip:sign-in:<ip>` when resolvable → 429 (F1/F2, covers HTTP + auth.api).
     c. `/request-password-reset`: consume `acct:reset-req:<sha256(email)>` 3/60s;
     then delete outstanding reset rows for the resolved user (supersede, F7).
     d. `/change-password`: `ctx.body.revokeOtherSessions = true` (F3) +
     `acct:change-pw:<userId>` 10/60s.
     e. session-bearing paths set: `getSessionFromCtx` → user non-ACTIVE →
     delete all user sessions + clear `ctx.context.session` so the endpoint
     resolves null/401 naturally (F4).
   - `emailAndPassword.onPasswordReset`: delete every remaining `verification`
     row with `value: user.id` (post-reset cleanup, F6; only reset rows exist).
   - `assertAuthSecretConfigured()` in production when secret missing/<32 (F11),
     called from `instrumentation.ts#register()`; guarded off `next build`.
3. `lib/auth/viewer.ts`: `getViewerFromHeaders` fails closed — session call or
   user lookup throwing/garbage → null (401, never 500) (F11-verify).
4. `lib/auth/password-reset-boundary.ts`: peek hashes `reset-password:<token>`
   (sha256→base64url) to match stored identifier.
5. `lib/workspace/invite-acceptance.ts`: peek binds token's workspaceId (F14).
6. `lib/workspace/roster.ts`: cursor = `createdAt|id` matching orderBy; test.
7. `lib/auth/roles.ts`: drop `member.remove` (+ roles.test.ts + session-route docs).
8. `app/signup/actions.ts`: consume sign-up limiter before signup (F7-sec).
9. `app/login/actions.ts`: 429 → "too many attempts" copy.
10. `instrumentation.ts` (new): boot check.
11. README + `.env.example` + schema comments + copy AUTH-DECISION.md.

## Test surgery

- `git show origin/Vari8-Beta:<file>` restores 28 CAR files + 4 KEEP-ALL files.
- Keep concurrency/rollback/expiry/tenant/date/token/integrity cases; delete
  cases whose only content is the replaced role-matrix grant or dead machinery.
- Rewire fixtures: `sess(userId)` already matches; only imports of deleted
  modules need rewiring (password-reset*, credentials, session, auth.config).
- `tests/integration/stubs/next-headers.ts` unchanged.
- Reconciliation table per audit block → `PR-05-test-reconciliation.md`.

## Gates

typecheck, lint, unit, integration (app_pr05), build, frontend build,
e2e both postures, `scripts/live-proof-pr05.mjs`, new probes for the sec items.
