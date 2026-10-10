import { describe, expect, it } from "vitest";

/**
 * P-025-C — staff Check-In detail review + terminal acknowledgement
 * (decisions #86–#91 carried by #96): staff header lists, explicit
 * answer-detail read with one structural READ audit, exactly one
 * workspace-terminal `CheckInReview` per submission (immutable
 * provenance only — who and when; no notes, no downstream gate).
 */

// ── Derived lifecycle: REVIEWED insertion point (§10) ────────────────────

describe("P-025-C — REVIEWED in the derived projector", () => {
  it("derives CANCELLED > REVIEWED > SUBMITTED > SCHEDULED", async () => {
    const { projectCheckInInstanceState } =
      await import("../../lib/checkin/instances");
    const base = {
      cancelledAt: null,
      cancelledByMemberId: null,
      hasSubmission: false,
      hasReview: false,
    };
    expect(projectCheckInInstanceState(base)).toBe("SCHEDULED");
    expect(projectCheckInInstanceState({ ...base, hasSubmission: true })).toBe(
      "SUBMITTED",
    );
    expect(
      projectCheckInInstanceState({
        ...base,
        hasSubmission: true,
        hasReview: true,
      }),
    ).toBe("REVIEWED");
    // Cancellation provenance wins over (impossible-by-locking) children.
    expect(
      projectCheckInInstanceState({
        cancelledAt: new Date(),
        cancelledByMemberId: "m1",
        hasSubmission: true,
        hasReview: true,
      }),
    ).toBe("CANCELLED");
    // A review implies a submission; incoherent hasReview alone still
    // derives REVIEWED — the projection treats the stronger child row.
    expect(projectCheckInInstanceState({ ...base, hasReview: true })).toBe(
      "REVIEWED",
    );
  });

  it("presentation keeps the late marker for a late-reviewed submission", async () => {
    const { projectCheckInInstancePresentation } =
      await import("../../lib/checkin/instances");
    const due = new Date("2026-01-01T00:00:00Z");
    const reviewedLate = projectCheckInInstancePresentation(
      {
        cancelledAt: null,
        cancelledByMemberId: null,
        hasSubmission: true,
        hasReview: true,
        submittedAt: new Date("2026-01-02T12:00:00Z"),
        dueAt: due,
      },
      new Date("2026-01-03T00:00:00Z"),
    );
    expect(reviewedLate.state).toBe("REVIEWED");
    expect(reviewedLate.late).toBe(true);
  });
});

// ── Audit resource union (§14: closed structural vocabulary) ─────────────

describe("P-025-C — audit resource union", () => {
  it("includes checkin_review exactly once after checkin_submission", async () => {
    const { AUDIT_RESOURCE_TYPES } = await import("../../lib/audit");
    const occurrences = AUDIT_RESOURCE_TYPES.filter(
      (r) => r === "checkin_review",
    );
    expect(occurrences).toHaveLength(1);
    const idx = AUDIT_RESOURCE_TYPES.indexOf("checkin_review");
    expect(AUDIT_RESOURCE_TYPES[idx - 1]).toBe("checkin_submission");
  });
});

// ── Service surface (exported contract) ──────────────────────────────────

describe("P-025-C — service exports", () => {
  it("exposes the three review operations", async () => {
    const m = await import("../../lib/checkin/instances");
    expect(typeof m.listCheckInSubmissionsForClient).toBe("function");
    expect(typeof m.readCheckInSubmissionDetail).toBe("function");
    expect(typeof m.markCheckInSubmissionReviewed).toBe("function");
  });
});

// ── Boundary surface (closed non-disclosing vocabulary) ──────────────────

describe("P-025-C — boundary exports", () => {
  it("exposes staff submission list / detail / mark wrappers", async () => {
    const b = await import("../../lib/checkin/instances-boundary");
    expect(typeof b.listStaffCheckInSubmissions).toBe("function");
    expect(typeof b.readStaffCheckInSubmissionDetail).toBe("function");
    expect(typeof b.markCheckInSubmissionReviewedFromAction).toBe("function");
  });
});

// ── RBAC capability split already pinned (no matrix change) ─────────────

describe("P-025-C — checkinsCoachReviews capability split", () => {
  it("staff detail read = ws/assigned; mark = assigned only", async () => {
    const { resolveScope } = await import("../../lib/auth/rbac");
    // Read: owner workspace, coach/assistant assigned.
    expect(
      resolveScope("checkinsCoachReviews", "read", "WORKSPACE_OWNER"),
    ).toBe("workspace");
    expect(resolveScope("checkinsCoachReviews", "read", "COACH")).toBe(
      "assigned",
    );
    expect(
      resolveScope("checkinsCoachReviews", "read", "ASSISTANT_COACH"),
    ).toBe("assigned");
    // Write (mark/submit): owner/assistant denied; only coach assigned +
    // client own (client's own write is the submission path).
    expect(
      resolveScope("checkinsCoachReviews", "write", "WORKSPACE_OWNER"),
    ).toBe("denied");
    expect(
      resolveScope("checkinsCoachReviews", "write", "ASSISTANT_COACH"),
    ).toBe("denied");
    expect(resolveScope("checkinsCoachReviews", "write", "COACH")).toBe(
      "assigned",
    );
  });
});
