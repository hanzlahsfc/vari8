// PR-M6 — real-PG round-trip of the ordered per-set prescription shape
// and exercise metadata through the training-program service: draft
// save (boundary document) -> publish (immutable materialized payload)
// -> staff version read (raw) and client current-week read
// (fieldConfig projection). Asserts literal row order and values, not
// shape: this is the "draft round-trips ordered sets" acceptance.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStaticConsentPolicy } from "../../lib/consent";
import {
  publishTrainingProgramVersion,
  readOwnTrainingProgram,
  readStaffTrainingProgramVersion,
  saveTrainingProgramDraft,
} from "../../lib/trainingprogram/service";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "training-plan-dev-privacy-v1",
  HEALTH_DATA: "training-plan-dev-health-v1",
});

const NOW = new Date("2026-10-20T12:00:00Z");

const CFG_ALL_ON = {
  sets: true,
  fixedReps: true,
  repRanges: true,
  tempo: true,
  setType: true,
  restPause: true,
  instructions: true,
  progressionNotes: true,
};

const DRAFT = {
  programMode: "WEEK_BASED",
  sessions: [
    { id: "s-lower", name: "Lower strength" },
    { id: "s-upper", name: "Upper strength" },
  ],
  exercises: [
    {
      id: "e-dead",
      sessionId: "s-lower",
      name: "Deadlift",
      muscle: "hamstrings",
      secondaryMuscles: ["glutes", "back"],
      generalNotes: "Build tension before lifting.",
      libraryItemId: "lib-deadlift",
    },
    { id: "e-ss", sessionId: "s-lower", name: "Split squat", muscle: "glutes" },
    {
      id: "e-bench",
      sessionId: "s-upper",
      name: "Bench press",
      muscle: "chest",
    },
    {
      id: "e-row",
      sessionId: "s-upper",
      name: "Chest-supported row",
      muscle: "back",
    },
  ],
  sessionOrder: {},
  exerciseOrder: {},
  sessionPresence: { "s-lower": { "1": true }, "s-upper": { "1": true } },
  exercisePresence: {
    "s-lower/e-dead": { "1": true },
    "s-lower/e-ss": { "1": true },
    "s-upper/e-bench": { "1": true },
    "s-upper/e-row": { "1": true },
  },
  sessionNames: {},
  fieldCells: {
    "s-lower/e-dead/reps": { "1": "4–5" },
    "s-lower/e-dead/note": { "1": "Leave two reps in reserve" },
    "s-lower/e-ss/reps": { "1": "8 / side" },
    "s-upper/e-bench/reps": { "1": "6" },
    "s-upper/e-row/reps": { "1": "8–10" },
  },
  setRows: {
    "s-lower/e-dead": {
      "1": [
        {
          id: "d1",
          reps: 4,
          repsMax: 5,
          tempo: "31X0",
          type: "Working",
          rest: "180s",
          instructions: "",
          coachNote: "Keep the brace",
        },
        {
          id: "d2",
          reps: 4,
          repsMax: 5,
          tempo: "",
          type: "Working",
          rest: "180s",
          instructions: "",
        },
        {
          id: "d3",
          reps: 4,
          tempo: "",
          type: "Working",
          rest: "180s",
          instructions: "",
        },
        {
          id: "d4",
          reps: 4,
          tempo: "",
          type: "Working",
          rest: "180s",
          instructions: "",
        },
      ],
    },
    "s-lower/e-ss": {
      "1": [
        {
          id: "s1",
          reps: 8,
          tempo: "",
          type: "Working",
          rest: "",
          instructions: "",
        },
        {
          id: "s2",
          reps: 8,
          tempo: "",
          type: "Working",
          rest: "",
          instructions: "",
        },
        {
          id: "s3",
          reps: 8,
          tempo: "",
          type: "Working",
          rest: "",
          instructions: "",
        },
      ],
    },
    "s-upper/e-bench": {
      "1": [
        {
          id: "b1",
          reps: 6,
          tempo: "",
          type: "Working",
          rest: "",
          instructions: "",
        },
        {
          id: "b2",
          reps: 6,
          tempo: "",
          type: "Working",
          rest: "",
          instructions: "",
        },
        {
          id: "b3",
          reps: 6,
          tempo: "",
          type: "Working",
          rest: "",
          instructions: "",
        },
        {
          id: "b4",
          reps: 6,
          tempo: "",
          type: "Working",
          rest: "",
          instructions: "",
        },
      ],
    },
    "s-upper/e-row": {
      "1": [
        {
          id: "r1",
          reps: 8,
          repsMax: 10,
          tempo: "",
          type: "Working",
          rest: "",
          instructions: "",
        },
        {
          id: "r2",
          reps: 8,
          repsMax: 10,
          tempo: "",
          type: "Working",
          rest: "",
          instructions: "",
        },
        {
          id: "r3",
          reps: 8,
          repsMax: 10,
          tempo: "",
          type: "Working",
          rest: "",
          instructions: "",
        },
      ],
    },
  },
};

describe.skipIf(!enabled)("PR-M6 ordered set rows (real PG)", () => {
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

  const uid = () => `m6${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = () => ({
    db: prisma as never,
    registry: DEV_REGISTRY,
    now: NOW,
  });

  it("publishes setRows and serves them identically to staff and client", async () => {
    const w = await prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `m6-${uid()}`, status: "ACTIVE" },
    });
    const coachU = await prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: "Coach",
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
        name: "Client",
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
      data: { workspaceId: w.id, userId: clientU.id, name: "Client A" },
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

    const created = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        title: "Strength foundation",
        startDate: "2026-10-05",
        weekCount: 4,
        fieldConfig: CFG_ALL_ON,
        timezone: "UTC",
        draft: DRAFT,
      },
      deps(),
    );
    const pub = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: created.programId,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-05",
        expectedPredecessor: null,
      },
      deps(),
    );

    // Staff raw version read: literal ordered rows + metadata survive.
    const staff = await readStaffTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: created.programId,
        versionId: pub.versionId,
      },
      deps(),
    );
    const payload = staff.payload as {
      weeks: {
        sessions: {
          exercises: {
            id: string;
            muscle?: string;
            setRows?: { id: string; reps?: number; coachNote?: string }[];
          }[];
        }[];
      }[];
    };
    const lower = payload.weeks[0].sessions[0];
    expect(lower.exercises[0].muscle).toBe("hamstrings");
    expect(lower.exercises[0].setRows?.map((r) => r.id)).toEqual([
      "d1",
      "d2",
      "d3",
      "d4",
    ]);
    expect(lower.exercises[0].setRows?.[0].coachNote).toBe("Keep the brace");

    // Client current-week read: same ordered rows through projection.
    const own = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(),
    );
    expect(own.state).toBe("active");
    const sessions = own.current?.week?.sessions ?? [];
    const deadlift = sessions
      .flatMap((s) => s.exercises)
      .find((e) => e.id === "e-dead");
    expect(deadlift?.muscle).toBe("hamstrings");
    expect(deadlift?.sets).toBe(4);
    expect(deadlift?.setRows?.map((r) => r.id)).toEqual([
      "d1",
      "d2",
      "d3",
      "d4",
    ]);
    expect(deadlift?.reps).toBe("4–5");
    const bench = sessions
      .flatMap((s) => s.exercises)
      .find((e) => e.id === "e-bench");
    expect(bench?.setRows?.map((r) => r.id)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(bench?.sets).toBe(4);
  });
});
