/**
 * PR-M7 (real PG) — bounded reason round-trip, all-time completion
 * counts over the full cohort (archived included), canvas frequency
 * labels on the read views, and the card's date guard: completions
 * counted across a Sunday→Monday week boundary resolve per declared
 * date, not per viewer clock.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { AccessDeniedError } from "../../lib/auth/guard";
import {
  archiveHabit,
  createHabit,
  editHabit,
  listHabitCompletions,
  listStaffHabits,
  listTodayHabits,
  setHabitLog,
} from "../../lib/habits/service";
import { serverTodayUtc, shiftDateUtc } from "../../lib/habits/date";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = !!url;
const sess = (userId: string) => ({ user: { id: userId } });

describe.skipIf(!enabled)("PR-M7 habit fields + completions (real PG)", () => {
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

  const uid = () => `m7${++n}_${Date.now()}`;
  const deps = (now?: Date) => ({ db: prisma as never, now });
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
      data: { name: `WS ${uid()}`, slug: `m7-${uid()}`, status: "ACTIVE" },
    });
  const member = (workspaceId: string, userId: string, role: string) =>
    prisma.workspaceMember.create({
      data: { workspaceId, userId, role: role as never, status: "ACTIVE" },
    });

  async function fixture() {
    const w = await ws();
    const ownerU = await user();
    const clientU = await user();
    await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    await member(w.id, clientU.id, "CLIENT");
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: w.id, userId: clientU.id, name: `C ${uid()}` },
    });
    return { w, ownerU, clientU, cp };
  }

  const today = serverTodayUtc();
  // Most recent Sunday strictly before today, and its Monday — always
  // <= today, always a week boundary pair (Europe/Vienna night included
  // in the assertion via literal dates, not viewer offsets).
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const sunday = shiftDateUtc(today, -(dow === 0 ? 7 : dow));
  const monday = shiftDateUtc(sunday, 1);

  it("reason round-trips through create/edit and the staff list exposes it", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Evening walk",
        target: "20 minutes",
        reason: "Create a calm transition into the evening.",
        startDate: today,
        weekdays: 127,
      },
      deps(),
    );
    const staff = await listStaffHabits(
      sess(f.ownerU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    expect(staff.habits).toHaveLength(1);
    expect(staff.habits[0]).toMatchObject({
      id: h.id,
      name: "Evening walk",
      target: "20 minutes",
      reason: "Create a calm transition into the evening.",
      frequency: "Daily",
      completed: 0,
      archived: false,
    });

    const edited = await editHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        reason: "  Wind down before bed.  ",
        expectedRevision: 1,
      },
      deps(),
    );
    expect(edited).toEqual({ revision: 2, changed: true });
    const after = await listStaffHabits(
      sess(f.ownerU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    expect(after.habits[0].reason).toBe("Wind down before bed.");

    // Clearing to "" is a real change; re-writing the same reason is not.
    const cleared = await editHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        reason: "",
        expectedRevision: 2,
      },
      deps(),
    );
    expect(cleared).toEqual({ revision: 3, changed: true });
    const noop = await editHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        reason: "",
        expectedRevision: 3,
      },
      deps(),
    );
    expect(noop).toEqual({ revision: 3, changed: false });

    await expect(
      createHabit(
        sess(f.ownerU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          name: "N",
          target: "T",
          reason: "x".repeat(501),
          startDate: today,
          weekdays: 127,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("all-time completions count across a Sunday→Monday week boundary", async () => {
    const f = await fixture();
    // Habit enrolled on that Sunday, Sun+Mon mask (65).
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "SunMon",
        target: "T",
        reason: "why",
        startDate: sunday,
        weekdays: 65,
      },
      deps(new Date(`${sunday}T12:00:00Z`)),
    );
    for (const date of [sunday, monday]) {
      const mark = await setHabitLog(
        sess(f.clientU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          habitId: h.id,
          date,
          desired: "DONE",
        },
        deps(),
      );
      expect(mark.status).toBe("DONE");
    }

    const staffView = await listHabitCompletions(
      sess(f.ownerU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    expect(staffView.habits).toEqual([
      {
        habitId: h.id,
        name: "SunMon",
        target: "T",
        reason: "why",
        frequency: "2× per week",
        completed: 2,
        archived: false,
      },
    ]);

    // The client reads the same row through the own-scope path.
    const ownView = await listHabitCompletions(
      sess(f.clientU.id),
      { workspaceId: f.w.id },
      deps(),
    );
    expect(ownView.habits).toEqual(staffView.habits);

    // Staff list exposes the same all-time count next to the boundary.
    const staff = await listStaffHabits(
      sess(f.ownerU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    expect(staff.habits[0].completed).toBe(2);
  });

  it("archived habits keep their completion count and last live frequency", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Retired",
        target: "T",
        startDate: today,
        weekdays: 127,
      },
      deps(),
    );
    await setHabitLog(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        date: today,
        desired: "DONE",
      },
      deps(),
    );
    await archiveHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        expectedRevision: 1,
      },
      deps(),
    );
    const view = await listHabitCompletions(
      sess(f.ownerU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    expect(view.habits).toEqual([
      {
        habitId: h.id,
        name: "Retired",
        target: "T",
        reason: "",
        frequency: "Daily",
        completed: 1,
        archived: true,
      },
    ]);
  });

  it("today's scheduled cohort exposes reason and frequency labels", async () => {
    const f = await fixture();
    const bit = 1 << ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7);
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Today",
        target: "T",
        reason: "because",
        startDate: today,
        weekdays: bit,
      },
      deps(),
    );
    const tl21 = await listTodayHabits(
      sess(f.clientU.id),
      { workspaceId: f.w.id },
      deps(),
    );
    const row = tl21.habits.find((x) => x.id === h.id);
    expect(row).toMatchObject({
      name: "Today",
      reason: "because",
      status: "NONE",
    });
    expect(row?.frequency).toBe("1× per week");
  });

  it("foreign staff cannot read the completions cohort", async () => {
    const f = await fixture();
    const otherW = await ws();
    const stranger = await user();
    await member(otherW.id, stranger.id, "WORKSPACE_OWNER");
    await expect(
      listHabitCompletions(
        sess(stranger.id),
        { workspaceId: f.w.id, clientProfileId: f.cp.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
