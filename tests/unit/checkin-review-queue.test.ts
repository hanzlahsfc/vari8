import { describe, expect, it } from "vitest";

/**
 * CHECK-IN-OVERVIEW-I1 — bounded staff "awaiting review" overview
 * (approved CHECK-IN-OVERVIEW-P2 contract; bounded W09 subset only).
 * One workspace-level read: submissions that exist with no review,
 * scoped by checkinsCoachReviews/read (owner workspace; coach/assistant
 * assigned). Header-only projection, deterministic submittedAt ASC,id
 * ASC keyset pagination, derived canReview hint. The ?submission=<id>
 * deep link on the per-client page is parsed by a pure bounded helper.
 */

const ISO = "2030-06-01T09:00:00.000Z";

// ── Keyset cursor codec (mirrors the feedback "{iso}|{id}" convention) ──

describe("CHECK-IN-OVERVIEW-I1 — review-queue cursor codec", () => {
  it("round-trips a well-formed submittedAt|id cursor", async () => {
    const { parseCheckInReviewQueueCursor } =
      await import("../../lib/checkin/instances");
    const parsed = parseCheckInReviewQueueCursor(`${ISO}|sub_abc`);
    expect(parsed.submittedAt.toISOString()).toBe(ISO);
    expect(parsed.id).toBe("sub_abc");
  });

  it.each([
    "no-delimiter",
    "|sub_only",
    `${ISO}|`,
    "not-a-date|sub_1",
    "2030-06-01|sub_1",
    `${ISO}|a|b`,
    `${ISO}|${"x".repeat(129)}`,
    "x".repeat(161),
  ])("rejects malformed cursor %j", async (raw) => {
    const { parseCheckInReviewQueueCursor, CheckInInstanceError } =
      await import("../../lib/checkin/instances");
    expect(() => parseCheckInReviewQueueCursor(raw)).toThrowError(
      CheckInInstanceError,
    );
    expect(() => parseCheckInReviewQueueCursor(raw)).toThrowError(
      "invalid_input",
    );
  });
});

// ── Scope → WHERE mapping (pure builder; SQL predicates before LIMIT) ──

describe("CHECK-IN-OVERVIEW-I1 — queue WHERE builder", () => {
  it("workspace scope = workspaceId + awaiting-review anti-join only", async () => {
    const { buildCheckInReviewQueueWhere } =
      await import("../../lib/checkin/instances");
    const where = buildCheckInReviewQueueWhere(
      "workspace",
      { workspaceId: "ws1", workspaceMemberId: "m1" },
      undefined,
    );
    expect(where).toEqual({
      workspaceId: "ws1",
      reviews: { none: {} },
    });
  });

  it("assigned scope adds the ACTIVE assignment semi-join", async () => {
    const { buildCheckInReviewQueueWhere } =
      await import("../../lib/checkin/instances");
    const where = buildCheckInReviewQueueWhere(
      "assigned",
      { workspaceId: "ws1", workspaceMemberId: "m_coach" },
      undefined,
    );
    expect(where).toEqual({
      workspaceId: "ws1",
      reviews: { none: {} },
      clientProfile: {
        assignments: {
          some: {
            workspaceId: "ws1",
            coachMemberId: "m_coach",
            status: "ACTIVE",
          },
        },
      },
    });
  });

  it("cursor adds the keyset OR branch without dropping predicates", async () => {
    const { buildCheckInReviewQueueWhere } =
      await import("../../lib/checkin/instances");
    const submittedAt = new Date(ISO);
    const where = buildCheckInReviewQueueWhere(
      "assigned",
      { workspaceId: "ws1", workspaceMemberId: "m1" },
      { submittedAt, id: "sub_9" },
    );
    expect(where.workspaceId).toBe("ws1");
    expect(where.reviews).toEqual({ none: {} });
    expect(where.clientProfile).toBeDefined();
    expect(where.OR).toEqual([
      { submittedAt: { gt: submittedAt } },
      { submittedAt, id: { gt: "sub_9" } },
    ]);
  });
});

// ── Derived canReview hint (never role-alone) ──────────────────────────

// ── ?submission= deep-link param parser (bounded single value) ─────────

describe("CHECK-IN-OVERVIEW-I1 — deep-link param parser", () => {
  it("missing param → none (normal page)", async () => {
    const { parseCheckInSubmissionParam } =
      await import("../../lib/checkin/instances");
    expect(parseCheckInSubmissionParam(undefined)).toEqual({
      status: "none",
    });
  });

  it("repeated param → invalid (no dispatch)", async () => {
    const { parseCheckInSubmissionParam } =
      await import("../../lib/checkin/instances");
    expect(parseCheckInSubmissionParam(["a", "b"])).toEqual({
      status: "invalid",
    });
    expect(parseCheckInSubmissionParam([])).toEqual({ status: "invalid" });
  });

  it.each(["", "x".repeat(129), "\uD800"])(
    "malformed param %j → invalid (no dispatch)",
    async (raw) => {
      const { parseCheckInSubmissionParam } =
        await import("../../lib/checkin/instances");
      expect(parseCheckInSubmissionParam(raw)).toEqual({
        status: "invalid",
      });
    },
  );

  it("well-formed single value → ok with the opaque id", async () => {
    const { parseCheckInSubmissionParam } =
      await import("../../lib/checkin/instances");
    expect(parseCheckInSubmissionParam("sub_xyz123")).toEqual({
      status: "ok",
      submissionId: "sub_xyz123",
    });
  });
});

// ── Service + boundary surface ─────────────────────────────────────────

describe("CHECK-IN-OVERVIEW-I1 — exports", () => {
  it("exposes the queue service + page size + item type contract", async () => {
    const m = await import("../../lib/checkin/instances");
    expect(typeof m.listCheckInReviewQueue).toBe("function");
    expect(typeof m.parseCheckInReviewQueueCursor).toBe("function");
    expect(m.CHECKIN_REVIEW_QUEUE_PAGE_SIZE).toBe(50);
  });

  it("exposes the boundary wrapper", async () => {
    const b = await import("../../lib/checkin/instances-boundary");
    expect(typeof b.listStaffCheckInReviewQueue).toBe("function");
  });
});
