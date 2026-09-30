import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sanitizeAuditMeta } from "../../lib/audit";
import {
  assertInvitationOrchestrationExternallyExposable,
  InvitationError,
  invitationResource,
  isInvitableRole,
} from "../../lib/workspace/invitations";

describe("S1-F2C invitation helpers", () => {
  it("maps intended roles to the correct authorization resource", () => {
    // CLIENT invites use the distinct resource — a coach's client-invite grant
    // can never widen staff-invitation permission.
    expect(invitationResource("CLIENT")).toBe("clientInvitations");
    expect(invitationResource("COACH")).toBe("membersInvitations");
    expect(invitationResource("ASSISTANT_COACH")).toBe("membersInvitations");
  });

  it("accepts only COACH/ASSISTANT_COACH/CLIENT as intended roles", () => {
    for (const ok of ["COACH", "ASSISTANT_COACH", "CLIENT"]) {
      expect(isInvitableRole(ok)).toBe(true);
    }
    for (const bad of [
      "WORKSPACE_OWNER",
      "SUPPORT",
      "PLATFORM_ADMIN",
      "coach",
      "admin",
      "",
      null,
      undefined,
      0,
      {},
    ]) {
      expect(isInvitableRole(bad)).toBe(false);
    }
  });

  it("errors are structural codes only — no input echo", () => {
    const err = new InvitationError("identity_mismatch");
    expect(err.message).toBe("identity_mismatch");
    expect(err.message).not.toContain("@");
  });

  it("audit meta accepts targetRole only for invitable roles", () => {
    expect(sanitizeAuditMeta({ targetRole: "CLIENT", changed: true })).toEqual({
      targetRole: "CLIENT",
      changed: true,
    });
    for (const bad of ["WORKSPACE_OWNER", "SUPPORT", "PRIMARY", "x@y.z"]) {
      expect(() => sanitizeAuditMeta({ targetRole: bad as never })).toThrow(
        "audit_metadata_forbidden",
      );
    }
  });

  it("orchestration exposure assertion fails closed", () => {
    expect(() =>
      assertInvitationOrchestrationExternallyExposable(),
    ).toThrowError(
      expect.objectContaining({ code: "invitations_not_exposable" }),
    );
  });

  it("no app/route file imports the invitations service", () => {
    const root = join(__dirname, "..", "..", "app");
    const scan = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) return scan(p);
        return /\.(ts|tsx)$/.test(entry) ? [p] : [];
      });
    for (const file of scan(root)) {
      const src = readFileSync(file, "utf8");
      const imports = src
        .split("\n")
        .filter((line) => /^\s*import\s/.test(line))
        .join("\n");
      expect(imports).not.toContain("workspace/invitations");
      expect(imports).not.toContain("tokens/store");
    }
  });
});
