/**
 * P-021 — DailyEntry development gate + feature-mode resolver
 * (decision #72, P-021-R2 §14).
 *
 * `ENABLE_DAILY_ENTRY === "1"` enables the persistent client form/history
 * affordances and write actions on the workspace Daily route. The existing
 * read-only DailyTrackerShell is NOT gated — it renders for authorized
 * users regardless. `ENABLE_DAILY_PROTOTYPE` independently controls the
 * legacy `/daily` prototype route.
 *
 * Mode conflict (both enabled): persistence affordances and actions refuse
 * with a non-disclosing unavailable state; neither route is hidden.
 *
 * The gate is checked at the action layer BEFORE session access, FormData
 * binding, or database work; it is a development control, never a
 * substitute for authorization.
 */

export { isDailyPrototypeEnabled } from "../daily-prototype";
import { isDailyPrototypeEnabled } from "../daily-prototype";

export function isDailyEntryEnabled(env: string | undefined): boolean {
  return env === "1";
}

export type DailyEntryMode = "off" | "persistent" | "conflict";

export function resolveDailyEntryMode(
  entryEnv: string | undefined,
  prototypeEnv: string | undefined,
): DailyEntryMode {
  if (!isDailyEntryEnabled(entryEnv)) return "off";
  if (isDailyPrototypeEnabled(prototypeEnv)) return "conflict";
  return "persistent";
}

/** Whether persistence affordances (form/actions) may run. The shell is
 * unaffected by this — it always renders for authorized roles. */
export function isDailyEntryPersistenceUsable(
  entryEnv: string | undefined,
  prototypeEnv: string | undefined,
): boolean {
  return resolveDailyEntryMode(entryEnv, prototypeEnv) === "persistent";
}

export type DailyEntryErrorCode =
  | "invalid_input"
  | "not_available"
  | "stale_form"
  | "consent_missing"
  | "policy_not_configured"
  | "ineligible"
  | "no_active_setup"
  | "serialization_conflict";

export class DailyEntryError extends Error {
  constructor(readonly code: DailyEntryErrorCode) {
    super(code);
    this.name = "DailyEntryError";
  }
}
