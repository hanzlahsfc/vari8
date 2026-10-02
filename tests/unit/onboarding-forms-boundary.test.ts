// Slice 5A — server boundary contract for onboarding form actions.
// These are LIBRARY ADAPTER tests: they prove boundary input binding, error
// mapping, and delegation seams — NOT HTTP/CSRF/session security (that is
// asserted only when routes land).

import { describe, expect, it, vi } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import * as service from "../../lib/onboarding/forms";
import { OnboardingFormError } from "../../lib/onboarding/forms";

const session = { user: { id: "u1" } } as never;
const ws = "w1";

function ok<T>(v: T) {
  return { ok: true as const, value: v };
}
function fail(message: string) {
  return { ok: false as const, message };
}
void ok;
void fail;

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
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toMatch(/too large|invalid/i);
      // The bound fired BEFORE parse — no JSON.parse call for the payload.
      expect(parseSpy).not.toHaveBeenCalledWith(huge);
      // ...and BEFORE any service/DB interaction.
      expect(saveSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
      saveSpy.mockRestore();
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
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toMatch(/invalid/i);
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
        { workspaceId: ws, formId: "f".repeat(5000), expectedRevision: 1 },
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
        expect(res.ok).toBe(false);
      }
      expect(saveSpy).not.toHaveBeenCalled();
    } finally {
      saveSpy.mockRestore();
    }
  });
});

describe("P-008 boundary — delegation + error mapping", () => {
  it("forwards the parsed draft + injected db to the guarded service and returns normalized output", async () => {
    const { saveDraftFromAction } =
      await import("../../lib/onboarding/forms-boundary");
    const db = { marker: "injected" } as never;
    const normalized = {
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
      // The service received the injected client — never the global.
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

  it.each([
    ["forbidden_field_id", /invalid/i],
    ["stale_revision", /changed|stale|reload/i],
    ["form_archived", /archiv/i],
    ["no_open_draft", /publish|open|draft/i],
    ["publish_incomplete", /empty|field|publish/i],
    ["serialization_conflict", /again|conflict/i],
    ["form_not_accessible", /access|found|permission/i],
    ["invalid_input", /invalid/i],
  ])("maps service code %s to a safe message", async (code, rx) => {
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
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.message).toMatch(rx);
        // Never the raw code or service internals.
        expect(res.message).not.toContain(code);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("maps AccessDeniedError to a generic denial — no internals leaked", async () => {
    const { publishFromAction } =
      await import("../../lib/onboarding/forms-boundary");
    const spy = vi
      .spyOn(service, "publishOnboardingForm")
      .mockRejectedValue(new AccessDeniedError("denied"));
    try {
      const res = await publishFromAction(
        session,
        { workspaceId: ws, formId: "f1", expectedRevision: 1 },
        { db: {} as never },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toMatch(/access|permission|denied/i);
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
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.message).toMatch(/went wrong|try again/i);
        expect(res.message).not.toMatch(/ECONNREFUSED|app_dev_password|pg/);
      }
      // Draft content is never logged.
      const logLines = consoleSpy.mock.calls.flat().join(" ");
      expect(logLines).not.toContain("draftJson");
      expect(logLines).not.toContain('"title":"T"');
    } finally {
      spy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it("read wrappers delegate to the guarded service with the injected db", async () => {
    const b = await import("../../lib/onboarding/forms-boundary");
    const db = { marker: "injected" } as never;
    const listSpy = vi
      .spyOn(service, "listOnboardingForms")
      .mockResolvedValue([]);
    const getSpy = vi
      .spyOn(service, "getOnboardingForm")
      .mockResolvedValue({} as never);
    const openSpy = vi.spyOn(service, "openOnboardingDraft").mockResolvedValue({
      revision: 1,
      definition: { title: "T", fields: [] },
    });
    const archiveSpy = vi
      .spyOn(service, "archiveOnboardingForm")
      .mockResolvedValue({ formId: "f1" });
    try {
      await b.listFormsForWorkspace(session, { workspaceId: ws }, { db });
      await b.getFormForWorkspace(
        session,
        { workspaceId: ws, formId: "f1" },
        { db },
      );
      await b.openDraftFromAction(
        session,
        { workspaceId: ws, formId: "f1" },
        { db },
      );
      await b.archiveFormFromAction(
        session,
        { workspaceId: ws, formId: "f1" },
        { db },
      );
      expect(listSpy.mock.calls[0][2]).toBe(db);
      expect(getSpy.mock.calls[0][2]).toBe(db);
      expect(openSpy.mock.calls[0][2]).toBe(db);
      expect(archiveSpy.mock.calls[0][2]).toBe(db);
    } finally {
      for (const s of [listSpy, getSpy, openSpy, archiveSpy]) s.mockRestore();
    }
  });
});
