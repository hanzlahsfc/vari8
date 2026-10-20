import { describe, expect, it } from "vitest";

import { computeSelectionFingerprint } from "../../lib/coaching/selection-fingerprint";

/**
 * P-020A — parameter data-classification foundation (decisions #64, #73,
 * #78 + binding correctness constraints). Pure contract coverage only: the
 * shared fingerprint helper. No persistence, no actor state, no runtime
 * context.
 */

describe("computeSelectionFingerprint", () => {
  it("is deterministic over ordered identity lists", () => {
    const a = computeSelectionFingerprint(["p1", "p2"], ["t1"]);
    const b = computeSelectionFingerprint(["p1", "p2"], ["t1"]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when membership or ordering changes", () => {
    const base = computeSelectionFingerprint(["p1", "p2"]);
    expect(computeSelectionFingerprint(["p2", "p1"])).not.toBe(base);
    expect(computeSelectionFingerprint(["p1", "p2", "p3"])).not.toBe(base);
    expect(computeSelectionFingerprint(["p1"])).not.toBe(base);
  });
});
