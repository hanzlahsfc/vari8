// Slice 5A (recovery) — server boundary contract for onboarding form actions.
// These are LIBRARY ADAPTER tests: they prove boundary input binding, error
// mapping, and delegation seams — NOT HTTP/CSRF/session security (that is
// asserted only when routes land). The guarded service carries real
// authorization proof separately.

import { describe, expect, it, vi } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import * as service from "../../lib/onboarding/forms";
import {
  OnboardingFormError,
  type FormDefinition,
} from "../../lib/onboarding/forms";

const session = { user: { id: "u1" } } as never;
const ws = "w1";

// Pinned safe-message contract (exact strings — never codes/internals):
const INVALID = "Check the form details and try again.";
const STALE = "This form changed while you were editing. Reload and try again.";
const ARCHIVED = "This form is archived.";
const NO_DRAFT = "There's no open draft. Reopen the draft to edit.";
const INCOMPLETE = "A publish needs at least one field.";
const CONFLICT = "A conflict occurred. Please try again.";
const DENIED = "You don't have access to do that.";
const GENERIC = "Something went wrong. Please try again in a moment.";

describe("P-008 boundary — raw payload bound before parse", () => {
  it("rejects an oversized draftJson BEFORE JSON.parse and before service/DB", async () => {
    const { saveDraftFromAction } =
      await import("../../lib/onboarding/forms-boundary");
    const huge = JSON.stringify({
      title: "T",
      fields: [
        {
          kind: "shortText",
          label: "x".repeat(200_000),
          required: false,
          order: 0,
        },
      ],
    });
    const parseSpy = vi.spyOn(JSON, "parse");
    const saveSpy = vi.spyOn(service, "saveOnboardingFormDraft");
    try {
      const res = await saveDraftFromAction(
        session,
        {
          workspaceId: ws,
          formId: "f1",
          expectedRevision: 1,
          draftJson: huge,
        },
        { db: {} as never },
      );
      expect(res).toEqual({ ok: false, message: INVALID });
      expect(parseSpy).not.toHaveBeenCalledWith(huge);
      expect(saveSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
      saveSpy.mockRestore();
    }
  });

  it("bounds BYTES, not characters — multibyte overflow rejects pre-parse", async () => {
    const { saveDraftFromAction } =
      await import("../../lib/onboarding/forms-boundary");
    // 40_000 four-byte characters: short in .length terms, huge in UTF-8.
    const huge = JSON.stringify({
      title: "🔥".repeat(40_000),
      fields: [],
    });
    const parseSpy = vi.spyOn(JSON, "parse");
    try {
      const res = await saveDraftFromAction(
        session,
        {
          workspaceId: ws,
          formId: "f1",
          expectedRevision: 1,
          draftJson: huge,
        },
        { db: {} as never },
      );
      expect(res).toEqual({ ok: false, message: INVALID });
      expect(parseSpy).not.toHaveBeenCalledWith(huge);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("rejects malformed JSON without touching the service", async () => {
    const { saveDraftFromAction } =
      await import("../../lib/onboarding/forms-boundary");
    const saveSpy = vi.spyOn(service, "saveOnboardingFormDraft");
    try {
      const res = await saveDraftFromAction(
        session,
        {
          workspaceId: ws,
          formId: "f1",
          expectedRevision: 1,
          draftJson: "{not json",
        },
        { db: {} as never },
      );
      expect(res).toEqual({ ok: false, message: INVALID });
      expect(saveSpy).not.toHaveBeenCalled();
    } finally {
      saveSpy.mockRestore();
    }
  });

  it("rejects malformed IDs/revisions and oversized strings pre-service", async () => {
    const { saveDraftFromAction } =
      await import("../../lib/onboarding/forms-boundary");
    const saveSpy = vi.spyOn(service, "saveOnboardingFormDraft");
    const draftJson = JSON.stringify({ title: "T", fields: [] });
    try {
      for (const input of [
        { workspaceId: "", formId: "f", expectedRevision: 1 },
        { workspaceId: ws, formId: "", expectedRevision: 1 },
        { workspaceId: ws, formId: "f", expectedRevision: 1.5 },
        { workspaceId: ws, formId: "f", expectedRevision: -1 },
        { workspaceId: ws, formId: "f", expectedRevision: "2" },
        {
          workspaceId: ws,
          formId: "f",
          expectedRevision: Number.MAX_SAFE_INTEGER + 1,
        },
        { workspaceId: ws, formId: "f", expectedRevision: Infinity },
        { workspaceId: ws, formId: "f", expectedRevision: NaN },
        { workspaceId: ws, formId: "f".repeat(5000), expectedRevision: 1 },
        { workspaceId: "w".repeat(5000), formId: "f", expectedRevision: 1 },
        {
          workspaceId: ws,
          formId: "f",
          expectedRevision: 1,
          name: "n".repeat(5000),
        },
      ]) {
        const res = await saveDraftFromAction(
          session,
          { ...input, draftJson } as never,
          { db: {} as never },
        );
        expect(res).toEqual({ ok: false, message: INVALID });
      }
      expect(saveSpy).not.toHaveBeenCalled();
    } finally {
      saveSpy.mockRestore();
    }
  });
});

describe("P-008 boundary — delegation + error mapping", () => {
  it("forwards the parsed draft + injected db and returns normalized output", async () => {
    const { saveDraftFromAction } =
      await import("../../lib/onboarding/forms-boundary");
    const db = { marker: "injected" } as never;
    const normalized: FormDefinition = {
      title: "T",
      fields: [
        {
          fieldId: "f_srv",
          kind: "shortText",
          label: "L",
          required: false,
          order: 0,
        },
      ],
    };
    const saveSpy = vi
      .spyOn(service, "saveOnboardingFormDraft")
      .mockResolvedValue({ revision: 3, definition: normalized });
    try {
      const res = await saveDraftFromAction(
        session,
        {
          workspaceId: ws,
          formId: "f1",
          expectedRevision: 2,
          draftJson: JSON.stringify({ title: "T", fields: [] }),
        },
        { db },
      );
      expect(res).toEqual({
        ok: true,
        value: { revision: 3, definition: normalized },
      });
      expect(saveSpy.mock.calls[0][2]).toBe(db);
      expect(saveSpy.mock.calls[0][1]).toMatchObject({
        workspaceId: ws,
        formId: "f1",
        expectedRevision: 2,
      });
    } finally {
      saveSpy.mockRestore();
    }
  });

  it.each<[string, string]>([
    ["forbidden_field_id", INVALID],
    ["invalid_input", INVALID],
    ["stale_revision", STALE],
    ["form_archived", ARCHIVED],
    ["no_open_draft", NO_DRAFT],
    ["publish_incomplete", INCOMPLETE],
    ["serialization_conflict", CONFLICT],
    ["form_not_accessible", DENIED],
  ])(
    "maps service code %s to its exact safe message",
    async (code, message) => {
      const { publishFromAction } =
        await import("../../lib/onboarding/forms-boundary");
      const spy = vi
        .spyOn(service, "publishOnboardingForm")
        .mockRejectedValue(new OnboardingFormError(code as never));
      try {
        const res = await publishFromAction(
          session,
          { workspaceId: ws, formId: "f1", expectedRevision: 2 },
          { db: {} as never },
        );
        expect(res).toEqual({ ok: false, message });
        if (!res.ok) expect(res.message).not.toContain(code);
      } finally {
        spy.mockRestore();
      }
    },
  );

  it("maps AccessDeniedError to the generic denial — no internals", async () => {
    const { publishFromAction } =
      await import("../../lib/onboarding/forms-boundary");
    const spy = vi
      .spyOn(service, "publishOnboardingForm")
      .mockRejectedValue(
        new AccessDeniedError(
          "role_denied",
          "onboardingFormTemplates",
          "write",
        ),
      );
    try {
      const res = await publishFromAction(
        session,
        { workspaceId: ws, formId: "f1", expectedRevision: 1 },
        { db: {} as never },
      );
      expect(res).toEqual({ ok: false, message: DENIED });
    } finally {
      spy.mockRestore();
    }
  });

  it("unexpected faults surface a generic message — no stack/SQL/payload/creds", async () => {
    const { saveDraftFromAction } =
      await import("../../lib/onboarding/forms-boundary");
    const spy = vi
      .spyOn(service, "saveOnboardingFormDraft")
      .mockRejectedValue(
        new Error("ECONNREFUSED db=app_dev_password host=pg internal"),
      );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await saveDraftFromAction(
        session,
        {
          workspaceId: ws,
          formId: "f1",
          expectedRevision: 1,
          draftJson: JSON.stringify({ title: "T", fields: [] }),
        },
        { db: {} as never },
      );
      expect(res).toEqual({ ok: false, message: GENERIC });
      const logLines = consoleSpy.mock.calls.flat().join(" ");
      expect(logLines).not.toContain("draftJson");
      expect(logLines).not.toContain('"title":"T"');
      expect(logLines).not.toContain("app_dev_password");
    } finally {
      spy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it("ALL seven wrappers delegate to the guarded service with the injected db", async () => {
    const b = await import("../../lib/onboarding/forms-boundary");
    const db = { marker: "injected" } as never;
    const def: FormDefinition = { title: "T", fields: [] };
    const spies = {
      save: vi
        .spyOn(service, "saveOnboardingFormDraft")
        .mockResolvedValue({ revision: 2, definition: def }),
      open: vi
        .spyOn(service, "openOnboardingDraft")
        .mockResolvedValue({ revision: 1, definition: def }),
      publish: vi
        .spyOn(service, "publishOnboardingForm")
        .mockResolvedValue({ versionSeq: 1 }),
      archive: vi
        .spyOn(service, "archiveOnboardingForm")
        .mockResolvedValue({ formId: "f1" }),
      create: vi
        .spyOn(service, "createOnboardingForm")
        .mockResolvedValue({ formId: "f2" }),
      list: vi.spyOn(service, "listOnboardingForms").mockResolvedValue([]),
      get: vi
        .spyOn(service, "getOnboardingForm")
        .mockResolvedValue({} as never),
    };
    try {
      const results = await Promise.all([
        b.saveDraftFromAction(
          session,
          {
            workspaceId: ws,
            formId: "f1",
            expectedRevision: 1,
            draftJson: JSON.stringify(def),
          },
          { db },
        ),
        b.openDraftFromAction(
          session,
          { workspaceId: ws, formId: "f1" },
          { db },
        ),
        b.publishFromAction(
          session,
          { workspaceId: ws, formId: "f1", expectedRevision: 2 },
          { db },
        ),
        b.archiveFormFromAction(
          session,
          { workspaceId: ws, formId: "f1" },
          { db },
        ),
        b.createFormFromAction(
          session,
          { workspaceId: ws, name: "New" },
          { db },
        ),
        b.listFormsForWorkspace(session, { workspaceId: ws }, { db }),
        b.getFormForWorkspace(
          session,
          { workspaceId: ws, formId: "f1" },
          { db },
        ),
      ]);
      for (const r of results) expect(r.ok).toBe(true);
      // Every wrapper bound the injected client — not the module global.
      for (const key of Object.keys(spies) as Array<keyof typeof spies>) {
        expect(spies[key]).toHaveBeenCalledOnce();
        expect(spies[key].mock.calls[0][2]).toBe(db);
      }
    } finally {
      for (const s of Object.values(spies)) s.mockRestore();
    }
  });
});
