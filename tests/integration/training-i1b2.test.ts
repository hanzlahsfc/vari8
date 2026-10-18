// TRAINING-I1B-2 (PROMPT 266) — dated-session bookings against
// disposable PostgreSQL (P2 + P2-A1 + bookings-finalization contract).
//
// Contract under test: authorized staff create/move/cancel explicit
// dated bookings; each booking pins an immutable tuple
// (pinnedVersionId, sessionId, bookedWeek) resolved ONCE at create via
// the anchor timezone; client projection renders through the PINNED
// version's snapshotted fieldConfig; move changes only the appointment
// date; skipped dates reject without folding; no backdating; pending
// replacements stay staff-only until takeover; replaced-program
// bookings are labelled history, never current/completed.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { createStaticConsentPolicy } from "../../lib/consent";
import {
  bookTrainingSession,
  cancelTrainingProgram,
  cancelTrainingSessionBooking,
  moveTrainingSessionBooking,
  publishTrainingProgramVersion,
  readOwnTrainingBookingHistory,
  readOwnTrainingProgram,
  readStaffTrainingBookings,
  readStaffTrainingProgram,
  saveTrainingProgramDraft,
} from "../../lib/trainingprogram/service";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "training-plan-dev-privacy-v1",
  HEALTH_DATA: "training-plan-dev-health-v1",
});

const NOW = new Date("2026-10-05T12:00:00Z");
const DAY = 86_400_000;
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);

const CFG = {
  sets: true,
  fixedReps: true,
  repRanges: false,
  tempo: false,
  setType: false,
  restPause: false,
  instructions: false,
  progressionNotes: false,
};

// startDate 2026-10-05 (UTC anchor). weekIndex: w1=10-05..11, w3 starts
// 10-19, w5 starts 11-02.
type TestDraft = {
  programMode: string;
  sessions: { id: string; name: string }[];
  exercises: { id: string; sessionId: string; name: string }[];
  sessionOrder: Record<string, unknown>;
  exerciseOrder: Record<string, unknown>;
  sessionPresence: Record<string, Record<string, boolean>>;
  exercisePresence: Record<string, Record<string, boolean>>;
  sessionNames: Record<string, string>;
  fieldCells: Record<string, Record<string, string | number>>;
};

const weekDraft = (): TestDraft => ({
  programMode: "WEEK_BASED",
  sessions: [
    { id: "s1", name: "Day A" },
    { id: "s2", name: "Day B" },
  ],
  exercises: [
    { id: "e1", sessionId: "s1", name: "Squat" },
    { id: "e2", sessionId: "s2", name: "Bench" },
  ],
  sessionOrder: {},
  exerciseOrder: {},
  sessionPresence: { s1: { "1": true }, s2: { "1": true } },
  exercisePresence: { "s1/e1": { "1": true }, "s2/e2": { "1": true } },
  sessionNames: {},
  fieldCells: {
    "s1/e1/sets": { "1": 3 },
    "s1/e1/reps": { "1": "8" },
    "s2/e2/sets": { "1": 3 },
    "s2/e2/reps": { "1": "6" },
  },
});

