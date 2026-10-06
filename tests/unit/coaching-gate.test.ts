import { describe, expect, it } from "vitest";

import {
  COACHING_LIMITS,
  isCoachingTemplatesEnabled,
} from "../../lib/coaching/gate";

/**
 * P-014 — coaching template/parameter feature gate truth table.
 * Exact `"1"` enablement only; every other value keeps the surface closed.
 */
describe("P-014 coaching feature gate", () => {
  it("enables only on the exact string '1'", () => {
    expect(isCoachingTemplatesEnabled("1")).toBe(true);
  });

  it.each([undefined, "", "0", "true", "yes", " 1 ", "1 ", "01", "on"])(
    "stays closed for %j",
    (value) => {
      expect(isCoachingTemplatesEnabled(value)).toBe(false);
    },
  );
});

describe("P-014 engineering safety limits", () => {
  it("exposes the reviewed conservative bounds", () => {
    expect(COACHING_LIMITS.definitionMaxBytes).toBe(64 * 1024);
    expect(COACHING_LIMITS.maxDepth).toBe(4);
    expect(COACHING_LIMITS.maxSections).toBe(32);
    expect(COACHING_LIMITS.maxItemsPerSection).toBe(64);
    expect(COACHING_LIMITS.maxItemsPerTemplate).toBe(128);
    expect(COACHING_LIMITS.maxOptions).toBe(64);
    expect(COACHING_LIMITS.labelMax).toBe(120);
    expect(COACHING_LIMITS.helpTextMax).toBe(500);
    expect(COACHING_LIMITS.keyMax).toBe(64);
    expect(COACHING_LIMITS.nameMax).toBe(120);
  });
});
