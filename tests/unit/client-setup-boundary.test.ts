import { afterEach, describe, expect, it, vi } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  assignTemplateFromAction,
  cancelSetupAssignmentFromAction,
  listAssignableClientsForSetup,
  listAssignableTemplatesForSetup,
  listClientSetupsForWorkspace,
} from "../../lib/coaching/client-setup-boundary";
import { ClientSetupError } from "../../lib/coaching/client-setup-gate";

vi.mock("../../lib/coaching/client-setup", () => ({
  createClientSetupAssignment: vi.fn(),
  cancelClientSetupAssignment: vi.fn(),
  listClientSetups: vi.fn(),
  listAssignableSetupClients: vi.fn(),
  listAssignableTemplates: vi.fn(),
}));

import {
  cancelClientSetupAssignment,
  createClientSetupAssignment,
} from "../../lib/coaching/client-setup";

/**
 * P-016 client-setup boundary — pure binding/mapping coverage.
 *
 * Every entry point checks the dev flag BEFORE binding inputs, so flag-off
 * calls never reach the service and never touch the database (the `db` stub
 * here throws if ever reached — any call hitting it fails the test).
 * Failure results carry only stable safe messages.
 */

const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";
const OFF = "This feature is not available.";
const GENERIC = "Something went wrong. Please try again in a moment.";

const unreachableDb = new Proxy({} as never, {
  get: () => {
    throw new Error("service/db reached — flag-off must not delegate");
  },
});

const session = { user: { id: "u_staff" } };

const FLAG_KEY = "ENABLE_CLIENT_SETUP";

function flagOn() {
  process.env[FLAG_KEY] = "1";
}
function flagOff() {
  delete process.env[FLAG_KEY];
}

afterEach(() => {
  flagOff();
  vi.clearAllMocks();
});

describe("P-016 boundary — flag-off fails before any input work", () => {
  it.each([
    [
      "listClientSetupsForWorkspace",
      () =>
        listClientSetupsForWorkspace(
          session,
          { workspaceId: "w" },
          { db: unreachableDb },
        ),
    ],
    [
      "listAssignableClientsForSetup",
      () =>
        listAssignableClientsForSetup(
          session,
          { workspaceId: "w" },
          { db: unreachableDb },
        ),
    ],
    [
      "listAssignableTemplatesForSetup",
      () =>
        listAssignableTemplatesForSetup(
          session,
          { workspaceId: "w" },
          { db: unreachableDb },
        ),
    ],
    [
      "assignTemplateFromAction",
      () =>
        assignTemplateFromAction(
          session,
          { workspaceId: "w", clientProfileId: "c", templateId: "t" },
          { db: unreachableDb },
        ),
    ],
    [
      "cancelSetupAssignmentFromAction",
      () =>
        cancelSetupAssignmentFromAction(
          session,
          { workspaceId: "w", pinId: "p" },
          { db: unreachableDb },
        ),
    ],
  ])(
    "%s returns the feature-off result without touching the db",
    async (_name, call) => {
      flagOff();
      const result = await call();
      expect(result).toEqual({ ok: false, message: OFF });
    },
  );
});

describe("P-016 boundary — input binding", () => {
  it("rejects overlong/missing ids before delegating", async () => {
    flagOn();
    const long = "x".repeat(200);
    expect(
      await assignTemplateFromAction(
        session,
        { workspaceId: long, clientProfileId: "c", templateId: "t" },
        { db: unreachableDb },
      ),
    ).toEqual({ ok: false, message: INVALID });
    expect(
      await cancelSetupAssignmentFromAction(
        session,
        { workspaceId: "w", pinId: "" },
        { db: unreachableDb },
      ),
    ).toEqual({ ok: false, message: INVALID });
    expect(createClientSetupAssignment).not.toHaveBeenCalled();
    expect(cancelClientSetupAssignment).not.toHaveBeenCalled();
  });
});

describe("P-016 boundary — error mapping", () => {
  it("maps service error codes to stable messages", async () => {
    flagOn();
    for (const [code, message] of [
      ["assignment_not_accessible", DENIED],
      ["assignment_not_active", "This assignment is no longer active."],
      ["client_not_eligible", "This client can't be assigned a template."],
      ["template_not_eligible", "This template can't be assigned right now."],
      [
        "assignment_conflict",
        "This client already has a current template assignment.",
      ],
      ["serialization_conflict", "A conflict occurred. Please try again."],
    ] as const) {
      vi.mocked(cancelClientSetupAssignment).mockRejectedValueOnce(
        new ClientSetupError(code),
      );
      const result = await cancelSetupAssignmentFromAction(
        session,
        { workspaceId: "w", pinId: "p" },
        { db: {} as never },
      );
      expect(result).toEqual({ ok: false, message });
    }
  });

  it("maps access denials and unknown errors to non-disclosing messages", async () => {
    flagOn();
    vi.mocked(cancelClientSetupAssignment).mockRejectedValueOnce(
      new AccessDeniedError("not_assigned", "clientSetups", "write"),
    );
    expect(
      await cancelSetupAssignmentFromAction(
        session,
        { workspaceId: "w", pinId: "p" },
        { db: {} as never },
      ),
    ).toEqual({ ok: false, message: DENIED });
    vi.mocked(cancelClientSetupAssignment).mockRejectedValueOnce(
      new Error("boom"),
    );
    expect(
      await cancelSetupAssignmentFromAction(
        session,
        { workspaceId: "w", pinId: "p" },
        { db: {} as never },
      ),
    ).toEqual({ ok: false, message: GENERIC });
  });
});
