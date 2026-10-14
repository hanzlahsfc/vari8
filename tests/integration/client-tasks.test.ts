/**
 * CLIENT-TASKS-I1 / decision 109 — staff-assigned client tasks on real
 * PostgreSQL: role/operation matrix, completion ownership, revocation
 * split, CAS/idempotency, provenance/CHECK, audit, projection bounds.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  assignClientTask,
  editClientTask,
  cancelClientTask,
  setClientTaskCompletion,
  listStaffClientTasks,
  listOwnClientTasks,
} from "../../lib/tasks/service";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = !!url;
const sess = (userId: string) => ({ user: { id: userId } });

describe.skipIf(!enabled)("CLIENT-TASKS-I1 (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "client_task","audit_event","client_dashboard_layout","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => prisma?.$disconnect());

  const uid = () => `ct${++n}_${Date.now()}`;
  const deps = () => ({ db: prisma as never });
  const user = (platformRole: "USER" | "PLATFORM_ADMIN" = "USER") =>
    prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `U ${uid()}`,
        platformRole,
        status: "ACTIVE",
      },
    });
  const ws = () =>
    prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `ct-${uid()}`, status: "ACTIVE" },
    });
  const member = (workspaceId: string, userId: string, role: string) =>
    prisma.workspaceMember.create({
      data: { workspaceId, userId, role: role as never, status: "ACTIVE" },
    });
  const profile = (workspaceId: string, userId: string) =>
    prisma.clientProfile.create({
      data: { workspaceId, userId, name: `C ${uid()}` },
    });
  const assign = (w: string, c: string, m: string) =>
    prisma.clientAssignment.create({
      data: {
        workspaceId: w,
        clientProfileId: c,
        coachMemberId: m,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });

  async function fixture() {
    const w = await ws();
    const ownerU = await user();
    const coachU = await user();
    const asstU = await user();
    const clientU = await user();
    const owner = await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const coach = await member(w.id, coachU.id, "COACH");
    const asst = await member(w.id, asstU.id, "ASSISTANT_COACH");
    await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    await assign(w.id, cp.id, coach.id);
    await prisma.clientAssignment.create({
      data: {
        workspaceId: w.id,
        clientProfileId: cp.id,
        coachMemberId: asst.id,
        role: "COACH",
        status: "ACTIVE",
      },
    });
    return { w, ownerU, coachU, asstU, clientU, owner, coach, asst, cp };
  }

  it("owner assigns; client sees own task and completes it", async () => {
    const f = await fixture();
    const created = await assignClientTask(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        title: "Upload training log",
        dueDate: "2026-10-20",
      },
      deps(),
    );
    expect(created.revision).toBe(1);
    const own = await listOwnClientTasks(
      sess(f.clientU.id),
      { workspaceId: f.w.id, option: "both" },
      deps(),
    );
    expect(own.tasks.map((t) => t.title)).toEqual(["Upload training log"]);
    const done = await setClientTaskCompletion(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        taskId: created.id,
        desired: "COMPLETED",
        expectedRevision: 1,
      },
      deps(),
    );
    expect(done).toMatchObject({ status: "COMPLETED", changed: true });
    const audit = await prisma.auditEvent.findMany({
      where: { resourceType: "client_task" },
    });
    expect(audit).toHaveLength(2); // CREATE + UPDATE only
  });

  it("assigned coach manages; assistant reads but cannot write", async () => {
    const f = await fixture();
    await assignClientTask(
      sess(f.coachU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        title: "Coach task",
        dueDate: "2026-11-01",
      },
      deps(),
    );
    const read = await listStaffClientTasks(
      sess(f.asstU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    expect(read.tasks).toHaveLength(1);
    await expect(
      assignClientTask(
        sess(f.asstU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          title: "Nope",
          dueDate: "2026-11-01",
        },
        deps(),
      ),
    ).rejects.toThrow();
  });

  it("client cannot create/edit/cancel (operation split inside tx)", async () => {
    const f = await fixture();
    const t = await assignClientTask(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        title: "T",
        dueDate: "2026-11-01",
      },
      deps(),
    );
    for (const op of [
      () =>
        assignClientTask(
          sess(f.clientU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            title: "X",
            dueDate: "2026-11-02",
          },
          deps(),
        ),
      () =>
        editClientTask(
          sess(f.clientU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            taskId: t.id,
            title: "X",
            dueDate: "2026-11-02",
            expectedRevision: 1,
          },
          deps(),
        ),
      () =>
        cancelClientTask(
          sess(f.clientU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            taskId: t.id,
            expectedRevision: 1,
          },
          deps(),
        ),
    ])
      await expect(op()).rejects.toThrow();
  });

  it("dual-role staff cannot complete on the client's behalf", async () => {
    const w = await ws();
    const ownerU = await user();
    const owner = await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    // The owner also owns a coherent clientProfile (dual-role fixture).
    const ownProfile = await profile(w.id, ownerU.id);
    const t = await assignClientTask(
      sess(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: ownProfile.id,
        title: "T",
        dueDate: "2026-11-01",
      },
      deps(),
    );
    await expect(
      setClientTaskCompletion(
        sess(ownerU.id),
        {
          workspaceId: w.id,
          clientProfileId: ownProfile.id,
          taskId: t.id,
          desired: "COMPLETED",
          expectedRevision: 1,
        },
        deps(),
      ),
    ).rejects.toThrow();
    void owner;
  });

  it("removed coach loses access; retained task stays completable", async () => {
    const f = await fixture();
    const t = await assignClientTask(
      sess(f.coachU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        title: "Survives",
        dueDate: "2026-11-01",
      },
      deps(),
    );
    await prisma.clientAssignment.updateMany({
      where: { coachMemberId: f.coach.id },
      data: { status: "REMOVED" },
    });
    await expect(
      listStaffClientTasks(
        sess(f.coachU.id),
        { workspaceId: f.w.id, clientProfileId: f.cp.id },
        deps(),
      ),
    ).rejects.toThrow();
    const done = await setClientTaskCompletion(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        taskId: t.id,
        desired: "COMPLETED",
        expectedRevision: 1,
      },
      deps(),
    );
    expect(done.status).toBe("COMPLETED");
  });

  it("idempotent replay writes no audit and bumps no revision", async () => {
    const f = await fixture();
    const t = await assignClientTask(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        title: "T",
        dueDate: "2026-11-01",
      },
      deps(),
    );
    await setClientTaskCompletion(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        taskId: t.id,
        desired: "COMPLETED",
        expectedRevision: 1,
      },
      deps(),
    );
    const auditsBefore = await prisma.auditEvent.count();
    const again = await setClientTaskCompletion(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        taskId: t.id,
        desired: "COMPLETED",
        expectedRevision: 2,
      },
      deps(),
    );
    expect(again).toMatchObject({ changed: false, status: "COMPLETED" });
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
    const row = await prisma.clientTask.findUnique({ where: { id: t.id } });
    expect(row?.revision).toBe(2);
  });

  it("cancelled tasks reject transitions and hide from the client", async () => {
    const f = await fixture();
    const t = await assignClientTask(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        title: "T",
        dueDate: "2026-11-01",
      },
      deps(),
    );
    await cancelClientTask(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        taskId: t.id,
        expectedRevision: 1,
      },
      deps(),
    );
    const own = await listOwnClientTasks(
      sess(f.clientU.id),
      { workspaceId: f.w.id, option: "both" },
      deps(),
    );
    expect(own.tasks).toHaveLength(0);
    const staff = await listStaffClientTasks(
      sess(f.ownerU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    expect(staff.tasks[0]?.status).toBe("CANCELLED");
    await expect(
      setClientTaskCompletion(
        sess(f.clientU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          taskId: t.id,
          desired: "COMPLETED",
          expectedRevision: 2,
        },
        deps(),
      ),
    ).rejects.toThrow();
  });

  it("projection filters in SQL before the 21-row limit", async () => {
    const f = await fixture();
    for (let i = 0; i < 22; i++)
      await prisma.clientTask.create({
        data: {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          title: `Task ${String(i).padStart(2, "0")}`,
          dueDate: new Date(`2026-11-${String((i % 28) + 1).padStart(2, "0")}`),
          assignedByMemberId: f.owner.id,
          status: i === 0 ? "CANCELLED" : "OPEN",
          cancelledAt: i === 0 ? new Date() : null,
          cancelledByMemberId: i === 0 ? f.owner.id : null,
        },
      });
    const own = await listOwnClientTasks(
      sess(f.clientU.id),
      { workspaceId: f.w.id, option: "open" },
      deps(),
    );
    // The CANCELLED row is excluded in SQL before LIMIT — 21 open tasks
    // exist, so hasMore=true and exactly 20 return.
    expect(own.tasks).toHaveLength(20);
    expect(own.hasMore).toBe(true);
    expect(own.tasks.every((t) => t.status === "OPEN")).toBe(true);
  });

  it("PLATFORM_ADMIN with ACTIVE staff membership is denied everywhere", async () => {
    const f = await fixture();
    const task = await assignClientTask(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        title: "Legit",
        dueDate: "2026-11-01",
      },
      deps(),
    );
    const tasksBefore = await prisma.clientTask.count();
    const auditsBefore = await prisma.auditEvent.count();

    // PLATFORM_ADMIN + ACTIVE WORKSPACE_OWNER membership — the dual-role
    // path the matrix cell alone does not cover.
    const adminU = await user("PLATFORM_ADMIN");
    await member(f.w.id, adminU.id, "WORKSPACE_OWNER");
    const admin = sess(adminU.id);

    await expect(
      assignClientTask(
        admin,
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          title: "Injected",
          dueDate: "2026-11-02",
        },
        deps(),
      ),
    ).rejects.toThrow();
    await expect(
      editClientTask(
        admin,
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          taskId: task.id,
          title: "X",
          expectedRevision: 1,
        },
        deps(),
      ),
    ).rejects.toThrow();
    await expect(
      cancelClientTask(
        admin,
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          taskId: task.id,
          expectedRevision: 1,
        },
        deps(),
      ),
    ).rejects.toThrow();
    await expect(
      setClientTaskCompletion(
        admin,
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          taskId: task.id,
          desired: "COMPLETED",
          expectedRevision: 1,
        },
        deps(),
      ),
    ).rejects.toThrow();
    await expect(
      listStaffClientTasks(
        admin,
        { workspaceId: f.w.id, clientProfileId: f.cp.id },
        deps(),
      ),
    ).rejects.toThrow();
    await expect(
      listOwnClientTasks(admin, { workspaceId: f.w.id }, deps()),
    ).rejects.toThrow();
    expect(await prisma.clientTask.count()).toBe(tasksBefore);
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);

    // PLATFORM_ADMIN + ACTIVE assigned COACH membership — same denial.
    const adminCoachU = await user("PLATFORM_ADMIN");
    const adminCoachM = await member(f.w.id, adminCoachU.id, "COACH");
    await prisma.clientAssignment.create({
      data: {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        coachMemberId: adminCoachM.id,
        role: "COACH",
        status: "ACTIVE",
      },
    });
    await expect(
      assignClientTask(
        sess(adminCoachU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          title: "Injected2",
          dueDate: "2026-11-02",
        },
        deps(),
      ),
    ).rejects.toThrow();
    await expect(
      listStaffClientTasks(
        sess(adminCoachU.id),
        { workspaceId: f.w.id, clientProfileId: f.cp.id },
        deps(),
      ),
    ).rejects.toThrow();
    expect(await prisma.clientTask.count()).toBe(tasksBefore);
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
  });

  it("denied attempts write no audit", async () => {
    const f = await fixture();
    const before = await prisma.auditEvent.count();
    await expect(
      assignClientTask(
        sess(f.asstU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          title: "X",
          dueDate: "2026-11-01",
        },
        deps(),
      ),
    ).rejects.toThrow();
    expect(await prisma.auditEvent.count()).toBe(before);
  });
});
