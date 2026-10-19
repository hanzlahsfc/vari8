import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S1-H route-guard unit tests — the server-side guard wiring for the
 * authenticated workspace shell. `@/auth` and `next/navigation` are mocked so
 * no Next runtime or database is required; the authorization repo is a fake
 * PrismaLike (same shape the real guard adapter reads).
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

vi.mock("../../auth", () => ({ auth: vi.fn() }));

import { auth } from "../../auth";

const authMock = auth as unknown as {
  mockReset: () => void;
  mockResolvedValue: (value: unknown) => void;
};
import { forbidden, redirect } from "next/navigation";
import {
  getAuthorizedWorkspaceSummary,
} from "../../lib/auth/route-guard";


beforeEach(() => {
  authMock.mockReset();
  vi.mocked(redirect).mockClear();
  vi.mocked(forbidden).mockClear();
});

describe("getAuthorizedWorkspaceSummary", () => {
  it("reads the name for the authorized workspace id", async () => {
    const client = {
      workspace: { findUnique: async () => ({ id: "w1", name: "Alpha" }) },
    };
    const summary = await getAuthorizedWorkspaceSummary(
      { workspaceId: "w1" } as never,
      client as never,
    );
    expect(summary).toEqual({ id: "w1", name: "Alpha" });
  });

  it("fails closed when the context has no workspace id", async () => {
    const client = {
      workspace: { findUnique: async () => ({ id: "w1", name: "Alpha" }) },
    };
    await expect(
      getAuthorizedWorkspaceSummary({} as never, client as never),
    ).rejects.toThrow();
  });
});
