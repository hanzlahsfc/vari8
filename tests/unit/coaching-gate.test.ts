import { describe, expect, it } from "vitest";

import { isCoachingTemplatesEnabled } from "../../lib/coaching/gate";

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
