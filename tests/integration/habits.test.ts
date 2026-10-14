/**
 * HABITS-I1 / decision 110 — real habit tracking on real PostgreSQL:
 * role/operation matrix, schedule history, tomorrow-effectiveness,
 * cohort separation (TL21/TL22/editor), fields semantics, full-cohort
 * aggregation, CAS/idempotency, races, provenance, audit. RED: the
 * service module does not exist yet.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  archiveHabit,
  createHabit,
  editHabit,
  habitConsistency,
  listHabitChoices,
  listStaffHabits,
  listTodayHabits,
  setHabitLog,
} from "../../lib/habits/service";
import { serverTodayUtc, shiftDateUtc } from "../../lib/habits/date";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = !!url;
const sess = (userId: string) => ({ user: { id: userId } });

describe.skipIf(!enabled)("HABITS-I1 (real PG)", () => {
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

  const uid = () => `hb${++n}_${Date.now()}`;
  const deps = (now?: Date) => ({ db: prisma as never, now });
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
      data: { name: `WS ${uid()}`, slug: `hb-${uid()}`, status: "ACTIVE" },
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

  const today = serverTodayUtc();
  const tomorrow = shiftDateUtc(today, 1);
  const yesterday = shiftDateUtc(today, -1);
  const todayBit = weekdayBitOf(today);
  const allDays = 127;

  function weekdayBitOf(d: string): number {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
    const iso = dow === 0 ? 7 : dow; // 1=Mon..7=Sun
    return 1 << (iso - 1);
  }
  const todayOnly = todayBit;
  const neverToday = allDays & ~todayBit; // covers every day except today

  async function schedulesOf(habitId: string) {
    const rows = await prisma.habitSchedule.findMany({
      where: { habitId },
      orderBy: { effectiveFrom: "asc" },
    });
    return rows.map((r) => ({
      effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
      weekdays: r.weekdays,
      endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
    }));
  }

  /* ---------------- creation ---------------- */

  it("owner creates a habit; many habits per client allowed", async () => {
    const f = await fixture();
    const a = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "30 min",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    const b = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Read",
        target: "10 pages",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    expect(a.id).not.toBe(b.id);
    const list = await listStaffHabits(
      sess(f.ownerU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    expect(list.habits.map((h) => h.name).sort()).toEqual(["Read", "Walk"]);
    // initial schedule row at the declared startDate
    expect(await schedulesOf(a.id)).toEqual([
      { effectiveFrom: today, weekdays: todayOnly, endDate: null },
    ]);
    const audit = await prisma.auditEvent.findMany({
      where: { resourceType: "habit" },
    });
    expect(audit).toHaveLength(2); // two CREATEs
  });

  it("rejects backdated start, bad grammar, endDate < startDate", async () => {
    const f = await fixture();
    for (const input of [
      { startDate: yesterday },
      { startDate: "2026/10/14" },
      { startDate: "2025-02-30" },
      { startDate: "2032-01-01" }, // > today+5y
    ])
      await expect(
        createHabit(
          sess(f.ownerU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            name: "X",
            target: "Y",
            weekdays: allDays,
            ...input,
          },
          deps(),
        ),
      ).rejects.toThrow();
    await expect(
      createHabit(
        sess(f.ownerU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          name: "X",
          target: "Y",
          startDate: today,
          weekdays: allDays,
          endDate: yesterday,
        },
        deps(),
      ),
    ).rejects.toThrow();
  });

  it("rejects caller-supplied weekdays=0 on create and edit (P3-1)", async () => {
    const f = await fixture();
    await expect(
      createHabit(
        sess(f.ownerU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          name: "X",
          target: "Y",
          startDate: today,
          weekdays: 0,
        },
        deps(),
      ),
    ).rejects.toThrow();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Real",
        target: "T",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    await expect(
      editHabit(
        sess(f.ownerU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          habitId: h.id,
          schedule: { weekdays: 0, endDate: null },
          expectedRevision: 1,
        },
        deps(),
      ),
    ).rejects.toThrow();
    // no rows were written for the rejected create
    expect(await prisma.habit.count({ where: { name: "X" } })).toBe(0);
    expect(await schedulesOf(h.id)).toHaveLength(1);
  });

  it("rejects weekdays >127, non-integer, blank name/target", async () => {
    const f = await fixture();
    for (const input of [
      { weekdays: 128 },
      { weekdays: -1 },
      { weekdays: 1.5 },
      { weekdays: "127" },
      { name: "   " },
      { name: "" },
      { target: "" },
    ])
      await expect(
        createHabit(
          sess(f.ownerU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            name: "X",
            target: "Y",
            startDate: today,
            weekdays: allDays,
            ...input,
          } as never,
          deps(),
        ),
      ).rejects.toThrow();
  });

  /* ---------------- schedule history ---------------- */

  it("historical preservation: past days resolve under their in-force schedule", async () => {
    const f = await fixture();
    // Day 0 (injected clock): created with an every-day schedule.
    const day0 = `${shiftDateUtc(today, -2)}`;
    const day1 = shiftDateUtc(day0, 1);
    const day2 = shiftDateUtc(day0, 2);
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "30 min",
        startDate: day0,
        weekdays: allDays,
      },
      deps(new Date(`${day0}T12:00:00Z`)),
    );
    // Day 1 (injected clock): edit → new boundary lands at day2 only.
    const out = await editHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        schedule: { weekdays: neverToday, endDate: null },
        expectedRevision: 1,
      },
      deps(new Date(`${day1}T12:00:00Z`)),
    );
    expect(out.changed).toBe(true);
    expect(await schedulesOf(h.id)).toEqual([
      { effectiveFrom: day0, weekdays: allDays, endDate: null },
      { effectiveFrom: day2, weekdays: neverToday, endDate: null },
    ]);
    // day1 is still scheduled under the day0 row even though a later
    // boundary exists — denominators never read the newest fields.
    const done = await setHabitLog(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        date: day1,
        desired: "DONE",
      },
      deps(new Date(`${day2}T12:00:00Z`)),
    );
    expect(done.status).toBe("DONE");
    // day2 resolves under the new boundary — unscheduled there.
    await expect(
      setHabitLog(
        sess(f.clientU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          habitId: h.id,
          date: day2,
          desired: "DONE",
        },
        deps(new Date(`${day2}T12:00:00Z`)),
      ),
    ).rejects.toThrow();
    // TL22 over [day0..day2]: day0 scheduled+unlogged, day1 done,
    // day2 not scheduled.
    const out22 = await habitConsistency(
      sess(f.clientU.id),
      { workspaceId: f.w.id, period: "7d" },
      deps(new Date(`${day2}T12:00:00Z`)),
    );
    expect(out22.totals).toEqual({
      scheduled: 2,
      done: 1,
      skipped: 0,
      missing: 1,
    });
  });

  it("archive mid-history preserves earlier eligibility", async () => {
    const f = await fixture();
    const day0 = shiftDateUtc(today, -2);
    const day1 = shiftDateUtc(day0, 1);
    const day2 = shiftDateUtc(day0, 2);
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "T",
        startDate: day0,
        weekdays: allDays,
      },
      deps(new Date(`${day0}T12:00:00Z`)),
    );
    await setHabitLog(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        date: day0,
        desired: "DONE",
      },
      deps(new Date(`${day0}T12:00:00Z`)),
    );
    // Archive on day1 → zero boundary at day2.
    await archiveHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        expectedRevision: 1,
      },
      deps(new Date(`${day1}T12:00:00Z`)),
    );
    // day1 remains loggable (archive effective tomorrow); day2 is not.
    const done = await setHabitLog(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        date: day1,
        desired: "DONE",
      },
      deps(new Date(`${day2}T12:00:00Z`)),
    );
    expect(done.status).toBe("DONE");
    await expect(
      setHabitLog(
        sess(f.clientU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          habitId: h.id,
          date: day2,
          desired: "DONE",
        },
        deps(new Date(`${day2}T12:00:00Z`)),
      ),
    ).rejects.toThrow();
    // TL22 retains the archived habit's earlier period.
    const out22 = await habitConsistency(
      sess(f.clientU.id),
      { workspaceId: f.w.id, period: "7d" },
      deps(new Date(`${day2}T12:00:00Z`)),
    );
    expect(out22.totals.scheduled).toBe(2); // day0 + day1
    expect(out22.totals.done).toBe(2);
  });

  it("edit upserts a new boundary at tomorrow (server-computed)", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "30 min",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    const out = await editHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        name: "Walk fast",
        schedule: { weekdays: neverToday, endDate: null },
        expectedRevision: 1,
      },
      deps(),
    );
    expect(out).toMatchObject({ revision: 2, changed: true });
    const rows = await schedulesOf(h.id);
    expect(rows).toEqual([
      { effectiveFrom: today, weekdays: allDays, endDate: null },
      { effectiveFrom: tomorrow, weekdays: neverToday, endDate: null },
    ]);
    // Today's TL21 resolution still sees the ORIGINAL schedule row —
    // the edit is effective tomorrow only.
    const tl21 = await listTodayHabits(
      sess(f.clientU.id),
      { workspaceId: f.w.id },
      deps(),
    );
    expect(tl21.habits.map((x) => x.id)).toContain(h.id);
  });

  it("same-day future upsert: two edits collapse to one tomorrow row", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "T",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    await editHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        schedule: { weekdays: neverToday, endDate: null },
        expectedRevision: 1,
      },
      deps(),
    );
    await editHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        schedule: { weekdays: todayOnly, endDate: null },
        expectedRevision: 2,
      },
      deps(),
    );
    const rows = await schedulesOf(h.id);
    expect(rows).toHaveLength(2); // today + tomorrow only
    expect(rows[1]).toEqual({
      effectiveFrom: tomorrow,
      weekdays: todayOnly,
      endDate: null,
    });
  });

  it("archive writes a zero boundary at tomorrow and keeps history", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "T",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    const out = await archiveHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        expectedRevision: 1,
      },
      deps(),
    );
    expect(out).toMatchObject({ changed: true, revision: 2 });
    const row = await prisma.habit.findUnique({ where: { id: h.id } });
    expect(row?.archivedAt).not.toBeNull();
    const rows = await schedulesOf(h.id);
    expect(rows[rows.length - 1]).toEqual({
      effectiveFrom: tomorrow,
      weekdays: 0,
      endDate: null,
    });
    // Replay is a no-op (idempotent) — no second boundary, no audit.
    const audits = await prisma.auditEvent.count({
      where: { resourceType: "habit" },
    });
    const again = await archiveHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        expectedRevision: 2,
      },
      deps(),
    );
    expect(again).toMatchObject({ changed: false });
    expect(await schedulesOf(h.id)).toHaveLength(2);
    expect(
      await prisma.auditEvent.count({ where: { resourceType: "habit" } }),
    ).toBe(audits);
  });

  /* ---------------- logging ---------------- */

  it("client marks done and undoes; replay is idempotent", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    const done = await setHabitLog(
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
    expect(done).toMatchObject({ status: "DONE", changed: true });
    const log = await prisma.habitLog.findFirst({ where: { habitId: h.id } });
    expect(log?.status).toBe("DONE");
    expect(log?.loggedByUserId).toBe(f.clientU.id);

    const again = await setHabitLog(
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
    expect(again).toMatchObject({ status: "DONE", changed: false });

    const cleared = await setHabitLog(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        date: today,
        desired: "CLEARED",
      },
      deps(),
    );
    expect(cleared).toMatchObject({ status: "NONE", changed: true });
    expect(await prisma.habitLog.count({ where: { habitId: h.id } })).toBe(0);
    const clearedAgain = await setHabitLog(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: h.id,
        date: today,
        desired: "CLEARED",
      },
      deps(),
    );
    expect(clearedAgain).toMatchObject({ status: "NONE", changed: false });
  });

  it("rejects future, unscheduled and pre-enrollment dates", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    for (const date of [
      tomorrow, // future
      yesterday, // before earliest effectiveFrom
    ])
      await expect(
        setHabitLog(
          sess(f.clientU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            habitId: h.id,
            date,
            desired: "DONE",
          },
          deps(),
        ),
      ).rejects.toThrow();
    // unscheduled weekday: create a habit whose mask excludes today,
    // starting today — today is in range but not scheduled.
    const h2 = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Never today",
        target: "T",
        startDate: today,
        weekdays: neverToday,
      },
      deps(),
    );
    await expect(
      setHabitLog(
        sess(f.clientU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          habitId: h2.id,
          date: today,
          desired: "DONE",
        },
        deps(),
      ),
    ).rejects.toThrow();
  });

  it("today's log survives a same-day archive (archive effective tomorrow)", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
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
    const done = await setHabitLog(
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
    expect(done.status).toBe("DONE");
  });

  /* ---------------- authorization matrix ---------------- */

  it("coach manages at assigned scope; assistant reads but cannot write", async () => {
    const f = await fixture();
    await createHabit(
      sess(f.coachU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Coach habit",
        target: "T",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    const read = await listStaffHabits(
      sess(f.asstU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    expect(read.habits).toHaveLength(1);
    for (const op of [
      () =>
        createHabit(
          sess(f.asstU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            name: "Nope",
            target: "T",
            startDate: today,
            weekdays: allDays,
          },
          deps(),
        ),
    ])
      await expect(op()).rejects.toThrow();
  });

  it("client cannot create/edit/archive (operation split inside tx)", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "T",
        target: "T",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    for (const op of [
      () =>
        createHabit(
          sess(f.clientU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            name: "X",
            target: "Y",
            startDate: today,
            weekdays: allDays,
          },
          deps(),
        ),
      () =>
        editHabit(
          sess(f.clientU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            habitId: h.id,
            name: "X",
            expectedRevision: 1,
          },
          deps(),
        ),
      () =>
        archiveHabit(
          sess(f.clientU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            habitId: h.id,
            expectedRevision: 1,
          },
          deps(),
        ),
    ])
      await expect(op()).rejects.toThrow();
  });

  it("staff cannot log on the client's behalf — even dual-role staff", async () => {
    const w = await ws();
    const ownerU = await user();
    await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const ownProfile = await profile(w.id, ownerU.id);
    const h = await createHabit(
      sess(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: ownProfile.id,
        name: "T",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    await expect(
      setHabitLog(
        sess(ownerU.id),
        {
          workspaceId: w.id,
          clientProfileId: ownProfile.id,
          habitId: h.id,
          date: today,
          desired: "DONE",
        },
        deps(),
      ),
    ).rejects.toThrow();
  });

  it("PLATFORM_ADMIN with ACTIVE staff membership is denied everywhere", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Legit",
        target: "T",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    const habitsBefore = await prisma.habit.count();
    const auditsBefore = await prisma.auditEvent.count();

    const adminU = await user("PLATFORM_ADMIN");
    await member(f.w.id, adminU.id, "WORKSPACE_OWNER");
    const admin = sess(adminU.id);

    for (const op of [
      () =>
        createHabit(
          admin,
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            name: "Injected",
            target: "T",
            startDate: today,
            weekdays: allDays,
          },
          deps(),
        ),
      () =>
        editHabit(
          admin,
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            habitId: h.id,
            name: "X",
            expectedRevision: 1,
          },
          deps(),
        ),
      () =>
        archiveHabit(
          admin,
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            habitId: h.id,
            expectedRevision: 1,
          },
          deps(),
        ),
      () =>
        setHabitLog(
          admin,
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            habitId: h.id,
            date: today,
            desired: "DONE",
          },
          deps(),
        ),
      () =>
        listStaffHabits(
          admin,
          { workspaceId: f.w.id, clientProfileId: f.cp.id },
          deps(),
        ),
      () => listTodayHabits(admin, { workspaceId: f.w.id }, deps()),
    ])
      await expect(op()).rejects.toThrow();
    expect(await prisma.habit.count()).toBe(habitsBefore);
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
  });

  it("removed coach loses access; retained habit stays completable", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.coachU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Survives",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    await prisma.clientAssignment.updateMany({
      where: { coachMemberId: f.coach.id },
      data: { status: "REMOVED" },
    });
    await expect(
      listStaffHabits(
        sess(f.coachU.id),
        { workspaceId: f.w.id, clientProfileId: f.cp.id },
        deps(),
      ),
    ).rejects.toThrow();
    const done = await setHabitLog(
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
    expect(done.status).toBe("DONE");
  });

  /* ---------------- cohorts / widgets ---------------- */

  it("TL21 lists only non-archived habits scheduled today (fields filter)", async () => {
    const f = await fixture();
    const scheduled = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Today habit",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    const notToday = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Other day",
        target: "T",
        startDate: today,
        weekdays: neverToday,
      },
      deps(),
    );
    const archived = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Archived",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    await archiveHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: archived.id,
        expectedRevision: 1,
      },
      deps(),
    );
    const tl21 = await listTodayHabits(
      sess(f.clientU.id),
      { workspaceId: f.w.id },
      deps(),
    );
    const ids = tl21.habits.map((x) => x.id);
    expect(ids).toContain(scheduled.id);
    expect(ids).not.toContain(notToday.id);
    expect(ids).not.toContain(archived.id);
    // fields subset
    const subset = await listTodayHabits(
      sess(f.clientU.id),
      { workspaceId: f.w.id, fields: [scheduled.id, "foreign-id"] },
      deps(),
    );
    expect(subset.habits.map((x) => x.id)).toEqual([scheduled.id]);
    // A stored layout carries `fields: []` when no subset was picked —
    // that is the full authorized cohort, not an empty one.
    const emptyArr = await listTodayHabits(
      sess(f.clientU.id),
      { workspaceId: f.w.id, fields: [] },
      deps(),
    );
    expect(emptyArr.habits.map((x) => x.id)).toEqual([scheduled.id]);
  });

  it("TL22 aggregates the FULL authorized cohort (>20 habits)", async () => {
    const f = await fixture();
    const HABITS = 22;
    const ids: string[] = [];
    for (let i = 0; i < HABITS; i++) {
      const h = await createHabit(
        sess(f.ownerU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          name: `H ${i}`,
          target: "T",
          startDate: today,
          weekdays: todayOnly,
        },
        deps(),
      );
      ids.push(h.id);
    }
    // mark the first 5 done — every other habit stays unlogged.
    for (const id of ids.slice(0, 5))
      await setHabitLog(
        sess(f.clientU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          habitId: id,
          date: today,
          desired: "DONE",
        },
        deps(),
      );
    const out = await habitConsistency(
      sess(f.clientU.id),
      { workspaceId: f.w.id, period: "7d" },
      deps(),
    );
    // The window [today-6, today] contains exactly one scheduled day
    // (today — startDate is today so earlier days are before enrollment).
    expect(out.totals).toEqual({
      scheduled: HABITS,
      done: 5,
      skipped: 0,
      missing: HABITS - 5,
    });
    expect(out.rows).toHaveLength(HABITS);
    // TL21/staff lists still bound at ≤20 + hasMore
    const staffList = await listStaffHabits(
      sess(f.ownerU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    expect(staffList.habits).toHaveLength(20);
    expect(staffList.hasMore).toBe(true);
  });

  it("TL22 subset: archived selected ID retains history; foreign dropped", async () => {
    const f = await fixture();
    const a = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "A",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    const b = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "B",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    await setHabitLog(
      sess(f.clientU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: a.id,
        date: today,
        desired: "DONE",
      },
      deps(),
    );
    // Archive A — its period history must persist.
    await archiveHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: a.id,
        expectedRevision: 1,
      },
      deps(),
    );
    // Empty fields = all authorized (incl. archived) — both when the key
    // is omitted and when a stored layout carries `fields: []`.
    const all = await habitConsistency(
      sess(f.clientU.id),
      { workspaceId: f.w.id, period: "7d" },
      deps(),
    );
    expect(all.totals.scheduled).toBe(2);
    expect(all.totals.done).toBe(1);
    const emptyArr = await habitConsistency(
      sess(f.clientU.id),
      { workspaceId: f.w.id, period: "7d", fields: [] },
      deps(),
    );
    expect(emptyArr.totals.scheduled).toBe(2);
    // Subset keeps the archived habit's history; foreign IDs drop silently.
    const sub = await habitConsistency(
      sess(f.clientU.id),
      { workspaceId: f.w.id, period: "7d", fields: [a.id, "nope"] },
      deps(),
    );
    expect(sub.rows.map((r) => r.habitId)).toEqual([a.id]);
    expect(sub.totals).toEqual({
      scheduled: 1,
      done: 1,
      skipped: 0,
      missing: 0,
    });
    // A habit from another workspace is never resolved by a fields ID.
    const f2 = await fixture();
    const foreign = await createHabit(
      sess(f2.ownerU.id),
      {
        workspaceId: f2.w.id,
        clientProfileId: f2.cp.id,
        name: "Foreign",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    const dropped = await habitConsistency(
      sess(f.clientU.id),
      { workspaceId: f.w.id, period: "7d", fields: [foreign.id] },
      deps(),
    );
    expect(dropped.totals.scheduled).toBe(0);
    expect(dropped.rows).toHaveLength(0);
    void b;
  });

  it("TL22 staff read at management scope; client config cannot reach others", async () => {
    const f = await fixture();
    await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "A",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    const staff = await habitConsistency(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        period: "7d",
      },
      deps(),
    );
    expect(staff.totals.scheduled).toBe(1);
    // client requesting a foreign clientProfileId is denied (own only)
    const other = await fixture();
    await expect(
      habitConsistency(
        sess(f.clientU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: other.cp.id,
          period: "7d",
        },
        deps(),
      ),
    ).rejects.toThrow();
  });

  it("empty denominator is honest — no invented counts", async () => {
    const f = await fixture();
    const out = await habitConsistency(
      sess(f.clientU.id),
      { workspaceId: f.w.id, period: "7d" },
      deps(),
    );
    expect(out.totals).toEqual({
      scheduled: 0,
      done: 0,
      skipped: 0,
      missing: 0,
    });
    expect(out.rows).toHaveLength(0);
  });

  /* ---------------- transactions / audit ---------------- */

  it("concurrent same-day DONE logs converge — one winner, one no-op", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "T",
        startDate: today,
        weekdays: todayOnly,
      },
      deps(),
    );
    const results = await Promise.all(
      [0, 1].map(() =>
        setHabitLog(
          sess(f.clientU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            habitId: h.id,
            date: today,
            desired: "DONE",
          },
          deps(),
        ),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(["DONE", "DONE"]);
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(await prisma.habitLog.count({ where: { habitId: h.id } })).toBe(1);
  });

  it("concurrent same-revision edits: one commits, one conflicts", async () => {
    const f = await fixture();
    const h = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Walk",
        target: "T",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        editHabit(
          sess(f.ownerU.id),
          {
            workspaceId: f.w.id,
            clientProfileId: f.cp.id,
            habitId: h.id,
            schedule: { weekdays: neverToday, endDate: null },
            expectedRevision: 1,
          },
          deps(),
        ),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await schedulesOf(h.id)).toHaveLength(2);
  });

  it("audit write failure rolls the whole mutation back", async () => {
    const f = await fixture();
    // db wrapper whose tx.auditEvent.create throws — the mutation must
    // not commit and no habit row may survive.
    const failingDb = {
      ...prisma,
      $transaction: (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) =>
        prisma.$transaction((tx) => {
          const wrapped = new Proxy(tx as never, {
            get(t, p) {
              if (p === "auditEvent")
                return new Proxy((t as never)["auditEvent"], {
                  get(a, m) {
                    if (m === "create")
                      return () =>
                        Promise.reject(new Error("audit write failed"));
                    return (a as never)[m];
                  },
                });
              return (t as never)[p];
            },
          });
          return fn(wrapped);
        }, opts as never),
    };
    const habitsBefore = await prisma.habit.count();
    const auditsBefore = await prisma.auditEvent.count();
    await expect(
      createHabit(
        sess(f.ownerU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          name: "Rollback",
          target: "T",
          startDate: today,
          weekdays: allDays,
        },
        { db: failingDb as never },
      ),
    ).rejects.toThrow();
    expect(await prisma.habit.count()).toBe(habitsBefore);
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
  });

  it("denied attempts and no-ops write no audit", async () => {
    const f = await fixture();
    const before = await prisma.auditEvent.count();
    await expect(
      createHabit(
        sess(f.asstU.id),
        {
          workspaceId: f.w.id,
          clientProfileId: f.cp.id,
          name: "X",
          target: "T",
          startDate: today,
          weekdays: allDays,
        },
        deps(),
      ),
    ).rejects.toThrow();
    expect(await prisma.auditEvent.count()).toBe(before);
  });

  it("editor choices list excludes archived habits", async () => {
    const f = await fixture();
    const live = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Live",
        target: "T",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    const dead = await createHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        name: "Dead",
        target: "T",
        startDate: today,
        weekdays: allDays,
      },
      deps(),
    );
    await archiveHabit(
      sess(f.ownerU.id),
      {
        workspaceId: f.w.id,
        clientProfileId: f.cp.id,
        habitId: dead.id,
        expectedRevision: 1,
      },
      deps(),
    );
    const choices = await listHabitChoices(
      sess(f.ownerU.id),
      { workspaceId: f.w.id, clientProfileId: f.cp.id },
      deps(),
    );
    const ids = choices.choices.map((c) => c.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(dead.id);
  });
});
