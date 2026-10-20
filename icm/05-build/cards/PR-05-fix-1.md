# PR-05 fix pass 1 (PR #69, issue #58)

The independent functional verifier (Haiku, neji gear) returned FIX. Read its report first: `icm/05-build/reports/PR-05-verify.md`, findings F1 to F11.

Function, gates and the role matrix pass. The test surgery broke the audit's rules, and one security invariant regressed. A separate Opus security review is still running; its findings come as a second card. Do not wait for it.

Work in `/home/nexuslink/vari8-worktrees/pr-05-auth-api` on branch `beta/pr-05-auth-api`.

## Hard rules

- Never write `docs/STATUS.md`.
- Never touch `frontend/`.
- Commit with explicit pathspecs.
- Use your own DB `app_pr05` at 127.0.0.1:5433.
- Do not merge.

## Fix

1. **Reset tokens stored raw (F3, F4).**
   - Today the `verifications.identifier` row holds the plain token from the mailed link.
   - Store only a digest. Use the Better Auth option for hashed verification identifiers (`verification.storeIdentifier`, or whatever the current Better Auth version calls it; read its docs in `node_modules`). If none exists, hash in a hook.
   - Restore a digest-only test: the stored row must not contain the mailed token, and the mailed token must still work once.
   - Apply the same to invite tokens if they go through the same table.
2. **Test surgery must follow `icm/03-plan/output/TEST-AUDIT.md`.** The relevant rules are at lines 11 and 323: CUT-AT-REPLACE deletes only the role-matrix assertions, and every independent concurrency, rollback, transaction, expiry, tenant-isolation and date guarantee is extracted first and kept.
   - For the 28 whole-file CUT-AT-REPLACE deletions (462 tests with a pass-2 verdict of KEEP, F1 and F2), rewrite each KEEP block against the new Better Auth fixtures and keep it. Delete only the blocks that assert the old role matrix or old session machinery.
   - Restore the four KEEP-ALL files deleted without a replacement: `phase-3-2`, `credentials`, `password-reset-delivery` and `password-reset-token-failure` (21 tests). Rewire them to the new auth.
   - Restore the mixed-suite guards removed from `password-reset-boundary` (KEEP-ALL), `invitations`, `p013`, `p016`, `p020b`, `p021`, `p022`, `p023` and `p025d2` (F5, F6), and the KEEP blocks in `password-reset.test.ts` and `checkin-review.test.ts` (F8).
   - Write `icm/05-build/reports/PR-05-test-reconciliation.md`. It has one row per audit block touched, giving the audit tag, its pass-2 verdict, what you did (kept, rewritten or deleted) and the new location. Add counts that reconcile with TEST-AUDIT.
3. **Superseded-reset revocation (F7).** Restore the guarantee: a new reset request invalidates earlier unused reset tokens for that user. Add a test.
4. **Fail-closed session lookup (F11).** Add a test: when the session store throws or returns garbage, protected routes return 401 and never 200 or 500.
5. **Roles (F9).**
   - Remove `member.remove` from the matrix. D10 and owner answer Q3 say no capabilities beyond what the canvas shows.
   - Keep the rest.
   - Correct the report wording: the matrix is the source of truth, and today it is enforced on the `/api/v1` routes that exist. List them.
6. **Leftovers (F10).**
   - Update the README auth section and env vars for Better Auth.
   - Copy `icm/05-build/AUTH-DECISION.md` into the branch from `/home/nexuslink/vari8-worktrees/beta/icm/05-build/AUTH-DECISION.md`.
   - Put the PR-R2 removal marker for `users.password_hash` and `session_version` in the schema comment, not only in the migration.

## Then

- Merge the latest `origin/Vari8-Beta` if it has moved.
- Run every gate:
  - typecheck
  - lint
  - unit
  - integration (`app_pr05`)
  - build
  - frontend build
  - kept e2e in both modes (dev-file and default)
  - `node scripts/live-proof-pr05.mjs`
- Add a "Fix pass 1" section to `icm/05-build/reports/PR-05.md`, with each item, its commit, the new test counts and the exit codes.
- Commit the verifier report unchanged.
- Push, and comment on PR #69.

## Security lane findings (Opus, `icm/05-build/reports/PR-05-secverify.md`, also FIX)

Read that report in full and fix these in the same pass. Each fix needs a live probe or a test that fails on `e68a2ef` and passes on your head; record which in the reconciliation file.

7. **F1 + F7 (P0): the form paths bypass the limiter.** `app/login/actions.ts:17` and `app/signup/actions.ts:28` call `auth.api.*` directly, so Better Auth's HTTP rate limit never runs. Put one shared limiter in front of the sign-in and sign-up server actions (reuse the Better Auth limiter storage or the existing `rate_limit` table; no new dependency). Live test: the 11th wrong-password form attempt is refused.
8. **F2 (P0): the limiter trusts client `X-Forwarded-For`.** The orchestrator ruled, because the host is not chosen yet:
   - Add a per-account throttle keyed on the normalized email, independent of IP. This holds on any host.
   - Set `advanced.ipAddress` so no forwarding header is trusted unless the env var `AUTH_TRUSTED_IP_HEADER` names one (for example `x-real-ip` or `cf-connecting-ip`). Document it in the README and `.env.example`.
   - Probes: rotating XFF gives no extra guesses, and one attacker cannot lock out a second user.
9. **F3 (P0): password change only revokes other sessions on request.** Force `revokeOtherSessions = true` in `hooks.before` for `/change-password`. Two-session test.
10. **F4 (P1): a deactivated user's session still works on Better Auth endpoints.** Delete the user's sessions when status leaves ACTIVE, and reject non-ACTIVE users in a `hooks.before` on every session-bearing auth path. Test `get-session`, `list-sessions`, `update-user` and `change-password`.
11. **F5:** same as item 1 (`verification.storeIdentifier: "hashed"`). Also update the `/reset` peek at `lib/auth/password-reset-boundary.ts:55-61`.
12. **F6:** same as item 3. After a successful reset, delete every `reset-password:*` row for that user.
13. **F8:** build reset links from `BETTER_AUTH_URL` only, never from the request.
14. **F9:** refuse `request-password-reset` and `reset-password` when `mailDeliveryConfigured()` is false, before any token is written.
15. **F11:** in production, refuse to boot when the auth secret is missing or shorter than 32 chars.
16. **F14:** bind the workspace in the invite peek (`getInviteLinkState`).
17. **Roster pagination** (`lib/workspace/roster.ts:44,47`): the cursor must match the sort order `(createdAt, id)`. Add a test with equal `createdAt`.

Not in this PR (orchestrator ruling; list each in the report as follow-up):

- F10 timing: the owner's 2026-09-30 ruling allows existence disclosure on reset. Note it only.
- F12: plan writes move to the matrix in the training-plan wiring PR, which replaces `rbac.ts`.
- F13: the leaking page is old root UI that PR-R1 deletes. The orchestrator files an issue.
- `sessions.token` raw at rest: Better Auth default. Note it.

Commit both verifier reports unchanged (`PR-05-verify.md`, `PR-05-secverify.md`).
