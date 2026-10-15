import { describe, expect, it, vi } from "vitest";

/**
 * SOLO-COACH-I1 — coach-assignment server actions (decision 111).
 * Action-layer contract: session resolution first, then bounded FormData
 * parsing (single values, length-capped, well-formed), role allowlist,
 * then the guarded services — which independently authorize inside their
 * transactions. Errors map to safe strings; denial is never disguised as
 * success; no mutation without a POSTed action.
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u_owner" } })),
}));
vi.mock("@/lib/workspace/clients", () => ({
  assignCoach: vi.fn(async () => ({ changed: true })),
  setPrimaryCoach: vi.fn(async () => ({ changed: true })),
  removeClientAssignment: vi.fn(async () => ({ changed: true })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/auth";
import {
  assignCoach,
  removeClientAssignment,
  setPrimaryCoach,
} from "@/lib/workspace/clients";
import {
  assignCoachAction,
  removeCoachAssignmentAction,
  setPrimaryCoachAction,
} from "../../app/workspace/[workspaceId]/clients/[clientProfileId]/coaches/actions";

const mockedAuth = vi.mocked(auth);
const mockedAssign = vi.mocked(assignCoach);
const mockedSetPrimary = vi.mocked(setPrimaryCoach);
const mockedRemove = vi.mocked(removeClientAssignment);

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const VALID = {
  workspaceId: "w_1",
  clientProfileId: "cp_1",
  coachMemberId: "m_1",
};

describe("SOLO-COACH-I1 coach-assignment actions", () => {
  it("assignCoachAction: happy path calls the service and returns ok", async () => {
    const result = await assignCoachAction(
      { status: "idle" } as never,
      fd({ ...VALID, role: "PRIMARY" }),
    );
    expect(result).toMatchObject({ ok: true });
    expect(mockedAssign).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: "u_owner" } }),
      {
        workspaceId: "w_1",
        clientProfileId: "cp_1",
        coachMemberId: "m_1",
        role: "PRIMARY",
      },
      expect.anything(),
    );
  });

  it("unauthenticated session denies before parsing or service work", async () => {
    mockedAuth.mockResolvedValueOnce(null as never);
    const result = await assignCoachAction(
      { status: "idle" } as never,
      fd({ ...VALID, role: "COACH" }),
    );
    expect(result).toMatchObject({ ok: false });
    expect(mockedAssign).not.toHaveBeenCalled();
  });

  it.each([
    ["missing coachMemberId", { workspaceId: "w_1", clientProfileId: "cp_1", role: "COACH" }],
    ["duplicate workspaceId", null],
    ["oversized workspaceId", { ...VALID, role: "COACH", workspaceId: "x".repeat(500) }],
    ["out-of-allowlist role", { ...VALID, role: "SUPERADMIN" }],
  ])("assignCoachAction rejects %s without calling the service", async (_label, entries) => {
    const f = new FormData();
    if (entries === null) {
      f.append("workspaceId", "w_1");
      f.append("workspaceId", "w_2");
      f.append("clientProfileId", "cp_1");
      f.append("coachMemberId", "m_1");
      f.append("role", "COACH");
    } else {
      for (const [k, v] of Object.entries(entries)) f.append(k, v);
    }
    const result = await assignCoachAction({ status: "idle" } as never, f);
    expect(result).toMatchObject({ ok: false });
    expect(mockedAssign).not.toHaveBeenCalled();
  });

  it("service denial maps to a safe denied message — never a success", async () => {
    const { AccessDeniedError } = await import("../../lib/auth/guard");
    mockedAssign.mockRejectedValueOnce(
      new AccessDeniedError("role_denied", "clientAssignments", "write"),
    );
    const result = await assignCoachAction(
      { status: "idle" } as never,
      fd({ ...VALID, role: "COACH" }),
    );
    expect(result).toMatchObject({ ok: false });
    expect(
      (result as { ok: false; message: string }).message,
    ).not.toMatch(/role_denied|w_1|cp_1|m_1/);
  });

  it("service WorkspaceServiceError codes map to safe strings", async () => {
    const { WorkspaceServiceError } = await import(
      "../../lib/workspace/clients"
    );
    mockedAssign.mockRejectedValueOnce(
      new WorkspaceServiceError("member_not_eligible"),
    );
    const result = await assignCoachAction(
      { status: "idle" } as never,
      fd({ ...VALID, role: "PRIMARY" }),
    );
    expect(result).toMatchObject({ ok: false });
    expect(
      (result as { ok: false; message: string }).message,
    ).not.toContain("member_not_eligible");
  });

  it("setPrimaryCoachAction and removeCoachAssignmentAction bind the three route IDs", async () => {
    const p = await setPrimaryCoachAction({ status: "idle" } as never, fd(VALID));
    expect(p).toMatchObject({ ok: true });
    expect(mockedSetPrimary).toHaveBeenCalledWith(
      expect.anything(),
      VALID,
      expect.anything(),
    );
    const r = await removeCoachAssignmentAction(
      { status: "idle" } as never,
      fd(VALID),
    );
    expect(r).toMatchObject({ ok: true });
    expect(mockedRemove).toHaveBeenCalledWith(
      expect.anything(),
      VALID,
      expect.anything(),
    );
  });
});
