import { describe, expect, it } from "vitest";

/**
 * P-025-C — staff Check-In detail review + terminal acknowledgement
 * (decisions #86–#91 carried by #96): staff header lists, explicit
 * answer-detail read with one structural READ audit, exactly one
 * workspace-terminal `CheckInReview` per submission (immutable
 * provenance only — who and when; no notes, no downstream gate).
 */

// ── Derived lifecycle: REVIEWED insertion point (§10) ────────────────────

// ── Audit resource union (§14: closed structural vocabulary) ─────────────

// ── Service surface (exported contract) ──────────────────────────────────

// ── Boundary surface (closed non-disclosing vocabulary) ──────────────────

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
    // Write (mark/submit): assistant denied; coach assigned; client own
    // (client's own write is the submission path). SOLO-COACH-I1
    // (decision 111, amends #95): owner write is `assigned` — requires an
    // ACTIVE assignment, enforced again inside the write transaction.
    expect(
      resolveScope("checkinsCoachReviews", "write", "WORKSPACE_OWNER"),
    ).toBe("assigned");
    expect(
      resolveScope("checkinsCoachReviews", "write", "ASSISTANT_COACH"),
    ).toBe("denied");
    expect(resolveScope("checkinsCoachReviews", "write", "COACH")).toBe(
      "assigned",
    );
  });
});
