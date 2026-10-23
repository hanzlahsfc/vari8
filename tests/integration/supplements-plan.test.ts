// PR-SUPP — supplement-plan backend against disposable PostgreSQL.
// Real schema, real transactions, real authorization: one saved plan per
// client, whole-plan save with revision CAS, ordered items, embedded
// product snapshot, the closed status set, structural audit only.
// Sessions are labeled identities; every role/workspace/assignment
// decision is re-resolved inside the serializable transaction.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { createStaticConsentPolicy } from "../../lib/consent";
import {
  readOwnSupplementPlan,
  readStaffSupplementPlan,
  viewStaffSupplementPlan,
  saveSupplementPlan,
  SupplementError,
} from "../../lib/supplements/service";
import {
  readOwnSupplementPlanFromAction,
  saveSupplementPlanFromAction,
} from "../../lib/supplements/boundary";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "supplements-dev-privacy-v1",
  HEALTH_DATA: "supplements-dev-health-v1",
});

const NOW = new Date("2026-10-23T12:00:00Z");

describe.skipIf(!enabled)("PR-SUPP supplement plan (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "supplement_plan_item","supplement_plan","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const uid = () => `supp${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = (now: Date = NOW) => ({
    db: prisma as never,
    registry: DEV_REGISTRY,
    now,
  });

  async function user(platformRole: "USER" | "PLATFORM_ADMIN" = "USER") {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Fixture ${uid()}`,
        platformRole,
        status: "ACTIVE",
      },
    });
  }
  async function ws() {
    return prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `sup-${uid()}`, status: "ACTIVE" },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status: "ACTIVE" },
    });
  }
  async function profile(workspaceId: string, userId: string) {
    return prisma.clientProfile.create({
      data: { workspaceId, userId, name: `Client ${uid()}` },
    });
  }
  async function consent(clientProfileId: string) {
    for (const [kind, version] of [
      ["PRIVACY_NOTICE", "supplements-dev-privacy-v1"],
      ["HEALTH_DATA", "supplements-dev-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId, kind, version },
      });
  }
  async function assignment(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
  ) {
    return prisma.clientAssignment.create({
      data: {
        workspaceId,
        clientProfileId,
        coachMemberId,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
  }

  async function setup() {
    const w = await ws();
    const ownerU = await user();
    const ownerMember = await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const coachU = await user();
    const coachMember = await member(w.id, coachU.id, "COACH");
    const asstU = await user();
    const asstMember = await member(w.id, asstU.id, "ASSISTANT_COACH");
    const supportU = await user();
    await member(w.id, supportU.id, "SUPPORT");
    const clientU = await user();
    await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    await consent(cp.id);
    await assignment(w.id, cp.id, coachMember.id);
    return {
      w,
      ownerU,
      ownerMember,
      coachU,
      coachMember,
      asstU,
      asstMember,
      supportU,
      clientU,
      cp,
    };
  }

  const product = {
    id: "prod_d3",
    brand: "Acme",
    name: "Vitamin D3 5600 IU",
    referenceQuantity: 1,
    quantityUnit: "capsules",
    declaredAmount: 5600,
    declaredUnit: "IU",
    url: "https://shop.example.test/d3",
  };
  const item = {
    id: "row_1",
    product,
    quantity: 2,
    doseUnit: "capsules",
    timing: "with breakfast",
    status: "must-have",
    notes: "daily",
  };

  const auditCount = (
    resourceId: string,
    action: "CREATE" | "UPDATE" | "READ",
  ) =>
    prisma.auditEvent.count({
      where: { resourceType: "supplement_plan", resourceId, action },
    });

  // ── Save + read happy path ──────────────────────────────────────────

  it("coach saves a plan; literal ordered items, snapshot and audit persist", async () => {
    const { w, coachU, cp } = await setup();
    const saved = await saveSupplementPlan(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        name: "Supplement plan",
        items: [
          item,
          {
            ...item,
            id: "row_2",
            timing: "before bed",
            status: "optional",
            notes: "",
          },
        ],
      },
      deps(),
    );
    expect(saved.revision).toBe(1);
    expect(await auditCount(saved.planId, "CREATE")).toBe(1);

    const view = await readStaffSupplementPlan(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(view.plan).not.toBeNull();
    expect(view.plan!.name).toBe("Supplement plan");
    expect(view.plan!.revision).toBe(1);
    expect(view.plan!.items).toHaveLength(2);
    expect(view.plan!.items[0].product.brand).toBe("Acme");
    expect(view.plan!.items[0].product.declaredAmount).toBe(5600);
    expect(view.plan!.items[0].product.declaredUnit).toBe("IU");
    expect(view.plan!.items[0].quantity).toBe(2);
    expect(view.plan!.items[0].status).toBe("must-have");
    expect(view.plan!.items[1].timing).toBe("before bed");
    expect(view.plan!.items[1].status).toBe("optional");
    expect(view.writeCapable).toBe(true);
    // Ordinary staff reads write NO audit (issue #161 acceptance 7).
    expect(await auditCount(saved.planId, "READ")).toBe(0);
    // The explicit staff view action surface writes exactly one READ.
    const viewed = await viewStaffSupplementPlan(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(viewed.plan!.revision).toBe(1);
    expect(await auditCount(saved.planId, "READ")).toBe(1);
  });

  it("whole-plan re-save replaces items, bumps revision and audits UPDATE", async () => {
    const { w, coachU, cp } = await setup();
    const first = await saveSupplementPlan(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        name: "Plan A",
        items: [item],
      },
      deps(),
    );
    const second = await saveSupplementPlan(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 1,
        name: "Plan B",
        items: [{ ...item, id: "row_9", timing: "morning", status: "none" }],
      },
      deps(),
    );
    expect(second.planId).toBe(first.planId);
    expect(second.revision).toBe(2);

    const rows = await prisma.supplementPlanItem.findMany({
      where: { planId: first.planId },
      orderBy: { position: "asc" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].timing).toBe("morning");
    expect(rows[0].status).toBe("NONE");
    const plan = await prisma.supplementPlan.findUniqueOrThrow({
      where: { id: first.planId },
    });
    expect(plan.name).toBe("Plan B");
    expect(await auditCount(first.planId, "UPDATE")).toBe(1);
  });

  it("stale expectedRevision is a conflict and writes nothing", async () => {
    const { w, coachU, cp } = await setup();
    const first = await saveSupplementPlan(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        name: "Plan",
        items: [item],
      },
      deps(),
    );
    await expect(
      saveSupplementPlan(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 0,
          name: "Clash",
          items: [{ ...item, notes: "other" }],
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "stale_revision" });
    const rows = await prisma.supplementPlanItem.count({
      where: { planId: first.planId },
    });
    expect(rows).toBe(1);
    expect(await auditCount(first.planId, "UPDATE")).toBe(0);
  });

  it("invalid items refuse before any write", async () => {
    const { w, coachU, cp } = await setup();
    for (const patch of [
      { quantity: 0 },
      { status: "taken" },
      { doseUnit: "grams" },
      { product: { ...product, url: "javascript:alert(1)" } },
      { timing: "t".repeat(201) },
    ])
      await expect(
        saveSupplementPlan(
          session(coachU.id),
          {
            workspaceId: w.id,
            clientProfileId: cp.id,
            expectedRevision: 0,
            name: "Plan",
            items: [{ ...item, ...patch }],
          },
          deps(),
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
    expect(
      await prisma.supplementPlan.count({ where: { workspaceId: w.id } }),
    ).toBe(0);
  });

  // ── Authorization matrix ────────────────────────────────────────────

  it("client reads the saved plan only, own scope", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const saved = await saveSupplementPlan(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        name: "Plan",
        items: [item],
      },
      deps(),
    );
    const own = await readOwnSupplementPlan(
      session(clientU.id),
      { workspaceId: w.id },
      deps(),
    );
    expect(own.plan!.items[0].timing).toBe("with breakfast");
    // Client-own reads write no audit (issue #161 acceptance 7).
    expect(await auditCount(saved.planId, "READ")).toBe(0);
    // Client write is denied.
    await expect(
      saveSupplementPlan(
        session(clientU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 1,
          name: "Hijack",
          items: [item],
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("unassigned owner reads but cannot write; assistant reads but cannot write", async () => {
    const { w, ownerU, asstU, asstMember, coachU, cp } = await setup();
    await saveSupplementPlan(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        name: "Plan",
        items: [item],
      },
      deps(),
    );
    const ownerView = await readStaffSupplementPlan(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(ownerView.plan).not.toBeNull();
    expect(ownerView.writeCapable).toBe(false);
    await expect(
      saveSupplementPlan(
        session(ownerU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 1,
          name: "X",
          items: [item],
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // The matrix gives assistants `assigned` read — one assignment row
    // per client, so reassign the client's coach to the assistant.
    await prisma.clientAssignment.updateMany({
      where: { clientProfileId: cp.id },
      data: { coachMemberId: asstMember.id },
    });
    const asstView = await readStaffSupplementPlan(
      session(asstU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(asstView.plan).not.toBeNull();
    await expect(
      saveSupplementPlan(
        session(asstU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 1,
          name: "X",
          items: [item],
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("unassigned coach, SUPPORT, foreign workspace and unauthenticated are denied", async () => {
    const { w, supportU, coachU, cp } = await setup();
    const saved = await saveSupplementPlan(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        name: "Plan",
        items: [item],
      },
      deps(),
    );
    const stray = await user();
    const strayMember = await member(w.id, stray.id, "COACH");
    void strayMember;
    await expect(
      readStaffSupplementPlan(
        session(stray.id),
        { workspaceId: w.id, clientProfileId: cp.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      readStaffSupplementPlan(
        session(supportU.id),
        { workspaceId: w.id, clientProfileId: cp.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    const foreign = await ws();
    const foreignOwnerU = await user();
    await member(foreign.id, foreignOwnerU.id, "WORKSPACE_OWNER");
    await expect(
      readStaffSupplementPlan(
        session(foreignOwnerU.id),
        { workspaceId: foreign.id, clientProfileId: cp.id },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "plan_not_accessible" });
    await expect(
      readStaffSupplementPlan(
        { user: { id: "" } },
        { workspaceId: w.id, clientProfileId: cp.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Denied access writes no audit and mutates no state.
    expect(await auditCount(saved.planId, "READ")).toBe(0);
    expect(
      await prisma.supplementPlan.findUniqueOrThrow({
        where: { id: saved.planId },
        select: { revision: true },
      }),
    ).toEqual({ revision: 1 });
  });

  it("PLATFORM_ADMIN is denied including the dual-role membership path", async () => {
    const { w, cp } = await setup();
    const adminU = await user("PLATFORM_ADMIN");
    await member(w.id, adminU.id, "WORKSPACE_OWNER");
    await expect(
      readStaffSupplementPlan(
        session(adminU.id),
        { workspaceId: w.id, clientProfileId: cp.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("foreign client reads only their own profile", async () => {
    const { w, coachU, cp } = await setup();
    const otherU = await user();
    await member(w.id, otherU.id, "CLIENT");
    const otherCp = await profile(w.id, otherU.id);
    await consent(otherCp.id);
    await saveSupplementPlan(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        name: "Plan",
        items: [item],
      },
      deps(),
    );
    await expect(
      readOwnSupplementPlan(session(otherU.id), { workspaceId: w.id }, deps()),
    ).resolves.toMatchObject({ plan: null });
  });

  // ── Boundary / flag / archived client ───────────────────────────────

  it("flag off returns not_available before any write or read", async () => {
    const { w, coachU, cp } = await setup();
    vi.stubEnv("ENABLE_SUPPLEMENTS", "0");
    vi.stubEnv("APP_ENV", "test");
    const out = await saveSupplementPlanFromAction(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        name: "Plan",
        items: [item],
      },
      deps(),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("not_available");
    expect(
      await prisma.supplementPlan.count({ where: { workspaceId: w.id } }),
    ).toBe(0);
    vi.unstubAllEnvs();
  });

  it("boundary maps stale revision to conflict without leaking", async () => {
    const { w, coachU, cp } = await setup();
    vi.stubEnv("ENABLE_SUPPLEMENTS", "1");
    vi.stubEnv("APP_ENV", "test");
    await saveSupplementPlan(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        name: "Plan",
        items: [item],
      },
      deps(),
    );
    const out = await saveSupplementPlanFromAction(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 7,
        name: "Plan",
        items: [item],
      },
      deps(),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("conflict");
    vi.unstubAllEnvs();
  });

  it("archived client's saved plan stays readable but refuses writes", async () => {
    const { w, coachU, cp } = await setup();
    const saved = await saveSupplementPlan(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        name: "Plan",
        items: [item],
      },
      deps(),
    );
    await prisma.clientProfile.update({
      where: { id: cp.id },
      data: { archivedAt: new Date(), archiveReason: "TEST_ARCHIVE" },
    });
    const view = await readStaffSupplementPlan(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(view.plan!.items).toHaveLength(1);
    // Archived client: writes refuse inside the lock (issue card:
    // "archived client → plan_not_accessible per PR-M1").
    await expect(
      saveSupplementPlan(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 1,
          name: "Changed",
          items: [item],
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "plan_not_accessible" });
    // The refused save leaves plan, revision and audit untouched.
    const plan = await prisma.supplementPlan.findUniqueOrThrow({
      where: { id: saved.planId },
      select: { revision: true, name: true },
    });
    expect(plan).toEqual({ revision: 1, name: "Plan" });
    expect(await auditCount(saved.planId, "UPDATE")).toBe(0);
  });

  it("boundary read returns non-disclosing denial for a foreign workspace", async () => {
    await setup();
    vi.stubEnv("ENABLE_SUPPLEMENTS", "1");
    vi.stubEnv("APP_ENV", "test");
    const foreign = await ws();
    const foreignOwnerU = await user();
    await member(foreign.id, foreignOwnerU.id, "WORKSPACE_OWNER");
    const out = await readOwnSupplementPlanFromAction(
      session(foreignOwnerU.id),
      { workspaceId: foreign.id },
      deps(),
    );
    // Own read on a workspace where the caller has no client profile.
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("denied");
    vi.unstubAllEnvs();
  });

  it("SupplementError exposes the closed code union", () => {
    const err = new SupplementError("invalid_input");
    expect(err.code).toBe("invalid_input");
    expect(err).toBeInstanceOf(Error);
  });
});
