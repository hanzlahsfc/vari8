import { describe, expect, it } from "vitest";

import {
  buildAccountAuditEvent,
  buildAuditEvent,
  sanitizeAuditMeta,
} from "../../lib/audit";
import {
  completePasswordReset,
  getResetLinkState,
  requestPasswordResetFromForm,
} from "../../lib/auth/password-reset-boundary";

/**
 * S1-F2D unit tests — pure/structural surface. DB behavior lives in
 * tests/integration/s1-f2d-password-reset.test.ts (real PostgreSQL).
 *
 * PR-05 rewiring — block TB2.088 kept; the cases that asserted deleted
 * machinery (`lib/auth/password-reset.ts`: the deliver-sink contract, the
 * serialization-retry loop, the exposure assertion) are gone with it. The
 * survivors rewire to the form boundary (`lib/auth/password-reset-boundary.ts`)
 * and the unchanged account-audit metadata rules in `lib/audit.ts`.
 */
describe("S1-F2D password-reset — unit surface", () => {
  it("invalid request inputs fail structurally without reaching the auth pipeline", async () => {
    // The field-format failure copy is distinct from the generic API failure —
    // proof the call short-circuited before `auth.api.requestPasswordReset`
    // (which cannot run without the request scope + DB).
    for (const email of [undefined, null, 42, "", "   ", {}, "noatsign"]) {
      await expect(
        requestPasswordResetFromForm(email, { deliveryAvailable: true }),
      ).resolves.toEqual({
        ok: false,
        message: "Enter a valid email address.",
      });
    }
    // A syntactically email-shaped but unreachable input still fails closed —
    // never ok, never an echo.
    const deepFailure = await requestPasswordResetFromForm("@x", {
      deliveryAvailable: true,
    });
    expect(deepFailure.ok).toBe(false);
  });

  it("password-policy violations surface before the token is ever claimed", async () => {
    // The boundary checks the fixable problem first: even on an unusable
    // token the user sees the policy copy, and the check runs before any
    // `auth.api.*` call (this suite has no request scope or DB).
    for (const [password, message] of [
      ["short", "Password must be at least 10 characters."],
      ["abcdefghij", "Password must contain at least one digit."],
      ["x".repeat(500), "Enter a valid password."],
    ] as const) {
      await expect(
        completePasswordReset(
          { rawToken: "nope", password },
          { deliveryAvailable: true },
        ),
      ).resolves.toEqual({ ok: false, message });
    }
  });

  it("the delivery gate fails closed before any auth call", async () => {
    const gate = { deliveryAvailable: false };
    await expect(
      requestPasswordResetFromForm("u@example.test", gate),
    ).resolves.toEqual({
      ok: false,
      message: "Password reset is not currently available.",
    });
    await expect(
      completePasswordReset(
        { rawToken: "any", password: "valid-pass-1" },
        gate,
      ),
    ).resolves.toEqual({
      ok: false,
      message: "Password reset is not currently available.",
    });
    let reads = 0;
    const counting = {
      verification: {
        findFirst: async () => {
          reads += 1;
          return { id: "v1" };
        },
      },
    };
    await expect(getResetLinkState("any", counting, gate)).resolves.toEqual({
      state: "invalid",
    });
    expect(reads).toBe(0);
  });

  it("throwing input getters fail closed without leaking internals", async () => {
    const trapped = {
      get rawToken(): never {
        throw new Error("raw-token-secret");
      },
      get password(): never {
        throw new Error("password-secret");
      },
    };
    const r = await completePasswordReset(trapped, {
      deliveryAvailable: true,
    });
    expect(r).toEqual({
      ok: false,
      message: "Something went wrong. Please try again in a moment.",
    });
    expect(JSON.stringify(r)).not.toContain("secret");
    // The request surface treats getter-trapped input as ordinary invalid
    // input — same field error, no leak, no auth call.
    await expect(
      requestPasswordResetFromForm(
        {
          get length(): never {
            throw new Error("email-getter-secret");
          },
        } as never,
        { deliveryAvailable: true },
      ),
    ).resolves.toEqual({
      ok: false,
      message: "Enter a valid email address.",
    });
  });

  it("resetStage is scoped to account PASSWORD_RESET audit only", () => {
    // Workspace audit construction must reject it.
    expect(() =>
      sanitizeAuditMeta({ resetStage: "REQUESTED" } as never),
    ).toThrow("audit_metadata_forbidden");
    const ctx = {
      userId: "u",
      workspaceId: "w",
      workspaceMemberId: "m",
      workspaceRole: "WORKSPACE_OWNER" as const,
      platformRole: "USER" as const,
      grantedScope: "workspace" as const,
    };
    expect(() =>
      buildAuditEvent(ctx, {
        action: "INVITE",
        resourceType: "access_token",
        meta: { resetStage: "COMPLETED" } as never,
      }),
    ).toThrow("audit_metadata_forbidden");
    // Account password-reset audit accepts exactly the closed pair.
    const row = buildAccountAuditEvent(
      { subjectUserId: "u1", actorUserId: null },
      {
        action: "PASSWORD_RESET",
        resourceType: "access_token",
        resourceId: "t",
        meta: { resetStage: "REQUESTED" },
      },
    );
    expect(row.scope).toBe("ACCOUNT");
    expect(row.meta).toEqual({ resetStage: "REQUESTED" });
    expect(() =>
      buildAccountAuditEvent(
        { subjectUserId: "u1" },
        {
          action: "PASSWORD_RESET",
          resourceType: "access_token",
          meta: { resetStage: "BROKEN" } as never,
        },
      ),
    ).toThrow("audit_metadata_forbidden");
    // PASSWORD_RESET/user keeps its S1-F2B allowed shape — but resetStage
    // metadata is forbidden on it.
    const userRow = buildAccountAuditEvent(
      { subjectUserId: "u1" },
      { action: "PASSWORD_RESET", resourceType: "user", resourceId: "u1" },
    );
    expect(userRow.scope).toBe("ACCOUNT");
    expect(userRow).not.toHaveProperty("meta");
    for (const stage of ["REQUESTED", "COMPLETED"] as const) {
      expect(() =>
        buildAccountAuditEvent(
          { subjectUserId: "u1" },
          {
            action: "PASSWORD_RESET",
            resourceType: "user",
            meta: { resetStage: stage } as never,
          },
        ),
      ).toThrow("audit_metadata_forbidden");
    }
    expect(() =>
      buildAccountAuditEvent(
        { subjectUserId: "u1" },
        {
          action: "PASSWORD_RESET",
          resourceType: "access_token",
          meta: { rawToken: "x" } as never,
        },
      ),
    ).toThrow("audit_metadata_forbidden");
  });
});
