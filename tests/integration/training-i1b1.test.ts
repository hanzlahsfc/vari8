// TRAINING-I1B-1 (PROMPT 262) — Evergreen program mode against
// disposable PostgreSQL (owner-approved P2 + P2-A1 contract).
//
// Contract under test: an Evergreen program is ongoing — editable and
// publishable beyond seven days (no week-1 lock, no `program_ended`
// ceiling, no date-based completion); published versions stay
// immutable and activate prospectively; `programMode` is locked after
// first publish (a different mode is a replacement, never an in-place
// conversion); `setTrainingProgramTimezone` never advances
// `lockedWeekHighWater` for Evergreen; active programs still end by
// replacement only and pending-leaf cancellation is unchanged. All
// week-based barriers remain intact.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { createStaticConsentPolicy } from "../../lib/consent";
import {
  cancelTrainingProgram,
  publishTrainingProgramVersion,
  readOwnTrainingProgram,
  readStaffTrainingProgram,
  saveTrainingProgramDraft,
  setTrainingProgramTimezone,
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
const localPlus = (n: number) =>
  new Date(Date.UTC(2026, 9, 5) + n * DAY).toISOString().slice(0, 10);

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

const evergreenDraft = (reps: string | number = "8") => ({
  programMode: "EVERGREEN",
  sessions: [{ id: "s1", name: "Day A" }],
  exercises: [{ id: "e1", sessionId: "s1", name: "Squat" }],
  sessionOrder: {},
  exerciseOrder: {},
  sessionPresence: { s1: { "1": true } },
  exercisePresence: { "s1/e1": { "1": true } },
  sessionNames: {},
  fieldCells: {
    "s1/e1/sets": { "1": 3 },
    "s1/e1/reps": { "1": reps },
  },
});

describe.skipIf(!enabled)("TRAINING-I1B-1 Evergreen (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "training_program_version","training_program","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `ti1b${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = (now: Date = NOW) => ({
    db: prisma as never,
    registry: DEV_REGISTRY,
    now,
  });

  async function setup() {
    const w = await prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `eg-${uid()}`, status: "ACTIVE" },
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

  async function createEvergreen(
    coachUserId: string,
    workspaceId: string,
    clientProfileId: string,
    overrides: { startDate?: string; now?: Date; draft?: unknown } = {},
  ) {
    return saveTrainingProgramDraft(
      session(coachUserId),
      {
        workspaceId,
        clientProfileId,
        expectedRevision: 0,
        title: "Ongoing strength",
        startDate: overrides.startDate ?? "2026-10-05",
        weekCount: 12,
        fieldConfig: CFG,
        timezone: "UTC",
        draft: overrides.draft ?? evergreenDraft(),
      },
      deps(overrides.now ?? NOW),
    );
  }

  it("create stores EVERGREEN mode with single-week internal representation", async () => {
    const { w, coachU, cp } = await setup();
    const r = await createEvergreen(coachU.id, w.id, cp.id);
    const row = await prisma.trainingProgram.findUniqueOrThrow({
      where: { id: r.programId },
      select: { programMode: true, weekCount: true },
    });
    expect(row.programMode).toBe("EVERGREEN");
    expect(row.weekCount).toBe(1);
  });

  it("publish v1 stamps mode + one materialized week; client sees ongoing", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const p = await createEvergreen(coachU.id, w.id, cp.id);
    const pub = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        effectiveDate: "2026-10-05",
        expectedPredecessor: null,
      },
      deps(NOW),
    );
    expect(pub.versionSeq).toBe(1);
    const v = await prisma.trainingProgramVersion.findUniqueOrThrow({
      where: { id: pub.versionId },
      select: { payload: true },
    });
    const payload = v.payload as {
      programMode: string;
      weeks: { week: number }[];
    };
    expect(payload.programMode).toBe("EVERGREEN");
    expect(payload.weeks).toHaveLength(1);
    expect(payload.weeks[0].week).toBe(1);
    const view = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(2)),
    );
    expect(view.state).toBe("active");
    expect(view.current?.ongoing).toBe(true);
    expect(view.current?.week?.sessions[0]?.exercises[0]?.reps).toBe("8");
  });

  it("day-8 and day-40: draft stays editable and a second version publishes", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const p = await createEvergreen(coachU.id, w.id, cp.id);
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        effectiveDate: "2026-10-05",
        expectedPredecessor: null,
      },
      deps(NOW),
    );
    // Day 12 — past the seven-day lock a week-based program would have.
    const saved = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        draft: evergreenDraft("10"),
      },
      deps(inDays(12)),
    );
    expect(saved.revision).toBe(p.revision + 1);
    // v2 publishes well beyond the old seven-day publish bound.
    const pub2 = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: saved.revision,
        effectiveDate: localPlus(40),
        expectedPredecessor: null,
      },
      deps(inDays(30)),
    );
    expect(pub2.versionSeq).toBe(2);
    // Earlier version immutable; v2 applies prospectively.
    const v1 = await prisma.trainingProgramVersion.findFirstOrThrow({
      where: { programId: p.programId, versionSeq: 1 },
      select: { payload: true },
    });
    expect(
      (
        v1.payload as {
          weeks: { sessions: { exercises: { reps?: unknown }[] }[] }[];
        }
      ).weeks[0].sessions[0].exercises[0].reps,
    ).toBe("8");
    const view = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(41)),
    );
    expect(view.state).toBe("active");
    expect(view.current?.week?.sessions[0]?.exercises[0]?.reps).toBe("10");
    expect(view.current?.marker?.label).toBe("updated");
  });

  it("evergreen never reports completed by date", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const p = await createEvergreen(coachU.id, w.id, cp.id);
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        effectiveDate: "2026-10-05",
        expectedPredecessor: null,
      },
      deps(NOW),
    );
    const view = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(400)),
    );
    expect(view.state).toBe("active");
    expect(view.current?.ongoing).toBe(true);
  });

  it("timezone change after day 7 never advances lockedWeekHighWater", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createEvergreen(coachU.id, w.id, cp.id);
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        effectiveDate: "2026-10-05",
        expectedPredecessor: null,
      },
      deps(NOW),
    );
    await setTrainingProgramTimezone(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        timezone: "Pacific/Auckland",
      },
      deps(inDays(30)),
    );
    const row = await prisma.trainingProgram.findUniqueOrThrow({
      where: { id: p.programId },
      select: { confirmedTimezone: true, lockedWeekHighWater: true },
    });
    expect(row.confirmedTimezone).toBe("Pacific/Auckland");
    expect(row.lockedWeekHighWater).toBe(0);
    // And a save stays editable after the tz change.
    const saved = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        draft: evergreenDraft("12"),
      },
      deps(inDays(30)),
    );
    expect(saved.revision).toBe(p.revision + 1);
  });

  it("mode is immutable after first publish; pre-publish switch keeps draft coherent", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createEvergreen(coachU.id, w.id, cp.id);
    // Pre-publish: switch to WEEK_BASED — draft mode changes the program.
    const switched = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        weekCount: 6,
        draft: { ...evergreenDraft(), programMode: "WEEK_BASED" },
      },
      deps(NOW),
    );
    const rowPre = await prisma.trainingProgram.findUniqueOrThrow({
      where: { id: p.programId },
      select: { programMode: true, weekCount: true },
    });
    expect(rowPre.programMode).toBe("WEEK_BASED");
    expect(rowPre.weekCount).toBe(6);
    // Back to EVERGREEN and publish.
    const back = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: switched.revision,
        draft: evergreenDraft(),
      },
      deps(NOW),
    );
    const rowMid = await prisma.trainingProgram.findUniqueOrThrow({
      where: { id: p.programId },
      select: { programMode: true, weekCount: true },
    });
    expect(rowMid.programMode).toBe("EVERGREEN");
    expect(rowMid.weekCount).toBe(1);
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: back.revision,
        effectiveDate: "2026-10-05",
        expectedPredecessor: null,
      },
      deps(NOW),
    );
    // Post-publish: a draft carrying a different mode rejects.
    await expect(
      saveTrainingProgramDraft(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          expectedRevision: back.revision,
          draft: { ...evergreenDraft(), programMode: "WEEK_BASED" },
        },
        deps(inDays(2)),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("evergreen ends by replacement; pending-leaf cancel unchanged", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const p = await createEvergreen(coachU.id, w.id, cp.id);
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        effectiveDate: "2026-10-05",
        expectedPredecessor: null,
      },
      deps(NOW),
    );
    // A pending leaf replacement (week-based) can be cancelled as before.
    const leaf = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        title: "Next block",
        startDate: localPlus(14),
        weekCount: 4,
        fieldConfig: CFG,
        timezone: "UTC",
        draft: {
          programMode: "WEEK_BASED",
          sessions: [{ id: "s1", name: "Day A" }],
          exercises: [{ id: "e1", sessionId: "s1", name: "Squat" }],
          sessionOrder: {},
          exerciseOrder: {},
          sessionPresence: { s1: { "1": true } },
          exercisePresence: { "s1/e1": { "1": true } },
          sessionNames: {},
          fieldCells: {
            "s1/e1/sets": { "1": 3 },
            "s1/e1/reps": { "1": "8" },
          },
        },
      },
      deps(NOW),
    );
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: leaf.programId,
        expectedRevision: leaf.revision,
        effectiveDate: localPlus(14),
        expectedPredecessor: p.programId,
      },
      deps(NOW),
    );
    const cancel = await cancelTrainingProgram(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: leaf.programId,
      },
      deps(inDays(3)),
    );
    expect(cancel.programId).toBe(leaf.programId);
    // A successful replacement takes over; evergreen remains active until then.
    const leaf2 = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        title: "Next block",
        startDate: localPlus(14),
        weekCount: 4,
        fieldConfig: CFG,
        timezone: "UTC",
        draft: {
          programMode: "WEEK_BASED",
          sessions: [{ id: "s1", name: "Day A" }],
          exercises: [{ id: "e1", sessionId: "s1", name: "Squat" }],
          sessionOrder: {},
          exerciseOrder: {},
          sessionPresence: { s1: { "1": true } },
          exercisePresence: { "s1/e1": { "1": true } },
          sessionNames: {},
          fieldCells: {
            "s1/e1/sets": { "1": 3 },
            "s1/e1/reps": { "1": "8" },
          },
        },
      },
      deps(NOW),
    );
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: leaf2.programId,
        expectedRevision: leaf2.revision,
        effectiveDate: localPlus(14),
        expectedPredecessor: p.programId,
      },
      deps(NOW),
    );
    const before = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(10)),
    );
    expect(before.current?.programId).toBe(p.programId);
    const after = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(inDays(15)),
    );
    expect(after.current?.programId).toBe(leaf2.programId);
  });

  it("staff detail reports ceiling 0 and evergreen mode; denied client read stays denied", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const p = await createEvergreen(coachU.id, w.id, cp.id);
    await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        effectiveDate: "2026-10-05",
        expectedPredecessor: null,
      },
      deps(NOW),
    );
    const detail = await readStaffTrainingProgram(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
      },
      deps(inDays(30)),
    );
    expect(detail.program.programMode).toBe("EVERGREEN");
    expect(detail.program.ceiling).toBe(0);
    await expect(
      readStaffTrainingProgram(
        session(clientU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
        },
        deps(NOW),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
