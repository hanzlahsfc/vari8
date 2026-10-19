import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assignTemplateFromAction,
  cancelSetupAssignmentFromAction,
  listAssignFormChoices,
  listClientSetupsForWorkspace,
} from "../../lib/coaching/client-setup-boundary";

vi.mock("../../lib/coaching/client-setup", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/coaching/client-setup")
  >("../../lib/coaching/client-setup");
  return {
    ...actual,
    createClientSetupAssignment: vi.fn(),
    cancelClientSetupAssignment: vi.fn(),
    listClientSetups: vi.fn(),
    listClientSetupPinIds: vi.fn(),
    listAssignableSetupClients: vi.fn(),
    listAssignableTemplates: vi.fn(),
    resolveAssignSelection: vi.fn(),
    resolveCancelSelection: vi.fn(),
  };
});

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

const INVALID = "Check the form details and try again.";
const OFF = "This feature is not available.";

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
      "listAssignFormChoices",
      () =>
        listAssignFormChoices(
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
          {
            workspaceId: "w",
            clientIndex: 0,
            templateIndex: 0,
            listFingerprint: "fp",
          },
          { db: unreachableDb },
        ),
    ],
    [
      "cancelSetupAssignmentFromAction",
      () =>
        cancelSetupAssignmentFromAction(
          session,
          { workspaceId: "w", pinIndex: 0, rowFingerprint: "fp" },
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
  it("rejects overlong/missing/malformed inputs before delegating", async () => {
    flagOn();
    const long = "x".repeat(200);
    expect(
      await assignTemplateFromAction(
        session,
        {
          workspaceId: long,
          clientIndex: 0,
          templateIndex: 0,
          listFingerprint: "fp",
        },
        { db: unreachableDb },
      ),
    ).toEqual({ ok: false, message: INVALID });
    expect(
      await cancelSetupAssignmentFromAction(
        session,
        { workspaceId: "w", pinIndex: 0, rowFingerprint: "" },
        { db: unreachableDb },
      ),
    ).toEqual({ ok: false, message: INVALID });
    expect(
      await assignTemplateFromAction(
        session,
        {
          workspaceId: "w",
          clientIndex: -1,
          templateIndex: 0,
          listFingerprint: "fp",
        },
        { db: unreachableDb },
      ),
    ).toEqual({ ok: false, message: INVALID });
    expect(
      await cancelSetupAssignmentFromAction(
        session,
        { workspaceId: "w", pinIndex: 0.5, rowFingerprint: "fp" },
        { db: unreachableDb },
      ),
    ).toEqual({ ok: false, message: INVALID });
    expect(createClientSetupAssignment).not.toHaveBeenCalled();
    expect(cancelClientSetupAssignment).not.toHaveBeenCalled();
  });
});
