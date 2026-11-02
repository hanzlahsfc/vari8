import { describe, expect, it, vi } from "vitest";

import {
  cleanupMeLookFixtures,
  newMeLookOwned,
  setupMeLookFixtures,
  type FixtureDb,
  type MeLookDeps,
} from "../e2e/me-look-fixture";

/**
 * P716 failure-path proof: a mid-setup throw must still leave a complete
 * ownership record, cleanup must attempt every safe delete, and nothing
 * outside the owned ids may be touched. The fixture helper is exercised
 * directly with a recorded mock — no new framework.
 */

const ID = (n: number) => `id-${n}`;

function mockDb() {
  const calls: string[] = [];
  const track = (name: string) => {
    return vi.fn(async () => {
      calls.push(name);
      return {};
    });
  };
  const prisma = {
    user: {
      upsert: vi.fn(async ({ where }: { where: { email: string } }) => ({
        id: ID(1 + calls.length),
        email: where.email,
      })),
      deleteMany: track("user.deleteMany"),
    },
    account: {
      upsert: vi.fn(async () => ({ id: "acct-1" })),
      deleteMany: track("account.deleteMany"),
    },
    workspace: {
      upsert: vi.fn(async ({ where }: { where: { slug: string } }) => ({
        id: "ws-1",
        slug: where.slug,
      })),
      deleteMany: track("workspace.deleteMany"),
    },
    workspaceMember: {
      upsert: vi.fn(async () => ({})),
      deleteMany: track("workspaceMember.deleteMany"),
    },
    clientProfile: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "cp-1" })),
      update: vi.fn(async () => ({})),
      deleteMany: track("clientProfile.deleteMany"),
    },
    accessToken: {
      deleteMany: track("accessToken.deleteMany"),
    },
    auditEvent: {
      deleteMany: track("auditEvent.deleteMany"),
    },
  };
  return { prisma: prisma as unknown as FixtureDb, calls };
}

const deps = (
  createInvitation?: MeLookDeps["createInvitation"],
): MeLookDeps => ({
  hashPassword: vi.fn(async () => "hash"),
  createInvitation:
    createInvitation ??
    vi.fn(async (_o, i) => ({
      invitationId: `invite-${i.intendedRole}`,
      delivery: { rawToken: "tok" },
    })),
});

describe("me-look fixture ownership under partial failure", () => {
  it("second invitation fails → first token and all earlier rows are owned and cleaned", async () => {
    const { prisma, calls } = mockDb();
    const createInvitation = vi
      .fn()
      .mockResolvedValueOnce({
        invitationId: "inv-first",
        delivery: { rawToken: "t1" },
      })
      .mockRejectedValueOnce(new Error("provider down"));
    const owned = newMeLookOwned();

    await expect(
      setupMeLookFixtures(prisma, deps(createInvitation), owned),
    ).rejects.toThrow("provider down");

    // Ownership: the committed first invite is tracked, not the failed one.
    expect(owned.inviteTokenIds).toEqual(["inv-first"]);
    expect(owned.workspaceId).toBe("ws-1");
    expect(owned.userIds).toHaveLength(2);
    expect(owned.clientProfileId).toBe("cp-1");

    const errors = await cleanupMeLookFixtures(prisma, owned);
    expect(errors).toEqual([]);
    // Restrict-FK children went before their parents.
    expect(calls.indexOf("accessToken.deleteMany")).toBeLessThan(
      calls.indexOf("workspace.deleteMany"),
    );
    expect(calls.indexOf("account.deleteMany")).toBeLessThan(
      calls.indexOf("user.deleteMany"),
    );
    // Token deletion is scoped to this run's workspace only.
    expect(prisma.accessToken.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1" },
    });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: owned.userIds } },
    });
  });

  it("account.upsert fails → the just-created user is still tracked and deleted", async () => {
    const { prisma } = mockDb();
    prisma.account.upsert = vi
      .fn()
      .mockRejectedValueOnce(new Error("account write failed"))
      .mockResolvedValue({ id: "acct" });
    const owned = newMeLookOwned();

    await expect(setupMeLookFixtures(prisma, deps(), owned)).rejects.toThrow(
      "account write failed",
    );

    // The user whose account failed is recorded; the second user was
    // never attempted.
    expect(owned.userIds).toHaveLength(1);

    const errors = await cleanupMeLookFixtures(prisma, owned);
    expect(errors).toEqual([]);
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: owned.userIds } },
    });
  });

  it("a failing delete does not block the rest, and every failure is reported", async () => {
    const { prisma, calls } = mockDb();
    prisma.workspaceMember.deleteMany = vi
      .fn()
      .mockRejectedValue(new Error("member delete blocked"));
    prisma.user.deleteMany = vi
      .fn()
      .mockRejectedValue(new Error("user delete blocked"));
    const owned = {
      runId: "x",
      workspaceId: "ws-1",
      clientProfileId: "cp-1",
      userIds: ["u-1", "u-2"],
      inviteTokenIds: ["inv-1"],
    };

    const errors = await cleanupMeLookFixtures(prisma, owned);

    // Both failures surfaced, labeled — nothing silently skipped.
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain("member delete blocked");
    expect(errors[1].message).toContain("user delete blocked");
    // Every other safe delete still ran after the first failure.
    for (const step of [
      "accessToken.deleteMany",
      "clientProfile.deleteMany",
      "auditEvent.deleteMany",
      "workspace.deleteMany",
      "account.deleteMany",
    ]) {
      expect(calls).toContain(step);
    }
  });

  it("cleanup never touches rows outside the owned record", async () => {
    const { prisma } = mockDb();
    const owned = newMeLookOwned();
    // Nothing was created — setup failed before any row existed.
    const errors = await cleanupMeLookFixtures(prisma, owned);
    expect(errors).toEqual([]);
    expect(prisma.accessToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.workspace.deleteMany).not.toHaveBeenCalled();
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });
});
