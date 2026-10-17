// P-025-B — Check-In instances + client submissions unit suite.
// RED-first contract: RBAC cells, dual-role deny-set, derived-state
// projector, dueAt/answer parsers, typed validation, consent resolver,
// closed error vocabulary — all against the real production modules.

import { describe, expect, it } from "vitest";

import {
  AccessDeniedError,
  authorize,
  type AuthorizationRepo,
} from "../../lib/auth/guard";
import {
  type Action,
  type PrincipalRole,
  RESOURCES,
  resolveScope,
} from "../../lib/auth/rbac";

// ── RBAC cells (decision #95 + §7 matrix) ────────────────────────────────

describe("P-025-B — checkinInstances RBAC matrix", () => {
  const cell = (role: PrincipalRole, action: Action) =>
    resolveScope("checkinInstances", action, role);

  it("owner workspace R/W; coach assigned R/W; assistant assigned read only", () => {
    expect(cell("WORKSPACE_OWNER", "read")).toBe("workspace");
    expect(cell("WORKSPACE_OWNER", "write")).toBe("workspace");
    expect(cell("COACH", "read")).toBe("assigned");
    expect(cell("COACH", "write")).toBe("assigned");
    expect(cell("ASSISTANT_COACH", "read")).toBe("assigned");
    expect(cell("ASSISTANT_COACH", "write")).toBe("denied");
  });

  it("client own read only; SUPPORT and PLATFORM_ADMIN denied outright", () => {
    expect(cell("CLIENT", "read")).toBe("own");
    expect(cell("CLIENT", "write")).toBe("denied");
    expect(cell("SUPPORT", "read")).toBe("denied");
    expect(cell("SUPPORT", "write")).toBe("denied");
    expect(cell("PLATFORM_ADMIN", "read")).toBe("denied");
    expect(cell("PLATFORM_ADMIN", "write")).toBe("denied");
    expect(RESOURCES).toContain("checkinInstances");
  });
});

describe("P-025-B — platform-admin deny-set completeness", () => {
  // Behavioral proof through authorize() with a fake repo — the dual-role
  // deny is enforced by PLATFORM_ADMIN_DENIED_RESOURCES inside guard.ts;
  // asserting through the real authorize path proves the set membership.
  const makeRepo = (): AuthorizationRepo => ({
    getUser: async () => ({
      id: "u1",
      platformRole: "PLATFORM_ADMIN",
      status: "ACTIVE",
    }),
    getWorkspace: async () => ({ id: "w1", status: "ACTIVE" }),
    getMembership: async () => ({
      id: "m1",
      role: "WORKSPACE_OWNER" as const,
      status: "ACTIVE" as const,
    }),
    getClientProfileInWorkspace: async () => null,
    getActiveAssignment: async () => null,
  });
  const session = () => ({ user: { id: "u1" } }) as never;

  it("all three Check-In resources deny a dual-role platform admin", async () => {
    for (const resource of [
      "checkinFormDefinitions",
      "checkinInstances",
      "checkinsCoachReviews",
    ] as const) {
      for (const action of ["read", "write"] as const) {
        let reason: string | undefined;
        try {
          await authorize(
            session(),
            { resource, action, workspaceId: "w1" },
            makeRepo(),
          );
        } catch (error) {
          reason =
            error instanceof AccessDeniedError
              ? error.reason
              : `other:${error}`;
        }
        expect(reason, `${resource}/${action}`).toBe("role_denied");
      }
    }
  });

  it("client submission uses the checkinsCoachReviews own/own cell; owner write is assigned-scoped (#95 amended by #111)", () => {
    expect(resolveScope("checkinsCoachReviews", "write", "CLIENT")).toBe("own");
    expect(resolveScope("checkinsCoachReviews", "read", "CLIENT")).toBe("own");
    // SOLO-COACH-I1 (decision 111): owner write resolves `assigned` — the
    // owner may mark only where an ACTIVE ClientAssignment exists.
    expect(
      resolveScope("checkinsCoachReviews", "write", "WORKSPACE_OWNER"),
    ).toBe("assigned");
    // Assigned coach may read+write (submit-on-behalf is not granted —
    // write is reserved for the P-025-C review mark cell per the matrix).
    expect(resolveScope("checkinsCoachReviews", "read", "COACH")).toBe(
      "assigned",
    );
    expect(resolveScope("checkinsCoachReviews", "write", "COACH")).toBe(
      "assigned",
    );
    expect(
      resolveScope("checkinsCoachReviews", "write", "ASSISTANT_COACH"),
    ).toBe("denied");
  });
});