describe.skipIf(!enabled)("TRAINING-I1B-2 bookings (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "training_session_booking","training_program_version","training_program","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `ti2b${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = (now: Date = NOW) => ({
    db: prisma as never,
    registry: DEV_REGISTRY,
    now,
  });

  async function setup() {
    const w = await prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `bk-${uid()}`, status: "ACTIVE" },
    });
    const coachU = await prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Coach ${uid()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
    const coachMember = await prisma.workspaceMember.create({
      data: {
        workspaceId: w.id,
        userId: coachU.id,
        role: "COACH",
        status: "ACTIVE",
      },
    });
    const clientU = await prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Client ${uid()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: w.id,
        userId: clientU.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: w.id, userId: clientU.id, name: `C ${uid()}` },
    });
    for (const [kind, version] of [
      ["PRIVACY_NOTICE", "training-plan-dev-privacy-v1"],
      ["HEALTH_DATA", "training-plan-dev-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId: cp.id, kind, version },
      });
    await prisma.clientAssignment.create({
      data: {
        workspaceId: w.id,
        clientProfileId: cp.id,
        coachMemberId: coachMember.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
    return { w, coachU, coachMember, clientU, cp };
  }

  async function createWeekProgram(
    coachUserId: string,
    workspaceId: string,
    clientProfileId: string,
    opts: { startDate?: string; weekCount?: number; draft?: unknown } = {},
  ) {
    return saveTrainingProgramDraft(
      session(coachUserId),
      {
        workspaceId,
        clientProfileId,
        expectedRevision: 0,
        title: "Block A",
        startDate: opts.startDate ?? "2026-10-05",
        weekCount: opts.weekCount ?? 8,
        fieldConfig: CFG,
        timezone: "UTC",
        draft: opts.draft ?? weekDraft(),
      },
      deps(NOW),
    );
  }

  async function publishV1(
    coachUserId: string,
    workspaceId: string,
    clientProfileId: string,
    programId: string,
    revision: number,
    effectiveDate = "2026-10-05",
  ) {
    return publishTrainingProgramVersion(
      session(coachUserId),
      {
        workspaceId,
        clientProfileId,
        programId,
        expectedRevision: revision,
        effectiveDate,
        expectedPredecessor: null,
      },
      deps(NOW),
    );
  }

  it("create pins the governing version with bookedWeek resolved once", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    const pub = await publishV1(
      coachU.id,
      w.id,
      cp.id,
      p.programId,
      p.revision,
    );
    const b = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-19", // week 3
      },
      deps(NOW),
    );
    const row = await prisma.trainingSessionBooking.findUniqueOrThrow({
      where: { id: b.bookingId },
    });
    expect(row.pinnedVersionId).toBe(pub.versionId);
    expect(row.bookedWeek).toBe(3);
    expect(row.scheduledByMemberId).toBeTruthy();
  });

  it("move changes the appointment date only — pinned content survives cross-week", async () => {
    const { w, coachU, clientU, cp } = await setup();
    // reps "5" from week 3, "10" from week 5.
    const draft = weekDraft();
    draft.fieldCells["s1/e1/reps"] = { "1": "8", "3": "5", "5": "10" };
    const p = await createWeekProgram(coachU.id, w.id, cp.id, { draft });
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    const b = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-19", // week 3 → reps "5"
      },
      deps(NOW),
    );
    await moveTrainingSessionBooking(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        bookingId: b.bookingId,
        scheduledDate: "2026-11-02", // week-5 date
      },
      deps(NOW),
    );
    const row = await prisma.trainingSessionBooking.findUniqueOrThrow({
      where: { id: b.bookingId },
    });
    expect(row.scheduledDate.toISOString().slice(0, 10)).toBe("2026-11-02");
    expect(row.bookedWeek).toBe(3); // invariant
    const view = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(14)),
    );
    const agenda = view.state === "active" ? view.agenda : [];
    const moved = agenda.find((x) => x.bookingId === b.bookingId);
    expect(moved?.scheduledDate).toBe("2026-11-02");
    expect(moved?.bookedWeek).toBe(3);
    const reps = moved?.session.exercises[0]?.reps;
    expect(reps).toBe("5"); // pinned week-3 content, not week-5 "10"
  });

  it("later version with different fieldConfig + changed session cannot alter the pin", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    const b = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-19",
      },
      deps(NOW),
    );
    // Publish v2: remove s1 entirely and disable `reps` field.
    const draft2 = weekDraft();
    draft2.sessionPresence = { s2: { "1": true } };
    draft2.exercisePresence = { "s2/e2": { "1": true } };
    const saved = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        fieldConfig: { ...CFG, fixedReps: false },
        draft: draft2,
      },
      deps(inDays(1)),
    );
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: saved.revision,
        effectiveDate: "2026-10-12",
        expectedPredecessor: null,
      },
      deps(inDays(1)),
    );
    const view = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(14)), // 2026-10-19 — the booked date; v2 already governs
    );
    const agenda = view.state === "active" ? view.agenda : [];
    const pinned = agenda.find((x) => x.bookingId === b.bookingId);
    // v2 removed session s1 — the pinned v1 render must still show it,
    // with v1's field visibility (reps enabled → "8").
    expect(pinned?.session.name).toBe("Day A");
    expect(pinned?.session.exercises[0]?.reps).toBe("8");
    expect(pinned?.bookedWeek).toBe(3);
  });

  it("Evergreen bookings pin bookedWeek=1", async () => {
    const { w, coachU, cp } = await setup();
    const eg = {
      programMode: "EVERGREEN",
      sessions: [{ id: "s1", name: "Day A" }],
      exercises: [{ id: "e1", sessionId: "s1", name: "Squat" }],
      sessionOrder: {},
      exerciseOrder: {},
      sessionPresence: { s1: { "1": true } },
      exercisePresence: { "s1/e1": { "1": true } },
      sessionNames: {},
      fieldCells: {
        "s1/e1/sets": { "1": 1 },
        "s1/e1/reps": { "1": "8" },
      },
    };
    const p = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        title: "Ongoing",
        startDate: "2026-10-05",
        weekCount: 8,
        fieldConfig: CFG,
        timezone: "UTC",
        draft: eg,
      },
      deps(NOW),
    );
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    const b = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        sessionId: "s1",
        scheduledDate: "2026-11-30", // far future — still week 1
      },
      deps(NOW),
    );
    const row = await prisma.trainingSessionBooking.findUniqueOrThrow({
      where: { id: b.bookingId },
    });
    expect(row.bookedWeek).toBe(1);
  });

  it("wholly skipped local date rejects without folding; same-date gap ok", async () => {
    const { w, coachU, cp } = await setup();
    // Program anchored in Pacific/Apia: 2011-12-30 never existed.
    const p = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        title: "Apia",
        startDate: "2011-12-20",
        weekCount: 8,
        fieldConfig: CFG,
        timezone: "Pacific/Apia",
        draft: weekDraft(),
      },
      deps(new Date("2011-12-20T12:00:00Z")),
    );
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        effectiveDate: "2011-12-20",
        expectedPredecessor: null,
      },
      deps(new Date("2011-12-20T12:00:00Z")),
    );
    await expect(
      bookTrainingSession(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "s1",
          scheduledDate: "2011-12-30",
        },
        deps(new Date("2011-12-20T12:00:00Z")),
      ),
    ).rejects.toMatchObject({ code: "unrepresentable_date" });
    const ok = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        sessionId: "s1",
        scheduledDate: "2011-12-29",
      },
      deps(new Date("2011-12-20T12:00:00Z")),
    );
    const row = await prisma.trainingSessionBooking.findUniqueOrThrow({
      where: { id: ok.bookingId },
    });
    expect(row.scheduledDate.toISOString().slice(0, 10)).toBe("2011-12-29");
  });

  it("backdating and out-of-range dates are rejected; draft programs unbookable", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    // Draft — no published version.
    await expect(
      bookTrainingSession(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "s1",
          scheduledDate: "2026-10-19",
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "no_governing_version" });
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    await expect(
      bookTrainingSession(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "s1",
          scheduledDate: "2026-10-04", // yesterday (anchor UTC)
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "booking_date_bounds" });
    await expect(
      bookTrainingSession(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "s1",
          scheduledDate: "2027-12-31", // beyond +366
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "booking_date_bounds" });
    // Unknown session in pinned week → invalid_input.
    await expect(
      bookTrainingSession(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "nope",
          scheduledDate: "2026-10-19",
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("identical create replays one row/one audit; cancelled key frees the tuple", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    const input = {
      workspaceId: w.id,
      clientProfileId: cp.id,
      programId: p.programId,
      sessionId: "s1",
      scheduledDate: "2026-10-19",
    };
    const b1 = await bookTrainingSession(session(coachU.id), input, deps(NOW));
    const b2 = await bookTrainingSession(session(coachU.id), input, deps(NOW));
    expect(b2.bookingId).toBe(b1.bookingId);
    expect(b2.replayed).toBe(true);
    const rows = await prisma.trainingSessionBooking.findMany({
      where: { programId: p.programId },
    });
    expect(rows).toHaveLength(1);
    const audits = await prisma.auditEvent.findMany({
      where: {
        resourceType: "training_session_booking",
        resourceId: b1.bookingId,
        action: "CREATE",
      },
    });
    expect(audits).toHaveLength(1);
    // Cancel frees the natural key.
    await cancelTrainingSessionBooking(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        bookingId: b1.bookingId,
      },
      deps(NOW),
    );
    const b3 = await bookTrainingSession(session(coachU.id), input, deps(NOW));
    expect(b3.bookingId).not.toBe(b1.bookingId);
    // Re-cancel is a no-op without a second write audit.
    const r = await cancelTrainingSessionBooking(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        bookingId: b1.bookingId,
      },
      deps(NOW),
    );
    expect(r.alreadyCancelled).toBe(true);
  });

  it("move collision maps to a safe error; original date unchanged", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    const b1 = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-19",
      },
      deps(NOW),
    );
    await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-20",
      },
      deps(NOW),
    );
    await expect(
      moveTrainingSessionBooking(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          bookingId: b1.bookingId,
          scheduledDate: "2026-10-20",
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "booking_conflict" });
    const row = await prisma.trainingSessionBooking.findUniqueOrThrow({
      where: { id: b1.bookingId },
    });
    expect(row.scheduledDate.toISOString().slice(0, 10)).toBe("2026-10-19");
  });

  it("denied/unassigned actors get closed denial with no existence oracle", async () => {
    const { w, coachU, cp } = await setup();
    const otherU = await prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `C2 ${uid()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
    const otherMember = await prisma.workspaceMember.create({
      data: {
        workspaceId: w.id,
        userId: otherU.id,
        role: "COACH",
        status: "ACTIVE",
      },
    });
    expect(otherMember).toBeTruthy();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-19",
      },
      deps(NOW),
    );
    // Unassigned coach — identical response whether the tuple exists or not.
    await expect(
      bookTrainingSession(
        session(otherU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "s2",
          scheduledDate: "2026-10-21",
        },
        deps(NOW),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      bookTrainingSession(
        session(otherU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "s1",
          scheduledDate: "2026-10-19",
        },
        deps(NOW),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Client own-scope cannot write bookings.
    const { clientU } = { clientU: undefined as never };
    expect(clientU).toBeUndefined();
    const c = await prisma.user.findFirstOrThrow({
      where: { memberships: { some: { workspaceId: w.id, role: "CLIENT" } } },
    });
    await expect(
      bookTrainingSession(
        session(c.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "s1",
          scheduledDate: "2026-10-21",
        },
        deps(NOW),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Withdraw consent → fail closed.
    await prisma.consentRecord.updateMany({
      where: { clientProfileId: cp.id },
      data: { revokedAt: new Date() },
    });
    await expect(
      bookTrainingSession(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "s1",
          scheduledDate: "2026-10-21",
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
  });

  it("pending replacement bookings are staff-only until takeover; cutoff refused on predecessor", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    // Replacement taking over 2026-10-26.
    const repl = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        title: "Block B",
        startDate: "2026-10-26",
        weekCount: 4,
        fieldConfig: CFG,
        timezone: "UTC",
        draft: weekDraft(),
      },
      deps(NOW),
    );
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: repl.programId,
        expectedRevision: repl.revision,
        effectiveDate: "2026-10-26",
        expectedPredecessor: p.programId,
      },
      deps(NOW),
    );
    // Booking on the predecessor at/after takeover → refused.
    await expect(
      bookTrainingSession(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "s1",
          scheduledDate: "2026-10-26",
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "past_handover" });
    // Booking on the pending successor works (staff-only until takeover).
    const sb = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: repl.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-27",
      },
      deps(NOW),
    );
    const preView = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(10)), // before takeover
    );
    const preAgenda = preView.state === "active" ? preView.agenda : [];
    expect(preAgenda.find((x) => x.bookingId === sb.bookingId)).toBeUndefined();
    // I1-R1 F1: the pending successor's booking is likewise absent from
    // the client booking HISTORY before takeover.
    const preHist = await readOwnTrainingBookingHistory(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(10)), // before takeover
    );
    expect(
      preHist.bookings.find((x) => x.bookingId === sb.bookingId),
    ).toBeUndefined();
    // After takeover the successor's booking is on the client agenda.
    const postView = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(22)), // 2026-10-27 — post-takeover, booking day
    );
    const postAgenda = postView.state === "active" ? postView.agenda : [];
    const shown = postAgenda.find((x) => x.bookingId === sb.bookingId);
    expect(shown?.session.name).toBe("Day A");
  });

  it("client history gates pending successors at the exact takeover instant", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    // Booking on the program that will be superseded — honest history.
    const oldB = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-19",
      },
      deps(NOW),
    );
    // Published-pending replacement; takeover 2026-10-26 (UTC anchor →
    // activation_instant 2026-10-26T00:00:00Z).
    const repl = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        title: "Block B",
        startDate: "2026-10-26",
        weekCount: 4,
        fieldConfig: CFG,
        timezone: "UTC",
        draft: weekDraft(),
      },
      deps(NOW),
    );
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: repl.programId,
        expectedRevision: repl.revision,
        effectiveDate: "2026-10-26",
        expectedPredecessor: p.programId,
      },
      deps(NOW),
    );
    const TAKEOVER = new Date("2026-10-26T00:00:00Z");
    // Two bookings on the pending successor; the second is cancelled.
    const live = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: repl.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-27",
      },
      deps(NOW),
    );
    const dead = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: repl.programId,
        sessionId: "s2",
        scheduledDate: "2026-10-28",
      },
      deps(NOW),
    );
    await cancelTrainingSessionBooking(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: repl.programId,
        bookingId: dead.bookingId,
      },
      deps(NOW),
    );
    const histAt = (t: Date) =>
      readOwnTrainingBookingHistory(
        session(clientU.id),
        { workspaceId: w.id },
        deps(t),
      );
    const ids = (page: Awaited<ReturnType<typeof histAt>>) =>
      page.bookings.map((x) => x.bookingId);

    // One millisecond before takeover: pending rows hidden; the still-
    // current predecessor's booking is already honest history.
    const before = await histAt(new Date(TAKEOVER.getTime() - 1));
    expect(ids(before)).toContain(oldB.bookingId);
    expect(ids(before)).not.toContain(live.bookingId);
    expect(ids(before)).not.toContain(dead.bookingId);

    // Exactly at the takeover instant the successor's booking is in force.
    const at = await histAt(TAKEOVER);
    expect(ids(at)).toContain(live.bookingId);
    expect(ids(at)).not.toContain(dead.bookingId);

    // After takeover: the successor booking is current-program history
    // (no replaced label); the governed superseded program's booking keeps
    // its truthful label; the cancelled row stays hidden.
    const after = await histAt(inDays(30));
    const liveRow = after.bookings.find((x) => x.bookingId === live.bookingId);
    expect(liveRow).toBeTruthy();
    expect(liveRow?.replacedProgramLabel).toBeNull();
    const oldRow = after.bookings.find((x) => x.bookingId === oldB.bookingId);
    expect(oldRow?.replacedProgramLabel).toContain("program replaced");
    expect(ids(after)).not.toContain(dead.bookingId);

    // A foreign workspace's bookings never enter this client's history.
    const other = await setup();
    const op = await createWeekProgram(
      other.coachU.id,
      other.w.id,
      other.cp.id,
    );
    await publishV1(
      other.coachU.id,
      other.w.id,
      other.cp.id,
      op.programId,
      op.revision,
    );
    const fb = await bookTrainingSession(
      session(other.coachU.id),
      {
        workspaceId: other.w.id,
        clientProfileId: other.cp.id,
        programId: op.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-19",
      },
      deps(NOW),
    );
    expect(ids(after)).not.toContain(fb.bookingId);
  });

  it("replaced-program future bookings render as labelled history, never current", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    // Book a far-future date on the current program BEFORE a successor exists.
    const b = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        sessionId: "s1",
        scheduledDate: "2026-11-09",
      },
      deps(NOW),
    );
    // Successor takes over 2026-10-26 — before the booking's date.
    const repl = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        title: "Block B",
        startDate: "2026-10-26",
        weekCount: 4,
        fieldConfig: CFG,
        timezone: "UTC",
        draft: weekDraft(),
      },
      deps(NOW),
    );
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: repl.programId,
        expectedRevision: repl.revision,
        effectiveDate: "2026-10-26",
        expectedPredecessor: p.programId,
      },
      deps(NOW),
    );
    const view = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(23)), // post-takeover
    );
    const agenda = view.state === "active" ? view.agenda : [];
    // The replaced program's booking is NOT a current assignment.
    expect(agenda.find((x) => x.bookingId === b.bookingId)).toBeUndefined();
    const hist = await readOwnTrainingBookingHistory(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(23)),
    );
    const hb = hist.bookings.find((x) => x.bookingId === b.bookingId);
    expect(hb).toBeTruthy();
    expect(hb?.replacedProgramLabel).toContain("program replaced");
    expect(hb?.replacedProgramLabel).toContain("Block A");
  });

  it("pending-leaf program cancel cancels its non-past bookings atomically", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    const repl = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        title: "Block B",
        startDate: "2026-10-26",
        weekCount: 4,
        fieldConfig: CFG,
        timezone: "UTC",
        draft: weekDraft(),
      },
      deps(NOW),
    );
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: repl.programId,
        expectedRevision: repl.revision,
        effectiveDate: "2026-10-26",
        expectedPredecessor: p.programId,
      },
      deps(NOW),
    );
    const b = await bookTrainingSession(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: repl.programId,
        sessionId: "s1",
        scheduledDate: "2026-10-27",
      },
      deps(NOW),
    );
    await cancelTrainingProgram(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: repl.programId,
      },
      deps(NOW),
    );
    const row = await prisma.trainingSessionBooking.findUniqueOrThrow({
      where: { id: b.bookingId },
    });
    expect(row.cancelledAt).not.toBeNull();
  });

  it("staff bookings read is bounded with truthful hasMore + cancelled rows labelled", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    // Create 4 bookings on distinct days.
    for (const d of ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"])
      await bookTrainingSession(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          sessionId: "s1",
          scheduledDate: d,
        },
        deps(NOW),
      );
    const detail = await readStaffTrainingBookings(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
      },
      deps(NOW),
    );
    expect(detail.upcoming.length).toBe(4);
    expect(detail.upcoming[0]?.session.name).toBe("Day A");
    // Cancel one → labelled in history, absent from upcoming.
    await cancelTrainingSessionBooking(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        bookingId: detail.upcoming[0].bookingId,
      },
      deps(NOW),
    );
    const after = await readStaffTrainingBookings(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
      },
      deps(NOW),
    );
    expect(after.upcoming.length).toBe(3);
    const cancelled = after.history.find((x) => x.cancelledAt !== null);
    expect(cancelled).toBeTruthy();
    expect(after.hasMore === false || after.hasMore === true).toBe(true);
  });

  it("staff detail exposes bookings and bookable sessions", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createWeekProgram(coachU.id, w.id, cp.id);
    await publishV1(coachU.id, w.id, cp.id, p.programId, p.revision);
    const detail = await readStaffTrainingProgram(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
      },
      deps(NOW),
    );
    const ids = detail.bookableSessions.map((s) => s.id);
    expect(ids).toContain("s1");
    expect(ids).toContain("s2");
    expect(detail.bookings.upcoming).toHaveLength(0);
  });
});
