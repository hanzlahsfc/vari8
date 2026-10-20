import { isClientSetupEnabled } from "./client-setup-gate";

/**
 * P-020B C2 template-version transitions — layered dev gate + shared
 * contract (product-decisions #58–#62 + P-020-R3).
 *
 * The transition surface exists ONLY behind
 * `ENABLE_CLIENT_SETUP_TRANSITIONS === "1"` (exact match — unset, empty,
 * malformed, or any other value keeps it closed) AND the existing parent
 * capability `ENABLE_CLIENT_SETUP === "1"`. The gate is checked at the
 * action and boundary layers BEFORE session access, FormData/input binding,
 * provider execution, or database access; it is a development control,
 * never a substitute for the server-side `clientSetups` write authorization
 * every operation performs.
 *
 * Error codes are structural vocabulary only — they never carry client
 * data, template content, provider output, or internals.
 */
import { devFlagEnabled, type RuntimeEnv } from "../runtime";

export function isClientSetupTransitionsEnabled(
  transitionsEnv: string | undefined,
  clientSetupEnv: string | undefined,
  env: RuntimeEnv = process.env,
): boolean {
  return (
    devFlagEnabled(transitionsEnv, env) &&
    isClientSetupEnabled(clientSetupEnv, env)
  );
}

export type ClientSetupTransitionErrorCode =
  | "invalid_input"
  | "assignment_not_accessible"
  | "assignment_not_active"
  | "transition_not_available"
  | "no_upgrade_available"
  | "incoherent_definition"
  | "transition_blocked"
  | "provider_configuration"
  | "stale_selection"
  | "serialization_conflict";

export class ClientSetupTransitionError extends Error {
  constructor(readonly code: ClientSetupTransitionErrorCode) {
    super(code);
    this.name = "ClientSetupTransitionError";
  }
}
