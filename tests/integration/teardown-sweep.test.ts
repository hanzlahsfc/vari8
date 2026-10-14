/**
 * HABITS-I1-R2 — coverage for the shared E2E fixture sweep: with
 * clientDashboardLayout + habit/log/schedule rows populated, the sweep
 * removes the fixture workspace's rows in RESTRICT dependency order,
 * leaves an unrelated workspace untouched, and is idempotent.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { sweepFixtureWorkspaces } from "../e2e/fixture-sweep";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = !!url;

describe.skipIf(!enabled)("fixture sweep (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "habit_logs","habit_schedules","habits","audit_event","client_dashboard_layout","client_task","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => prisma?.$disconnect());

  const uid = () => `sw${++n}_${Date.now()}`;

  /** A fully populated fixture workspace: member, profile, dashboard
   * layout, habit + schedule + log — every RESTRICT dependent. */
  async function populatedWorkspace() {
    const user = await prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `U ${uid()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
    const workspace = await prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `sw-${uid()}`, status: "ACTIVE" },
    });
    const member = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: workspace.id, userId: user.id, name: `C ${uid()}` },
    });
    await prisma.clientDashboardLayout.create({
      data: {
        workspaceId: workspace.id,
        clientProfileId: cp.id,
        config: { name: "Fixture layout", widgets: [] },
      },
    });
    const habit = await prisma.habit.create({
      data: {
        workspaceId: workspace.id,
        clientProfileId: cp.id,
        name: "Walk",
        target: "T",
      },
    });
    await prisma.habitSchedule.create({
      data: {
        habitId: habit.id,
        effectiveFrom: new Date("2026-10-14T00:00:00Z"),
        weekdays: 127,
      },
    });
    await prisma.habitLog.create({
      data: {
        habitId: habit.id,
        date: new Date("2026-10-14T00:00:00Z"),
        status: "DONE",
        loggedByUserId: user.id,
      },
    });
    return { user, workspace, member, cp, habit };
  }

  it("sweeps populated dashboard/habit/log/schedule rows in RESTRICT order, fixture-scoped and idempotent", async () => {
    const fixture = await populatedWorkspace();
    const sentinel = await populatedWorkspace();

    await sweepFixtureWorkspaces(
      prisma,
      [fixture.workspace.id],
      [fixture.user.id],
    );

    // Fixture workspace fully swept — including rows that RESTRICT the
    // client profile (habits chain + dashboard layout).
    expect(
      await prisma.habitLog.count({
        where: { habit: { workspaceId: fixture.workspace.id } },
      }),
    ).toBe(0);
    expect(
      await prisma.habitSchedule.count({
        where: { habit: { workspaceId: fixture.workspace.id } },
      }),
    ).toBe(0);
    expect(
      await prisma.habit.count({
        where: { workspaceId: fixture.workspace.id },
      }),
    ).toBe(0);
    expect(
      await prisma.clientDashboardLayout.count({
        where: { workspaceId: fixture.workspace.id },
      }),
    ).toBe(0);
    expect(
      await prisma.clientProfile.count({
        where: { workspaceId: fixture.workspace.id },
      }),
    ).toBe(0);
    expect(
      await prisma.workspaceMember.count({
        where: { workspaceId: fixture.workspace.id },
      }),
    ).toBe(0);
    expect(
      await prisma.workspace.count({ where: { id: fixture.workspace.id } }),
    ).toBe(0);
    expect(await prisma.user.count({ where: { id: fixture.user.id } })).toBe(0);

    // Unrelated workspace/data is never swept.
    expect(await prisma.habit.count({ where: { id: sentinel.habit.id } })).toBe(
      1,
    );
    expect(
      await prisma.habitLog.count({ where: { habitId: sentinel.habit.id } }),
    ).toBe(1);
    expect(
      await prisma.clientDashboardLayout.count({
        where: { workspaceId: sentinel.workspace.id },
      }),
    ).toBe(1);
    expect(
      await prisma.workspace.count({ where: { id: sentinel.workspace.id } }),
    ).toBe(1);

    // Idempotent / failure-safe: a second run on already-empty scopes is a
    // no-op, not an error.
    await expect(
      sweepFixtureWorkspaces(prisma, [fixture.workspace.id], [fixture.user.id]),
    ).resolves.toBeUndefined();

    // Clean up the sentinel so the shared DB carries no leftovers.
    await sweepFixtureWorkspaces(
      prisma,
      [sentinel.workspace.id],
      [sentinel.user.id],
    );
  });
});
