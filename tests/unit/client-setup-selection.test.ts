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
  listAssignableSetupClients,
  listAssignableTemplates,
  listClientSetups,
  resolveAssignSelection,
  resolveCancelSelection,
} from "../../lib/coaching/client-setup";

/**
 * P-016-R2 — ID-free browser selection contract.
 *
 * The browser submits bounded positional indices plus an opaque list
 * fingerprint — never raw client/setup/pin/template/version/member ids.
 * Boundary list outputs strip internal ids before serialization; resolution
 * re-fetches the authorized list and fails closed on stale/tampered input
 * with zero mutation and zero audit.
 */

const session = { user: { id: "u_staff" } };
const FLAG_KEY = "ENABLE_CLIENT_SETUP";

const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";
const OFF = "This feature is not available.";
const STALE =
  "The list changed while you were working — refresh and try again.";

const INTERNAL_ID = /^(c[a-z0-9]{20,}|p016_|s1h_|ws_|tpl_|ver_)/;

function flagOn() {
  process.env[FLAG_KEY] = "1";
}
function flagOff() {
  delete process.env[FLAG_KEY];
}

const stubDb = { marker: "stub" } as never;

afterEach(() => {
  flagOff();
  vi.clearAllMocks();
});

function collectStrings(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value))
    for (const v of value) collectStrings(v, found);
  else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, found);
  }
  return found;
}

