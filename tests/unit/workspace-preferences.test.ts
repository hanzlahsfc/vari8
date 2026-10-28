import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { ApiError, type ApiWorkspaceContext } from "@/lib/api/v1";
import type { PrismaLike } from "@/lib/workspace/access";
import {
  getSidebarState,
  getWorkspacePreferences,
  updateSidebarState,
  updateWorkspacePreferences,
} from "../../lib/workspace/preferences";

/**
 * PR-M2 — workspace appearance/preferences and member sidebar boundary.
 *
 * Calls the service the way the /api/v1 routes do (typed workspace context
 * plus a raw, unvalidated patch body) and asserts literal outcomes: the
 * canvas-vocabulary payload, the exact Prisma write shape, and rejection of
 * bad input before any write. Workspace isolation is asserted through the
 * `where` clause the service hands to Prisma.
 */
const ctx: ApiWorkspaceContext = {
  workspaceId: "ws-1",
  memberId: "mem-1",
  role: "owner",
  scope: "workspace",
};

const dbRow = {
  appearanceMode: "DARK",
  appearanceAccent: "#EB91B8",
  appearanceFont: "SANS",
  appearanceDensity: "COMFORTABLE",
  logoMediaId: null as string | null,
  availabilityText: "Weekdays · 09:00–18:00",
  notificationsEnabled: true,
  priorityNotificationsEnabled: true,
};

function fakeClient(overrides: { mediaId?: string | null } = {}) {
  const calls = {
    workspaceUpdate: [] as { where: unknown; data: Record<string, unknown> }[],
    memberUpdate: [] as { where: unknown; data: Record<string, unknown> }[],
    mediaLookup: [] as { where: unknown }[],
  };
  const client = {
    workspace: {
      findUnique: vi.fn(async () => dbRow),
      update: vi.fn(
        async (args: { where: unknown; data: Record<string, unknown> }) => {
          calls.workspaceUpdate.push(args);
          return { ...dbRow, ...args.data };
        },
      ),
    },
    workspaceMember: {
      findUnique: vi.fn(async () => ({ sidebarCollapsed: false })),
      update: vi.fn(
        async (args: { where: unknown; data: Record<string, unknown> }) => {
          calls.memberUpdate.push(args);
          return { sidebarCollapsed: args.data.sidebarCollapsed };
        },
      ),
    },
    mediaObject: {
      findFirst: vi.fn(async (args: { where: unknown }) => {
        calls.mediaLookup.push(args);
        return overrides.mediaId ? { id: overrides.mediaId } : null;
      }),
    },
  };
  return { client: client as unknown as PrismaLike, calls };
}

describe("getWorkspacePreferences", () => {
  it("returns the canvas-vocabulary preferences for the workspace row", async () => {
    const { client } = fakeClient();
    await expect(getWorkspacePreferences(ctx, client)).resolves.toEqual({
      mode: "dark",
      accent: "#EB91B8",
      font: "sans",
      density: "comfortable",
      logoMediaId: null,
      availability: "Weekdays · 09:00–18:00",
      notifications: true,
      priorityNotifications: true,
    });
  });

  it("reads only the caller's workspace", async () => {
    const { client } = fakeClient();
    await getWorkspacePreferences(ctx, client);
    const c = client as unknown as {
      workspace: { findUnique: ReturnType<typeof vi.fn> };
    };
    expect(c.workspace.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ws-1" } }),
    );
  });
});

