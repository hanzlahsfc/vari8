import { describe, expect, it } from "vitest";

import { isResource, resolveScope } from "../../lib/auth/rbac";

/**
 * P-016 `clientSetups` RBAC cells (product-decisions #51–#54): staff-only
 * template-assignment surface. Owner manages workspace-wide; any currently
 * ACTIVE assigned coach may manage (D-11 resolved — never PRIMARY-only);
 * assistant reads assigned scope, writes denied; client/support denied;
 * platform admin denied (the dual-role block lives in guard.ts).
 */
describe("P-016 clientSetups resource", () => {
  it("is a known resource", () => {
    expect(isResource("clientSetups")).toBe(true);
  });

  it("owner resolves workspace read/write", () => {
    expect(resolveScope("clientSetups", "read", "WORKSPACE_OWNER")).toBe(
      "workspace",
    );
    expect(resolveScope("clientSetups", "write", "WORKSPACE_OWNER")).toBe(
      "workspace",
    );
  });

  it("coach resolves assigned read/write — multi-coach, not PRIMARY-only", () => {
    expect(resolveScope("clientSetups", "read", "COACH")).toBe("assigned");
    expect(resolveScope("clientSetups", "write", "COACH")).toBe("assigned");
  });

  it("assistant resolves assigned read but write denied", () => {
    expect(resolveScope("clientSetups", "read", "ASSISTANT_COACH")).toBe(
      "assigned",
    );
    expect(resolveScope("clientSetups", "write", "ASSISTANT_COACH")).toBe(
      "denied",
    );
  });

  it.each(["CLIENT", "SUPPORT", "PLATFORM_ADMIN"] as const)(
    "%s is denied for both actions",
    (role) => {
      expect(resolveScope("clientSetups", "read", role)).toBe("denied");
      expect(resolveScope("clientSetups", "write", role)).toBe("denied");
    },
  );
});
