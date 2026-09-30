/**
 * S1-F1 token-flow boundary.
 *
 * The `access_token` table and `users.session_version` column exist (migration
 * `20260930150000_stage1_access_tokens`), and the independently reviewed S1-F0
 * primitives live in `lib/tokens/crypto.ts`. **No token lifecycle service exists
 * yet** — nothing here issues, lists, revokes, inspects, or consumes tokens.
 *
 * External token flows (invite creation/acceptance, password-reset
 * request/consume) must stay unreachable until every one of these is complete:
 *
 * - issuance and consumption services with atomic consume + replacement
 *   revocation semantics;
 * - the approved password policy (still `TODO(human)`);
 * - email provider, sender identity, and application base URL (undecided);
 * - session-version embed/compare inside JWT validation (logout-on-reset);
 * - the user-scoped audit-ownership decision (plan §4.2) and audit writes;
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
