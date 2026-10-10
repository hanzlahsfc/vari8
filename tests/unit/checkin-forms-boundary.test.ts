// P-025-A — Check-In forms server boundary contract. LIBRARY ADAPTER tests:
// boundary input binding, error mapping, and delegation seams — NOT
// HTTP/CSRF/session security (that is asserted at the route/integration
// layer). The guarded service carries real authorization proof separately.

import { describe, expect, it, vi } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import * as service from "../../lib/checkin/forms";
import { CheckInFormError } from "../../lib/checkin/forms";

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

describe("P-025-A boundary — raw payload bound before parse", () => {
  it("rejects an oversized draftJson BEFORE JSON.parse and before service/DB", async () => {
    const { saveCheckInDraftFromAction } =
      await import("../../lib/checkin/forms-boundary");
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
    const saveSpy = vi.spyOn(service, "saveCheckInFormDraft");
    try {
      const res = await saveCheckInDraftFromAction(
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
    const { saveCheckInDraftFromAction } =
      await import("../../lib/checkin/forms-boundary");
    // 40_000 four-byte characters: short in .length terms, huge in UTF-8.
    const huge = JSON.stringify({
      title: "🔥".repeat(40_000),
      fields: [],
    });
    const parseSpy = vi.spyOn(JSON, "parse");
    try {
      const res = await saveCheckInDraftFromAction(
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

  it("malformed JSON and missing args fail typed before the service", async () => {
    const { saveCheckInDraftFromAction } =
      await import("../../lib/checkin/forms-boundary");
    for (const draftJson of ["", "not json", "{"]) {
      const res = await saveCheckInDraftFromAction(
        session,
        { workspaceId: ws, formId: "f1", expectedRevision: 1, draftJson },
        { db: {} as never },
      );
      expect(res).toEqual({ ok: false, message: INVALID });
    }
  });
});

describe("P-025-A boundary — closed error vocabulary maps to safe copy", () => {
  const run = async (thrown: unknown) => {
    const { saveCheckInDraftFromAction } =
      await import("../../lib/checkin/forms-boundary");
    const spy = vi
      .spyOn(service, "saveCheckInFormDraft")
      .mockRejectedValue(thrown);
    try {
      return await saveCheckInDraftFromAction(
        session,
        {
          workspaceId: ws,
          formId: "f1",
          expectedRevision: 1,
          draftJson: JSON.stringify({ title: "T", fields: [] }),
        },
        { db: {} as never },
      );
    } finally {
      spy.mockRestore();
    }
  };

  it("maps each typed code to its pinned message; unknown → GENERIC", async () => {
    const cases: [CheckInFormError["code"], string][] = [
      ["invalid_input", INVALID],
      ["forbidden_field_id", INVALID],
      ["stale_revision", STALE],
      ["form_archived", ARCHIVED],
      ["no_open_draft", NO_DRAFT],
      ["publish_incomplete", INCOMPLETE],
      ["serialization_conflict", CONFLICT],
      ["form_not_accessible", DENIED],
    ];
    for (const [code, message] of cases) {
      expect(await run(new CheckInFormError(code))).toEqual({
        ok: false,
        message,
      });
    }
    expect(
      await run(
        new AccessDeniedError("role_denied", "checkinFormDefinitions", "write"),
      ),
    ).toEqual({ ok: false, message: DENIED });
    expect(await run(new Error("boom"))).toEqual({
      ok: false,
      message: GENERIC,
    });
  });
});
