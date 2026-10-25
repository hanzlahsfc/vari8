// PR-M10 (#176) — training session + set log on a disposable PostgreSQL
// database (INTEGRATION_DATABASE_URL). Synthetic fixtures only.
//
// Contract under test: a client starts a session against the prescription
// version live at the performed date, saves sets manually (same set twice
// keeps one row), leaves and resumes with every saved set; a version
// published after logging leaves the pinned v1 prescription beside its
// actuals; terminal states are stored explicitly; a flagged set note
// reaches the card-06 check-in review read; the coach reads the session
// and its sets; a client can never touch another client's log.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { createStaticConsentPolicy } from "../../lib/consent";
import type { SessionLike } from "../../lib/auth/guard";
import {
  createCheckInForm,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";
import {
  scheduleCheckInInstance,
  submitCheckInInstance,
} from "../../lib/checkin/instances";
import { readCheckInReviewPanel } from "../../lib/checkin/review-panel";
import {
  finishTrainingSessionLog,
  publishTrainingProgramVersion,
  readOwnSessionLog,
  readStaffTrainingLogs,
  saveTrainingProgramDraft,
  saveTrainingSetLog,
  startTrainingSessionLog,
  TrainingError,
} from "../../lib/trainingprogram/service";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "training-log-dev-privacy-v1",
  HEALTH_DATA: "training-log-dev-health-v1",
});

const NOW = new Date("2026-10-05T12:00:00Z");

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
  setRows: Record<string, Record<string, unknown[]>>;
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
  fieldCells: {},
  setRows: {
    "s1/e1": {
      "1": [
        {
          id: "set-1",
          reps: 8,
          tempo: "2010",
          type: "straight",
          rest: "90s",
          instructions: "",
        },
        {
          id: "set-2",
          reps: 8,
          tempo: "2010",
          type: "straight",
          rest: "90s",
          instructions: "",
        },
      ],
    },
    "s2/e2": {
      "1": [
        {
          id: "set-1",
          reps: 6,
          tempo: "2010",
          type: "straight",
          rest: "60s",
          instructions: "",
        },
      ],
    },
  },
});

