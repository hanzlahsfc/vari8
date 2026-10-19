import { describe, expect, it } from "vitest";

import { isClientSetupEnabled } from "../../lib/coaching/client-setup-gate";

/**
 * P-016 staff-only client setup / template assignments — dev gate + contract
 * constants. The feature exists only behind ENABLE_CLIENT_SETUP=1; every
 * other value (unset, empty, malformed, "true", "01", whitespace) keeps it
 * closed.
 */
describe("P-016 client-setup dev gate", () => {
  it("is enabled only by the exact value '1'", () => {
    expect(isClientSetupEnabled("1")).toBe(true);
  });

  it.each([undefined, "", "0", "true", "TRUE", "01", " 1", "1 ", "2", "yes"])(
    "is disabled for %j",
    (value) => {
      expect(isClientSetupEnabled(value)).toBe(false);
    },
  );
});
