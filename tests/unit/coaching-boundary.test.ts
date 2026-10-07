import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P-014 boundary flag-off proof — the REAL boundary functions with the
 * guarded service modules mocked. Under flag-off every boundary entry
 * (reads AND mutations) returns the off-result without touching the
 * service layer at all — zero database work, zero audit.
 */

vi.mock("@/lib/coaching/parameters", () => ({
  archiveParameter: vi.fn(async () => ({})),
  createParameter: vi.fn(async () => ({})),
  getParameter: vi.fn(async () => ({})),
  listParameters: vi.fn(async () => ({ parameters: [], nextCursor: null })),
  updateParameter: vi.fn(async () => ({})),
  ParameterError: class ParameterError extends Error {},
}));
vi.mock("@/lib/coaching/templates", () => ({
  archiveTemplate: vi.fn(async () => ({})),
  CoachingTemplateError: class CoachingTemplateError extends Error {},
  createTemplate: vi.fn(async () => ({})),
  getTemplate: vi.fn(async () => ({})),
  getTemplateVersion: vi.fn(async () => ({})),
  listTemplates: vi.fn(async () => []),
  openTemplateDraft: vi.fn(async () => ({})),
  publishTemplate: vi.fn(async () => ({})),
  saveTemplateDraft: vi.fn(async () => ({})),
}));

import {
  archiveParameter,
  createParameter,
  getParameter,
  listParameters,
  updateParameter,
} from "@/lib/coaching/parameters";
import {
  archiveParameterFromAction,
  createParameterFromAction,
  getParameterForWorkspace,
  listParametersForWorkspace,
  updateParameterFromAction,
} from "@/lib/coaching/parameters-boundary";
import {
  archiveTemplate,
  createTemplate,
  getTemplate,
  getTemplateVersion,
  listTemplates,
  openTemplateDraft,
  publishTemplate,
  saveTemplateDraft,
} from "@/lib/coaching/templates";
import {
  archiveTemplateFromAction,
  createTemplateFromAction,
  getTemplateForWorkspace,
  getTemplateVersionForWorkspace,
  listTemplatesForWorkspace,
  openTemplateDraftFromAction,
  publishTemplateFromAction,
  saveTemplateDraftFromAction,
} from "@/lib/coaching/templates-boundary";

const FLAG = "ENABLE_COACHING_TEMPLATES";
const session = { user: { id: "u1" } };
const OFF = { ok: false, message: "This feature is not available." };

describe("P-014 boundaries — flag-off zero side effects", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[FLAG];
    vi.clearAllMocks();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[FLAG];
    else process.env[FLAG] = saved;
  });

  it.each(["", "0", "yes", " 1 "])(
    "flag=%j: every parameter boundary fn refuses before the service",
    async (value) => {
      if (value === "") delete process.env[FLAG];
      else process.env[FLAG] = value;
      const results = await Promise.all([
        createParameterFromAction(session, {
          workspaceId: "w",
          inputJson: "{}",
        }),
        updateParameterFromAction(session, {
          workspaceId: "w",
          parameterId: "p",
          expectedRevision: 1,
          inputJson: "{}",
        }),
        archiveParameterFromAction(session, {
          workspaceId: "w",
          parameterId: "p",
        }),
        listParametersForWorkspace(session, { workspaceId: "w" }),
        getParameterForWorkspace(session, {
          workspaceId: "w",
          parameterId: "p",
        }),
      ]);
      for (const r of results) expect(r).toEqual(OFF);
      for (const fn of [
        createParameter,
        updateParameter,
        archiveParameter,
        listParameters,
        getParameter,
      ]) {
        expect(vi.mocked(fn)).not.toHaveBeenCalled();
      }
    },
  );

  it.each(["", "0", "yes", " 1 "])(
    "flag=%j: every template boundary fn refuses before the service",
    async (value) => {
      if (value === "") delete process.env[FLAG];
      else process.env[FLAG] = value;
      const results = await Promise.all([
        createTemplateFromAction(session, { workspaceId: "w", name: "t" }),
        saveTemplateDraftFromAction(session, {
          workspaceId: "w",
          templateId: "t",
          expectedRevision: 1,
          draftJson: "{}",
        }),
        openTemplateDraftFromAction(session, {
          workspaceId: "w",
          templateId: "t",
        }),
        publishTemplateFromAction(session, {
          workspaceId: "w",
          templateId: "t",
          expectedRevision: 1,
        }),
        archiveTemplateFromAction(session, {
          workspaceId: "w",
          templateId: "t",
        }),
        listTemplatesForWorkspace(session, { workspaceId: "w" }),
        getTemplateForWorkspace(session, {
          workspaceId: "w",
          templateId: "t",
        }),
        getTemplateVersionForWorkspace(session, {
          workspaceId: "w",
          templateId: "t",
          versionSeq: 1,
        }),
      ]);
      for (const r of results) expect(r).toEqual(OFF);
      for (const fn of [
        createTemplate,
        saveTemplateDraft,
        openTemplateDraft,
        publishTemplate,
        archiveTemplate,
        listTemplates,
        getTemplate,
        getTemplateVersion,
      ]) {
        expect(vi.mocked(fn)).not.toHaveBeenCalled();
      }
    },
  );

  it("flag on: listParametersForWorkspace forwards bounded limit/cursor", async () => {
    process.env[FLAG] = "1";
    vi.mocked(listParameters).mockResolvedValueOnce({
      parameters: [],
      nextCursor: "c_next",
    });
    const r = await listParametersForWorkspace(session, {
      workspaceId: "w",
      limit: 10,
      cursor: "c_1",
    });
    expect(r).toEqual({
      ok: true,
      value: { parameters: [], nextCursor: "c_next" },
    });
    expect(vi.mocked(listParameters)).toHaveBeenCalledWith(
      session,
      { workspaceId: "w", limit: 10, cursor: "c_1" },
      expect.anything(),
    );
  });

  it.each([
    { limit: 0 },
    { limit: -1 },
    { limit: 1.5 },
    { limit: 101 },
    { limit: "10" },
    { cursor: 42 },
    { cursor: "x".repeat(129) },
  ])(
    "flag on: malformed page request %o is rejected before the service",
    async (extra) => {
      process.env[FLAG] = "1";
      const r = await listParametersForWorkspace(session, {
        workspaceId: "w",
        ...(extra as { limit?: number; cursor?: string }),
      });
      expect(r).toEqual({
        ok: false,
        message: "Check the details and try again.",
      });
      expect(vi.mocked(listParameters)).not.toHaveBeenCalled();
    },
  );

  it("flag on: oversized payload rejected by byte bound before JSON.parse", async () => {
    process.env[FLAG] = "1";
    const huge = `"${"x".repeat(140 * 1024)}"`;
    const r = await createParameterFromAction(session, {
      workspaceId: "w",
      inputJson: huge,
    });
    expect(r).toEqual({
      ok: false,
      message: "Check the details and try again.",
    });
    expect(vi.mocked(createParameter)).not.toHaveBeenCalled();
  });
});