describe.skipIf(!enabled)("PR-M10 training session log (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "training_set_log","training_session_log","training_session_booking","training_program_version","training_program","checkin_review","checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `tl${++n}_${Date.now()}`;
  const session = (userId: string): SessionLike => ({ user: { id: userId } });
  const deps = (now: Date = NOW) => ({
    db: prisma as never,
    registry: DEV_REGISTRY,
    now,
  });

  async function setup() {
    const w = await prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `tl-${uid()}`, status: "ACTIVE" },
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
      ["PRIVACY_NOTICE", "training-log-dev-privacy-v1"],
      ["HEALTH_DATA", "training-log-dev-health-v1"],
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

  async function publishProgram(
    s: Awaited<ReturnType<typeof setup>>,
    draft: TestDraft = weekDraft(),
  ) {
    const p = await saveTrainingProgramDraft(
      session(s.coachU.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        expectedRevision: 0,
        title: "Block A",
        startDate: "2026-10-05",
        weekCount: 8,
        fieldConfig: CFG,
        timezone: "UTC",
        draft,
      },
      deps(NOW),
    );
    const pub = await publishTrainingProgramVersion(
      session(s.coachU.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        programId: p.programId,
        expectedRevision: p.revision,
        effectiveDate: "2026-10-05",
        expectedPredecessor: null,
      },
      deps(NOW),
    );
    return { programId: p.programId, versionId: pub.versionId };
  }

  it("start pins the live version and resume returns the in-progress log", async () => {
    const s = await setup();
    const { programId, versionId } = await publishProgram(s);
    const started = await startTrainingSessionLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        programId,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    const row = await prisma.trainingSessionLog.findUniqueOrThrow({
      where: { id: started.sessionLogId },
    });
    expect(row.pinnedVersionId).toBe(versionId);
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.clientProfileId).toBe(s.cp.id);
    const resumed = await readOwnSessionLog(
      session(s.clientU.id),
      { workspaceId: s.w.id, sessionLogId: started.sessionLogId },
      deps(NOW),
    );
    expect(resumed.status).toBe("IN_PROGRESS");
    expect(resumed.pinnedVersionId).toBe(versionId);
    expect(resumed.session.name).toBe("Day A");
    expect(resumed.sets).toEqual([]);
  });

  it("start replay returns the same log — never a second row", async () => {
    const s = await setup();
    const { programId } = await publishProgram(s);
    const input = {
      workspaceId: s.w.id,
      programId,
      sessionId: "s1",
      bookedWeek: 1,
      performedDate: "2026-10-05",
    };
    const first = await startTrainingSessionLog(
      session(s.clientU.id),
      input,
      deps(NOW),
    );
    const again = await startTrainingSessionLog(
      session(s.clientU.id),
      input,
      deps(NOW),
    );
    expect(again.sessionLogId).toBe(first.sessionLogId);
    expect(again.replayed).toBe(true);
    expect(
      await prisma.trainingSessionLog.count({
        where: { clientProfileId: s.cp.id },
      }),
    ).toBe(1);
  });

  it("save two sets, reload, resume returns both", async () => {
    const s = await setup();
    const { programId } = await publishProgram(s);
    const { sessionLogId } = await startTrainingSessionLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        programId,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    for (const [position, setId, reps] of [
      [0, "set-1", 8],
      [1, "set-2", 7],
    ] as const)
      await saveTrainingSetLog(
        session(s.clientU.id),
        {
          workspaceId: s.w.id,
          sessionLogId,
          exerciseId: "e1",
          position,
          set: { setId, actualReps: reps, load: 100, loadUnit: "kg" },
        },
        deps(NOW),
      );
    const resumed = await readOwnSessionLog(
      session(s.clientU.id),
      { workspaceId: s.w.id, sessionLogId },
      deps(NOW),
    );
    expect(resumed.sets).toHaveLength(2);
    expect(resumed.sets.map((r) => r.setId)).toEqual(["set-1", "set-2"]);
    expect(resumed.sets[0].actuals).toMatchObject({
      actualReps: 8,
      load: 100,
      loadUnit: "kg",
    });
    expect(resumed.sets[1].actuals).toMatchObject({ actualReps: 7 });
  });

  it("saving the same set twice keeps one row, later wins", async () => {
    const s = await setup();
    const { programId } = await publishProgram(s);
    const { sessionLogId } = await startTrainingSessionLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        programId,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    for (const reps of [8, 6])
      await saveTrainingSetLog(
        session(s.clientU.id),
        {
          workspaceId: s.w.id,
          sessionLogId,
          exerciseId: "e1",
          position: 0,
          set: { setId: "set-1", actualReps: reps },
        },
        deps(NOW),
      );
    expect(
      await prisma.trainingSetLog.count({ where: { sessionLogId } }),
    ).toBe(1);
    const resumed = await readOwnSessionLog(
      session(s.clientU.id),
      { workspaceId: s.w.id, sessionLogId },
      deps(NOW),
    );
    expect(resumed.sets[0].actuals).toMatchObject({ actualReps: 6 });
  });

  it("a version published after logging leaves the pinned v1 prescription beside the actuals", async () => {
    const s = await setup();
    const { programId, versionId: v1 } = await publishProgram(s);
    const { sessionLogId } = await startTrainingSessionLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        programId,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    await saveTrainingSetLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        sessionLogId,
        exerciseId: "e1",
        position: 0,
        set: { setId: "set-1", actualReps: 8, load: 100, loadUnit: "kg" },
      },
      deps(NOW),
    );
    // Publish v2 with a changed prescription (reps 8 → 12 on set-1).
    const draft2 = weekDraft();
    draft2.setRows["s1/e1"]["1"] = [
      {
        id: "set-1",
        reps: 12,
        tempo: "2010",
        type: "straight",
        rest: "120s",
        instructions: "",
      },
      {
        id: "set-2",
        reps: 12,
        tempo: "2010",
        type: "straight",
        rest: "120s",
        instructions: "",
      },
    ];
    const live = await prisma.trainingProgram.findUniqueOrThrow({
      where: { id: programId },
      select: { draftRevision: true },
    });
    const saved = await saveTrainingProgramDraft(
      session(s.coachU.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        programId,
        expectedRevision: live.draftRevision,
        draft: draft2,
      },
      deps(NOW),
    );
    const v2 = await publishTrainingProgramVersion(
      session(s.coachU.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        programId,
        expectedRevision: saved.revision,
        effectiveDate: "2026-10-05",
        expectedPredecessor: null,
      },
      deps(NOW),
    );
    const resumed = await readOwnSessionLog(
      session(s.clientU.id),
      { workspaceId: s.w.id, sessionLogId },
      deps(NOW),
    );
    expect(resumed.pinnedVersionId).toBe(v1);
    expect(resumed.pinnedVersionSeq).toBe(1);
    const set1 = resumed.session.exercises
      .find((e) => e.id === "e1")
      ?.setRows?.find((r) => r.id === "set-1");
    expect(set1?.reps).toBe(8); // v1 prescription, not v2's 12
    expect(resumed.sets[0].actuals).toMatchObject({
      actualReps: 8,
      load: 100,
    });
    expect(v2.versionId).not.toBe(v1);
  });

  it("finish stores COMPLETED when every prescribed set is logged, PARTIAL otherwise", async () => {
    const s = await setup();
    const { programId } = await publishProgram(s);
    const { sessionLogId } = await startTrainingSessionLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        programId,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    for (const [position, setId] of [
      [0, "set-1"],
      [1, "set-2"],
    ] as const)
      await saveTrainingSetLog(
        session(s.clientU.id),
        {
          workspaceId: s.w.id,
          sessionLogId,
          exerciseId: "e1",
          position,
          set: { setId, actualReps: 8 },
        },
        deps(NOW),
      );
    const done = await finishTrainingSessionLog(
      session(s.clientU.id),
      { workspaceId: s.w.id, sessionLogId, outcome: "completed" },
      deps(NOW),
    );
    expect(done.status).toBe("COMPLETED");

    const s2 = await setup();
    const { programId: p2 } = await publishProgram(s2);
    const { sessionLogId: l2 } = await startTrainingSessionLog(
      session(s2.clientU.id),
      {
        workspaceId: s2.w.id,
        programId: p2,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    await saveTrainingSetLog(
      session(s2.clientU.id),
      {
        workspaceId: s2.w.id,
        sessionLogId: l2,
        exerciseId: "e1",
        position: 0,
        set: { setId: "set-1", actualReps: 8 },
      },
      deps(NOW),
    );
    const partial = await finishTrainingSessionLog(
      session(s2.clientU.id),
      { workspaceId: s2.w.id, sessionLogId: l2, outcome: "completed" },
      deps(NOW),
    );
    expect(partial.status).toBe("PARTIAL");
    const row = await prisma.trainingSessionLog.findUniqueOrThrow({
      where: { id: l2 },
    });
    expect(row.completedAt).not.toBeNull();
  });

  it("skipped sessions store the SKIPPED state and refuse later set saves", async () => {
    const s = await setup();
    const { programId } = await publishProgram(s);
    const { sessionLogId } = await startTrainingSessionLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        programId,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    const skipped = await finishTrainingSessionLog(
      session(s.clientU.id),
      { workspaceId: s.w.id, sessionLogId, outcome: "skipped" },
      deps(NOW),
    );
    expect(skipped.status).toBe("SKIPPED");
    await expect(
      saveTrainingSetLog(
        session(s.clientU.id),
        {
          workspaceId: s.w.id,
          sessionLogId,
          exerciseId: "e1",
          position: 0,
          set: { setId: "set-1", actualReps: 8 },
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "state_conflict" });
  });

  it("a flagged set note reaches the check-in review surface", async () => {
    const s = await setup();
    const { programId } = await publishProgram(s);
    const { sessionLogId } = await startTrainingSessionLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        programId,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    await saveTrainingSetLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        sessionLogId,
        exerciseId: "e1",
        position: 0,
        set: {
          setId: "set-1",
          actualReps: 6,
          note: "Knee pain on the descent",
          flags: ["checkin-review"],
        },
      },
      deps(NOW),
    );
    // A real submission the review panel reads.
    const created = await createCheckInForm(
      session(s.coachU.id),
      { workspaceId: s.w.id, name: `Form ${uid()}` },
      prisma,
    );
    const savedForm = await saveCheckInFormDraft(
      session(s.coachU.id),
      {
        workspaceId: s.w.id,
        formId: created.formId,
        expectedRevision: 1,
        draft: {
          title: "Weekly",
          fields: [
            { kind: "shortText", label: "How are you?", required: true, order: 0 },
          ],
        },
      },
      prisma,
    );
    const published = await publishCheckInForm(
      session(s.coachU.id),
      {
        workspaceId: s.w.id,
        formId: created.formId,
        expectedRevision: savedForm.revision,
      },
      prisma,
    );
    const version = await prisma.checkInFormVersion.findUniqueOrThrow({
      where: {
        formId_versionSeq: {
          formId: created.formId,
          versionSeq: published.versionSeq,
        },
      },
      select: { id: true, definition: true },
    });
    const { instanceId } = await scheduleCheckInInstance(
      session(s.coachU.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        formId: created.formId,
        formVersionId: version.id,
        dueAt: "2026-10-05T09:00:00.000Z",
      },
      deps(NOW),
    );
    const fieldId = (
      version.definition as { fields: { fieldId: string }[] }
    ).fields[0].fieldId;
    await submitCheckInInstance(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: JSON.stringify([{ fieldId, value: "Sore knee today" }]),
      },
      deps(NOW),
    );
    const submission = await prisma.checkInSubmission.findUniqueOrThrow({
      where: { instanceId },
    });
    const panel = await readCheckInReviewPanel(
      session(s.coachU.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId: submission.id,
      },
      deps(NOW),
    );
    expect(panel.flaggedTrainingNotes).toEqual([
      expect.objectContaining({
        exerciseName: "Squat",
        note: "Knee pain on the descent",
        performedDate: "2026-10-05",
      }),
    ]);
  });

  it("the coach reads the session and its sets on the staff log read", async () => {
    const s = await setup();
    const { programId } = await publishProgram(s);
    const { sessionLogId } = await startTrainingSessionLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        programId,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    await saveTrainingSetLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        sessionLogId,
        exerciseId: "e1",
        position: 0,
        set: { setId: "set-1", actualReps: 8, load: 100, loadUnit: "kg" },
      },
      deps(NOW),
    );
    const page = await readStaffTrainingLogs(
      session(s.coachU.id),
      { workspaceId: s.w.id, clientProfileId: s.cp.id },
      deps(NOW),
    );
    const entry = page.logs.find((l) => l.sessionLogId === sessionLogId);
    expect(entry).toBeDefined();
    expect(entry!.session.name).toBe("Day A");
    expect(entry!.sets).toHaveLength(1);
    expect(entry!.sets[0].actuals).toMatchObject({
      actualReps: 8,
      load: 100,
    });
    expect(entry!.performedDate).toBe("2026-10-05");
    expect(entry!.status).toBe("IN_PROGRESS");
  });

  it("a client can never read, start, save or finish another client's log", async () => {
    const s = await setup();
    const other = await setup();
    const { programId } = await publishProgram(s);
    const { sessionLogId } = await startTrainingSessionLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        programId,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    const foreign = session(other.clientU.id);
    await expect(
      readOwnSessionLog(
        foreign,
        { workspaceId: s.w.id, sessionLogId },
        deps(NOW),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      startTrainingSessionLog(
        foreign,
        {
          workspaceId: s.w.id,
          programId,
          sessionId: "s1",
          bookedWeek: 1,
          performedDate: "2026-10-05",
        },
        deps(NOW),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      saveTrainingSetLog(
        foreign,
        {
          workspaceId: s.w.id,
          sessionLogId,
          exerciseId: "e1",
          position: 0,
          set: { setId: "set-1", actualReps: 8 },
        },
        deps(NOW),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      finishTrainingSessionLog(
        foreign,
        { workspaceId: s.w.id, sessionLogId, outcome: "skipped" },
        deps(NOW),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("payload outside the M6 shape fails before any store write", async () => {
    const s = await setup();
    const { programId } = await publishProgram(s);
    const { sessionLogId } = await startTrainingSessionLog(
      session(s.clientU.id),
      {
        workspaceId: s.w.id,
        programId,
        sessionId: "s1",
        bookedWeek: 1,
        performedDate: "2026-10-05",
      },
      deps(NOW),
    );
    await expect(
      saveTrainingSetLog(
        session(s.clientU.id),
        {
          workspaceId: s.w.id,
          sessionLogId,
          exerciseId: "e1",
          position: 0,
          set: { setId: "set-1", actualReps: "eight" },
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      saveTrainingSetLog(
        session(s.clientU.id),
        {
          workspaceId: s.w.id,
          sessionLogId,
          exerciseId: "e1",
          position: 0,
          set: { actualReps: 8 }, // no setId — no idempotency identity
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      saveTrainingSetLog(
        session(s.clientU.id),
        {
          workspaceId: s.w.id,
          sessionLogId,
          exerciseId: "not-an-exercise",
          position: 0,
          set: { setId: "set-1", actualReps: 8 },
        },
        deps(NOW),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(
      await prisma.trainingSetLog.count({ where: { sessionLogId } }),
    ).toBe(0);
    expect(TrainingError).toBeDefined();
  });
});
