# Phase 3.2 — Password-reset request + set-password flow

Slice: expose the reviewed S1-F2D `lib/auth/password-reset.ts` orchestration
through public routes `/reset-request` (request) and `/reset?token=<raw>`
(consume), keeping the `app/**` → service import ban via a boundary module.

## 1. Scope

- In: request page (generic non-enumerating response), token landing +
  new-password page, boundary module, delivery seam (documented no-op),
  confirmed policy (≥10 code points + ≥1 ASCII digit) on reset completion,
  route-scoped `Referrer-Policy: no-referrer` + `Cache-Control: no-store` on
  `/reset`, login-page "forgot password" link + `?reset=1` status note.
- Out: account recovery beyond password reset, MFA, rate-limiting redesign,
  email-provider integration, invite UI changes, role-management redesign,
  client shell, tracker/catalog changes. No tokens/credentials in Git.

## 2. Inspection findings (verified)

- `requestPasswordReset` (S1-F2D): mandatory injected `deliver` sink (runs
  exactly once, post-commit, outside tx/retry loop); returns existence-only
  `ACCOUNT_EXISTS`/`ACCOUNT_NOT_FOUND` (service-level accepted enumeration
  per product-decisions §24 — the UI will NOT propagate it; public response
  is generic per the Phase 3.2 instruction). Serializable tx: users-row lock
  → ACTIVE re-check → sibling revoke → issue → `REQUESTED` audit.
- `resetPasswordWithToken`: structural token validation first; password
  policy + scrypt hash BEFORE the tx (a policy failure never claims the
  token); Serializable tx: bound-user resolve → users lock → ACTIVE check →
  conditional atomic claim → sibling revoke → `passwordHash` +
  `sessionVersion++` (invalidates every existing JWT session via `sv`
  mismatch) → `COMPLETED` audit. All-or-nothing.
- `assertPasswordResetOrchestrationExternallyExposable` still throws —
  provider/sender/base-URL and rate limiting remain undecided (kept).
- `lib/tokens/store.ts`: `issuePasswordResetToken`, `claimAccessToken`,
  `inspectAccessToken` (non-consuming `{valid, purpose, expiresAt}`).
- Import ban (`tests/unit/invitations.test.ts`) forbids `app/**` from
  importing `workspace/invitations` + `tokens/store`; service doc adds
  `auth/password-reset` to that convention → extend the ban test.
- F2D `NEW_PASSWORD` fixture is digitless — needs a digit once consume uses
  the stricter rule.
- The confirmed rule already exists as `validateInvitePassword`; it is not
  invite-specific → rename to `validatePasswordSetup` (single source, both
  flows; `invitations.ts` call site + test imports updated — behavior
  unchanged).

## 3. Design

- `lib/auth/password-reset-delivery.ts` — `deliverPasswordResetToken` seam:
  deliberate documented no-op (no provider/sender/base URL; MUST NOT throw —
  a throw surfaces `reset_failed` only for existing accounts and would leak
  existence). Raw token discarded server-side; never logged/returned.
- `lib/auth/password-reset-boundary.ts`:
  - `getResetLinkState(rawToken)` — `inspectAccessToken` peek + `purpose ===
"PASSWORD_RESET"`; everything else → `invalid`. Display-only; claim stays
    atomic at submit.
  - `requestPasswordResetFromForm(email)` — service call with the seam;
    `invalid_input` → "Enter a valid email address."; both existence outcomes
    → identical generic "If an account exists…" message; unexpected → generic
    failure (never distinguishable).
  - `completePasswordReset({rawToken, password})` — service call; structural
    error → safe copy map (shared helper, echo-free).
- `app/reset-request/{page,reset-request-form,actions}` — label + email +
  submit; success note `role="status"`; error `role="alert"`.
- `app/reset/{page,reset-form,actions}` — missing/invalid link → same safe
  state + "request a new link"; valid → password field + digit hint
  (`aria-describedby`); success → `redirect("/login?reset=1")`.
- `app/login/page.tsx` — additive `?reset=1` `role="status"` note + "Forgot
  your password?" link to `/reset-request`; sign-in untouched.
- `next.config.ts` — second scoped headers entry: `source: "/reset"` →
  `Referrer-Policy: no-referrer` AND `Cache-Control: no-store`.
- `app/globals.css` — extend the invite-form selector list with `reset-form`
  (44px submit, focus-visible) — additive.
- `lib/auth/password-reset.ts` — consume path swaps `validatePasswordPolicy`
  → `validatePasswordSetup` (single reviewed edit).
- `lib/password-policy.ts` — `validateInvitePassword` renamed
  `validatePasswordSetup`; `lib/workspace/invitations.ts` call site updated.

## 4. Errors (structural → copy)

