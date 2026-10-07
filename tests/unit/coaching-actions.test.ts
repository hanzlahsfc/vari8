import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P-014 action-layer flag-off proof — real exported server actions with
 * mocked `auth`, boundary, and `revalidatePath` dependencies. Flag-off calls
 * must stop before auth, before FormData reads, and before any boundary/DB
 * work; a crafted invocation performs zero observable side effects.
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u_test" } })),
}));
vi.mock("@/lib/coaching/parameters-boundary", () => ({
  archiveParameterFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  createParameterFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  updateParameterFromAction: vi.fn(async () => ({ ok: true, value: {} })),
}));
vi.mock("@/lib/coaching/templates-boundary", () => ({
  archiveTemplateFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  createTemplateFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  openTemplateDraftFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  publishTemplateFromAction: vi.fn(async () => ({ ok: true, value: {} })),
  saveTemplateDraftFromAction: vi.fn(async () => ({ ok: true, value: {} })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/auth";
import {
  archiveParameterFromAction,
  createParameterFromAction,
  updateParameterFromAction,
} from "@/lib/coaching/parameters-boundary";
import {
  archiveTemplateFromAction,
  createTemplateFromAction,
  publishTemplateFromAction,
  saveTemplateDraftFromAction,
} from "@/lib/coaching/templates-boundary";
import {
  archiveParameter,
  createParameter,
  updateParameter,
} from "../../app/workspace/[workspaceId]/parameters/actions";
import {
  archiveTemplate,
  createTemplate,
  publishTemplate,
  saveTemplateDraft,
} from "../../app/workspace/[workspaceId]/templates/actions";

const FLAG = "ENABLE_COACHING_TEMPLATES";

function trackedFormData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  const getAll = vi.spyOn(fd, "getAll");
  const get = vi.spyOn(fd, "get");
  return { fd, getAll, get };
}

describe("P-014 server actions — flag-off ordering", () => {
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
    "flag=%j: parameter actions stop before auth/FormData/boundary",
    async (value) => {
      if (value === "") delete process.env[FLAG];
      else process.env[FLAG] = value;
      const { fd, getAll } = trackedFormData({ kind: "TEXT", label: "x" });
      const create = await createParameter("ws1", fd);
      expect(create).toEqual({
        ok: false,
        message: "This feature is not available.",
      });
      const upd = await updateParameter("ws1", fd);
      const arc = await archiveParameter("ws1", fd);
      expect(upd.ok).toBe(false);
      expect(arc.ok).toBe(false);
      expect(vi.mocked(auth)).not.toHaveBeenCalled();
      expect(getAll).not.toHaveBeenCalled();
      expect(vi.mocked(createParameterFromAction)).not.toHaveBeenCalled();
      expect(vi.mocked(updateParameterFromAction)).not.toHaveBeenCalled();
      expect(vi.mocked(archiveParameterFromAction)).not.toHaveBeenCalled();
    },
  );

  it.each(["", "0"])(
    "flag=%j: template actions stop before auth/FormData/boundary",
    async (value) => {
      if (value === "") delete process.env[FLAG];
      else process.env[FLAG] = value;
      const { fd, getAll } = trackedFormData({ name: "t" });
      for (const call of [
        createTemplate("ws1", fd),
        saveTemplateDraft("ws1", fd),
        publishTemplate("ws1", fd),
        archiveTemplate("ws1", fd),
      ]) {
        const r = await call;
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.message).toBe("This feature is not available.");
      }
      expect(vi.mocked(auth)).not.toHaveBeenCalled();
      expect(getAll).not.toHaveBeenCalled();
      expect(vi.mocked(createTemplateFromAction)).not.toHaveBeenCalled();
      expect(vi.mocked(saveTemplateDraftFromAction)).not.toHaveBeenCalled();
      expect(vi.mocked(publishTemplateFromAction)).not.toHaveBeenCalled();
      expect(vi.mocked(archiveTemplateFromAction)).not.toHaveBeenCalled();
    },
  );

  it("flag on: actions authenticate, bind, and delegate", async () => {
    process.env[FLAG] = "1";
    const fd = new FormData();
    fd.append("name", "Template A");
    const result = await createTemplate("ws1", fd);
    expect(vi.mocked(auth)).toHaveBeenCalled();
    expect(vi.mocked(createTemplateFromAction)).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: "u_test" } }),
      expect.objectContaining({ workspaceId: "ws1", name: "Template A" }),
    );
    expect(result.ok).toBe(true);
  });
});
