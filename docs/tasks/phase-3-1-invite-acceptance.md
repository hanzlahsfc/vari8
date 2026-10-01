# Phase 3.1 — Invite acceptance + initial password setup (user-facing)

**Plan only — committed before production code.** Builder: SWE-2 High.
Base: `main` = `9e2bb68a528c097f8b2a2cb06b480deabc1f37fc` (verified
`origin/main`, clean worktree). Branch: `feature/phase-3-1-invite-acceptance`.

## 1. Scope

Expose the **existing, reviewed** `acceptWorkspaceInvitation` service
(`lib/workspace/invitations.ts`, S1-F2C) through a minimal public route so an
invited user can accept a valid invitation and set an initial password.
Invite creation/list/revoke stay internal-only — no UI for them this slice.

Out of scope: invite creation/resend UI, email delivery, password reset,
role-management redesign, rate limiting infra, client shell, tracker/catalog.

## 2. Inspection findings (verified by reading code)

- `acceptWorkspaceInvitation(session, {workspaceId, rawToken, name?, password?})`
  already implements: atomic `claimAccessToken` (one winner; malformed /
  missing / wrong-purpose / wrong-workspace / expired / revoked / consumed /
  lost race → uniform `invalid_token`), issuer re-authorization inside the
  Serializable tx, identity binding (existing user ⇒ session for the exact
  invited email → `identity_required` / `identity_mismatch`; non-ACTIVE →
  `account_ineligible`), membership state machine with
  `targetMemberStateVersion` causal freshness, profile coherence gate,
  token→user binding, coupled audit (`INVITE`, `acceptedAs`), bounded retry on
  real serialization shapes only. Rollback = one transaction.
- `inspectAccessToken(db, rawToken)` (S1-F2A) is a read-only peek returning
  `{valid:false}` or `{valid:true, purpose, expiresAt}` — enough to render a
  safe invalid-link state without consuming anything.
- **Contract constraint:** `tests/unit/invitations.test.ts` scans `app/**` and
  fails if any route file imports `workspace/invitations` or `tokens/store`.
  ⇒ A boundary module is required (`lib/workspace/invite-acceptance.ts`).
- Password policy: `validatePasswordPolicy` = 10–128 code points, NFC, **no
  composition rule**. Confirmed instruction (Aleks, via Hanzlah) for invite
  password **setup** differs: ≥10 chars **and ≥1 number** — additive stricter
  validator `validateInvitePassword` (new structural code
  `password_needs_digit`); `validatePasswordPolicy` and the reset path are
  untouched. Ordinary sign-in performs no policy check at all (hash verify
  only) — unchanged.
- Session: `session.user` carries `id` only (JWT `sub` + `sv`). Sign-in is the
  Auth.js Credentials provider via `signIn("credentials")`. New-user success
  therefore hands off to the **existing** `/login` flow (with a neutral
  `inviteAccepted` status hint); no invented session mechanism. Signed-in
  acceptances redirect to `/` (role-neutral; client shell is deferred).
- `acceptInvitationFromLink` maps structural error codes to generic UI copy:
  `invalid_token` → "link invalid or already used"; `identity_required` →
  "sign in with the invited email first"; `identity_mismatch` → "invitation
  is for a different account"; `account_ineligible`/`membership_conflict`/
  `invalid_input`/`serialization_conflict`/`invitation_failed` → safe generic;
  `password_too_short`/`password_too_long`/`password_needs_digit` → explicit
  accessible policy text. No token, email, hash, or internals echo.

## 3. Route design

`GET /invite?workspace=<id>&token=<raw>` (matches the delivery payload shape:
`workspaceId` + `rawToken`). Server component:

1. Missing/malformed params → safe invalid state (no form).
2. `getInviteLinkState` peeks the token (no consume): `valid +
purpose="WORKSPACE_INVITE"` → form; anything else → invalid state.
3. Session-aware form:
   - anonymous → `Your name` + `Password` fields ("Create account and join") +
     link to `/login` ("Already have an account? Sign in first").
   - signed-in → single "Accept invitation" submit (no password — the service
     ignores/rejects password on the existing-user path).
4. Server action `app/invite/actions.ts` (`useActionState`, same shape as
   `app/login/actions.ts`): `auth()` → boundary → on success redirect
   (`/login?inviteAccepted=1` anonymous-new, `/` signed-in); on failure return
   `{error}` rendered with `role="alert"` + `aria-describedby` policy hint.
5. `app/login/page.tsx` gains an additive `?inviteAccepted=1` status note
   (`role="status"`), no behavior change.

No `workspace`-param trust issue: the atomic claim is workspace-bound; a
mismatched workspace param fails as `invalid_token` on submit.

## 4. Files

- `lib/password-policy.ts` — add `password_needs_digit` to the error-code
  union + `validateInvitePassword` (length via existing validator + `/[0-9]/`
  on the NFC-normalized value).
- `lib/workspace/invitations.ts` — new-user path uses
  `validateInvitePassword` (the only production-code change; the confirmed
  policy is enforced at the service boundary, not just the form).
- `lib/workspace/invite-acceptance.ts` — NEW boundary: `getInviteLinkState`,
  `acceptInvitationFromLink`, safe message map.
- `app/invite/{page,actions,invite-form}.{ts,tsx}` — NEW route.
- `app/login/page.tsx` — additive `inviteAccepted` status note.
- `app/globals.css` — invite-scoped additive styles (`44px` submit target,
  focus-visible, hint text); no existing rule edited.
- Tests: `tests/unit/invite-acceptance.test.ts` (new), extend
  `tests/unit/password-policy.test.ts`, `tests/integration/s1-f2c` fixture
  password gains a digit + digitless-rejection regression, new
  `tests/e2e/invite-acceptance.spec.ts`.
- `docs/product-decisions.md` — dated note under §23 recording the invite-setup
  digit requirement (supersedes "no composition requirement" for this flow).

## 5. Acceptance criteria

- AC1: Valid link → form; missing/malformed/expired/revoked/consumed/
  wrong-purpose token → one safe invalid state, zero mutations.
- AC2: Anonymous accept creates account/member/profile atomically; <10 chars
  → `password_too_short`, ≥10 without digit → `password_needs_digit`, both
  server-side with accessible copy and a still-usable token.
- AC3: Signed-in accept = one click; wrong-account → `identity_mismatch` safe
  message; anonymous existing-account → `identity_required` message.
- AC4: Success exactly once; second submit/revisit → invalid state.
- AC5: Ordinary sign-in and password-reset policy behavior byte-identical.
- AC6: Boundary enforced — no `app/**` import of the service/store (existing
  test stays green).
- AC7: 1440/834/390 usable: labelled inputs, `role="alert"` errors, focus
  visible, ≥44px submit, zero horizontal overflow, keyboard submit.
- AC8: Audit/session semantics preserved (INVITE audit, `sessionVersion`
  untouched by acceptance; sign-in via existing provider).

## 6. Gates

diff-check · format:check · typecheck · lint · unit · integration on
disposable `invite_p31_int` · build · e2e — real exit codes recorded in §7.

## 7. Implementation + verification record

_(filled in during implementation)_
