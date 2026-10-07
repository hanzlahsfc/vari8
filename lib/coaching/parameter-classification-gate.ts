/**
 * P-020A parameter data-classification management surface — dev gate
 * (product-decisions #73/#78).
 *
 * The classification control and server action exist ONLY behind
 * `ENABLE_PARAMETER_CLASSIFICATION=1` (exact match — unset, empty, malformed,
 * or any other value keeps it closed). The gate is checked at the action and
 * boundary layers BEFORE any user-controlled input is bound; it is a
 * development control, never a substitute for the server-side authorization
 * every operation performs.
 *
 * This gate covers only the management surface. The schema column, snapshot
 * field/parser, universal duplicate-publish invariant (#64), and pure
 * eligibility module are live on merge and are NOT flag-gated.
 */
export function isParameterClassificationEnabled(
  env: string | undefined,
): boolean {
  return env === "1";
}
