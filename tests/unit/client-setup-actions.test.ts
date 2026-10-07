import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P-016 action-layer flag-off proof. The exported server actions must stop
 * at the feature flag BEFORE calling `auth()`, before touching FormData,
 * and before any boundary/database work — a crafted action invocation under
 * flag-off performs zero observable side effects.
 *
 * These tests exercise the REAL exported action functions with mocked
 * dependencies (auth, boundary, revalidatePath), so they prove the actual
 * action-level ordering rather than merely POSTing to a page URL.
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u_test" } })),
}));
vi.mock("@/lib/coaching/client-setup-boundary", () => ({
  assignTemplateFromAction: vi.fn(async () => ({
    ok: true,
    value: { assignmentId: "pin_x" },
  })),
  cancelSetupAssignmentFromAction: vi.fn(async () => ({
    ok: true,
    value: { cancelled: true },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/auth";
import {
  assignTemplateFromAction,
  cancelSetupAssignmentFromAction,
} from "@/lib/coaching/client-setup-boundary";
import {
  assignTemplate,
  cancelSetupAssignment,
} from "../../app/workspace/[workspaceId]/client-setups/actions";

const FLAG = "ENABLE_CLIENT_SETUP";

function trackedFormData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  const getAll = vi.spyOn(fd, "getAll");
  const get = vi.spyOn(fd, "get");
  return { fd, getAll, get };
}

describe("P-016 server actions — flag-off ordering", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[FLAG];
    vi.clearAllMocks();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[FLAG];
    else process.env[FLAG] = saved;
  });

  it.each([
    [
      "assignTemplate",
      () =>
        assignTemplate(
          "ws1",
          trackedFormData({ clientProfileId: "c", templateId: "t" }).fd,
        ),
    ],
    [
      "cancelSetupAssignment",
      () => cancelSetupAssignment("ws1", trackedFormData({ pinId: "p" }).fd),
    ],
  ])(
    "%s fails closed before auth, FormData, or the boundary",
    async (_name, call) => {
      delete process.env[FLAG];
      const result = await call();
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.message).toBe("This feature is not available.");
      expect(auth).not.toHaveBeenCalled();
      expect(assignTemplateFromAction).not.toHaveBeenCalled();
      expect(cancelSetupAssignmentFromAction).not.toHaveBeenCalled();
    },
  );

  it("flag-off never reads FormData entries", async () => {
    delete process.env[FLAG];
    const { fd, getAll, get } = trackedFormData({ pinId: "p" });
    await cancelSetupAssignment("ws1", fd);
    expect(getAll).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("P-016 server actions — flag-on validation", () => {
  beforeEach(() => {
    process.env[FLAG] = "1";
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env[FLAG];
  });

  it("rejects malformed workspace and missing fields before delegating", async () => {
    expect((await assignTemplate("w".repeat(200), new FormData())).ok).toBe(
      false,
    );
    expect(assignTemplateFromAction).not.toHaveBeenCalled();
    const empty = new FormData();
    const result = await assignTemplate("ws1", empty);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.message).toBe("Check the form details and try again.");
    expect(assignTemplateFromAction).not.toHaveBeenCalled();
  });

  it("assignTemplate delegates with bounded inputs", async () => {
    const fd = new FormData();
    fd.set("clientProfileId", "client_1");
    fd.set("templateId", "tpl_1");
    const result = await assignTemplate("ws1", fd);
    expect(result).toEqual({ ok: true, value: { assignmentId: "pin_x" } });
    expect(assignTemplateFromAction).toHaveBeenCalledWith(
      { user: { id: "u_test" } },
      { workspaceId: "ws1", clientProfileId: "client_1", templateId: "tpl_1" },
    );
  });

  it("cancelSetupAssignment delegates with the pin id", async () => {
    const fd = new FormData();
    fd.set("pinId", "pin_1");
    const result = await cancelSetupAssignment("ws1", fd);
    expect(result).toEqual({ ok: true, value: { cancelled: true } });
    expect(cancelSetupAssignmentFromAction).toHaveBeenCalledWith(
      { user: { id: "u_test" } },
      { workspaceId: "ws1", pinId: "pin_1" },
    );
  });
});
