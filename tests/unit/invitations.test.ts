
import { describe, expect, it } from "vitest";


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

