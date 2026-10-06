import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P-013/P3 action-layer flag-off proof. The exported server actions must
 * stop at the feature flag BEFORE calling `auth()`, before touching
 * FormData, and before any boundary/database work — a crafted action
 * invocation under flag-off performs zero observable side effects.
 *
 * These tests exercise the REAL exported action functions with mocked
 * dependencies (auth, boundary, revalidatePath), so they prove the actual
 * action-level ordering rather than merely POSTing to a page URL.
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u_test" } })),
}));
vi.mock("@/lib/onboarding/assignments-boundary", () => ({
  assignFormFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  replaceAssignmentFromAction: vi.fn(async () => ({
    ok: true,
    value: { changed: true },
  })),
  cancelAssignmentFromAction: vi.fn(async () => ({
    ok: true,
    value: { cancelled: true },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/auth";
import {
  assignFormFromAction,
  cancelAssignmentFromAction,
  replaceAssignmentFromAction,
} from "@/lib/onboarding/assignments-boundary";
import {
  cancelAssignment,
  createAssignment,
  replaceAssignment,
} from "../../app/workspace/[workspaceId]/onboarding/assignments/actions";

const FLAG = "ENABLE_ONBOARDING_ASSIGNMENTS";

function trackedFormData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  const getAll = vi.spyOn(fd, "getAll");
  const get = vi.spyOn(fd, "get");
  return { fd, getAll, get };
}

describe("P-013 server actions — flag-off ordering", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[FLAG];
    vi.clearAllMocks();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[FLAG];
    else process.env[FLAG] = saved;
  });

  it.each(["", "0", "yes", "true", " 1 "])(
    "flag=%j: createAssignment stops before auth/FormData/boundary",
    async (value) => {
      if (value === "") delete process.env[FLAG];
      else process.env[FLAG] = value;
      const { fd, getAll, get } = trackedFormData({
        clientProfileId: "cp1",
        formId: "f1",
      });
      const result = await createAssignment("ws1", fd);
      expect(result).toEqual({
        ok: false,
        message: "This feature is not available.",
      });
      expect(vi.mocked(auth)).not.toHaveBeenCalled();
      expect(getAll).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(vi.mocked(assignFormFromAction)).not.toHaveBeenCalled();
    },
  );

  it("flag off: replaceAssignment stops before auth/FormData/boundary", async () => {
    delete process.env[FLAG];
    const { fd, getAll } = trackedFormData({ assignmentId: "a1" });
    const result = await replaceAssignment("ws1", fd);
    expect(result).toEqual({
      ok: false,
      message: "This feature is not available.",
    });
    expect(vi.mocked(auth)).not.toHaveBeenCalled();
    expect(getAll).not.toHaveBeenCalled();
    expect(vi.mocked(replaceAssignmentFromAction)).not.toHaveBeenCalled();
  });

  it("flag off: cancelAssignment stops before auth/FormData/boundary", async () => {
    delete process.env[FLAG];
    const { fd, getAll } = trackedFormData({ assignmentId: "a1" });
    const result = await cancelAssignment("ws1", fd);
    expect(result).toEqual({
      ok: false,
      message: "This feature is not available.",
    });
    expect(vi.mocked(auth)).not.toHaveBeenCalled();
    expect(getAll).not.toHaveBeenCalled();
    expect(vi.mocked(cancelAssignmentFromAction)).not.toHaveBeenCalled();
  });

  it("flag on: actions still authenticate, bind, and delegate", async () => {
    process.env[FLAG] = "1";
    const { fd } = trackedFormData({ clientProfileId: "cp1", formId: "f1" });
    const result = await createAssignment("ws1", fd);
    expect(vi.mocked(auth)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(assignFormFromAction)).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});