// ── Derived lifecycle projector (§10 — no stored status) ────────────────

describe("P-025-B — derived lifecycle projector", () => {
  it("derives CANCELLED > SUBMITTED > SCHEDULED from child rows only", async () => {
    const { projectCheckInInstanceState } =
      await import("../../lib/checkin/instances");
    const base = {
      cancelledAt: null,
      cancelledByMemberId: null,
      hasSubmission: false,
    };
    expect(projectCheckInInstanceState(base)).toBe("SCHEDULED");
    expect(projectCheckInInstanceState({ ...base, hasSubmission: true })).toBe(
      "SUBMITTED",
    );
    expect(
      projectCheckInInstanceState({
        ...base,
        cancelledAt: new Date(),
        cancelledByMemberId: "m1",
      }),
    ).toBe("CANCELLED");
    // Cancellation provenance wins over a (impossible-by-FK) submission.
    expect(
      projectCheckInInstanceState({
        hasSubmission: true,
        cancelledAt: new Date(),
        cancelledByMemberId: "m1",
      }),
    ).toBe("CANCELLED");
    // Partial provenance is invalid — never derives CANCELLED.
    expect(
      projectCheckInInstanceState({
        hasSubmission: false,
        cancelledAt: null,
        cancelledByMemberId: "m1",
      }),
    ).toBe("SCHEDULED");
  });

  it("isLate/overdue derive from dueAt vs submittedAt/now — never a stored flag", async () => {
    const { projectCheckInInstancePresentation } =
      await import("../../lib/checkin/instances");
    const due = new Date("2026-01-01T12:00:00Z");
    // Submitted after due → late marker.
    const late = projectCheckInInstancePresentation(
      {
        cancelledAt: null,
        cancelledByMemberId: null,
        hasSubmission: true,
        submittedAt: new Date("2026-01-02T12:00:00Z"),
        dueAt: due,
      },
      new Date("2026-01-03T00:00:00Z"),
    );
    expect(late.state).toBe("SUBMITTED");
    expect(late.late).toBe(true);
    // Submitted before due → not late.
    const onTime = projectCheckInInstancePresentation(
      {
        cancelledAt: null,
        cancelledByMemberId: null,
        hasSubmission: true,
        submittedAt: new Date("2025-12-31T12:00:00Z"),
        dueAt: due,
      },
      new Date("2025-12-31T13:00:00Z"),
    );
    expect(onTime.late).toBe(false);
    // Scheduled past due → overdue marker, state unchanged.
    const overdue = projectCheckInInstancePresentation(
      {
        cancelledAt: null,
        cancelledByMemberId: null,
        hasSubmission: false,
        submittedAt: null,
        dueAt: due,
      },
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(overdue.state).toBe("SCHEDULED");
    expect(overdue.late).toBe(true);
    // Scheduled before due → not late.
    const pending = projectCheckInInstancePresentation(
      {
        cancelledAt: null,
        cancelledByMemberId: null,
        hasSubmission: false,
        submittedAt: null,
        dueAt: due,
      },
      new Date("2025-12-31T00:00:00Z"),
    );
    expect(pending.late).toBe(false);
    // Cancelled never marks late — terminal, no submission possible.
    const cancelled = projectCheckInInstancePresentation(
      {
        cancelledAt: new Date("2025-12-30T00:00:00Z"),
        cancelledByMemberId: "m1",
        hasSubmission: false,
        submittedAt: null,
        dueAt: due,
      },
      new Date("2026-06-01T00:00:00Z"),
    );
    expect(cancelled.state).toBe("CANCELLED");
    expect(cancelled.late).toBe(false);
  });
});

// ── dueAt / wire parsers ────────────────────────────────────────────────

describe("P-025-B — dueAt and payload bounds", () => {
  it("accepts a sane ISO timestamp; rejects malformed/unbounded", async () => {
    const { parseCheckInDueAt } = await import("../../lib/checkin/instances");
    expect(parseCheckInDueAt("2026-12-01T09:00:00.000Z")).toBeInstanceOf(Date);
    for (const bad of [
      "",
      "not-a-date",
      "2026-13-01T00:00:00Z",
      "1900-01-01T00:00:00Z", // below sane bound
      "2200-01-01T00:00:00Z", // above sane bound
      "2026-01-01", // missing time — ambiguous
    ]) {
      expect(parseCheckInDueAt(bad)).toBeNull();
    }
  });

  it("rejects oversized answer payloads before canonicalization", async () => {
    const { parseCheckInAnswersJson } =
      await import("../../lib/checkin/instances");
    expect(() => parseCheckInAnswersJson("x".repeat(200_000))).toThrow();
    expect(() => parseCheckInAnswersJson("not json")).toThrow();
    expect(() => parseCheckInAnswersJson("{}")).toThrow(); // not an array
  });
});

// ── Answer canonicalization against the pinned definition ───────────────

const DEF: import("../../lib/checkin/forms").CheckInDefinition = {
  title: "Weekly",
  fields: [
    {
      fieldId: "f_short",
      kind: "shortText",
      label: "Name",
      required: true,
      order: 0,
    },
    {
      fieldId: "f_num",
      kind: "number",
      label: "Kg",
      required: false,
      order: 1,
    },
    {
      fieldId: "f_date",
      kind: "date",
      label: "Day",
      required: false,
      order: 2,
    },
    {
      fieldId: "f_single",
      kind: "singleChoice",
      label: "Pick",
      required: true,
      order: 3,
      options: [
        { optionId: "o_a", label: "A" },
        { optionId: "o_b", label: "B" },
      ],
    },
    {
      fieldId: "f_multi",
      kind: "multiChoice",
      label: "Many",
      required: false,
      order: 4,
      options: [
        { optionId: "o_x", label: "X" },
        { optionId: "o_y", label: "Y" },
      ],
    },
    {
      fieldId: "f_long",
      kind: "longText",
      label: "Notes",
      required: false,
      order: 5,
    },
  ],
};

describe("P-025-B — answer canonicalization (typed, definition-bound)", () => {
  const canon = async (raw: unknown) => {
    const { canonicalizeCheckInAnswers } =
      await import("../../lib/checkin/instances");
    return canonicalizeCheckInAnswers(
      DEF,
      raw as import("../../lib/checkin/instances").RawCheckInAnswerEntry[],
    );
  };

  it("valid input produces one typed row per field, definition order", async () => {
    const rows = await canon([
      { fieldId: "f_single", value: "o_b" },
      { fieldId: "f_short", value: "  Jane  " },
      { fieldId: "f_num", value: "72.5" },
      { fieldId: "f_multi", value: ["o_y", "o_x"] },
      { fieldId: "f_date", value: "2026-01-15" },
    ]);
    expect(rows.map((r) => r.fieldId)).toEqual([
      "f_short",
      "f_num",
      "f_date",
      "f_single",
      "f_multi",
      "f_long",
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.fieldId, r]));
    expect(byId.f_short).toMatchObject({
      kind: "SHORT_TEXT",
      valueText: "Jane",
    });
    expect(byId.f_num).toMatchObject({
      kind: "NUMBER",
      valueNumeric: "72.5",
    });
    expect(byId.f_date).toMatchObject({
      kind: "DATE",
      valueDate: "2026-01-15",
    });
    expect(byId.f_single).toMatchObject({
      kind: "SINGLE_CHOICE",
      valueOptionIds: ["o_b"],
    });
    // Multi-choice option IDs are sorted+deduped for stable storage.
    expect(byId.f_multi).toMatchObject({
      kind: "MULTI_CHOICE",
      valueOptionIds: ["o_x", "o_y"],
    });
    // Optional unanswered fields store null placeholders per kind.
    expect(byId.f_long.kind).toBe("LONG_TEXT");
  });

  it.each([
    [
      "duplicate fieldId",
      [
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_short", value: "b" },
      ],
    ],
    [
      "unknown fieldId",
      [
        { fieldId: "f_ghost", value: "x" },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "missing required",
      [
        { fieldId: "f_num", value: "1" },
        { fieldId: "f_short", value: "a" },
      ],
    ],
    [
      "wrong type for number",
      [
        { fieldId: "f_num", value: { n: 1 } },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "invalid option ID",
      [
        { fieldId: "f_single", value: "o_ghost" },
        { fieldId: "f_short", value: "a" },
      ],
    ],
    [
      "multi with non-array",
      [
        { fieldId: "f_multi", value: "o_x" },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "multi with invalid option",
      [
        { fieldId: "f_multi", value: ["o_x", "o_ghost"] },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "bad date grammar",
      [
        { fieldId: "f_date", value: "15/01/2026" },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "oversized text",
      [
        { fieldId: "f_short", value: "x".repeat(5000) },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "non-integer numeric",
      [
        { fieldId: "f_num", value: "1e999" },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "sparse record",
      [{ fieldId: "f_short" }, { fieldId: "f_single", value: "o_a" }],
    ],
    [
      "extra keys",
      [
        { fieldId: "f_short", value: "a", hack: true },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
  ])("rejects %s", async (_label, raw) => {
    await expect(canon(raw)).rejects.toThrow();
  });

  it("required field must have a non-empty answer", async () => {
    await expect(
      canon([
        { fieldId: "f_short", value: "   " },
        { fieldId: "f_single", value: "o_a" },
      ]),
    ).rejects.toThrow();
    await expect(
      canon([{ fieldId: "f_single" }, { fieldId: "f_short", value: "ok" }]),
    ).rejects.toThrow();
  });
});

// ── Consent resolver (synthetic dev/test only) ───────────────────────────

describe("P-025-B — consent policy resolver", () => {
  it("synthetic registry requires flag AND trusted runtime", async () => {
    const { resolveCheckInConsentPolicy } =
      await import("../../lib/checkin/instances-consent");
    // Flag + trusted → synthetic registry.
    const on = resolveCheckInConsentPolicy({
      ENABLE_CHECK_INS: "1",
      APP_ENV: "test",
    });
    expect(on.currentVersion("PRIVACY_NOTICE")).toBe("check-in-dev-privacy-v1");
    expect(on.currentVersion("HEALTH_DATA")).toBe("check-in-dev-health-v1");
    // Flag alone in production classification → unconfigured.
    const prod = resolveCheckInConsentPolicy({
      ENABLE_CHECK_INS: "1",
      APP_ENV: "production",
    });
    expect(prod.currentVersion("PRIVACY_NOTICE")).toBeNull();
    // Flag off in trusted env → unconfigured.
    const off = resolveCheckInConsentPolicy({
      ENABLE_CHECK_INS: "",
      APP_ENV: "test",
    });
    expect(off.currentVersion("PRIVACY_NOTICE")).toBeNull();
    // Missing/unknown env → unconfigured.
    const missing = resolveCheckInConsentPolicy({});
    expect(missing.currentVersion("HEALTH_DATA")).toBeNull();
    // Staging/malformed → unconfigured.
    const staging = resolveCheckInConsentPolicy({
      ENABLE_CHECK_INS: "1",
      APP_ENV: "staging",
    });
    expect(staging.currentVersion("PRIVACY_NOTICE")).toBeNull();
  });
});

// ── Closed error vocabulary ─────────────────────────────────────────────

describe("P-025-B — closed error vocabulary", () => {
  it("CheckInInstanceError carries only structural codes", async () => {
    const { CheckInInstanceError } =
      await import("../../lib/checkin/instances");
    const err = new CheckInInstanceError("not_available");
    expect(err.code).toBe("not_available");
    expect(err.message).toBe("not_available");
    // No internal details carried.
    expect(JSON.stringify(err)).not.toContain("prisma");
  });
});

// ── Boundary seam ───────────────────────────────────────────────────────

describe("P-025-B — boundary seam exists for app-facing calls", () => {
  it("imports without service internals in the signature surface", async () => {
    const boundary = await import("../../lib/checkin/instances-boundary");
    expect(typeof boundary.scheduleCheckInInstanceFromAction).toBe("function");
    expect(typeof boundary.cancelCheckInInstanceFromAction).toBe("function");
    expect(typeof boundary.listOwnCheckInInstances).toBe("function");
    expect(typeof boundary.getOwnCheckInInstance).toBe("function");
    expect(typeof boundary.submitCheckInInstanceFromAction).toBe("function");
  });
});