describe("P-016-R2 boundary — serialized choices carry no internal ids", () => {
  it("assign form choices return display labels + one fingerprint, no ids", async () => {
    flagOn();
    vi.mocked(listAssignableSetupClients).mockResolvedValueOnce([
      { id: "p016_client_one_id", name: "Client One" },
      { id: "p016_client_two_id", name: "Client Two" },
    ]);
    vi.mocked(listAssignableTemplates).mockResolvedValueOnce([
      {
        id: "p016_template_id",
        name: "Template",
        latestVersionSeq: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const result = await listAssignFormChoices(
      session,
      { workspaceId: "w" },
      { db: stubDb },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const strings = collectStrings(result.value);
    // Display labels survive; internal ids and raw identity fields do not.
    expect(strings).toContain("Client One");
    expect(strings).toContain("Template");
    for (const s of strings) expect(s).not.toMatch(INTERNAL_ID);
    expect(strings.some((s) => s.includes("_id"))).toBe(false);
    // A single list fingerprint covers both pickers for staleness checks.
    expect(typeof result.value.listFingerprint).toBe("string");
    expect(result.value.listFingerprint.length).toBe(64);
  });

  it("setup rows return display fields + positional index, no ids", async () => {
    flagOn();
    vi.mocked(listClientSetups).mockResolvedValueOnce({
      items: [
        {
          index: 0,
          clientName: "Client One",
          templateName: "Template",
          templateArchived: false,
          versionSeq: 2,
          status: "ACTIVE" as const,
          assignedAt: "2026-01-01T00:00:00.000Z",
          endedAt: null,
        },
      ],
      nextCursor: null,
      fingerprint: "a".repeat(64),
    });
    const result = await listClientSetupsForWorkspace(
      session,
      { workspaceId: "w" },
      { db: stubDb },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const strings = collectStrings(result.value);
    expect(strings).toContain("Client One");
    for (const s of strings) expect(s).not.toMatch(INTERNAL_ID);
    const row = result.value.items[0] as unknown as Record<string, unknown>;
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("templateId");
    expect(row).not.toHaveProperty("clientSetupId");
    expect(typeof row.index).toBe("number");
    expect(typeof result.value.fingerprint).toBe("string");
  });
});

describe("P-016-R2 boundary — positional assign resolution", () => {
  it("valid index+fingerprint resolves through the selection helper", async () => {
    flagOn();
    vi.mocked(resolveAssignSelection).mockResolvedValueOnce({
      clientProfileId: "cp1",
      templateId: "t1",
    });
    vi.mocked(createClientSetupAssignment).mockResolvedValueOnce({
      assignmentId: "a1",
    });
    const result = await assignTemplateFromAction(
      session,
      {
        workspaceId: "w",
        clientIndex: 0,
        templateIndex: 1,
        listFingerprint: "fp",
      },
      { db: stubDb },
    );
    expect(result.ok).toBe(true);
    expect(resolveAssignSelection).toHaveBeenCalledWith(
      session,
      {
        workspaceId: "w",
        clientIndex: 0,
        templateIndex: 1,
        fingerprint: "fp",
      },
      stubDb,
    );
    expect(createClientSetupAssignment).toHaveBeenCalledWith(
      session,
      { workspaceId: "w", clientProfileId: "cp1", templateId: "t1" },
      stubDb,
    );
  });

  it.each([
    ["negative index", { clientIndex: -1, templateIndex: 0 }],
    ["non-integer index", { clientIndex: 0.5, templateIndex: 0 }],
    ["NaN index", { clientIndex: Number.NaN, templateIndex: 0 }],
    ["missing fingerprint", { clientIndex: 0, templateIndex: 0 }],
  ])("rejects %s without touching the service", async (_name, fields) => {
    flagOn();
    const result = await assignTemplateFromAction(
      session,
      { workspaceId: "w", ...fields } as never,
      { db: stubDb },
    );
    expect(result.ok).toBe(false);
    expect(resolveAssignSelection).not.toHaveBeenCalled();
    expect(createClientSetupAssignment).not.toHaveBeenCalled();
  });

  it("maps stale fingerprint to the refresh message", async () => {
    flagOn();
    const { ClientSetupError } =
      await import("../../lib/coaching/client-setup-gate");
    vi.mocked(resolveAssignSelection).mockRejectedValueOnce(
      new ClientSetupError("stale_selection"),
    );
    const result = await assignTemplateFromAction(
      session,
      {
        workspaceId: "w",
        clientIndex: 0,
        templateIndex: 0,
        listFingerprint: "fp",
      },
      { db: stubDb },
    );
    expect(result).toEqual({ ok: false, message: STALE });
    expect(createClientSetupAssignment).not.toHaveBeenCalled();
  });

  it("flag-off refuses before binding positional input", async () => {
    flagOff();
    const unreachable = new Proxy({} as never, {
      get: () => {
        throw new Error("reached");
      },
    });
    const result = await assignTemplateFromAction(
      session,
      {
        workspaceId: "w",
        clientIndex: 0,
        templateIndex: 0,
        listFingerprint: "fp",
      },
      { db: unreachable },
    );
    expect(result).toEqual({ ok: false, message: OFF });
  });
});

describe("P-016-R2 boundary — positional cancel resolution", () => {
  it("valid index+fingerprint resolves the server-side pin", async () => {
    flagOn();
    vi.mocked(resolveCancelSelection).mockResolvedValueOnce({
      pinId: "pin1",
    });
    vi.mocked(cancelClientSetupAssignment).mockResolvedValueOnce(undefined);
    const result = await cancelSetupAssignmentFromAction(
      session,
      { workspaceId: "w", pinIndex: 2, rowFingerprint: "fp" },
      { db: stubDb },
    );
    expect(result.ok).toBe(true);
    expect(resolveCancelSelection).toHaveBeenCalledWith(
      session,
      { workspaceId: "w", pinIndex: 2, fingerprint: "fp" },
      stubDb,
    );
    expect(cancelClientSetupAssignment).toHaveBeenCalledWith(
      session,
      { workspaceId: "w", pinId: "pin1" },
      stubDb,
    );
  });

  it.each([
    ["negative", -1],
    ["non-integer", 0.5],
    ["NaN", Number.NaN],
  ])("rejects a %s index without touching the service", async (_n, idx) => {
    flagOn();
    const result = await cancelSetupAssignmentFromAction(
      session,
      { workspaceId: "w", pinIndex: idx, rowFingerprint: "fp" },
      { db: stubDb },
    );
    expect(result.ok).toBe(false);
    expect(resolveCancelSelection).not.toHaveBeenCalled();
    expect(cancelClientSetupAssignment).not.toHaveBeenCalled();
  });

  it("maps stale row fingerprint to the refresh message", async () => {
    flagOn();
    const { ClientSetupError } =
      await import("../../lib/coaching/client-setup-gate");
    vi.mocked(resolveCancelSelection).mockRejectedValueOnce(
      new ClientSetupError("stale_selection"),
    );
    const result = await cancelSetupAssignmentFromAction(
      session,
      { workspaceId: "w", pinIndex: 0, rowFingerprint: "fp" },
      { db: stubDb },
    );
    expect(result).toEqual({ ok: false, message: STALE });
    expect(cancelClientSetupAssignment).not.toHaveBeenCalled();
  });

  it("denied resolution maps to the safe message", async () => {
    flagOn();
    const { ClientSetupError } =
      await import("../../lib/coaching/client-setup-gate");
    vi.mocked(resolveCancelSelection).mockRejectedValueOnce(
      new ClientSetupError("assignment_not_accessible"),
    );
    const result = await cancelSetupAssignmentFromAction(
      session,
      { workspaceId: "w", pinIndex: 0, rowFingerprint: "fp" },
      { db: stubDb },
    );
    expect(result).toEqual({ ok: false, message: DENIED });
    void INVALID;
  });
});
