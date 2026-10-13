import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  updateClientDashboardLayout,
  readStaffDashboardLayout,
  readOwnDashboardLayout,
} from "../../lib/dashboard/service";
import {
  updateClientDashboardLayoutFromAction,
  readOwnDashboardLayout as boundaryReadOwn,
} from "../../lib/dashboard/boundary";
import { isClientDashboardEnabled } from "../../lib/dashboard/gate";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

/**
 * DASHBOARD-I1 / decision #108 — persisted coach-configured client
 * layouts: role matrix, CAS, subset filtering, audit atomicity, and
 * revocation behavior on real PostgreSQL.
 */
describe.skipIf(!enabled)("DASHBOARD-I1 layout persistence (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "client_dashboard_layout","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `di1${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = () => ({ db: prisma as never });

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
      data: { name: `WS ${uid()}`, slug: `di1-${uid()}`, status: "ACTIVE" },
    });
  }
  async function member(workspaceId: string, userId: string, role: string) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role: role as never, status: "ACTIVE" },
    });
  }
  async function profile(workspaceId: string, userId: string) {
    return prisma.clientProfile.create({
      data: { workspaceId, userId, name: `Client ${uid()}` },
    });
  }
  async function assign(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
    role: "PRIMARY" | "COACH" = "PRIMARY",
  ) {
    return prisma.clientAssignment.create({
      data: {
        workspaceId,
        clientProfileId,
        coachMemberId,
        role,
        status: "ACTIVE",
      },
    });
  }

  function config(widgets: { id: string; visibility: string }[]) {
    return {
      version: 1,
      name: "Maya",
      widgets: widgets.map((w) => ({
        id: w.id,
        kind: w.id.startsWith("c") ? "CU16" : "CU04",
        settings: {
          title: "T",
          source: w.id.startsWith("c") ? "links" : "checkins",
          summary: w.id.startsWith("c") ? "enabled" : "status",
          period: w.id.startsWith("c") ? "" : "30d",
          historyPeriod: "auto",
          target: false,
          size: "Compact",
          fields: w.id.startsWith("c") ? ["Tracker"] : [],
          labels: {},
          option: "default",
          unit: "",
          visibility: w.visibility,
        },
      })),
      layouts: {
        desktop: Object.fromEntries(
          widgets.map((w, i) => [
            w.id,
            {
              x: (i * 4) % 12,
              y: Math.floor(i / 3),
              w: 4,
              h: 3,
              size: "Compact",
            },
          ]),
        ),
      },
      widths: { desktop: 1040 },
    };
  }

  it("owner saves without an assignment; save→reload roundtrips", async () => {
    const owner = await user();
    const w = await ws();
    await member(w.id, owner.id, "WORKSPACE_OWNER");
    const cp = await profile(w.id, (await user()).id);
    const saved = await updateClientDashboardLayout(
      session(owner.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        config: config([
          { id: "w1", visibility: "client" },
          { id: "c2", visibility: "client" },
        ]),
        expectedRevision: 0,
      },
      deps(),
    );
    expect(saved.revision).toBe(1);
    const read = await readStaffDashboardLayout(
      session(owner.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(read.layout?.revision).toBe(1);
    expect(read.layout?.config.widgets).toHaveLength(2);
    const audits = await prisma.auditEvent.findMany({
      where: { resourceType: "client_dashboard_layout" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("UPDATE");
  });

  it("no-op save writes nothing and audits nothing", async () => {
    const owner = await user();
    const w = await ws();
    await member(w.id, owner.id, "WORKSPACE_OWNER");
    const cp = await profile(w.id, (await user()).id);
    const cfg = config([{ id: "w1", visibility: "client" }]);
    await updateClientDashboardLayout(
      session(owner.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        config: cfg,
        expectedRevision: 0,
      },
      deps(),
    );
    const before = await prisma.auditEvent.count({
      where: { resourceType: "client_dashboard_layout" },
    });
    const again = await updateClientDashboardLayout(
      session(owner.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        config: cfg,
        expectedRevision: 1,
      },
      deps(),
    );
    expect(again.revision).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { resourceType: "client_dashboard_layout" },
      }),
    ).toBe(before);
  });

  it("client gets the server-filtered subset — no staff config leaks", async () => {
    const owner = await user();
    const clientUser = await user();
    const w = await ws();
    await member(w.id, owner.id, "WORKSPACE_OWNER");
    const cp = await profile(w.id, clientUser.id);
    await member(w.id, clientUser.id, "CLIENT");
    await updateClientDashboardLayout(
      session(owner.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        config: config([
          { id: "w1", visibility: "client" },
          { id: "s2", visibility: "staff" },
        ]),
        expectedRevision: 0,
      },
      deps(),
    );
    const own = await readOwnDashboardLayout(
      session(clientUser.id),
      { workspaceId: w.id },
      deps(),
    );
    expect(own.layout?.config.widgets.map((x) => x.id)).toEqual(["w1"]);
    expect(Object.keys(own.layout!.config.layouts.desktop!)).toEqual(["w1"]);
    // provenance/configVersion/revision are staff-only
    expect(own.layout).not.toHaveProperty("revision");
    expect(own.layout).not.toHaveProperty("updatedByMemberId");
    // and zero READ audits for a passive config read
    expect(
      await prisma.auditEvent.count({
        where: { action: "READ", resourceType: "client_dashboard_layout" },
      }),
    ).toBe(0);
  });

  it("CAS: stale expectedRevision conflicts; concurrent saves serialize to one winner", async () => {
    const owner = await user();
    const w = await ws();
    await member(w.id, owner.id, "WORKSPACE_OWNER");
    const cp = await profile(w.id, (await user()).id);
    await updateClientDashboardLayout(
      session(owner.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        config: config([{ id: "w1", visibility: "client" }]),
        expectedRevision: 0,
      },
      deps(),
    );
    await expect(
      updateClientDashboardLayout(
        session(owner.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          config: config([{ id: "w1", visibility: "client" }]),
          expectedRevision: 0, // stale — actual is 1
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "conflict" });
    // committed-but-response-lost reconcile: same snapshot at the new
    // revision is a truthful no-op, not a conflict
    const reconciled = await updateClientDashboardLayout(
      session(owner.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        config: config([{ id: "w1", visibility: "client" }]),
        expectedRevision: 1,
      },
      deps(),
    );
    expect(reconciled.revision).toBe(1);
  });

  it("role matrix: assigned coach edits, assistant view-only, others denied", async () => {
    const owner = await user();
    const coach = await user();
    const assistant = await user();
    const outsider = await user();
    const clientUser = await user();
    const w = await ws();
    await member(w.id, owner.id, "WORKSPACE_OWNER");
    const coachM = await member(w.id, coach.id, "COACH");
    const assistantM = await member(w.id, assistant.id, "ASSISTANT_COACH");
    const cp = await profile(w.id, clientUser.id);
    await member(w.id, clientUser.id, "CLIENT");
    await assign(w.id, cp.id, coachM.id);
    await assign(w.id, cp.id, assistantM.id, "COACH");

    // assigned coach edits
    const r = await updateClientDashboardLayout(
      session(coach.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        config: config([{ id: "w1", visibility: "client" }]),
        expectedRevision: 0,
      },
      deps(),
    );
    expect(r.revision).toBe(1);
    // assistant reads, cannot write
    const ar = await readStaffDashboardLayout(
      session(assistant.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(ar.layout?.revision).toBe(1);
    await expect(
      updateClientDashboardLayout(
        session(assistant.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          config: config([{ id: "w1", visibility: "client" }]),
          expectedRevision: 1,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // outsider denied
    await expect(
      readStaffDashboardLayout(
        session(outsider.id),
        { workspaceId: w.id, clientProfileId: cp.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // client cannot write
    await expect(
      updateClientDashboardLayout(
        session(clientUser.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          config: config([{ id: "w1", visibility: "client" }]),
          expectedRevision: 1,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("revoked assignment fails closed; platform-admin dual-role denied", async () => {
    const coach = await user();
    const admin = await user("PLATFORM_ADMIN");
    const w = await ws();
    const coachM = await member(w.id, coach.id, "COACH");
    await member(w.id, admin.id, "WORKSPACE_OWNER");
    const cp = await profile(w.id, (await user()).id);
    const asg = await assign(w.id, cp.id, coachM.id);
    await prisma.clientAssignment.update({
      where: { id: asg.id },
      data: { status: "REMOVED" },
    });
    await expect(
      updateClientDashboardLayout(
        session(coach.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          config: config([{ id: "w1", visibility: "client" }]),
          expectedRevision: 0,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      readStaffDashboardLayout(
        session(admin.id),
        { workspaceId: w.id, clientProfileId: cp.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("invalid config and foreign tuples are closed; flag gate fail-closed", async () => {
    const owner = await user();
    const w = await ws();
    await member(w.id, owner.id, "WORKSPACE_OWNER");
    const cp = await profile(w.id, (await user()).id);
    await expect(
      updateClientDashboardLayout(
        session(owner.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          config: { widgets: [{ id: "x", kind: "XX99" }] },
          expectedRevision: 0,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    // missing layout → null, not fabricated
    const none = await readStaffDashboardLayout(
      session(owner.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(none.layout).toBeNull();
    // flag gate: off + production fail closed; boundary maps to
    // not_available without touching the DB
    expect(
      isClientDashboardEnabled({
        ENABLE_CLIENT_DASHBOARD: "0",
        APP_ENV: "test",
      }),
    ).toBe(false);
    expect(
      isClientDashboardEnabled({
        ENABLE_CLIENT_DASHBOARD: "1",
        APP_ENV: "production",
      }),
    ).toBe(false);
    expect(
      isClientDashboardEnabled({
        ENABLE_CLIENT_DASHBOARD: "1",
        APP_ENV: "test",
      }),
    ).toBe(true);
    const off = await boundaryReadOwn(
      session(owner.id),
      { workspaceId: w.id },
      deps(),
    );
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.code).toBe("not_available");
    const act = await updateClientDashboardLayoutFromAction(
      session(owner.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        config: config([{ id: "w1", visibility: "client" }]),
        expectedRevision: 0,
      },
      deps(),
    );
    expect(act.ok).toBe(false);
  });
});
