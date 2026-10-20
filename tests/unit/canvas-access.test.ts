import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PR-W1 route-guard tests — the identity-aware canvas gates.
 *
 * A session user whose only binding is a CLIENT membership never reaches a
 * staff route: the staff gate redirects them to `/me`. A staff member passes
 * the staff gate. The client gate admits a bound client and denies everyone
 * else. `next/navigation`, `@/auth`, `@/lib/db`, `@/lib/auth/server` and
 * `next/headers` are mocked so no Next runtime or database is required; the
 * fake prisma returns the rows the real selects would return.
 */

class RedirectSentinel extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
    this.name = "RedirectSentinel";
  }
}
class ForbiddenSentinel extends Error {
  constructor() {
    super("forbidden");
    this.name = "ForbiddenSentinel";
  }
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSentinel(url);
  }),
  forbidden: vi.fn(() => {
    throw new ForbiddenSentinel();
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/auth/server", () => ({ auth: { api: {} } }));
vi.mock("../../lib/db", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

import { forbidden, redirect } from "next/navigation";

import { auth } from "../../auth";
import { prisma } from "../../lib/db";
import {
  requireCanvasAccess,
  requireClientAccess,
} from "../../app/(canvas)/require-canvas-access";

const authMock = vi.mocked(auth);
const findUnique = vi.mocked(prisma.user.findUnique);

const STAFF_USER = {
  status: "ACTIVE",
  name: "Liliana Mansfeld",
  email: "owner@vari8.test",
  memberships: [
    {
      role: "WORKSPACE_OWNER",
      workspace: { id: "w1", name: "Liliana Mansfeld Coaching" },
    },
  ],
  clientProfiles: [],
};
const CLIENT_USER = {
  status: "ACTIVE",
  name: "Emma Anders",
  email: "client@vari8.test",
  memberships: [],
  clientProfiles: [
    {
      id: "cp1",
      name: "Emma Anders",
      workspace: { id: "w1", name: "Liliana Mansfeld Coaching" },
    },
  ],
};
const NO_BINDING_USER = {
  status: "ACTIVE",
  name: "Nobody",
  email: "nobody@vari8.test",
  memberships: [],
  clientProfiles: [],
};

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue({
    user: { id: "u1", email: "u1@vari8.test", name: "U One" },
  });
  findUnique.mockReset();
  vi.mocked(redirect).mockClear();
  vi.mocked(forbidden).mockClear();
});

describe("requireCanvasAccess (staff routes)", () => {
  it("lets a staff session through without a redirect", async () => {
    findUnique.mockResolvedValue(STAFF_USER as never);
    const viewer = await requireCanvasAccess();
    expect(viewer.role).toBe("Owner");
    expect(viewer.workspace.name).toBe("Liliana Mansfeld Coaching");
    expect(redirect).not.toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("redirects a client session to /me", async () => {
    findUnique.mockResolvedValue(CLIENT_USER as never);
    await expect(requireCanvasAccess()).rejects.toMatchObject({
      name: "RedirectSentinel",
      url: "/me",
    });
    expect(redirect).toHaveBeenCalledWith("/me");
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("denies a session with no staff or client binding", async () => {
    findUnique.mockResolvedValue(NO_BINDING_USER as never);
    await expect(requireCanvasAccess()).rejects.toMatchObject({
      name: "ForbiddenSentinel",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("requireClientAccess (the /me gate)", () => {
  it("admits a bound client", async () => {
    findUnique.mockResolvedValue(CLIENT_USER as never);
    const viewer = await requireClientAccess();
    expect(viewer.clientProfileId).toBe("cp1");
    expect(viewer.workspace.name).toBe("Liliana Mansfeld Coaching");
    expect(viewer.initials).toBe("EA");
  });

  it("denies a staff-only session", async () => {
    findUnique.mockResolvedValue(STAFF_USER as never);
    await expect(requireClientAccess()).rejects.toMatchObject({
      name: "ForbiddenSentinel",
    });
  });
});
