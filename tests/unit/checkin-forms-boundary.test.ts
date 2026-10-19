// P-025-A — Check-In forms server boundary contract. LIBRARY ADAPTER tests:
// boundary input binding, error mapping, and delegation seams — NOT
// HTTP/CSRF/session security (that is asserted at the route/integration
// layer). The guarded service carries real authorization proof separately.

import { describe, expect, it, vi } from "vitest";

import * as service from "../../lib/checkin/forms";

const session = { user: { id: "u1" } } as never;
const ws = "w1";

// Pinned safe-message contract (exact strings — never codes/internals):
const INVALID = "Check the form details and try again.";

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