`invalid_token`/`account_ineligible` → "This password reset link is invalid
or has expired. Request a new link." · `password_too_short` → "Password must
be at least 10 characters." · `password_needs_digit` → "Password must include
at least one digit (0–9)." · `password_too_long` → "…at most 128 characters."
· `invalid_input`/`serialization_conflict`/`reset_failed`/
`resets_not_exposable`/unknown → generic failure copy.

## 5. Tests first

- `tests/unit/password-reset-boundary.test.ts` — peek collapse/purpose check
  (no DB read on malformed), generic request outcome, message-map totality +
  non-echo; plus `app/**` import ban extended to `auth/password-reset`.
- `tests/unit/password-policy.test.ts` — updated to `validatePasswordSetup`.
- `tests/integration/phase-3-2-password-reset.test.ts` — boundary request
  (existing vs missing account → identical message; token issued + REQUESTED
  audit; hash-only row), boundary consume (new hash verifies, token consumed,
  `sessionVersion++`, COMPLETED audit), digitless/short rejection without
  consuming, reused/expired/revoked/malformed/wrong-purpose → invalid, no
  mutation.
- `tests/integration/s1-f2d-password-reset.test.ts` — NEW_PASSWORD gains a
  digit; add a digitless-rejection regression if not already covered.
- `tests/e2e/password-reset.spec.ts` — request generic response (existing +
  missing + malformed email), valid-token form → short/digitless errors →
  compliant password → `/login?reset=1` → sign-in with new password works /
  old fails; consumed/revoked/expired/malformed → same safe state; header
  assertions (`referrer-policy`, `cache-control`) on `/reset`; 1440/834/390,
  keyboard, overflow, a11y.

## 6. Gates

`git diff --check` · `format:check` · `typecheck` · `lint` · `test` ·
`test:integration` (disposable `reset_p32_int`) · `build` (`/reset`,
`/reset-request` emitted) · `test:e2e` · production `curl -I` header probe.
Mutations: digit-rule removal, purpose-check removal.

## 7. Record

Implemented on `feature/phase-3-2-password-reset`.

- TDD: unit RED (missing boundary + `validatePasswordSetup`) → GREEN (40/40
  in the touched files). Integration file added (+6) and F2D fixture gained
  a digit + a digitless-regression assertion.
- Boundary: `lib/auth/password-reset-boundary.ts` — peek collapse,
  non-enumerating request (unit-proven identical messages), structural
  error→copy map. Delivery seam `lib/auth/password-reset-delivery.ts` —
  documented no-op (must never throw: a thrown sink error surfaces only for
  existing accounts and would reintroduce enumeration).
- Service edit: `lib/auth/password-reset.ts` consume now calls
  `validatePasswordSetup` (the only reviewed-code change; the ordering —
  policy before tx, claim inside — is untouched).
- Rename: `validateInvitePassword` → `validatePasswordSetup` in
  `password-policy.ts`; `invitations.ts` call site + unit imports updated;
  behavior unchanged (same codes, same bounds).
- Headers: `/reset` gets `Referrer-Policy: no-referrer` +
  `Cache-Control: no-store` (route-scoped; prod-probe verified).
- Login: `?reset=1` status note + "Forgot your password?" link.
- Gates (real exit codes): `git diff --check` 0 · `format:check` 0 ·
  `typecheck` 0 · `lint` 0 · `test` 0 (44/456) · `test:integration` 0
  (21/226, disposable `reset_p32_int`) · `build` 0 (`ƒ /reset`,
  `ƒ /reset-request`) · `test:e2e` 0 (81/81, +12).
- Mutations caught + restored byte-exact (sha256): digit-check removal
  (unit FAIL), purpose-check removal (unit FAIL).
- E2E bugs found/fixed during the run: none in production code — two test
  defects (a `getByRole("alert")` strict-mode collision scoped to
  `.auth-error`; a self-defeating "exist" string assertion) — fixed.
- Independent review (fresh-context read-only; **same model — SWE-2 High,
  diversity NOT achieved** — a different-model review is still required
  before merge): **PASS**, no P0/P1. P1-adjacent note reaffirmed: the public
  routes need rate limiting before production exposure — already deferred
  and recorded. P2s: timing oracle on the request path (bounded when rate
  limiting lands), failure-path existence signal (backend-faults only),
  peek doesn't pre-check user status (submit fails closed), `token as
string` narrowing (REPAIRED — typeof guard), double property read of
  `input.rawToken` (service-internal, not exploitable via the route),
  a11y `aria-invalid`/`aria-errormessage` polish, DB-error → 500 on the
  page (REPAIRED — peek now fails closed to the invalid state).
  Reviewer ran static analysis only (read-only profile, no shell); gate
  exit codes above are builder-run on the exact tree.
- Repairs: `6d30f5c` — token narrowing + fail-closed peek.

## 8. Deferred

Email provider + sender + canonical reset URL (delivery seam is a documented
no-op until then — request flow issues/audits tokens that are discarded
server-side; reported as an operational limitation). Rate limiting on both
public routes. Token→cookie exchange hardening (same as §3.1).
