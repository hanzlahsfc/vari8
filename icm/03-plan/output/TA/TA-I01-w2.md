# TA-I01 worker w2 — integration test audit

Scratch worktree: /home/nexuslink/.hermes/cache/scratch/vari8-ta/TA-I01-w2 at 58eb6ed.
Database: app_ta_i01_w2 on 127.0.0.1:5433.

Summary: 4 files, 2804 lines total. KEEP 4, MERGE 0, CUT 0. All 4 KEEP
verdicts are backed by a failing bite check (file fails when the code under
test is broken one line).

Baseline runs (all against app_ta_i01_w2, one file at a time):
s1-f2c 32/32 passed, s1-f2d 18/18, phase-3-1 6/6, phase-3-2 6/6, exit 0 each.

| file | lines | under test | asserts | verdict | rule | bite check (command, result) |
|------|-------|------------|---------|---------|------|------------------------------|
| tests/integration/s1-f2c-invitations.test.ts | 1462 | lib/workspace/invitations.ts, lib/auth/guard.ts, lib/tokens/store.ts + crypto.ts, lib/password.ts | Owner/coach/other-role create rights denied or allowed per RBAC; hash-only token persistence; exact-tuple replace and audit-failure rollback; owner-only paginated listing with minimal fields; idempotent owner-only revoke; new-user accept creates user+member+ClientProfile and binds token; existing-user identity_required/identity_mismatch; password policy rejects leave token claimable; membership state machine INVITED/ACTIVE/SUSPENDED/REMOVED incl. stale-generation invalid_token; concurrent create/accept single winner; no email/token/hash leakage in audit or errors; DB trigger state_version behavior; list index and CHECK constraints live | KEEP | Server-enforced permission matrix, token crypto, atomic replace/rollback, concurrency correctness, causal staleness, and data non-leakage — exactly the trust-boundary behavior a browser check cannot see | Mutated lib/workspace/invitations.ts line 84: swapped clientInvitations/membersInvitations mapping. `INTEGRATION_DATABASE_URL=... npx vitest run --config vitest.integration.config.ts tests/integration/s1-f2c-invitations.test.ts` → FAILED (exit 1, 3 failed / 29 passed). Restored. |
| tests/integration/s1-f2d-password-reset.test.ts | 682 | lib/auth/password-reset.ts, auth.ts (real Auth.js), lib/credentials.ts, lib/password.ts, lib/tokens/crypto.ts + store.ts | Request outcome distinguishes only existence; malformed input rejected; INVITED/DEACTIVATED get outcome but no token/audit/delivery; sibling revocation on re-request; concurrency leaves exactly one active token (3/8-way bursts); deactivation mid-request fails closed; audit failure rolls back revocation; consume changes password, bumps sessionVersion exactly once, consumes token, writes audit; every invalid token shape maps to invalid_token with zero mutation; policy failure never consumes; single winner on concurrent consumes; canary non-leakage; real Auth.js session dies on consume and new password signs in via real pipeline; exposure assertion fails closed | KEEP | Non-enumerating boundary, token lifecycle, sessionVersion invalidation proven through the real Auth.js jwt/session pipeline, serialization-conflict handling — server behavior invisible to a browser | Mutated lib/auth/password-reset.ts line 374: sessionVersion increment 1 → 0. `INTEGRATION_DATABASE_URL=... npx vitest run --config vitest.integration.config.ts tests/integration/s1-f2d-password-reset.test.ts` → FAILED (exit 1, 4 failed / 14 passed, incl. the stale-cookie-must-die test). Restored. |
| tests/integration/phase-3-1-invite-acceptance.test.ts | 328 | lib/workspace/invite-acceptance.ts, lib/workspace/invitations.ts, lib/tokens/store.ts, lib/password.ts | getInviteLinkState is non-consuming and purpose-scoped (invite token ready; consumed/revoked/expired/wrong-purpose/malformed all invalid); acceptInvitationFromLink maps service codes to one safe message per class; policy failures leave no partial state and token claimable; anonymous existing-account accept asks for sign-in; wrong session gets different-account copy; FormData null name/password normalized to undefined on the existing-user path | KEEP | Public boundary contract: non-consuming peek, uniform non-oracle invalid state, safe copy mapping, null normalization — behavior s1-f2c does not cover (it asserts thrown codes, this asserts the user-facing surface) | Mutated lib/workspace/invite-acceptance.ts line 52: purpose check WORKSPACE_INVITE → PASSWORD_RESET. `INTEGRATION_DATABASE_URL=... npx vitest run --config vitest.integration.config.ts tests/integration/phase-3-1-invite-acceptance.test.ts` → FAILED (exit 1, 3 failed / 6 passed). Restored. |
| tests/integration/phase-3-2-password-reset.test.ts | 332 | lib/auth/password-reset-boundary.ts, lib/auth/password-reset.ts, lib/tokens/crypto.ts + store.ts, lib/password.ts | requestPasswordResetFromForm returns byte-identical result for existing vs missing accounts (non-enumerating); INVITED/DEACTIVATED issue nothing but answer identically; getResetLinkState non-consuming and purpose-scoped; completePasswordReset is atomic (password changed, token consumed, sessionVersion +1, REQUESTED+COMPLETED audit); policy failures return mapped copy without consuming; reused/revoked/expired/malformed/wrong-purpose tokens share one safe message and mutate nothing | KEEP | Non-enumeration at the public surface, purpose-scoped non-consuming peek, atomic claim + session invalidation, uniform safe failure copy — boundary behavior s1-f2d does not cover (it asserts structural outcomes and codes, this asserts the route-facing contract) | Mutated lib/auth/password-reset-boundary.ts line 58: purpose check PASSWORD_RESET → WORKSPACE_INVITE. `INTEGRATION_DATABASE_URL=... npx vitest run --config vitest.integration.config.ts tests/integration/phase-3-2-password-reset.test.ts` → FAILED (exit 1, 1 failed / 6 passed). Restored. |

## Could not check

Nothing. All 4 files ran green at baseline and all 4 bite checks produced
failing runs.

## Notes

- The s1-f2* files (service layer, structural error codes) and phase-3-* files
  (route boundary, safe copy + peek contract) overlap in scenario but assert
  different observable contracts at different trust boundaries, so they are
  not duplicates under the CUT rule.
- phase-3-2's bite check failed only 1 of 6 tests because the mutated line is
  exercised only by getResetLinkState; the failing test is the one asserting
  that contract. The file still fails, which is what the bite check requires.
