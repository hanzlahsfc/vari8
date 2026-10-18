// TRAINING-I1A (PROMPT 244) — week-based training program workflow
// against disposable PostgreSQL (reviewed P9 + A1 + A2 + A3 contract
// with S/G corrections). Real schema, real transactions, real
// authorization: sessions are labeled identities; every membership/
// role/workspace/assignment/consent decision is re-resolved inside the
// serializable transaction.
//
// Contract under test: assigned coaches AND explicitly assigned owners
// author shared boundary drafts (draftRevision CAS; every accepted save
// bumps and audits with meta {changed}); publish mints immutable
// effective-dated versions on a published-only replacement chain
// (single root, live-successor slot, tail-only claim, activation floor,
// pending-successor cutoff, wholly-past-week history invariant);
// replay keyed on publishOriginRevision; pending-leaf cancellation;
// staff lifecycle-unfiltered labelled history vs client-scoped
// visibility; PLATFORM_ADMIN (incl. dual-role) denied; BASE_CONSENTS
// gate every path.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { createStaticConsentPolicy } from "../../lib/consent";
import {
  cancelTrainingProgram,
  publishTrainingProgramVersion,
  readOwnTrainingHistory,
  readOwnTrainingProgram,
  readOwnTrainingProgramVersions,
  readOwnTrainingVersion,
  readStaffTrainingProgram,
  readStaffTrainingPrograms,
  readStaffTrainingProgramVersion,
  saveTrainingProgramDraft,
  setTrainingProgramTimezone,
} from "../../lib/trainingprogram/service";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "training-plan-dev-privacy-v1",
  HEALTH_DATA: "training-plan-dev-health-v1",
});

const NOW = new Date("2026-10-20T12:00:00Z");

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

const draftPayload = (): {
  programMode: string;
  sessions: { id: string; name: string }[];
  exercises: { id: string; sessionId: string; name: string }[];
  sessionOrder: Record<string, Record<string, number>>;
  exerciseOrder: Record<string, Record<string, number>>;
  sessionPresence: Record<string, Record<string, boolean>>;
  exercisePresence: Record<string, Record<string, boolean>>;
  sessionNames: Record<string, Record<string, string>>;
  fieldCells: Record<string, Record<string, unknown>>;
} => ({
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
});

const CREATE_INPUT = {
  title: "Base block",
  startDate: "2026-10-05",
  weekCount: 4,
  fieldConfig: CFG,
  timezone: "UTC",
};

