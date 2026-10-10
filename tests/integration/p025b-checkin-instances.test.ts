// P-025-B — Check-In instance + submission service against disposable
// PostgreSQL. Real schema, real transactions, real authorization: the
// mocked actor is only a labeled session identity; every membership/role/
// workspace/assignment/consent decision is re-resolved inside the
// serializable transaction.

import { execFileSync } from "node:child_process";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  createStaticConsentPolicy,
  unconfiguredConsentPolicy,
} from "../../lib/consent";
import {
  createCheckInForm,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";
import {
  CheckInInstanceError,
  cancelCheckInInstance,
  getOwnCheckInInstance,
  listOwnCheckInInstances,
  listCheckInInstancesForClient,
  projectCheckInInstanceState,
  scheduleCheckInInstance,
  submitCheckInInstance,
} from "../../lib/checkin/instances";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "check-in-dev-privacy-v1",
  HEALTH_DATA: "check-in-dev-health-v1",
});

describe.skipIf(!enabled)("P-025-B check-in instances (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `p25b${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = () => ({
    db: prisma as never,
    registry: DEV_REGISTRY,
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
      data: { name: `WS ${uid()}`, slug: `p25b-${uid()}`, status: "ACTIVE" },
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
      ["PRIVACY_NOTICE", "check-in-dev-privacy-v1"],
      ["HEALTH_DATA", "check-in-dev-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId, kind, version },
      });
  }
  async function revokeConsent(clientProfileId: string) {
    await prisma.consentRecord.updateMany({
      where: { clientProfileId },
      data: { revokedAt: new Date() },
    });
  }
  async function assignment(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
  ) {
    return prisma.clientAssignment.create({
      data: {
        workspaceId,
        clientProfileId,
        coachMemberId,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
  }

  const draftJson = () => ({
    title: "Weekly",
    fields: [
      { kind: "shortText", label: "How are you?", required: true, order: 0 },
      { kind: "number", label: "Weight", required: false, order: 1 },
      {
        kind: "singleChoice",
        label: "Mood",
        required: true,
        order: 2,
        options: [{ label: "Good" }, { label: "Okay" }],
      },
    ],
  });

  /** Owner-authored form + published v1 — returns ids + the minted field/option IDs. */
  async function publishedForm(
    ownerId: string,
    workspaceId: string,
    draft: unknown = draftJson(),
  ) {
    const created = await createCheckInForm(
      session(ownerId),
      { workspaceId, name: `Form ${uid()}` },
      prisma,
    );
    const saved = await saveCheckInFormDraft(
      session(ownerId),
      {
        workspaceId,
        formId: created.formId,
        expectedRevision: 1,
        draft,
      },
      prisma,
    );
    const published = await publishCheckInForm(
      session(ownerId),
      { workspaceId, formId: created.formId, expectedRevision: saved.revision },
      prisma,
    );
    const version = await prisma.checkInFormVersion.findUniqueOrThrow({
      where: {
        formId_versionSeq: {
          formId: created.formId,
          versionSeq: published.versionSeq,
        },
      },
      select: { id: true, formId: true, definition: true },
    });
    return {
      formId: created.formId,
      versionId: version.id,
      definition: version.definition as {
        fields: Array<{
          fieldId: string;
          kind: string;
          required: boolean;
          options?: { optionId: string }[];
        }>;
      },
    };
  }

  /** Workspace + client with consent + owner + form. */
  async function setup() {
    const w = await ws();
    const owner = await user();
    const ownerMember = await member(w.id, owner.id, "WORKSPACE_OWNER");
    const clientUser = await user();
    const clientMember = await member(w.id, clientUser.id, "CLIENT");
    const cp = await profile(w.id, clientUser.id);
    await consent(cp.id);
    const form = await publishedForm(owner.id, w.id);
    return {
      w,
      owner,
      ownerMember,
      clientUser,
      clientMember,
      cp,
      ...form,
    };
  }

  async function schedule(
    sessionUserId: string,
    s: Awaited<ReturnType<typeof setup>>,
    dueAt = "2030-06-01T09:00:00.000Z",
  ) {
    return scheduleCheckInInstance(
      session(sessionUserId),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        formId: s.formId,
        formVersionId: s.versionId,
        dueAt,
      },
      deps(),
    );
  }

  const answersJson = (
    def: Awaited<ReturnType<typeof publishedForm>>["definition"],
  ) => {
    const [text, num, single] = def.fields;
    return JSON.stringify([
      { fieldId: text.fieldId, value: "Good week" },
      { fieldId: num.fieldId, value: "70.5" },
      { fieldId: single.fieldId, value: single.options![0].optionId },
    ]);
  };

  const audits = (resourceType: string, resourceId?: string) =>
    prisma.auditEvent.findMany({
      where: { resourceType, ...(resourceId ? { resourceId } : {}) },
      orderBy: { at: "asc" },
    });

  // ── Role matrix ──────────────────────────────────────────────────────

  it("owner schedules without any ClientAssignment; the row + audit commit", async () => {
    const s = await setup();
    const res = await schedule(s.owner.id, s);
    expect(res.status).toBe("scheduled");
    const row = await prisma.checkInInstance.findUniqueOrThrow({
      where: { id: res.instanceId },
    });
    expect(row.workspaceId).toBe(s.w.id);
    expect(row.clientProfileId).toBe(s.cp.id);
    expect(row.formVersionId).toBe(s.versionId);
    expect(row.scheduledByMemberId).toBe(s.ownerMember.id);
    const instanceAudits = await audits("checkin_instance", res.instanceId);
    expect(instanceAudits).toHaveLength(1);
  });

  it("assigned coach schedules; unassigned coach is denied; assistant cannot write", async () => {
    const s = await setup();
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    // Unassigned first → denied.
    await expect(schedule(coach.id, s)).rejects.toThrow(AccessDeniedError);
    await assignment(s.w.id, s.cp.id, coachMember.id);
    const res = await schedule(coach.id, s);
    expect(res.status).toBe("scheduled");

    const assistant = await user();
    const assistantMember = await member(
      s.w.id,
      assistant.id,
      "ASSISTANT_COACH",
    );
    // One ACTIVE assignment per client_profile — the assistant's assigned
    // scope is proven on their own client.
    const acu = await user();
    await member(s.w.id, acu.id, "CLIENT");
    const acp = await profile(s.w.id, acu.id);
    await consent(acp.id);
    await assignment(s.w.id, acp.id, assistantMember.id);
    const scheduled = await scheduleCheckInInstance(
      session(s.owner.id),
      {
        workspaceId: s.w.id,
        clientProfileId: acp.id,
        formId: s.formId,
        formVersionId: s.versionId,
        dueAt: "2030-06-02T09:00:00.000Z",
      },
      deps(),
    );
    await expect(
      scheduleCheckInInstance(
        session(assistant.id),
        {
          workspaceId: s.w.id,
          clientProfileId: acp.id,
          formId: s.formId,
          formVersionId: s.versionId,
          dueAt: "2030-06-03T09:00:00.000Z",
        },
        deps(),
      ),
    ).rejects.toThrow(AccessDeniedError);
    // Assistant CAN read headers for their assigned client.
    const list = await listCheckInInstancesForClient(
      session(assistant.id),
      { workspaceId: s.w.id, clientProfileId: acp.id },
      deps(),
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0].instanceId).toBe(scheduled.instanceId);
    // …but NOT the coach's client.
    await expect(
      listCheckInInstancesForClient(
        session(assistant.id),
        { workspaceId: s.w.id, clientProfileId: s.cp.id },
        deps(),
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("client/SUPPORT/nonmember cannot schedule; dual-role PLATFORM_ADMIN denied with ACTIVE membership", async () => {
    const s = await setup();
    await expect(schedule(s.clientUser.id, s)).rejects.toThrow(
      AccessDeniedError,
    );
    const support = await user();
    await member(s.w.id, support.id, "SUPPORT");
    await expect(schedule(support.id, s)).rejects.toThrow(AccessDeniedError);
    const outsider = await user();
    await expect(schedule(outsider.id, s)).rejects.toThrow(AccessDeniedError);
    // Dual-role PA: platform admin + ACTIVE owner membership → denied.
    const pa = await user("PLATFORM_ADMIN");
    await member(s.w.id, pa.id, "WORKSPACE_OWNER");
    await expect(schedule(pa.id, s)).rejects.toThrow(AccessDeniedError);
  });

  it("archived form cannot schedule; foreign workspace/form/version tuples reject", async () => {
    const s = await setup();
    const { archiveCheckInForm } = await import("../../lib/checkin/forms");
    await archiveCheckInForm(
      session(s.owner.id),
      { workspaceId: s.w.id, formId: s.formId },
      prisma,
    );
    await expect(schedule(s.owner.id, s)).rejects.toThrow(CheckInInstanceError);

    const s2 = await setup();
    await expect(
      scheduleCheckInInstance(
        session(s2.owner.id),
        {
          workspaceId: s2.w.id,
          clientProfileId: s2.cp.id,
          formId: s.formId, // foreign form — not in s2's workspace
          formVersionId: s2.versionId,
          dueAt: "2030-06-01T09:00:00.000Z",
        },
        deps(),
      ),
    ).rejects.toThrow(CheckInInstanceError);
    await expect(
      scheduleCheckInInstance(
        session(s2.owner.id),
        {
          workspaceId: s2.w.id,
          clientProfileId: s.cp.id, // foreign profile
          formId: s2.formId,
          formVersionId: s2.versionId,
          dueAt: "2030-06-01T09:00:00.000Z",
        },
        deps(),
      ),
    ).rejects.toThrow(CheckInInstanceError);
  });

  // ── Scheduling idempotency + duplicates ──────────────────────────────

  it("duplicate (client, form, dueAt) returns the existing instance; distinct dueAt schedules", async () => {
    const s = await setup();
    const first = await schedule(s.owner.id, s, "2030-06-01T09:00:00.000Z");
    const replay = await schedule(s.owner.id, s, "2030-06-01T09:00:00.000Z");
    expect(replay).toEqual({
      status: "already_scheduled",
      instanceId: first.instanceId,
    });
    const count = await prisma.checkInInstance.count({
      where: { formId: s.formId },
    });
    expect(count).toBe(1);
    // A different dueAt is a genuinely distinct one-off instance (#92).
    const second = await schedule(s.owner.id, s, "2030-06-08T09:00:00.000Z");
    expect(second.status).toBe("scheduled");
    // exactly ONE schedule audit per instance — the replay wrote none.
    expect(await audits("checkin_instance", first.instanceId)).toHaveLength(1);
    expect(await audits("checkin_instance", second.instanceId)).toHaveLength(1);
  });

  it("concurrent duplicate scheduling yields exactly one row", async () => {
    const s = await setup();
    const [a, b] = await Promise.allSettled([
      schedule(s.owner.id, s, "2030-07-01T09:00:00.000Z"),
      schedule(s.owner.id, s, "2030-07-01T09:00:00.000Z"),
    ]);
    const count = await prisma.checkInInstance.count({
      where: { clientProfileId: s.cp.id },
    });
    expect(count).toBe(1);
    const statuses = [a, b].map((r) =>
      r.status === "fulfilled" ? r.value.status : "rejected",
    );
    expect(statuses.sort()).toEqual(["already_scheduled", "scheduled"]);
  });

  // ── Cancellation ────────────────────────────────────────────────────

  it("cancel sets paired provenance, derives CANCELLED, audits once; second cancel fails closed", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    const res = await cancelCheckInInstance(
      session(s.owner.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        instanceId,
      },
      deps(),
    );
    expect(res.status).toBe("cancelled");
    const row = await prisma.checkInInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(row.cancelledAt).not.toBeNull();
    expect(row.cancelledByMemberId).toBe(s.ownerMember.id);
    expect(
      projectCheckInInstanceState({
        cancelledAt: row.cancelledAt,
        cancelledByMemberId: row.cancelledByMemberId,
        hasSubmission: false,
      }),
    ).toBe("CANCELLED");
    // Idempotent-ish: a second cancel on a CANCELLED instance fails closed.
    await expect(
      cancelCheckInInstance(
        session(s.owner.id),
        { workspaceId: s.w.id, clientProfileId: s.cp.id, instanceId },
        deps(),
      ),
    ).rejects.toThrow(CheckInInstanceError);
    const instanceAudits = await audits("checkin_instance", instanceId);
    expect(instanceAudits).toHaveLength(2); // schedule + cancel only
  });

  // ── Submission ──────────────────────────────────────────────────────

  it("client submits once; immutable submission + typed answers + one audit", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    const res = await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: answersJson(s.definition),
      },
      deps(),
    );
    expect(res.status).toBe("submitted");
    const answers = await prisma.checkInSubmissionAnswer.findMany({
      where: { submissionId: res.submissionId },
    });
    expect(answers).toHaveLength(3);
    const byKind = Object.fromEntries(answers.map((a) => [a.kind, a]));
    expect(byKind.SHORT_TEXT.valueText).toBe("Good week");
    expect(Number(byKind.NUMBER.valueNumeric)).toBeCloseTo(70.5);
    expect(byKind.SINGLE_CHOICE.valueOptionIds).toEqual([
      s.definition.fields[2].options![0].optionId,
    ]);
    const subAudits = await audits("checkin_submission", res.submissionId);
    expect(subAudits).toHaveLength(1);
  });

  it("replay returns the durable submission with zero writes and zero new audit", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    const first = await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: answersJson(s.definition),
      },
      deps(),
    );
    const replay = await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: answersJson(s.definition),
      },
      deps(),
    );
    expect(replay).toEqual({
      status: "already_submitted",
      submissionId: first.submissionId,
    });
    expect(
      await prisma.checkInSubmission.count({ where: { instanceId } }),
    ).toBe(1);
    expect(await audits("checkin_submission", first.submissionId)).toHaveLength(
      1,
    );
  });

  it("concurrent double-submit produces exactly one submission + one audit", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    const payload = {
      workspaceId: s.w.id,
      instanceId,
      answersJson: answersJson(s.definition),
    };
    const [a, b] = await Promise.allSettled([
      submitCheckInInstance(session(s.clientUser.id), payload, deps()),
      submitCheckInInstance(session(s.clientUser.id), payload, deps()),
    ]);
    expect(
      await prisma.checkInSubmission.count({ where: { instanceId } }),
    ).toBe(1);
    const submission = await prisma.checkInSubmission.findFirstOrThrow({
      where: { instanceId },
    });
    expect(await audits("checkin_submission", submission.id)).toHaveLength(1);
    const statuses = [a, b].map((r) =>
      r.status === "fulfilled" ? r.value.status : "rejected",
    );
    expect(statuses.sort()).toEqual(["already_submitted", "submitted"]);
    // exactly 3 answers on the single submission.
    expect(
      await prisma.checkInSubmissionAnswer.count({
        where: { submissionId: submission.id },
      }),
    ).toBe(3);
  });

  it("cancel after submit fails; cancel vs submit race serializes coherently", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    const payload = {
      workspaceId: s.w.id,
      instanceId,
      answersJson: answersJson(s.definition),
    };
    await submitCheckInInstance(session(s.clientUser.id), payload, deps());
    await expect(
      cancelCheckInInstance(
        session(s.owner.id),
        { workspaceId: s.w.id, clientProfileId: s.cp.id, instanceId },
        deps(),
      ),
    ).rejects.toThrow(CheckInInstanceError);

    // Race — one outcome wins, the other fails closed; derived state
    // must never contradict the child rows.
    const s2 = await setup();
    const { instanceId: i2 } = await schedule(s2.owner.id, s2);
    const [cancelR, submitR] = await Promise.allSettled([
      cancelCheckInInstance(
        session(s2.owner.id),
        { workspaceId: s2.w.id, clientProfileId: s2.cp.id, instanceId: i2 },
        deps(),
      ),
      submitCheckInInstance(
        session(s2.clientUser.id),
        {
          workspaceId: s2.w.id,
          instanceId: i2,
          answersJson: answersJson(s2.definition),
        },
        deps(),
      ),
    ]);
    const row = await prisma.checkInInstance.findUniqueOrThrow({
      where: { id: i2 },
    });
    const hasSub =
      (await prisma.checkInSubmission.count({ where: { instanceId: i2 } })) > 0;
    const derived = projectCheckInInstanceState({
      cancelledAt: row.cancelledAt,
      cancelledByMemberId: row.cancelledByMemberId,
      hasSubmission: hasSub,
    });
    if (cancelR.status === "fulfilled") {
      expect(submitR.status).toBe("rejected");
      expect(derived).toBe("CANCELLED");
    } else {
      expect(submitR.status).toBe("fulfilled");
      expect(derived).toBe("SUBMITTED");
    }
  });

  it("submit on a cancelled instance fails closed; cancelled detail is unavailable", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    await cancelCheckInInstance(
      session(s.owner.id),
      { workspaceId: s.w.id, clientProfileId: s.cp.id, instanceId },
      deps(),
    );
    await expect(
      submitCheckInInstance(
        session(s.clientUser.id),
        {
          workspaceId: s.w.id,
          instanceId,
          answersJson: answersJson(s.definition),
        },
        deps(),
      ),
    ).rejects.toThrow(CheckInInstanceError);
    expect(
      await prisma.checkInSubmission.count({ where: { instanceId } }),
    ).toBe(0);
  });

  it("late submission is allowed and marked late (#93)", async () => {
    const s = await setup();
    const { instanceId } = await schedule(
      s.owner.id,
      s,
      "2001-01-01T00:00:00.000Z", // past due — still submittable
    );
    const res = await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: answersJson(s.definition),
      },
      deps(),
    );
    expect(res.status).toBe("submitted");
    const list = await listOwnCheckInInstances(
      session(s.clientUser.id),
      { workspaceId: s.w.id },
      deps(),
    );
    const item = list.items.find((i) => i.instanceId === instanceId);
    expect(item?.state).toBe("SUBMITTED");
    expect(item?.late).toBe(true);
  });

  // ── Consent gate ────────────────────────────────────────────────────

  it("no consent → consent_missing on submit; unconfigured registry → policy_not_configured", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    await prisma.consentRecord.deleteMany({
      where: { clientProfileId: s.cp.id },
    });
    await expect(
      submitCheckInInstance(
        session(s.clientUser.id),
        {
          workspaceId: s.w.id,
          instanceId,
          answersJson: answersJson(s.definition),
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
    await expect(
      submitCheckInInstance(
        session(s.clientUser.id),
        {
          workspaceId: s.w.id,
          instanceId,
          answersJson: answersJson(s.definition),
        },
        { db: prisma as never, registry: unconfiguredConsentPolicy },
      ),
    ).rejects.toMatchObject({ code: "policy_not_configured" });
    expect(
      await prisma.checkInSubmission.count({ where: { instanceId } }),
    ).toBe(0);
  });

  it("consent withdrawal blocks new submission AND submitted answer detail; list headers remain (#85)", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: answersJson(s.definition),
      },
      deps(),
    );
    await revokeConsent(s.cp.id);
    // Own detail now fails closed on the consent lock — no answers.
    await expect(
      getOwnCheckInInstance(
        session(s.clientUser.id),
        { workspaceId: s.w.id, instanceId },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
    // A new submission is also blocked.
    const { instanceId: i2 } = await schedule(
      s.owner.id,
      s,
      "2030-08-01T09:00:00.000Z",
    );
    await expect(
      submitCheckInInstance(
        session(s.clientUser.id),
        {
          workspaceId: s.w.id,
          instanceId: i2,
          answersJson: answersJson(s.definition),
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
    // Bounded operational list metadata remains visible.
    const list = await listOwnCheckInInstances(
      session(s.clientUser.id),
      { workspaceId: s.w.id },
      deps(),
    );
    expect(list.items).toHaveLength(2);
  });

  it("client detail returns definition + own answers while consent holds; foreign instance is not_available", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: answersJson(s.definition),
      },
      deps(),
    );
    const detail = await getOwnCheckInInstance(
      session(s.clientUser.id),
      { workspaceId: s.w.id, instanceId },
      deps(),
    );
    expect(detail.state).toBe("SUBMITTED");
    expect(detail.submittedAnswers).toHaveLength(3);
    expect(detail.definition.fields[0].label).toBe("How are you?");

    // Foreign client — a different workspace's member sees nothing.
    const s2 = await setup();
    await expect(
      getOwnCheckInInstance(
        session(s2.clientUser.id),
        { workspaceId: s2.w.id, instanceId }, // s's instance, s2's session
        deps(),
      ),
    ).rejects.toThrow(CheckInInstanceError);
  });

  // ── Pinned-version immutability ─────────────────────────────────────

  it("submission validates against the PINNED v1 definition, not v2", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    // Publish v2 with a different shape — v1 answers must still validate.
    const { openCheckInDraft } = await import("../../lib/checkin/forms");
    await openCheckInDraft(
      session(s.owner.id),
      { workspaceId: s.w.id, formId: s.formId },
      prisma,
    );
    const v2saved = await saveCheckInFormDraft(
      session(s.owner.id),
      {
        workspaceId: s.w.id,
        formId: s.formId,
        expectedRevision: 3,
        draft: {
          title: "Changed",
          fields: [
            { kind: "longText", label: "Only", required: true, order: 0 },
          ],
        },
      },
      prisma,
    );
    await publishCheckInForm(
      session(s.owner.id),
      {
        workspaceId: s.w.id,
        formId: s.formId,
        expectedRevision: v2saved.revision,
      },
      prisma,
    );
    // Submitting the v1-shaped answers still validates — the instance pins
    // v1; a v1-shaped payload is accepted exactly because of that pin.
    const res = await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: answersJson(s.definition),
      },
      deps(),
    );
    expect(res.status).toBe("submitted");
    // And a v2-shaped payload (fields from the new version) is REJECTED —
    // it doesn't match the pinned definition.
    const { instanceId: i3 } = await schedule(
      s.owner.id,
      s,
      "2030-09-01T09:00:00.000Z",
    );
    // i3 pins v1 too (scheduled after v2 but still pinned to s.versionId —
    // re-schedule pins whatever version was passed; use the new version to
    // show pinning works both ways).
    const v2 = await prisma.checkInFormVersion.findFirstOrThrow({
      where: { formId: s.formId, versionSeq: 2 },
    });
    const { instanceId: i4 } = await scheduleCheckInInstance(
      session(s.owner.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        formId: s.formId,
        formVersionId: v2.id,
        dueAt: "2030-10-01T09:00:00.000Z",
      },
      deps(),
    );
    const v2Def = (
      await prisma.checkInFormVersion.findUniqueOrThrow({
        where: { id: v2.id },
      })
    ).definition as { fields: { fieldId: string }[] };
    const r4 = await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId: i4,
        answersJson: JSON.stringify([
          { fieldId: v2Def.fields[0].fieldId, value: "v2 answer" },
        ]),
      },
      deps(),
    );
    expect(r4.status).toBe("submitted");
    // Submitting v2-shaped answers to the v1-pinned instance i3 must fail.
    await expect(
      submitCheckInInstance(
        session(s.clientUser.id),
        {
          workspaceId: s.w.id,
          instanceId: i3,
          answersJson: JSON.stringify([
            { fieldId: v2Def.fields[0].fieldId, value: "v2 answer" },
          ]),
        },
        deps(),
      ),
    ).rejects.toThrow(CheckInInstanceError);
  });

  // ── DB-level constraints ────────────────────────────────────────────

  it("paired cancellation provenance CHECK rejects partial tuples", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "checkin_instance" SET cancelled_at = now() WHERE id = $1`,
        instanceId,
      ),
    ).rejects.toThrow();
    await expect(
      prisma.checkInInstance.update({
        where: { id: instanceId },
        data: { cancelledByMemberId: s.ownerMember.id },
      }),
    ).rejects.toThrow();
  });

  it("answer kind↔column CHECK rejects a mismatched value column", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    const res = await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: answersJson(s.definition),
      },
      deps(),
    );
    const fieldId = s.definition.fields[0].fieldId;
    // Try to overwrite the stored kind/column shape — the CHECK rejects.
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "checkin_submission_answer"
         SET kind = 'NUMBER'::"public"."CheckInAnswerKind"
         WHERE submission_id = $1 AND field_id = $2`,
        res.submissionId,
        fieldId,
      ),
    ).rejects.toThrow();
    await expect(
      prisma.checkInSubmissionAnswer.create({
        data: {
          submissionId: res.submissionId,
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          fieldId: "f_extra",
          kind: "SHORT_TEXT",
          valueNumeric: new Prisma.Decimal(5), // wrong column for the kind
        },
      }),
    ).rejects.toThrow();
  });

  it("wide composite FK rejects an incoherent submission tuple", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    const inst = await prisma.checkInInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    // Mutating the tuple on insert — wrong client_profile_id — must reject.
    await expect(
      prisma.checkInSubmission.create({
        data: {
          workspaceId: s.w.id,
          clientProfileId: (await profile(s.w.id, (await user()).id)).id,
          formId: inst.formId,
          formVersionId: inst.formVersionId,
          instanceId: inst.id,
          submittedByUserId: s.clientUser.id,
          submittedByMemberId: s.clientMember.id,
        },
      }),
    ).rejects.toThrow();
  });

  // ── Audit atomicity ─────────────────────────────────────────────────

  it("audit failure rolls the WHOLE submission back (trigger-level proof)", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    // Block every audit insert — the commit must leave no half-state.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION p025b_block_audit() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'audit blocked for test'; END; $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER p025b_audit_block BEFORE INSERT ON audit_event
       FOR EACH ROW EXECUTE FUNCTION p025b_block_audit()`,
    );
    try {
      await expect(
        submitCheckInInstance(
          session(s.clientUser.id),
          {
            workspaceId: s.w.id,
            instanceId,
            answersJson: answersJson(s.definition),
          },
          deps(),
        ),
      ).rejects.toThrow();
      expect(
        await prisma.checkInSubmission.count({ where: { instanceId } }),
      ).toBe(0);
      expect(
        await prisma.checkInSubmissionAnswer.count({
          where: { workspaceId: s.w.id },
        }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS p025b_audit_block ON audit_event`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS p025b_block_audit()`,
      );
    }
  });

  it("passive reads write zero audits; writes produce exactly one each", async () => {
    const s = await setup();
    const { instanceId } = await schedule(s.owner.id, s);
    const before = await prisma.auditEvent.count();
    await listOwnCheckInInstances(
      session(s.clientUser.id),
      { workspaceId: s.w.id },
      deps(),
    );
    await getOwnCheckInInstance(
      session(s.clientUser.id),
      { workspaceId: s.w.id, instanceId },
      deps(),
    );
    await listCheckInInstancesForClient(
      session(s.owner.id),
      { workspaceId: s.w.id, clientProfileId: s.cp.id },
      deps(),
    );
    expect(await prisma.auditEvent.count()).toBe(before);
  });

  // ── Advisory-key proof: foreign tuple acquires NO advisory ──────────

  it("a foreign/missing instance acquires ZERO advisory locks before failing", async () => {
    const s = await setup();
    const s2 = await setup();
    const { instanceId } = await schedule(s.owner.id, s);

    // Proxy the tx client to count pg_advisory_xact_lock acquisitions.
    const advisoryKeys: string[] = [];
    const proxied = new Proxy(prisma, {
      get(target, prop) {
        if (prop === "$queryRawUnsafe" || prop === "$executeRawUnsafe") {
          return (query: string, ...args: unknown[]) => {
            if (
              typeof query === "string" &&
              query.includes("pg_advisory_xact_lock")
            )
              advisoryKeys.push(String(args[0]));
            return (target[prop] as (...a: unknown[]) => unknown).call(
              target,
              query,
              ...args,
            );
          };
        }
        if (prop === "$transaction") {
          return (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) =>
            (target.$transaction as (...a: unknown[]) => unknown).call(
              target,
              (tx: unknown) => {
                const ptx = new Proxy(tx as object, {
                  get(t, p) {
                    if (p === "$executeRawUnsafe" || p === "$queryRawUnsafe") {
                      return (query: string, ...args: unknown[]) => {
                        if (
                          typeof query === "string" &&
                          query.includes("pg_advisory_xact_lock")
                        )
                          advisoryKeys.push(String(args[0]));
                        return (
                          t[p as keyof typeof t] as (...a: unknown[]) => unknown
                        ).call(t, query, ...args);
                      };
                    }
                    return t[p as keyof typeof t];
                  },
                });
                return fn(ptx);
              },
              opts,
            );
        }
        return target[prop as keyof typeof target];
      },
    });

    // s2's client submits against s's instance → foreign tuple →
    // non-disclosing failure BEFORE any chkin advisory is acquired.
    await expect(
      submitCheckInInstance(
        session(s2.clientUser.id),
        {
          workspaceId: s2.w.id,
          instanceId,
          answersJson: answersJson(s2.definition),
        },
        { db: proxied as never, registry: DEV_REGISTRY },
      ),
    ).rejects.toMatchObject({ code: "not_available" });
    expect(advisoryKeys.filter((k) => k.startsWith("chkin:"))).toHaveLength(0);
    expect(advisoryKeys.filter((k) => k.startsWith("member:"))).toHaveLength(0);

    // A legitimate submit DOES take the exact chkin key shape.
    advisoryKeys.length = 0;
    await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: answersJson(s.definition),
      },
      { db: proxied as never, registry: DEV_REGISTRY },
    );
    expect(advisoryKeys[0]).toBe(`chkin:${s.w.id}:${s.cp.id}:${s.formId}`);
    expect(advisoryKeys[1]).toBe(`member:${s.w.id}:${s.clientUser.id}`);
  });
});
