// PR-M8 — explicit T+56 generation boundary, the read-only schedule
// projection, coach notes, and RATING/VISUAL answers against disposable
// PostgreSQL (D30, D11/D14 keep categories: date rules and data
// integrity a browser cannot see).

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStaticConsentPolicy } from "../../lib/consent";
import {
  createCheckInForm,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";
import {
  listCheckInInstancesForClient,
  readCheckInSubmissionDetail,
  scheduleCheckInInstance,
  submitCheckInInstance,
} from "../../lib/checkin/instances";
import {
  createCheckInScheduleRule,
  generateCheckInScheduleRuleInstances,
  projectCheckInScheduleOccurrences,
} from "../../lib/checkin/schedules";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "check-in-dev-privacy-v1",
  HEALTH_DATA: "check-in-dev-health-v1",
});

const ZONE = "UTC";

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!enabled)("PR-M8 (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "checkin_answer_media","checkin_schedule_rule","checkin_feedback","checkin_review","checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","media_object","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `prm8${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = () => ({ db: prisma as never, registry: DEV_REGISTRY });

  async function user() {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Fixture ${uid()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
  }
  async function ws() {
    return prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `m8-${uid()}`, status: "ACTIVE" },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role: "WORKSPACE_OWNER" | "COACH" | "CLIENT",
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

  const draftJson = () => ({
    title: "Weekly",
    // fieldIds are server-minted on save — presented ids are forbidden.
    fields: [
      {
        kind: "longText",
        label: "How did you feel this week?",
        required: true,
        order: 0,
      },
      {
        kind: "rating",
        label: "How was your training?",
        required: true,
        order: 1,
        ratingScheme: "SCALE_1_10",
      },
      {
        kind: "visual",
        label: "Progress visuals",
        required: false,
        order: 2,
      },
    ],
  });

  type FormIds = {
    formId: string;
    formVersionId: string;
    energy: string;
    training: string;
    visuals: string;
  };

  async function publishedForm(
    ownerId: string,
    workspaceId: string,
  ): Promise<FormIds> {
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
        draft: draftJson(),
      },
      prisma,
    );
    const fields = saved.definition.fields;
    const byLabel = (label: string) =>
      fields.find((f) => f.label === label)!.fieldId;
    const published = await publishCheckInForm(
      session(ownerId),
      {
        workspaceId,
        formId: created.formId,
        expectedRevision: saved.revision,
      },
      prisma,
    );
    const version = await prisma.checkInFormVersion.findFirstOrThrow({
      where: { formId: created.formId, versionSeq: published.versionSeq },
      select: { id: true },
    });
    return {
      formId: created.formId,
      formVersionId: version.id,
      energy: byLabel("How did you feel this week?"),
      training: byLabel("How was your training?"),
      visuals: byLabel("Progress visuals"),
    };
  }

  it("generation writes through T+56 only; the projection lists later dates without writing", async () => {
    const ownerU = await user();
    const w = await ws();
    await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const clientU = await user();
    await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    const { formId } = await publishedForm(ownerU.id, w.id);

    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId,
        weekday: "MONDAY",
        localTimeMinutes: 540,
        timezone: ZONE,
        startDate: "2026-10-19",
      },
      deps(),
    );
    if (created.status !== "created") throw new Error("rule not created");

    const now = new Date("2026-10-19T08:00:00Z"); // a Monday, pre-09:00
    const gen = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      { ...deps(), now: () => now },
    );
    if (gen.status !== "generated") throw new Error("not generated");
    expect(gen.examinedThrough).toBe("2026-12-14"); // T+56 inclusive
    expect(gen.created).toBe(9); // nine Mondays 10-19..12-14

    // Nothing exists past the horizon — literal bound check.
    const written = await prisma.checkInInstance.findMany({
      where: { originRuleId: created.ruleId },
      select: { occurrenceDate: true },
      orderBy: { occurrenceDate: "asc" },
    });
    const writtenDates = written.map((r) =>
      r.occurrenceDate!.toISOString().slice(0, 10),
    );
    expect(writtenDates.at(-1)).toBe("2026-12-14");
    expect(writtenDates).not.toContain("2026-12-21");

    // The projection lists later dates — strictly read-only.
    const instanceCountBefore = await prisma.checkInInstance.count();
    const auditCountBefore = await prisma.auditEvent.count();
    const projection = await projectCheckInScheduleOccurrences(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        rangeStart: "2026-12-01",
        rangeEnd: "2027-01-31",
      },
      deps(),
    );
    expect(await prisma.checkInInstance.count()).toBe(instanceCountBefore);
    expect(await prisma.auditEvent.count()).toBe(auditCountBefore);

    const projected = projection.items.map((i) => i.occurrenceDate);
    // Materialized December dates render from the instance list —
    // the projection carries only what is NOT generated.
    expect(projected).not.toContain("2026-12-14");
    // Beyond-T+56 dates arrive read-only.
    expect(projected).toContain("2026-12-21");
    expect(projected).toContain("2026-12-28");
    expect(projected).toContain("2027-01-25");
    expect(projection.unrepresentable).toEqual([]);
    // The projection pins the same 09:00 due instant the rule declares.
    const dec21 = projection.items.find(
      (i) => i.occurrenceDate === "2026-12-21",
    )!;
    expect(dec21.dueAt).toBe("2026-12-21T09:00:00.000Z");
    expect(dec21.ruleId).toBe(created.ruleId);
  });

  it("rejects an over-wide projection range", async () => {
    const ownerU = await user();
    const w = await ws();
    await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const clientU = await user();
    const cp = await profile(w.id, clientU.id);
    await expect(
      projectCheckInScheduleOccurrences(
        session(ownerU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          rangeStart: "2026-01-01",
          rangeEnd: "2026-12-31",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("coach note persists on a scheduled instance and surfaces staff-side", async () => {
    const ownerU = await user();
    const w = await ws();
    await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const clientU = await user();
    await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    const { formId, formVersionId } = await publishedForm(ownerU.id, w.id);

    const result = await scheduleCheckInInstance(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId,
        formVersionId,
        dueAt: addDays("2026-10-19", 3) + "T09:00:00.000Z",
        coachNote: "  Mid-week energy and recovery update  ",
      },
      deps(),
    );
    if (result.status !== "scheduled") throw new Error("not scheduled");
    const row = await prisma.checkInInstance.findUniqueOrThrow({
      where: { id: result.instanceId },
      select: { coachNote: true },
    });
    expect(row.coachNote).toBe("Mid-week energy and recovery update");

    const list = await listCheckInInstancesForClient(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(list.items[0]!.coachNote).toBe(
      "Mid-week energy and recovery update",
    );
  });

  it("rating + visual answers persist typed columns and media ids; foreign media rejects", async () => {
    const ownerU = await user();
    const w = await ws();
    await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const clientU = await user();
    const clientMember = await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    await consent(cp.id);
    const { formId, formVersionId, energy, training, visuals } =
      await publishedForm(ownerU.id, w.id);

    // Media the client uploaded in this workspace + a foreign one.
    const media = await prisma.mediaObject.create({
      data: {
        workspaceId: w.id,
        kind: "IMAGE",
        storageKey: `test/${uid()}.jpg`,
        fileName: "front.jpg",
        contentType: "image/jpeg",
        byteSize: BigInt(1000),
        uploadedByUserId: clientU.id,
      },
    });
    const foreignWs = await ws();
    const foreignMedia = await prisma.mediaObject.create({
      data: {
        workspaceId: foreignWs.id,
        kind: "IMAGE",
        storageKey: `test/${uid()}.jpg`,
        fileName: "foreign.jpg",
        contentType: "image/jpeg",
        byteSize: BigInt(1000),
      },
    });

    const scheduled = await scheduleCheckInInstance(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId,
        formVersionId,
        dueAt: addDays("2026-10-19", 1) + "T09:00:00.000Z",
      },
      deps(),
    );
    if (scheduled.status !== "scheduled") throw new Error("not scheduled");

    // A foreign-workspace media id fails closed — no submission survives.
    await expect(
      submitCheckInInstance(
        session(clientU.id),
        {
          workspaceId: w.id,
          instanceId: scheduled.instanceId,
          answersJson: JSON.stringify([
            { fieldId: energy, value: "Good week" },
            { fieldId: training, value: 8 },
            { fieldId: visuals, value: [foreignMedia.id] },
          ]),
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(
      await prisma.checkInSubmission.count({
        where: { instanceId: scheduled.instanceId },
      }),
    ).toBe(0);

    const submitted = await submitCheckInInstance(
      session(clientU.id),
      {
        workspaceId: w.id,
        instanceId: scheduled.instanceId,
        answersJson: JSON.stringify([
          { fieldId: energy, value: "Good week" },
          { fieldId: training, value: 8 },
          { fieldId: visuals, value: [media.id] },
        ]),
      },
      deps(),
    );
    if (submitted.status !== "submitted") throw new Error("not submitted");

    const answer = await prisma.checkInSubmissionAnswer.findFirstOrThrow({
      where: { submissionId: submitted.submissionId, fieldId: training },
    });
    expect(answer.kind).toBe("RATING");
    expect(answer.valueRating).toBe(8);
    const visual = await prisma.checkInSubmissionAnswer.findFirstOrThrow({
      where: { submissionId: submitted.submissionId, fieldId: visuals },
      include: { media: true },
    });
    expect(visual.kind).toBe("VISUAL");
    expect(visual.valueText).toBeNull();
    expect(visual.media.map((m) => m.mediaObjectId)).toEqual([media.id]);

    const detail = await readCheckInSubmissionDetail(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        submissionId: submitted.submissionId,
      },
      deps(),
    );
    const ratingView = detail.fields.find((f) => f.fieldId === training)!;
    expect(ratingView.display).toBe("8 / 10");
    const visualView = detail.fields.find((f) => f.fieldId === visuals)!;
    expect(visualView.mediaIds).toEqual([media.id]);
    void clientMember;
  });
});