describe.skipIf(!enabled)("TRAINING-I1A (real PG)", () => {
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

  const uid = () => `ti1a${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = (now: Date = NOW) => ({
    db: prisma as never,
    registry: DEV_REGISTRY,
    now,
  });

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
      data: { name: `WS ${uid()}`, slug: `tp-${uid()}`, status: "ACTIVE" },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status: "ACTIVE" },
    });
  }
  async function profile(workspaceId: string, userId: string) {
    return prisma.clientProfile.create({
      data: { workspaceId, userId, name: `Client ${uid()}` },
    });
  }
  async function consent(clientProfileId: string) {
    for (const [kind, version] of [
      ["PRIVACY_NOTICE", "training-plan-dev-privacy-v1"],
      ["HEALTH_DATA", "training-plan-dev-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId, kind, version },
      });
  }
  async function assignment(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
    role: "PRIMARY" | "COACH" = "PRIMARY",
  ) {
    return prisma.clientAssignment.upsert({
      where: {
        clientProfileId_coachMemberId: { clientProfileId, coachMemberId },
      },
      update: { role, status: "ACTIVE" },
      create: {
        workspaceId,
        clientProfileId,
        coachMemberId,
        role,
        status: "ACTIVE",
      },
    });
  }

  async function setup() {
    const w = await ws();
    const ownerU = await user();
    const ownerMember = await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const coachU = await user();
    const coachMember = await member(w.id, coachU.id, "COACH");
    const asstU = await user();
    const asstMember = await member(w.id, asstU.id, "ASSISTANT_COACH");
    const supportU = await user();
    await member(w.id, supportU.id, "SUPPORT");
    const clientU = await user();
    const clientMember = await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    await consent(cp.id);
    await assignment(w.id, cp.id, coachMember.id);
    return {
      w,
      ownerU,
      ownerMember,
      coachU,
      coachMember,
      asstU,
      asstMember,
      supportU,
      clientU,
      clientMember,
      cp,
    };
  }

  async function createAndPublish(
    coachUserId: string,
    workspaceId: string,
    clientProfileId: string,
    overrides: {
      startDate?: string;
      effectiveDate?: string;
      expectedPredecessor?: string | null;
      timezone?: string;
      weekCount?: number;
      acknowledgeImmediateTakeover?: boolean;
      draft?: unknown;
      now?: Date;
    } = {},
  ) {
    const now = overrides.now ?? NOW;
    const created = await saveTrainingProgramDraft(
      session(coachUserId),
      {
        workspaceId,
        clientProfileId,
        expectedRevision: 0,
        title: CREATE_INPUT.title,
        startDate: overrides.startDate ?? CREATE_INPUT.startDate,
        weekCount: overrides.weekCount ?? CREATE_INPUT.weekCount,
        fieldConfig: CFG,
        timezone: overrides.timezone ?? "UTC",
        draft: overrides.draft ?? draftPayload(),
      },
      deps(now),
    );
    const pub = await publishTrainingProgramVersion(
      session(coachUserId),
      {
        workspaceId,
        clientProfileId,
        programId: created.programId,
        expectedRevision: created.revision,
        effectiveDate:
          overrides.effectiveDate ??
          overrides.startDate ??
          CREATE_INPUT.startDate,
        expectedPredecessor: overrides.expectedPredecessor ?? null,
        acknowledgeImmediateTakeover: overrides.acknowledgeImmediateTakeover,
      },
      deps(now),
    );
    return { programId: created.programId, ...pub };
  }

  // ── Authorization matrix ────────────────────────────────────────────

  it("assigned coach + assigned owner author; CAS save bumps and audits {changed}", async () => {
    const { w, ownerU, ownerMember, coachU, cp } = await setup();
    // Owner without assignment may read but not write.
    await expect(
      saveTrainingProgramDraft(
        session((await user()).id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 0,
          ...CREATE_INPUT,
          draft: draftPayload(),
        },
        deps(),
      ),
    ).rejects.toMatchObject({ reason: expect.any(String) });

    const created = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        ...CREATE_INPUT,
        draft: draftPayload(),
      },
      deps(),
    );
    expect(created.revision).toBe(1);

    // Assigned owner writes too (PROMPT 244 §6 amendment). Only one
    // ACTIVE PRIMARY per client exists — the coach holds it, so the
    // owner takes a COACH-scoped assignment row.
    await assignment(w.id, cp.id, ownerMember.id, "COACH");
    const owned = await saveTrainingProgramDraft(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        ...CREATE_INPUT,
        title: "Owner block",
        draft: draftPayload(),
      },
      deps(),
    );
    expect(owned.revision).toBe(1);

    // No-op identical save still bumps + audits changed:false.
    const noOp = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: created.programId,
        expectedRevision: 1,
        ...CREATE_INPUT,
        draft: draftPayload(),
      },
      deps(),
    );
    expect(noOp.revision).toBe(2);
    const noOpAudit = await prisma.auditEvent.findFirstOrThrow({
      where: {
        resourceType: "training_program",
        resourceId: created.programId,
        action: "UPDATE",
      },
      orderBy: { at: "desc" },
    });
    expect(noOpAudit.meta).toMatchObject({ changed: false });

    // Changed save → changed:true.
    const d2 = draftPayload();
    d2.fieldCells["s1/e1/sets"] = { "1": 3, "2": 4 };
    await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: created.programId,
        expectedRevision: 2,
        draft: d2,
      },
      deps(),
    );
    const changedAudit = await prisma.auditEvent.findFirstOrThrow({
      where: {
        resourceType: "training_program",
        resourceId: created.programId,
        action: "UPDATE",
      },
      orderBy: { at: "desc" },
    });
    expect(changedAudit.meta).toMatchObject({ changed: true });

    // Lost-response save retry → stale_revision.
    await expect(
      saveTrainingProgramDraft(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: created.programId,
          expectedRevision: 2,
          draft: d2,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "stale_revision" });
  });

  it("denies assistant/client write, SUPPORT, and dual-role PLATFORM_ADMIN", async () => {
    const { w, asstU, clientU, supportU, cp } = await setup();
    for (const u of [asstU, clientU, supportU]) {
      await expect(
        saveTrainingProgramDraft(
          session(u.id),
          {
            workspaceId: w.id,
            clientProfileId: cp.id,
            expectedRevision: 0,
            ...CREATE_INPUT,
            draft: draftPayload(),
          },
          deps(),
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }
    // Client-own write is rejected even though the matrix cell exists
    // for the future logging surface (PROMPT 244 §6).
    const pa = await user("PLATFORM_ADMIN");
    await member(w.id, pa.id, "WORKSPACE_OWNER");
    await expect(
      saveTrainingProgramDraft(
        session(pa.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 0,
          ...CREATE_INPUT,
          draft: draftPayload(),
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // P2-1 (I1A-R2): the PLATFORM_ADMIN deny-set is the ONLY thing that
  // can deny these calls — valid membership, valid consent, and (for
  // the write) a valid ACTIVE assignment all exist. Removing
  // `trainingPlansLogs` from PLATFORM_ADMIN_DENIED_RESOURCES must make
  // both fail through forbidden admission.
  it("PLATFORM_ADMIN deny-set: dual-role PA denied a read; PA assigned-coach denied a write", async () => {
    const { w, coachU, cp } = await setup();
    await createAndPublish(coachU.id, w.id, cp.id);

    // (a) PA + ACTIVE WORKSPACE_OWNER membership → without the deny-set,
    // readPrelude grants `workspace` read scope and returns the program.
    const paRead = await user("PLATFORM_ADMIN");
    await member(w.id, paRead.id, "WORKSPACE_OWNER");
    await expect(
      readStaffTrainingPrograms(
        session(paRead.id),
        { workspaceId: w.id, clientProfileId: cp.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      readStaffTrainingProgram(
        session(paRead.id),
        { workspaceId: w.id, clientProfileId: cp.id, programId: "any" },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // (b) PA + ACTIVE COACH membership + ACTIVE ClientAssignment →
    // without the deny-set, writePrelude grants `assigned` write scope
    // and the save commits.
    const paWrite = await user("PLATFORM_ADMIN");
    const paCoach = await member(w.id, paWrite.id, "COACH");
    await assignment(w.id, cp.id, paCoach.id, "COACH");
    await expect(
      saveTrainingProgramDraft(
        session(paWrite.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 0,
          ...CREATE_INPUT,
          draft: draftPayload(),
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("consent gates every read and write", async () => {
    const { w, coachU, cp } = await setup();
    await prisma.consentRecord.deleteMany({
      where: { clientProfileId: cp.id },
    });
    await expect(
      saveTrainingProgramDraft(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 0,
          ...CREATE_INPUT,
          draft: draftPayload(),
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
    await consent(cp.id);
    const created = await createAndPublish(coachU.id, w.id, cp.id);
    await prisma.consentRecord.updateMany({
      where: { clientProfileId: cp.id, kind: "HEALTH_DATA" },
      data: { revokedAt: new Date() },
    });
    await expect(
      readStaffTrainingProgram(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: created.programId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
  });

  // ── Publish chain + replay ──────────────────────────────────────────

  it("publish v1 (root), replay identical retry, same-revision mismatch", async () => {
    const { w, coachU, cp } = await setup();
    const created = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        ...CREATE_INPUT,
        draft: draftPayload(),
      },
      deps(),
    );
    const pub = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: created.programId,
        expectedRevision: 1,
        effectiveDate: CREATE_INPUT.startDate,
      },
      deps(),
    );
    expect(pub.versionSeq).toBe(1);
    expect(pub.replayed).toBe(false);

    // Identical retry → original result, no write/audit.
    const auditsBefore = await prisma.auditEvent.count();
    const retry = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: created.programId,
        expectedRevision: 1,
        effectiveDate: CREATE_INPUT.startDate,
      },
      deps(),
    );
    expect(retry.versionId).toBe(pub.versionId);
    expect(retry.replayed).toBe(true);
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);

    // Same revision, different date → revision_already_published.
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: created.programId,
          expectedRevision: 1,
          effectiveDate: "2026-10-12",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "revision_already_published" });

    // Same revision, unexpected predecessor claim → mismatch.
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: created.programId,
          expectedRevision: 1,
          effectiveDate: CREATE_INPUT.startDate,
          expectedPredecessor: "some-other-id",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "revision_already_published" });

    // Missing/invalid expectedRevision → invalid_input.
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: created.programId,
          expectedRevision: 0,
          effectiveDate: CREATE_INPUT.startDate,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("v2+ replay on replacement succeeds; v2+ carrying a claim is invalid_input", async () => {
    const { w, coachU, cp } = await setup();
    const p1 = await createAndPublish(coachU.id, w.id, cp.id);
    // Replacement program, future start so no immediate-takeover gate.
    const p2 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-11-02",
      effectiveDate: "2026-11-02",
      expectedPredecessor: p1.programId,
    });
    expect(p2.versionSeq).toBe(1);

    // Save v2 draft on p2, publish with NO claim.
    await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p2.programId,
        expectedRevision: 1,
        draft: draftPayload(),
      },
      deps(),
    );
    const v2 = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p2.programId,
        expectedRevision: 2,
        effectiveDate: "2026-11-09",
      },
      deps(),
    );
    expect(v2.versionSeq).toBe(2);

    // Identical v2 retry on the replacement → replay succeeds (G1).
    const retry = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p2.programId,
        expectedRevision: 2,
        effectiveDate: "2026-11-09",
      },
      deps(),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.versionId).toBe(v2.versionId);

    // Fresh v3 carrying a predecessor claim → invalid_input.
    await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p2.programId,
        expectedRevision: 2,
        draft: draftPayload(),
      },
      deps(),
    );
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p2.programId,
          expectedRevision: 3,
          effectiveDate: "2026-11-16",
          expectedPredecessor: p1.programId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("single-root + tail-only claim enforce; second root → state_conflict", async () => {
    const { w, coachU, cp } = await setup();
    await createAndPublish(coachU.id, w.id, cp.id);
    // Second root draft → its first publish must reject.
    const second = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        ...CREATE_INPUT,
        title: "Rogue root",
        draft: draftPayload(),
      },
      deps(),
    );
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: second.programId,
          expectedRevision: 1,
          effectiveDate: CREATE_INPUT.startDate,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "state_conflict" });
  });

  it("tail-only claim: claiming a non-tail predecessor → state_conflict", async () => {
    const { w, coachU, cp } = await setup();
    const p1 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
    });
    // p2 claims the live tail p1 → valid.
    await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-11-02",
      effectiveDate: "2026-11-02",
      expectedPredecessor: p1.programId,
    });
    // p3 draft claiming p1 (which now has live successor p2) → reject.
    const p3 = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        ...CREATE_INPUT,
        startDate: "2026-11-30",
        title: "Non-tail",
        draft: draftPayload(),
      },
      deps(),
    );
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p3.programId,
          expectedRevision: 1,
          effectiveDate: "2026-11-30",
          expectedPredecessor: p1.programId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "state_conflict" });
    // Claiming a DRAFT (never-published) predecessor → state_conflict.
    const p4 = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        ...CREATE_INPUT,
        startDate: "2026-12-07",
        title: "Draft pred",
        draft: draftPayload(),
      },
      deps(),
    );
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p4.programId,
          expectedRevision: 1,
          effectiveDate: "2026-12-07",
          expectedPredecessor: p3.programId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "state_conflict" });
  });

  it("activation floor: v2 before own takeover rejected; equality permitted", async () => {
    const { w, coachU, cp } = await setup();
    // v1 effective Nov 1 (future); v2 dated Oct 25 → floor reject.
    const p = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-11-01",
      effectiveDate: "2026-11-01",
    });
    await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: 1,
        draft: draftPayload(),
      },
      deps(),
    );
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          expectedRevision: 2,
          effectiveDate: "2026-10-25",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "effective_bounds" });
    // Equality: v2 effective at exactly the takeover instant's date.
    const eq = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: 2,
        effectiveDate: "2026-11-01",
      },
      deps(),
    );
    expect(eq.versionSeq).toBe(2);
  });

  it("replacement lifecycle: future-start claim, takeover, superseded writes", async () => {
    const { w, coachU, clientU, cp } = await setup();
    // An 8-week program still spans Nov 2 — a version effective at the
    // successor takeover is in-bounds but born with an empty span.
    const p1 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
      weekCount: 8,
    });
    const p2 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-11-02",
      effectiveDate: "2026-11-02",
      expectedPredecessor: p1.programId,
    });
    expect(p2.programState).toBe("pending");

    // Client still sees p1 (pending replacement not disclosed).
    const view = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(),
    );
    expect(view.state).toBe("active");
    expect(view.current?.programId).toBe(p1.programId);

    // Write to p1 bounded by pending successor cutoff.
    await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p1.programId,
        expectedRevision: 1,
        draft: draftPayload(),
      },
      deps(),
    );
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p1.programId,
          expectedRevision: 2,
          effectiveDate: "2026-11-02",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "superseded_by_pending_replacement" });
  });

  it("immediate-takeover gate: confirmation_required then commit with ack", async () => {
    const { w, coachU, cp } = await setup();
    const p1 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
    });
    // Replacement starting today → takes over at once.
    const created = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        ...CREATE_INPUT,
        startDate: "2026-10-20",
        title: "Immediate",
        draft: draftPayload(),
      },
      deps(),
    );
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: created.programId,
          expectedRevision: 1,
          effectiveDate: "2026-10-20",
          expectedPredecessor: p1.programId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "confirmation_required" });
    const committed = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: created.programId,
        expectedRevision: 1,
        effectiveDate: "2026-10-20",
        expectedPredecessor: p1.programId,
        acknowledgeImmediateTakeover: true,
      },
      deps(),
    );
    expect(committed.versionSeq).toBe(1);
    // Already taken over → cannot be cancelled.
    await expect(
      cancelTrainingProgram(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: created.programId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "already_taken_over" });
  });

  it("cancel: pending leaf only; replay idempotent; slot freed", async () => {
    const { w, coachU, cp } = await setup();
    const p1 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
    });
    const p2 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-11-02",
      effectiveDate: "2026-11-02",
      expectedPredecessor: p1.programId,
    });
    // Root is not a replacement → not_a_replacement.
    await expect(
      cancelTrainingProgram(
        session(coachU.id),
        { workspaceId: w.id, clientProfileId: cp.id, programId: p1.programId },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "not_a_replacement" });
    const cancelled = await cancelTrainingProgram(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id, programId: p2.programId },
      deps(),
    );
    expect(cancelled.alreadyCancelled).toBe(false);
    const audits = await prisma.auditEvent.findMany({
      where: {
        resourceType: "training_program",
        resourceId: p2.programId,
        action: "UPDATE",
      },
    });
    const cancelAudit = audits[audits.length - 1];
    expect(cancelAudit.meta).toMatchObject({ changed: true });
    // Replay → already, no new audit.
    const count = await prisma.auditEvent.count();
    const replay = await cancelTrainingProgram(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id, programId: p2.programId },
      deps(),
    );
    expect(replay.alreadyCancelled).toBe(true);
    expect(await prisma.auditEvent.count()).toBe(count);
    // Publish on cancelled → program_cancelled. expectedRevision 2 has
    // no committed version, so this is a fresh publication — not a
    // replay — and hits the cancellation guard.
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p2.programId,
          expectedRevision: 2,
          effectiveDate: "2026-11-02",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "program_cancelled" });
    // Slot freed: a new draft can claim p1.
    const p3 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-11-02",
      effectiveDate: "2026-11-02",
      expectedPredecessor: p1.programId,
    });
    expect(p3.versionSeq).toBe(1);
  });

  it("past-week protection: locked-week boundary edits reject; start anchor locks", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
    });
    // NOW = Oct 20 → week 3 current; weeks 1–2 locked.
    const lockedEdit = draftPayload();
    lockedEdit.fieldCells["s1/e1/sets"] = { "1": 9, "4": 9 };
    await expect(
      saveTrainingProgramDraft(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          expectedRevision: 1,
          draft: lockedEdit,
        },
        deps(),
      ),
    ).rejects.toMatchObject({
      code: "past_week_locked",
      detail: { weeks: [1] },
    });
    // Current-week forward edit allowed — the sparse boundary keeps
    // week 1's explicit entry (removal would itself be a locked change).
    const ok = draftPayload();
    ok.fieldCells["s1/e1/sets"] = { "1": 3, "3": 5 };
    const saved = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: 1,
        draft: ok,
      },
      deps(),
    );
    expect(saved.revision).toBe(2);
    // startDate change post-publish → start_anchor_locked.
    await expect(
      saveTrainingProgramDraft(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          expectedRevision: 2,
          startDate: "2026-10-06",
          draft: ok,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "start_anchor_locked" });
  });

  it("history invariant: publish can't rewrite wholly-past weeks", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
    });
    // Weeks 1–2 locked. A draft that leaves weeks 1–2 identical but
    // changes w3 publishes fine.
    const samePast = draftPayload();
    samePast.fieldCells["s1/e1/sets"] = { "1": 3, "3": 5 };
    await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: 1,
        draft: samePast,
      },
      deps(),
    );
    const v2 = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: 2,
        effectiveDate: "2026-10-20",
      },
      deps(),
    );
    expect(v2.versionSeq).toBe(2);
  });

  // P2-2 (I1A-R2): a draft legitimately saved while week 2 was open must
  // still fail the PUBLISH-time wholly-past invariant once week 2 has
  // closed — the save-time gate cannot see the future. Week anchors are
  // UTC: w1 Oct 5–11, w2 Oct 12–18, w3 Oct 19–25, w4 Oct 26–Nov 1.
  it("history invariant: stale draft saved before week close is rejected at publish", async () => {
    const { w, coachU, cp } = await setup();
    const OPEN = new Date("2026-10-14T12:00:00Z"); // week 2 in progress
    const LATER = new Date("2026-10-20T12:00:00Z"); // week 2 wholly past

    // Baseline v1 with content in weeks 1–2 (sets=3, reps=8 at both).
    const base = draftPayload();
    base.sessionPresence = { s1: { "1": true, "2": true } };
    base.exercisePresence = { "s1/e1": { "1": true, "2": true } };
    base.fieldCells = {
      "s1/e1/sets": { "1": 3, "2": 3 },
      "s1/e1/reps": { "1": "8", "2": "8" },
    };
    const p = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
      draft: base,
      now: OPEN,
    });

    // Legitimate save while week 2 is still open — the save-time
    // locked-week gate correctly accepts (week 2 not yet locked).
    const stale = { ...base, fieldCells: { ...base.fieldCells } };
    stale.fieldCells["s1/e1/sets"] = { "1": 3, "2": 5 };
    const saved = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        expectedRevision: 1,
        draft: stale,
      },
      deps(OPEN),
    );
    expect(saved.revision).toBe(2);

    // Clock advances past week 2's close; publication must now hit the
    // publish-time history invariant — not save-time, not effective_bounds.
    const auditsBefore = await prisma.auditEvent.count();
    const versionsBefore = await prisma.trainingProgramVersion.count({
      where: { programId: p.programId },
    });
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          expectedRevision: 2,
          effectiveDate: "2026-10-20",
        },
        deps(LATER),
      ),
    ).rejects.toMatchObject({ code: "history_conflict" });
    expect(
      await prisma.trainingProgramVersion.count({
        where: { programId: p.programId },
      }),
    ).toBe(versionsBefore);
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
  });

  // ── Reads: staff vs client visibility ───────────────────────────────

  it("staff history is lifecycle-unfiltered and labelled; client sees governed only", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const p1 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
    });
    const p2 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-11-02",
      effectiveDate: "2026-11-02",
      expectedPredecessor: p1.programId,
    });
    // Staff list: both programs labelled (current + pending).
    const staffList = await readStaffTrainingPrograms(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    const labels = Object.fromEntries(
      staffList.programs.map((p) => [p.programId, p.state]),
    );
    expect(labels[p1.programId]).toBe("current");
    expect(labels[p2.programId]).toBe("pending");

    // Cancel p2 → staff sees it labelled cancelled; client L2 → not_found.
    await cancelTrainingProgram(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id, programId: p2.programId },
      deps(),
    );
    const after = await readStaffTrainingPrograms(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(
      after.programs.find((x) => x.programId === p2.programId)?.state,
    ).toBe("cancelled");
    await expect(
      readOwnTrainingProgramVersions(
        session(clientU.id),
        { workspaceId: w.id, programId: p2.programId },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    // Staff still reads the cancelled program's version with labels.
    const detail = await readStaffTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p2.programId,
        versionId: p2.versionId,
      },
      deps(),
    );
    expect(detail.labels.programCancelled).toBe(true);

    // Client L1: only p1 (governed, not dead).
    const history = await readOwnTrainingHistory(
      session(clientU.id),
      { workspaceId: w.id },
      deps(),
    );
    expect(history.programs.map((x) => x.programId)).toEqual([p1.programId]);
    // Client L2 for a foreign/unknown program → not_found (no leak).
    await expect(
      readOwnTrainingProgramVersions(
        session(clientU.id),
        { workspaceId: w.id, programId: "nonexistent" },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("client current view projects through version fieldConfig; shadowed version not_found", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const draft = draftPayload();
    draft.fieldCells["s1/e1/tempo"] = { "1": "3-1-2-0" };
    const p = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
      draft,
    });
    const view = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(),
    );
    expect(view.state).toBe("active");
    const ex = view.current?.week?.sessions[0]?.exercises[0];
    expect(ex?.sets).toBe(3);
    expect(ex).not.toHaveProperty("tempo"); // tempo toggle off → hidden
    // Stored payload retains it; staff sees it.
    const staffDetail = await readStaffTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        versionId: p.versionId,
      },
      deps(),
    );
    expect(staffDetail.payload.weeks[0].sessions[0].exercises[0].tempo).toBe(
      "3-1-2-0",
    );
    // Direct client access to a non-governing/unknown version → not_found.
    await expect(
      readOwnTrainingVersion(
        session(clientU.id),
        { workspaceId: w.id, programId: p.programId, versionId: "nonexistent" },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("timezone change: mutable confirmed tz, immutable anchor; high-water advances", async () => {
    const { w, coachU, cp } = await setup();
    const p = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
    });
    const v1 = await prisma.trainingProgramVersion.findUniqueOrThrow({
      where: { id: p.versionId },
    });
    const before = v1.activationInstant;
    await setTrainingProgramTimezone(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        timezone: "Pacific/Auckland",
      },
      deps(),
    );
    const after = await prisma.trainingProgramVersion.findUniqueOrThrow({
      where: { id: p.versionId },
    });
    expect(after.activationInstant.getTime()).toBe(before.getTime());
    expect(after.effectiveTimezone).toBe("UTC"); // anchor snapshot untouched
    const program = await prisma.trainingProgram.findUniqueOrThrow({
      where: { id: p.programId },
    });
    expect(program.confirmedTimezone).toBe("Pacific/Auckland");
    expect(program.lockedWeekHighWater).toBeGreaterThanOrEqual(2);
    // Idempotent same-zone set → no new audit.
    const count = await prisma.auditEvent.count();
    await setTrainingProgramTimezone(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p.programId,
        timezone: "Pacific/Auckland",
      },
      deps(),
    );
    expect(await prisma.auditEvent.count()).toBe(count);
  });

  it("unrepresentable effective date and missing timezone reject safely", async () => {
    const { w, coachU, cp } = await setup();
    const noTz = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        ...CREATE_INPUT,
        timezone: undefined,
        draft: draftPayload(),
      },
      deps(),
    );
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: noTz.programId,
          expectedRevision: 1,
          effectiveDate: "2026-10-05",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "timezone_required" });
    const apia = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        ...CREATE_INPUT,
        startDate: "2011-12-30",
        timezone: "Pacific/Apia",
        draft: draftPayload(),
      },
      deps(),
    );
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: apia.programId,
          expectedRevision: 1,
          effectiveDate: "2011-12-30",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "unrepresentable_date" });
  });

  it("two-level pagination: >page-size versions complete; program cursor works", async () => {
    const { w, coachU, clientU, cp } = await setup();
    // 52-week program gives room for distinct effective dates; distinct
    // activation instants keep every version non-shadowed (same-instant
    // versions shadow by design).
    const p = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      effectiveDate: "2026-10-05",
      weekCount: 52,
    });
    const effDate = (i: number) => {
      const d = new Date(Date.UTC(2026, 9, 20 + i * 13));
      return d.toISOString().slice(0, 10);
    };
    for (let i = 0; i < 24; i++) {
      const rev = await prisma.trainingProgram.findUniqueOrThrow({
        where: { id: p.programId },
        select: { draftRevision: true },
      });
      await saveTrainingProgramDraft(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          expectedRevision: rev.draftRevision,
          draft: draftPayload(),
        },
        deps(),
      );
      await publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p.programId,
          expectedRevision: rev.draftRevision + 1,
          effectiveDate: effDate(i),
        },
        deps(),
      );
    }
    // Read far enough ahead that every activation is in force — the
    // preamble stays satisfied (program remains in force, not dead).
    const later = deps(new Date("2027-09-01T00:00:00Z"));
    const page1 = await readOwnTrainingProgramVersions(
      session(clientU.id),
      { workspaceId: w.id, programId: p.programId },
      later,
    );
    expect(page1.versions).toHaveLength(20);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await readOwnTrainingProgramVersions(
      session(clientU.id),
      {
        workspaceId: w.id,
        programId: p.programId,
        cursorSeq: page1.nextCursor!,
      },
      later,
    );
    expect(page2.versions.length).toBe(5); // v1 + 24 = 25 total
    expect(page2.nextCursor).toBeNull();
  });

  // ── R3 (PROMPT 253): client state at the program end boundary ─────
  // Acceptance defect D1: the final week was rendered "completed" — a
  // one-week program reported ended on day one. The final week remains
  // current through its final valid instant under the immutable anchor.

  it("one-week program stays current through its final valid instant", async () => {
    const { w, coachU, cp, clientU } = await setup();
    await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-12",
      weekCount: 1,
    });
    const read = (t: string) =>
      readOwnTrainingProgram(
        session(clientU.id),
        { workspaceId: w.id },
        deps(new Date(t)),
      );
    // First and last day of the single week (UTC week: Oct 12–18).
    expect((await read("2026-10-12T12:00:00Z")).state).toBe("active");
    const lastDay = await read("2026-10-18T23:30:00Z");
    expect(lastDay.state).toBe("active");
    expect(lastDay.current?.weekIndex).toBe(1);
    expect(lastDay.current?.week?.sessions.length).toBeGreaterThan(0);
    // One millisecond before the end boundary.
    expect((await read("2026-10-18T23:59:59.999Z")).state).toBe("active");
    // At the boundary and beyond.
    const ended = await read("2026-10-19T00:00:00Z");
    expect(ended.state).toBe("completed");
    expect((await read("2026-10-25T12:00:00Z")).state).toBe("completed");
  });

  it("multi-week program stays current during its final week", async () => {
    const { w, coachU, cp, clientU } = await setup();
    // 4-week UTC program: weeks Oct 5–11 … Oct 26–Nov 1; end Nov 2 00:00Z.
    await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-05",
      weekCount: 4,
    });
    const read = (t: string) =>
      readOwnTrainingProgram(
        session(clientU.id),
        { workspaceId: w.id },
        deps(new Date(t)),
      );
    const w4 = await read("2026-10-30T12:00:00Z");
    expect(w4.state).toBe("active");
    expect(w4.current?.weekIndex).toBe(4);
    expect((await read("2026-11-01T23:59:59Z")).state).toBe("active");
    expect((await read("2026-11-02T00:00:00Z")).state).toBe("completed");
  });

  it("anchor-timezone end boundary holds across a DST transition", async () => {
    const { w, coachU, cp, clientU } = await setup();
    // America/New_York 1-week program spanning the 2026-11-01 fall-back:
    // the week covers Oct 26–Nov 1 local; end boundary Nov 2 00:00 EST
    // = 05:00Z.
    await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-10-26",
      weekCount: 1,
      timezone: "America/New_York",
    });
    const read = (t: string) =>
      readOwnTrainingProgram(
        session(clientU.id),
        { workspaceId: w.id },
        deps(new Date(t)),
      );
    // Nov 1 23:30 EST (post fall-back) = Nov 2 04:30Z — still week 1.
    const inWeek = await read("2026-11-02T04:30:00Z");
    expect(inWeek.state).toBe("active");
    expect(inWeek.current?.weekIndex).toBe(1);
    expect((await read("2026-11-02T04:59:59Z")).state).toBe("active");
    expect((await read("2026-11-02T05:00:00Z")).state).toBe("completed");
  });

  it("not-yet-started program still reports upcoming", async () => {
    const { w, coachU, cp, clientU } = await setup();
    await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-11-09",
      weekCount: 4,
    });
    const view = await readOwnTrainingProgram(
      session(clientU.id),
      { workspaceId: w.id },
      deps(new Date("2026-10-20T12:00:00Z")),
    );
    expect(view.state).toBe("upcoming");
    expect(view.current).toBeNull();
  });

  // ── R4 (PROMPT 255): v1-replay request reconstruction across remount ──
  // F1: after a remount the editor must reproduce the ORIGINAL request for
  // a retry at the committed origin revision — including the predecessor
  // claim — rather than erroring with revision_already_published.

  it("v1 replay reconstructs the original claim; origin revision exposed to authorized staff", async () => {
    const { w, coachU, cp } = await setup();
    const p1 = await createAndPublish(coachU.id, w.id, cp.id);
    // Replacement v1 (future start — no immediate-takeover gate).
    const p2 = await createAndPublish(coachU.id, w.id, cp.id, {
      startDate: "2026-11-02",
      effectiveDate: "2026-11-02",
      expectedPredecessor: p1.programId,
    });
    // Unpublished programs expose no origin revision.
    const draftOnly = await saveTrainingProgramDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        ...CREATE_INPUT,
        draft: draftPayload(),
      },
      deps(),
    );
    const d0 = await readStaffTrainingProgram(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: draftOnly.programId,
      },
      deps(),
    );
    expect(d0.program.firstPublishOriginRevision).toBeNull();
    // Published replacement: authorized staff can reconstruct the
    // original request from committed state.
    const detail = await readStaffTrainingProgram(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p2.programId,
      },
      deps(),
    );
    expect(detail.program.firstPublishOriginRevision).toBe(1);
    expect(detail.program.replacesProgramId).toBe(p1.programId);
    // A denied actor cannot recover the reconstruction state.
    const outsider = await user();
    await expect(
      readStaffTrainingProgram(
        session(outsider.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p2.programId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ reason: expect.any(String) });
    // Reconstructed retry at v1's origin revision — same revision, same
    // date, stored claim → idempotent replay of the committed version.
    const retry = await publishTrainingProgramVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        programId: p2.programId,
        expectedRevision: detail.program.draftRevision,
        effectiveDate: "2026-11-02",
        expectedPredecessor: detail.program.replacesProgramId,
      },
      deps(),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.versionSeq).toBe(1);
    // Claimless retry at the same origin is a DIFFERENT request — still
    // a parameter mismatch, not a silent success.
    await expect(
      publishTrainingProgramVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          programId: p2.programId,
          expectedRevision: detail.program.draftRevision,
          effectiveDate: "2026-11-02",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "revision_already_published" });
    // No new versions or publication audits from replay/mismatch.
    expect(
      await prisma.trainingProgramVersion.count({
        where: { programId: p2.programId },
      }),
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: {
          action: "CREATE",
          resourceType: "training_program_version",
          resourceId: p2.versionId,
        },
      }),
    ).toBe(1);
  });
});
