import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  deriveFirstRunChecklist,
  readFirstRunChecklist,
  readFirstRunFlags,
} from "../../lib/dashboard/first-run";

const session = (id = "u1") => ({ user: { id } }) as never;
const ws = "w1";

type FlagCounts = {
  clientProfiles?: number;
  checkInForms?: number;
  onboardingForms?: number;
  clientPlans?: number;
  mealPlans?: number;
  trainingPrograms?: number;
  iifymPlans?: number;
  supplementPlans?: number;
};

function fakePrisma(
  counts: FlagCounts = {},
  member: { role: string; status: string } | null = {
    role: "WORKSPACE_OWNER",
    status: "ACTIVE",
  },
) {
  const delegates = {
    user: {
      findUnique: vi.fn(async () => ({
        id: "u1",
        platformRole: "USER",
        status: "ACTIVE",
      })),
    },
    workspace: {
      findUnique: vi.fn(async () => ({ id: ws, status: "ACTIVE" })),
    },
    workspaceMember: {
      findUnique: vi.fn(async () =>
        member === null ? null : { id: "m1", ...member },
      ),
    },
    clientProfile: {
      count: vi.fn(async () => counts.clientProfiles ?? 0),
    },
    checkInForm: {
      count: vi.fn(async () => counts.checkInForms ?? 0),
    },
    onboardingForm: {
      count: vi.fn(async () => counts.onboardingForms ?? 0),
    },
    clientPlan: {
      count: vi.fn(async () => counts.clientPlans ?? 0),
    },
    mealPlan: {
      count: vi.fn(async () => counts.mealPlans ?? 0),
    },
    trainingProgram: {
      count: vi.fn(async () => counts.trainingPrograms ?? 0),
    },
    iifymPlan: {
      count: vi.fn(async () => counts.iifymPlans ?? 0),
    },
    supplementPlan: {
      count: vi.fn(async () => counts.supplementPlans ?? 0),
    },
  };
  return {
    client: delegates as unknown as PrismaClient,
    delegates,
  };
}

describe("deriveFirstRunChecklist", () => {
  it("is visible with zero of three done on a fresh workspace", () => {
    const checklist = deriveFirstRunChecklist({
      hasClient: false,
      hasForm: false,
      hasPlan: false,
    });
    expect(checklist).toEqual({
      hasClient: false,
      hasForm: false,
      hasPlan: false,
      completed: 0,
      total: 3,
      visible: true,
    });
  });

  it("counts each completed flag and stays visible while any is open", () => {
    const checklist = deriveFirstRunChecklist({
      hasClient: true,
      hasForm: false,
      hasPlan: true,
    });
    expect(checklist.completed).toBe(2);
    expect(checklist.visible).toBe(true);
  });

  it("hides once every flag is done, which is the populated-workspace rule", () => {
    const checklist = deriveFirstRunChecklist({
      hasClient: true,
      hasForm: true,
      hasPlan: true,
    });
    expect(checklist.completed).toBe(3);
    expect(checklist.visible).toBe(false);
  });
});

describe("readFirstRunFlags", () => {
  it("returns all false for a fresh workspace", async () => {
    const { client } = fakePrisma();
    const flags = await readFirstRunFlags(
      session(),
      { workspaceId: ws },
      client,
    );
    expect(flags).toEqual({
      hasClient: false,
      hasForm: false,
      hasPlan: false,
    });
  });

  it("sees an added client through the non-archived roster predicate", async () => {
    const { client, delegates } = fakePrisma({ clientProfiles: 1 });
    const flags = await readFirstRunFlags(
      session(),
      { workspaceId: ws },
      client,
    );
    expect(flags.hasClient).toBe(true);
    expect(delegates.clientProfile.count).toHaveBeenCalledWith({
      where: { workspaceId: ws, archivedAt: null },
    });
  });

  it("ticks the form flag for a check-in form or an onboarding form", async () => {
    const viaCheckIn = fakePrisma({ checkInForms: 1 });
    expect(
      (
        await readFirstRunFlags(
          session(),
          { workspaceId: ws },
          viaCheckIn.client,
        )
      ).hasForm,
    ).toBe(true);
    const viaOnboarding = fakePrisma({ onboardingForms: 1 });
    expect(
      (
        await readFirstRunFlags(
          session(),
          { workspaceId: ws },
          viaOnboarding.client,
        )
      ).hasForm,
    ).toBe(true);
    expect(viaCheckIn.delegates.checkInForm.count).toHaveBeenCalledWith({
      where: { workspaceId: ws, status: "ACTIVE" },
    });
  });

  it("ticks the plan flag for any plan record in the workspace", async () => {
    const sources: (keyof FlagCounts)[] = [
      "clientPlans",
      "mealPlans",
      "trainingPrograms",
      "iifymPlans",
      "supplementPlans",
    ];
    for (const source of sources) {
      const { client } = fakePrisma({ [source]: 1 });
      const flags = await readFirstRunFlags(
        session(),
        { workspaceId: ws },
        client,
      );
      expect(flags.hasPlan).toBe(true);
    }
    const none = fakePrisma();
    expect(
      (await readFirstRunFlags(session(), { workspaceId: ws }, none.client))
        .hasPlan,
    ).toBe(false);
  });

  it("denies staff-absent callers with the closed AccessDeniedError", async () => {
    const outsider = fakePrisma({}, null);
    await expect(
      readFirstRunFlags(session(), { workspaceId: ws }, outsider.client),
    ).rejects.toThrow(AccessDeniedError);
    const clientMember = fakePrisma({}, { role: "CLIENT", status: "ACTIVE" });
    await expect(
      readFirstRunFlags(session(), { workspaceId: ws }, clientMember.client),
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("readFirstRunChecklist", () => {
  it("composes flags into the mount condition the workspace page renders", async () => {
    const { client } = fakePrisma({ clientProfiles: 1, mealPlans: 2 });
    const checklist = await readFirstRunChecklist(
      session(),
      { workspaceId: ws },
      client,
    );
    expect(checklist).toEqual({
      hasClient: true,
      hasForm: false,
      hasPlan: true,
      completed: 2,
      total: 3,
      visible: true,
    });
  });
});
