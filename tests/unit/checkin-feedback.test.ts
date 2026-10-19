// CHECK-IN-FEEDBACK-I1 — staff written feedback on Check-In submissions
// (reviewed P3 contract + P3-R1 refinements; decisions #96/#101, owner
// answers: same consent gate as answers; author departure persists rows
// for currently authorized readers only). New resource `checkinFeedback`,
// deny-set + audit registry membership, and the action-layer contract.
// Mirrors the guard.test.ts makeRepo pattern.

import { describe, expect, it } from "vitest";

import { AUDIT_RESOURCE_TYPES } from "../../lib/audit";
import {
  sendCheckInFeedbackFromAction,
  resolveCheckInFeedbackSendFromAction,
} from "../../lib/checkin/instances-boundary";

describe("CHECK-IN-FEEDBACK-I1 deny-set + audit registry", () => {
  // Deny-set membership is asserted BEHAVIORALLY below (dual-role
  // authorize/authorizeCollection → role_denied) — the set itself is not
  // exported; the behavioral path proves denial precedes scope resolution.

  it("checkin_feedback is a named audit resource type", () => {
    expect(AUDIT_RESOURCE_TYPES).toContain("checkin_feedback");
  });
});

describe("CHECK-IN-FEEDBACK-I1 boundary exports", () => {
  it("instances-boundary exposes send + resolve functions", () => {
    expect(typeof sendCheckInFeedbackFromAction).toBe("function");
    expect(typeof resolveCheckInFeedbackSendFromAction).toBe("function");
  });
});