describe("updateWorkspacePreferences", () => {
  it("maps a full canvas patch to the exact Prisma write, normalizing accent", async () => {
    const { client, calls } = fakeClient();
    const result = await updateWorkspacePreferences(
      ctx,
      {
        mode: "light",
        accent: "#c5457c",
        font: "serif",
        density: "compact",
        availability: "By appointment",
        notifications: false,
        priorityNotifications: false,
      },
      client,
    );
    expect(calls.workspaceUpdate).toHaveLength(1);
    expect(calls.workspaceUpdate[0].where).toEqual({ id: "ws-1" });
    expect(calls.workspaceUpdate[0].data).toEqual({
      appearanceMode: "LIGHT",
      appearanceAccent: "#C5457C",
      appearanceFont: "SERIF",
      appearanceDensity: "COMPACT",
      availabilityText: "By appointment",
      notificationsEnabled: false,
      priorityNotificationsEnabled: false,
    });
    expect(result.mode).toBe("light");
    expect(result.accent).toBe("#C5457C");
    expect(result.font).toBe("serif");
    expect(result.density).toBe("compact");
  });

  it("writes only the keys the patch carries (partial merge)", async () => {
    const { client, calls } = fakeClient();
    await updateWorkspacePreferences(ctx, { accent: "#3565b7" }, client);
    expect(calls.workspaceUpdate[0].data).toEqual({
      appearanceAccent: "#3565B7",
    });
  });

  it.each([
    ["missing hash", "EB91B8"],
    ["short hex", "#EB91B"],
    ["non-hex", "#ZZZZZZ"],
    ["word", "rose"],
  ])("rejects accent %s before any write", async (_label, accent) => {
    const { client, calls } = fakeClient();
    await expect(
      updateWorkspacePreferences(ctx, { accent }, client),
    ).rejects.toBeInstanceOf(ZodError);
    expect(calls.workspaceUpdate).toHaveLength(0);
  });

  it.each([
    { mode: "auto" },
    { font: "comic-sans" },
    { density: "roomy" },
    { notifications: "yes" },
    { availability: "x".repeat(501) },
    { theme: "x" },
  ])("rejects %j before any write", async (patch) => {
    const { client, calls } = fakeClient();
    await expect(
      updateWorkspacePreferences(ctx, patch, client),
    ).rejects.toBeInstanceOf(ZodError);
    expect(calls.workspaceUpdate).toHaveLength(0);
  });

  it.each([[null], ["rose"], [42], [["mode", "dark"]]])(
    "rejects a non-object body %j before any write",
    async (body) => {
      const { client, calls } = fakeClient();
      await expect(
        updateWorkspacePreferences(ctx, body, client),
      ).rejects.toBeInstanceOf(ZodError);
      expect(calls.workspaceUpdate).toHaveLength(0);
    },
  );

  it("sets logoMediaId only when the media object lives in this workspace", async () => {
    const { client, calls } = fakeClient({ mediaId: "med-1" });
    await updateWorkspacePreferences(ctx, { logoMediaId: "med-1" }, client);
    expect(calls.mediaLookup[0].where).toEqual({
      id: "med-1",
      workspaceId: "ws-1",
    });
    expect(calls.workspaceUpdate[0].data).toEqual({ logoMediaId: "med-1" });
  });

  it("rejects a logo media id that is not in this workspace with 400", async () => {
    const { client, calls } = fakeClient();
    await expect(
      updateWorkspacePreferences(ctx, { logoMediaId: "med-foreign" }, client),
    ).rejects.toMatchObject({ status: 400, code: "invalid_input" });
    expect(calls.workspaceUpdate).toHaveLength(0);
  });

  it("clears the logo with logoMediaId null without a media lookup", async () => {
    const { client, calls } = fakeClient();
    await updateWorkspacePreferences(ctx, { logoMediaId: null }, client);
    expect(calls.mediaLookup).toHaveLength(0);
    expect(calls.workspaceUpdate[0].data).toEqual({ logoMediaId: null });
  });
});

describe("member sidebar state", () => {
  it("returns the member's stored flag", async () => {
    const { client } = fakeClient();
    await expect(getSidebarState(ctx, client)).resolves.toEqual({
      sidebarCollapsed: false,
    });
  });

  it("writes the flag on the caller's own member row only", async () => {
    const { client, calls } = fakeClient();
    await expect(
      updateSidebarState(ctx, { sidebarCollapsed: true }, client),
    ).resolves.toEqual({ sidebarCollapsed: true });
    expect(calls.memberUpdate).toHaveLength(1);
    expect(calls.memberUpdate[0].where).toEqual({ id: "mem-1" });
    expect(calls.memberUpdate[0].data).toEqual({ sidebarCollapsed: true });
  });

  it.each([
    {},
    { sidebarCollapsed: "yes" },
    { sidebarCollapsed: true, extra: 1 },
  ])("rejects %j before any write", async (patch) => {
    const { client, calls } = fakeClient();
    await expect(updateSidebarState(ctx, patch, client)).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(calls.memberUpdate).toHaveLength(0);
  });
});

describe("error types at the boundary", () => {
  it("shape violations throw ZodError so the route maps them to 400", async () => {
    const { client } = fakeClient();
    const failure = await updateWorkspacePreferences(
      ctx,
      { accent: "nope" },
      client,
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ZodError);
    expect(failure).not.toBeInstanceOf(ApiError);
  });
});
