/**
 * HABITS-I1 (decision 110) — schema contract on real PostgreSQL:
 * tables, enum, uniqueness, CHECKs, DATE/TIMESTAMPTZ types, composite
 * same-workspace coherence FK, RESTRICT/SET NULL delete behaviour.
 * RED: the habits migration does not exist yet.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = !!url;

describe.skipIf(!enabled)("HABITS-I1 schema (real PG)", () => {
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

  const uid = () => `hs${++n}_${Date.now()}`;
  const user = () =>
    prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `U ${uid()}`,
        status: "ACTIVE",
      },
    });
  const ws = () =>
    prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `hs-${uid()}`, status: "ACTIVE" },
    });
  const member = (workspaceId: string, userId: string, role: string) =>
    prisma.workspaceMember.create({
      data: { workspaceId, userId, role: role as never, status: "ACTIVE" },
    });
  const profile = (workspaceId: string, userId: string) =>
    prisma.clientProfile.create({
      data: { workspaceId, userId, name: `C ${uid()}` },
    });

  it("creates the three habit tables + HabitLogStatus enum", async () => {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name IN
       ('habits','habit_schedules','habit_logs') ORDER BY table_name`,
    );
    expect(tables.map((r) => r.table_name)).toEqual([
      "habit_logs",
      "habit_schedules",
      "habits",
    ]);
    const enums = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
      `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
       WHERE t.typname='HabitLogStatus' ORDER BY enumsortorder`,
    );
    expect(enums.map((r) => r.enumlabel)).toEqual(["DONE", "SKIPPED"]);
  });

  it("declared dates are DATE; provenance is TIMESTAMPTZ", async () => {
    const cols = await prisma.$queryRawUnsafe<
      { table_name: string; column_name: string; data_type: string }[]
    >(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND (
         (table_name='habit_schedules' AND column_name IN ('effective_from','end_date'))
         OR (table_name='habit_logs' AND column_name IN ('date','logged_at'))
         OR (table_name='habits' AND column_name IN ('archived_at','created_at','updated_at'))
       ) ORDER BY table_name, column_name`,
    );
    const typeOf = (t: string, c: string) =>
      cols.find((r) => r.table_name === t && r.column_name === c)?.data_type;
    expect(typeOf("habit_schedules", "effective_from")).toBe("date");
    expect(typeOf("habit_schedules", "end_date")).toBe("date");
    expect(typeOf("habit_logs", "date")).toBe("date");
    expect(typeOf("habit_logs", "logged_at")).toBe(
      "timestamp with time zone",
    );
    expect(typeOf("habits", "archived_at")).toBe("timestamp with time zone");
    expect(typeOf("habits", "created_at")).toBe("timestamp with time zone");
    expect(typeOf("habits", "updated_at")).toBe("timestamp with time zone");
  });

  it("enforces CHECKs: trimmed non-empty name/target, weekdays 0..127, end >= from", async () => {
    const w = await ws();
    const u = await user();
    const m = await member(w.id, u.id, "WORKSPACE_OWNER");
    const cp = await profile(w.id, u.id);
    void m;
    // name: blank rejected
    await expect(
      prisma.habit.create({
        data: {
          workspaceId: w.id,
          clientProfileId: cp.id,
          name: "   ",
          target: "ok",
        },
      }),
    ).rejects.toThrow();
    // target: blank rejected
    await expect(
      prisma.habit.create({
        data: {
          workspaceId: w.id,
          clientProfileId: cp.id,
          name: "Walk",
          target: "",
        },
      }),
    ).rejects.toThrow();
    const habit = await prisma.habit.create({
      data: {
        workspaceId: w.id,
        clientProfileId: cp.id,
        name: "Walk",
        target: "30 min",
      },
    });
    // weekdays > 127 rejected
    await expect(
      prisma.habitSchedule.create({
        data: {
          habitId: habit.id,
          effectiveFrom: new Date("2026-10-15T00:00:00Z"),
          weekdays: 128,
        },
      }),
    ).rejects.toThrow();
    // weekdays < 0 rejected
    await expect(
      prisma.habitSchedule.create({
        data: {
          habitId: habit.id,
          effectiveFrom: new Date("2026-10-15T00:00:00Z"),
          weekdays: -1,
        },
      }),
    ).rejects.toThrow();
    // end_date before effective_from rejected
    await expect(
      prisma.habitSchedule.create({
        data: {
          habitId: habit.id,
          effectiveFrom: new Date("2026-10-15T00:00:00Z"),
          weekdays: 127,
          endDate: new Date("2026-10-14T00:00:00Z"),
        },
      }),
    ).rejects.toThrow();
    // weekdays = 0 is structurally permitted (archive boundary row)
    await prisma.habitSchedule.create({
      data: {
        habitId: habit.id,
        effectiveFrom: new Date("2026-10-15T00:00:00Z"),
        weekdays: 0,
      },
    });
  });

  it("enforces boundary + log uniqueness per habit per day", async () => {
    const w = await ws();
    const u = await user();
    const cp = await profile(w.id, u.id);
    const habit = await prisma.habit.create({
      data: {
        workspaceId: w.id,
        clientProfileId: cp.id,
        name: "Walk",
        target: "30 min",
      },
    });
    await prisma.habitSchedule.create({
      data: {
        habitId: habit.id,
        effectiveFrom: new Date("2026-10-14T00:00:00Z"),
        weekdays: 127,
      },
    });
    await expect(
      prisma.habitSchedule.create({
        data: {
          habitId: habit.id,
          effectiveFrom: new Date("2026-10-14T00:00:00Z"),
          weekdays: 63,
        },
      }),
    ).rejects.toThrow(); // one boundary per habit per day

    await prisma.habitLog.create({
      data: { habitId: habit.id, date: new Date("2026-10-14T00:00:00Z"), status: "DONE" },
    });
    await expect(
      prisma.habitLog.create({
        data: {
          habitId: habit.id,
          date: new Date("2026-10-14T00:00:00Z"),
          status: "SKIPPED",
        },
      }),
    ).rejects.toThrow(); // one state per habit per day
  });

  it("enforces same-workspace coherence FK + RESTRICT + SET NULL", async () => {
    const w1 = await ws();
    const w2 = await ws();
    const u1 = await user();
    const u2 = await user();
    const cpW1 = await profile(w1.id, u1.id);
    // Cross-workspace insert violates the composite coherence FK.
    await expect(
      prisma.habit.create({
        data: {
          workspaceId: w2.id,
          clientProfileId: cpW1.id,
          name: "X",
          target: "Y",
        },
      }),
    ).rejects.toThrow();
    const habit = await prisma.habit.create({
      data: {
        workspaceId: w1.id,
        clientProfileId: cpW1.id,
        name: "Walk",
        target: "30 min",
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
        loggedByUserId: u1.id,
      },
    });
    // RESTRICT: client profile with habits cannot be deleted.
    await expect(
      prisma.clientProfile.delete({ where: { id: cpW1.id } }),
    ).rejects.toThrow();
    // RESTRICT: habit with schedules/logs cannot be deleted.
    await expect(prisma.habit.delete({ where: { id: habit.id } })).rejects.toThrow();
    // SET NULL: deleting the logging user nulls the pointer.
    await prisma.user.delete({ where: { id: u2.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: u1.id } });
    const log = await prisma.habitLog.findFirst({
      where: { habitId: habit.id },
    });
    expect(log?.loggedByUserId).toBeNull();
  });
});
