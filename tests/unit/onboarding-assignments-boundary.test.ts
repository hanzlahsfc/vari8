import { afterEach, describe, expect, it, vi } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  assignFormFromAction,
  cancelAssignmentFromAction,
  listAssignableClientsForWorkspace,
  listAssignableFormsForWorkspace,
  listAssignmentsForWorkspace,
  replaceAssignmentFromAction,
} from "../../lib/onboarding/assignments-boundary";
import { OnboardingAssignmentError } from "../../lib/onboarding/assignments-gate";

vi.mock("../../lib/onboarding/assignments", () => ({
  createOnboardingAssignment: vi.fn(),
  replaceOnboardingAssignment: vi.fn(),
  cancelOnboardingAssignment: vi.fn(),
  listOnboardingAssignments: vi.fn(),
  listAssignableClients: vi.fn(),
  listAssignableForms: vi.fn(),
}));

import {
  cancelOnboardingAssignment,
  createOnboardingAssignment,
} from "../../lib/onboarding/assignments";

/**
 * P-013 assignments boundary — pure binding/mapping coverage.
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

const FLAG_KEY = "ENABLE_ONBOARDING_ASSIGNMENTS";

function flagOn() {
  process.env[FLAG_KEY] = "1";
}
function flagOff() {
  delete process.env[FLAG_KEY];
}

afterEach(() => {
  flagOff();
});

describe("P-013 boundary — flag-off fails before any input work", () => {
  it.each([
    [
      "listAssignmentsForWorkspace",
      () =>
        listAssignmentsForWorkspace(
          session,
          { workspaceId: "w" },
          { db: unreachableDb },
        ),
    ],
    [
      "listAssignableClientsForWorkspace",
      () =>
        listAssignableClientsForWorkspace(
          session,
          { workspaceId: "w" },
          { db: unreachableDb },
        ),
    ],
    [
      "listAssignableFormsForWorkspace",
      () =>
        listAssignableFormsForWorkspace(
          session,
          { workspaceId: "w" },
          { db: unreachableDb },
        ),
    ],
    [
      "assignFormFromAction",
      () =>
        assignFormFromAction(
          session,
          { workspaceId: "w", clientProfileId: "c", formId: "f" },
          { db: unreachableDb },
        ),
    ],
    [
      "replaceAssignmentFromAction",
      () =>
        replaceAssignmentFromAction(
          session,
          { workspaceId: "w", assignmentId: "a" },
          { db: unreachableDb },
        ),
    ],
    [
      "cancelAssignmentFromAction",
      () =>
        cancelAssignmentFromAction(
          session,
          { workspaceId: "w", assignmentId: "a" },
          { db: unreachableDb },
        ),
    ],
  ])("%s returns the feature-off result", async (_name, call) => {
    flagOff();
    const result = await call();
    expect(result).toEqual({ ok: false, message: OFF });
  });

  it("feature-off wins over malformed input — the flag precedes binding", async () => {
    flagOff();
    const result = await assignFormFromAction(
      session,
      {
        workspaceId: 42 as unknown as string,
        clientProfileId: null as unknown as string,
        formId: undefined as unknown as string,
      },
      { db: unreachableDb },
    );
    expect(result).toEqual({ ok: false, message: OFF });
  });
});

describe("P-013 boundary — input binding (flag on)", () => {
  it.each([
    [
      "non-string workspaceId",
      { workspaceId: 7, clientProfileId: "c", formId: "f" },
    ],
    [
      "empty clientProfileId",
      { workspaceId: "w", clientProfileId: "", formId: "f" },
    ],
    [
      "oversized formId",
      { workspaceId: "w", clientProfileId: "c", formId: "x".repeat(129) },
    ],
    [
      "missing formId",
      { workspaceId: "w", clientProfileId: "c" } as unknown as {
        workspaceId: string;
        clientProfileId: string;
        formId: string;
      },
    ],
  ])("create rejects %s before service delegation", async (_n, input) => {
    flagOn();
    const result = await assignFormFromAction(
      session,
      input as { workspaceId: string; clientProfileId: string; formId: string },
      { db: unreachableDb },
    );
    expect(result).toEqual({ ok: false, message: INVALID });
  });

  it.each([
    [
      "replace",
      () =>
        replaceAssignmentFromAction(
          session,
          { workspaceId: "w", assignmentId: "" },
          { db: unreachableDb },
        ),
    ],
    [
      "cancel",
      () =>
        cancelAssignmentFromAction(
          session,
          { workspaceId: "w", assignmentId: 3 as unknown as string },
          { db: unreachableDb },
        ),
    ],
  ])("%s rejects a bad assignmentId before delegation", async (_n, call) => {
    flagOn();
    expect(await call()).toEqual({ ok: false, message: INVALID });
  });
});

describe("P-013 boundary — error mapping (flag on)", () => {
  const createInput = { workspaceId: "w", clientProfileId: "c", formId: "f" };
  const cancelInput = { workspaceId: "w", assignmentId: "a" };

  it.each([
    ["invalid_input", INVALID],
    ["assignment_not_accessible", DENIED],
    ["assignment_not_active", "This assignment is no longer active."],
    ["client_not_eligible", "This client can't be assigned a form."],
    ["form_not_eligible", "This form can't be assigned right now."],
    [
      "assignment_conflict",
      "This client already has an active assignment for this form.",
    ],
    ["serialization_conflict", "A conflict occurred. Please try again."],
  ])("maps %s to a stable safe message", async (code, message) => {
    flagOn();
    vi.mocked(createOnboardingAssignment).mockRejectedValueOnce(
      new OnboardingAssignmentError(code as never),
    );
    const result = await assignFormFromAction(session, createInput, {
      db: unreachableDb,
    });
    expect(result).toEqual({ ok: false, message });
  });

  it("maps AccessDeniedError to the non-disclosing denial", async () => {
    flagOn();
    vi.mocked(createOnboardingAssignment).mockRejectedValueOnce(
      new AccessDeniedError("not_assigned", "onboardingAssignments", "write"),
    );
    const result = await assignFormFromAction(session, createInput, {
      db: unreachableDb,
    });
    expect(result).toEqual({ ok: false, message: DENIED });
  });

  it("maps unknown failures to the generic message", async () => {
    flagOn();
    vi.mocked(cancelOnboardingAssignment).mockRejectedValueOnce(
      new Error("db blew up with SELECT * leak"),
    );
    const result = await cancelAssignmentFromAction(session, cancelInput, {
      db: unreachableDb,
    });
    expect(result).toEqual({ ok: false, message: GENERIC });
  });
});
