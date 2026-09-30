/**
 * S1-F1 token-flow boundary.
 *
 * The `access_token` table and `users.session_version` column exist (migration
 * `20260930150000_stage1_access_tokens`), and the independently reviewed S1-F0
 * primitives live in `lib/tokens/crypto.ts`. **No token lifecycle service exists
 * yet** — nothing here issues, lists, revokes, inspects, or consumes tokens.
 *
 * External token flows (invite creation/acceptance, password-reset
 * request/consume) must stay unreachable until every one of these is complete.
 * S1-F2B landed the password policy, account-scoped audit storage, session-
 * version JWT enforcement, and bounded cleanup — still missing:
 *
 * - invitation orchestration and reset orchestration (services, acceptance,
 *   atomic consume + replacement revocation);
 * - email provider, sender identity, and application base URL (undecided);
 * - rate limiting / abuse protection;
 * - route/action security review (S1-H) plus independent review of the flows.
 *
 * This assertion fails closed; it is not a no-op placeholder.
 */

export class TokenFlowNotExposableError extends Error {
  constructor(readonly code: "token_flows_not_exposable") {
    super(code);
    this.name = "TokenFlowNotExposableError";
  }
}

export function assertTokenFlowsExternallyExposable(): never {
  throw new TokenFlowNotExposableError("token_flows_not_exposable");
}

export class TokenPrimitivesNotExposableError extends Error {
  constructor(readonly code: "token_primitives_not_exposable") {
    super(code);
    this.name = "TokenPrimitivesNotExposableError";
  }
}

/**
 * S1-F2A: `lib/tokens/store.ts` adds transaction-bound internal primitives, but
 * primitives alone are not a product surface — all of the following are still
 * absent: authorization orchestration, invite acceptance, password policy,
 * password reset, session invalidation, audit coupling, email delivery, abuse
 * controls, and reviewed routes. No app or route file may import the store.
 */
export function assertTokenPrimitivesExternallyExposable(): never {
  throw new TokenPrimitivesNotExposableError("token_primitives_not_exposable");
}

export class AccountSecurityNotExposableError extends Error {
  constructor(readonly code: "account_security_not_exposable") {
    super(code);
    this.name = "AccountSecurityNotExposableError";
  }
}

/**
 * S1-F2B: the account-security surface (account-audit reader/writer, password
 * policy, session-version internals, token cleanup) is internal primitives
 * only — the following remain absent: invitation orchestration, reset
 * orchestration, provider configuration, rate limiting, reviewed routes/
 * actions, and UI/E2E exposure review. No app or route file may import this
 * surface.
 */
export function assertAccountSecurityExternallyExposable(): never {
  throw new AccountSecurityNotExposableError("account_security_not_exposable");
}
