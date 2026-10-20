import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  CAPABILITY_MATRIX,
  capabilityScope,
  memberRoleToRole,
  ROLES,
  type Capability,
  type Role,
} from "../../lib/auth/roles";

/**
 * PR-05 — the owner-decided capability matrix (D10/D15), exercised as data.
 * Every row of CAPABILITY_MATRIX is asserted against the decided cell values;
 * every MemberRole maps deliberately (unknown -> deny).
 */
describe("capability matrix (owner-decided)", () => {
  it("is exhaustive and closed — every capability has all three roles", () => {
    for (const capability of CAPABILITIES) {
      for (const role of ROLES) {
        expect(["workspace", "own", "deny"]).toContain(
          CAPABILITY_MATRIX[capability][role],
        );
      }
    }
  });

  it.each<[Capability, Role, "workspace" | "own" | "deny"]>([
    // roster.read — staff-only surface (owner answer 3 / D22)
    ["roster.read", "owner", "workspace"],
    ["roster.read", "coach", "workspace"],
    ["roster.read", "client", "deny"],
    // plan.write — the headline rule: coach edits a client's plan, client cannot
    ["plan.write", "owner", "workspace"],
    ["plan.write", "coach", "workspace"],
    ["plan.write", "client", "deny"],
    // plan.read — clients may read their own plans only
    ["plan.read", "owner", "workspace"],
    ["plan.read", "coach", "workspace"],
    ["plan.read", "client", "own"],
    // clientData.read — staff read everything, client reads own
    ["clientData.read", "owner", "workspace"],
    ["clientData.read", "coach", "workspace"],
    ["clientData.read", "client", "own"],
    // own surfaces — everyone can act on their own data
    ["own.read", "owner", "own"],
    ["own.read", "coach", "own"],
    ["own.read", "client", "own"],
    ["own.write", "owner", "own"],
    ["own.write", "coach", "own"],
    ["own.write", "client", "own"],
    // staff-only write surfaces
    ["notes.write", "owner", "workspace"],
    ["notes.write", "coach", "workspace"],
    ["notes.write", "client", "deny"],
    ["tasks.manage", "owner", "workspace"],
    ["tasks.manage", "coach", "workspace"],
    ["tasks.manage", "client", "deny"],
    ["library.manage", "owner", "workspace"],
    ["library.manage", "coach", "workspace"],
    ["library.manage", "client", "deny"],
    ["appearance.write", "owner", "workspace"],
    ["appearance.write", "coach", "workspace"],
    ["appearance.write", "client", "deny"],
    ["member.invite", "owner", "workspace"],
    ["member.invite", "coach", "workspace"],
    ["member.invite", "client", "deny"],
    // messaging — staff anywhere, client only own conversation
    ["message.write", "owner", "workspace"],
    ["message.write", "coach", "workspace"],
    ["message.write", "client", "own"],
  ])("%s for %s resolves to %s", (capability, role, expected) => {
    expect(capabilityScope(role, capability)).toBe(expected);
  });

  it("memberRoleToRole maps the decided roles and denies the rest", () => {
    expect(memberRoleToRole("WORKSPACE_OWNER")).toBe("owner");
    expect(memberRoleToRole("COACH")).toBe("coach");
    expect(memberRoleToRole("CLIENT")).toBe("client");
    // Legacy roles have no D15 grant — fail closed.
    expect(memberRoleToRole("ASSISTANT_COACH")).toBeNull();
    expect(memberRoleToRole("SUPPORT")).toBeNull();
  });
});
