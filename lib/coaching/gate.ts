/**
 * P-014 workspace parameter library + coaching template foundation —
 * dev gate + shared contract.
 *
 * The feature exists ONLY behind `ENABLE_COACHING_TEMPLATES=1` (exact match —
 * unset, empty, malformed, or any other value keeps it closed). The gate is
 * checked at the route and action layers BEFORE any user-controlled input is
 * bound; it is a development control, never a substitute for the server-side
 * authorization every operation performs.
 *
 * Limits below are engineering safety bounds (reviewed in
 * docs/tasks/p014-parameter-template-foundation.md) — not product semantics.
 */
export function isCoachingTemplatesEnabled(env: string | undefined): boolean {
  return env === "1";
}

export const COACHING_LIMITS = {
  definitionMaxBytes: 64 * 1024,
  maxDepth: 4,
  maxSections: 32,
  maxItemsPerSection: 64,
  maxItemsPerTemplate: 128,
  maxOptions: 64,
  labelMax: 120,
  helpTextMax: 500,
  keyMax: 64,
  nameMax: 120,
  listDefaultLimit: 25,
  listMaxLimit: 100,
  /** Hard ceiling on positional list indices submitted by the browser. */
  indexMax: 100_000,
} as const;
