import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P-020A-I1-R2 repair — pins the *action-layer* ordering of the
 * classification gate: with ENABLE_PARAMETER_CLASSIFICATION absent or not
 * exactly "1", the real exported server action must return the flag-off
 * result before `auth()`, before any FormData read, and before any
 * boundary/database work. The boundary-level before-DB proof remains in
 * coaching-classification.test.ts — this test binds the production action
 * ordering itself against regression.
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u_test" } })),
}));
vi.mock("@/lib/coaching/parameters-boundary", () => ({
  archiveParameterFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  classifyParameterFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  createParameterFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  updateParameterFromAction: vi.fn(async () => ({ ok: true, value: {} })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/auth";
import { classifyParameterFromAction } from "@/lib/coaching/parameters-boundary";
import { classifyParameter } from "../../app/workspace/[workspaceId]/parameters/actions";

const FLAG = "ENABLE_PARAMETER_CLASSIFICATION";
const COACHING_FLAG = "ENABLE_COACHING_TEMPLATES";
const WS = "ws_test";

function trackedFormData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  const getAll = vi.spyOn(fd, "getAll");
  const get = vi.spyOn(fd, "get");
  return { fd, getAll, get };
}

describe("P-020A classifyParameter action — flag-off ordering", () => {
  let saved: string | undefined;
  let savedCoaching: string | undefined;

  beforeEach(() => {
    saved = process.env[FLAG];
    savedCoaching = process.env[COACHING_FLAG];
    delete process.env[COACHING_FLAG];
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[FLAG];
    else process.env[FLAG] = saved;
    if (savedCoaching === undefined) delete process.env[COACHING_FLAG];
    else process.env[COACHING_FLAG] = savedCoaching;
  });

  it.each([undefined, "", "yes", "true", "01"] as const)(
    "flag=%j → refuses before auth, FormData reads, and the boundary",
    async (value) => {
      if (value === undefined) delete process.env[FLAG];
      else process.env[FLAG] = value;
      const { fd, get, getAll } = trackedFormData({
        parameterIndex: "0",
        expectedRevision: "1",
        fingerprint: "fp",
        classification: "GENERAL_HEALTH",
      });
      const r = await classifyParameter(WS, fd);
      expect(r).toEqual({
        ok: false,
        message: "This feature is not available.",
      });
      expect(vi.mocked(auth)).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(getAll).not.toHaveBeenCalled();
      expect(vi.mocked(classifyParameterFromAction)).not.toHaveBeenCalled();
    },
  );

  it("flag=1 → proceeds to auth and the boundary", async () => {
    process.env[FLAG] = "1";
    process.env[COACHING_FLAG] = "1";
    const { fd } = trackedFormData({
      parameterIndex: "0",
      expectedRevision: "1",
      fingerprint: "fp",
      classification: "GENERAL_HEALTH",
    });
    await classifyParameter(WS, fd);
    expect(vi.mocked(auth)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(classifyParameterFromAction)).toHaveBeenCalledTimes(1);
  });
});
