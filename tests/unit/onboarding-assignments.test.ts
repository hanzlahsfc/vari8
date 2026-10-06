import { describe, expect, it } from "vitest";

import {
  ASSIGNMENT_LIMITS,
  isOnboardingAssignmentsEnabled,
  OnboardingAssignmentError,
} from "../../lib/onboarding/assignments-gate";

/**
 * P-013 staff-only onboarding-form assignments — dev gate + contract
 * constants. The feature exists only behind
 * ENABLE_ONBOARDING_ASSIGNMENTS=1; every other value (unset, empty,
 * malformed, "true", "01", whitespace) keeps it closed.
 */
describe("P-013 assignments dev gate", () => {
  it("is enabled only by the exact value '1'", () => {
    expect(isOnboardingAssignmentsEnabled("1")).toBe(true);
  });

  it.each([undefined, "", "0", "true", "TRUE", "01", " 1", "1 ", "2", "yes"])(
    "is disabled for %j",
    (value) => {
      expect(isOnboardingAssignmentsEnabled(value)).toBe(false);
    },
  );
});

describe("P-013 assignments contract constants", () => {
  it("exposes bounded limits", () => {
    expect(ASSIGNMENT_LIMITS.idMax).toBe(128);
    expect(ASSIGNMENT_LIMITS.listMaxLimit).toBe(100);
    expect(ASSIGNMENT_LIMITS.listDefaultLimit).toBe(25);
  });

  it("error codes stay structural — never carry content", () => {
    const err = new OnboardingAssignmentError("assignment_conflict");
    expect(err.code).toBe("assignment_conflict");
    expect(err.message).toBe("assignment_conflict");
    expect(err.name).toBe("OnboardingAssignmentError");
  });
});
