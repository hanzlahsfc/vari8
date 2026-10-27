import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sanitizeAuditMeta } from "../../lib/audit";
import {
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

// ---------------------------------------------------------------------------
// P2002 race classification — pinned against observed Prisma metadata shapes
// ---------------------------------------------------------------------------

import { Prisma } from "@prisma/client";
import {
  isExpectedUniqueRace,
  listWorkspaceInvitations,
} from "../../lib/workspace/invitations";

const p2002 = (meta: unknown) =>
  new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "6.19.3",
    meta: meta as Record<string, unknown>,
  });

describe("P2002 race classification", () => {
  it("retries only the four expected acceptance races", () => {
    const expected: Array<[string, string[]]> = [
      ["User", ["email"]],
      ["WorkspaceMember", ["workspace_id", "user_id"]],
      ["ClientProfile", ["workspace_id", "user_id"]],
      ["CoachProfile", ["workspace_member_id"]],
    ];
    for (const [model, target] of expected) {
      expect(isExpectedUniqueRace(p2002({ modelName: model, target }))).toBe(
        true,
      );
    }
  });

  it("rejects unrelated/missing/malformed P2002 metadata", () => {
    const bad: unknown[] = [
      { modelName: "AccessToken", target: ["token_hash"] }, // hash collision — never a race
      { modelName: "User", target: ["id"] },
      { modelName: "User", target: [] },
      { modelName: "WorkspaceMember", target: ["user_id", "workspace_id"] }, // wrong order = not the expected index
      { modelName: "UnknownModel", target: ["email"] },
      { target: ["email"] }, // missing modelName
      { modelName: "User" }, // missing target
      { modelName: "User", target: "email" }, // malformed target
      {},
      undefined,
    ];
    for (const meta of bad) {
      expect(isExpectedUniqueRace(p2002(meta))).toBe(false);
    }
    // Extra unexpected meta keys fail closed.
    expect(
      isExpectedUniqueRace(
        p2002({ modelName: "User", target: ["email"], driverAdapterError: {} }),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// List bound — prove the DATABASE query carries take = limit + 1 (a sliced
// array alone can hide an unbounded read)
// ---------------------------------------------------------------------------

describe("list query bound", () => {
  function fakeClient() {
    const calls: Array<{ take?: number }> = [];
    const client = {
      user: {
        findUnique: async () => ({
          id: "u",
          platformRole: "USER",
          status: "ACTIVE",
        }),
      },
      workspace: {
        findUnique: async () => ({ id: "w", status: "ACTIVE" }),
      },
      workspaceMember: {
        findUnique: async () => ({
          id: "m",
          role: "WORKSPACE_OWNER",
          status: "ACTIVE",
        }),
      },
      clientProfile: { findFirst: async () => null },
      clientAssignment: { findFirst: async () => null },
      accessToken: {
        findMany: async (args: { take?: number }) => {
          calls.push(args);
          return [];
        },
      },
    };
    return { client: client as never, calls };
  }

  it("passes take = limit+1 to the database", async () => {
    const { client, calls } = fakeClient();
    await listWorkspaceInvitations(
      { user: { id: "u" } },
      { workspaceId: "w" },
      client,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].take).toBe(26); // default 25 + 1 lookahead
    await listWorkspaceInvitations(
      { user: { id: "u" } },
      { workspaceId: "w", limit: 7 },
      client,
    );
    expect(calls[1].take).toBe(8);
    await listWorkspaceInvitations(
      { user: { id: "u" } },
      { workspaceId: "w", limit: 10_000 },
      client,
    );
    expect(calls[2].take).toBe(101); // clamped to MAX 100 + 1
  });
});

// ---------------------------------------------------------------------------
// Post-lock re-authorization — the guard must run TWICE (before and after the
// advisory-lock wait). Removing the second call must fail this test.
// ---------------------------------------------------------------------------

import { createWorkspaceInvitation } from "../../lib/workspace/invitations";

describe("post-lock re-authorization", () => {
  it("authorize runs before AND after the advisory lock", async () => {
    let membershipReads = 0;
    const tx = {
      $executeRawUnsafe: async () => 1,
      $queryRawUnsafe: async () => [{ id: "x" }],
      user: {
        findUnique: async () => ({
          id: "u",
          platformRole: "USER",
          status: "ACTIVE",
        }),
      },
      workspace: {
        findUnique: async () => ({ id: "w", status: "ACTIVE" }),
      },
      workspaceMember: {
        findUnique: async (args: { select?: Record<string, boolean> }) => {
          // The guard reads {id, role, status}; the issuance snapshot reads
          // only {stateVersion} — count guard reads precisely.
          if (args?.select && "role" in args.select && "status" in args.select)
            membershipReads++;
          return { id: "m", role: "WORKSPACE_OWNER", status: "ACTIVE" };
        },
        findFirst: async () => null,
      },
      clientProfile: { findFirst: async () => null },
      clientAssignment: { findFirst: async () => null },
      accessToken: {
        updateMany: async () => ({ count: 0 }),
        create: async () => ({ id: "tok", expiresAt: new Date() }),
      },
      auditEvent: { create: async () => ({ id: "a" }) },
    };
    const client = {
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    await createWorkspaceInvitation(
      { user: { id: "u" } },
      {
        workspaceId: "w",
        targetEmail: "t@example.test",
        intendedRole: "CLIENT",
      },
      client as never,
    );
    // Two authorize() calls → the membership row is read once per call.
    expect(membershipReads).toBeGreaterThanOrEqual(2);
  });
});
