import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { CheckInInstanceError } from "../../lib/checkin/instances";
import {
  cancelCheckInInstance,
  listCheckInInstancesForClient,
  listOwnCheckInInstances,
  scheduleCheckInInstance,
  submitCheckInInstance,
} from "../../lib/checkin/instances";
import {
  createCheckInForm,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";
import { createStaticConsentPolicy } from "../../lib/consent";

/**
 * P-025-D2 — Check-In calendar data contract (decision #104): the
 * bounded instant-range variant of the existing answer-free header
 * lists. Same authorization protocol, scopes, consent, ordering, and
 * zero-READ-audit contract — a range only narrows the bounded set.
 */

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const CHECKIN_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "chk-dev-privacy-v1",
  HEALTH_DATA: "chk-dev-health-v1",
});

const OCT = {
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-11-01T00:00:00.000Z",
};

describe.skipIf(!enabled)("P-025-D2 calendar list (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "checkin_review","checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","consent_record","audit_event","client_assignment","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `p25d2${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = () => ({
    db: prisma as never,
    registry: CHECKIN_REGISTRY,
  });
  const audits = (workspaceId: string) =>
    prisma.auditEvent.findMany({ where: { workspaceId } });

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
      data: { name: `WS ${uid()}`, slug: `p25d2-${uid()}`, status: "ACTIVE" },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT",
    status: "ACTIVE" | "SUSPENDED" = "ACTIVE",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status },
    });
  }
  async function consent(clientProfileId: string) {
    for (const [kind, ver] of [
      ["PRIVACY_NOTICE", "chk-dev-privacy-v1"],
      ["HEALTH_DATA", "chk-dev-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId, kind, version: ver },
      });
  }
  async function assignment(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
    status: "ACTIVE" | "REMOVED" = "ACTIVE",
  ) {
    return prisma.clientAssignment.create({
      data: {
        workspaceId,
        clientProfileId,
        coachMemberId,
        role: "PRIMARY",
        status,
      },
    });
  }
  const draftJson = () => ({
    title: "Weekly",
    fields: [
      { kind: "shortText", label: "How are you?", required: true, order: 0 },
    ],
  });
  async function publishedForm(ownerId: string, workspaceId: string) {
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
      select: { id: true, definition: true },
    });
    return {
      formId: created.formId,
      versionId: version.id,
      definition: version.definition as {
        fields: { fieldId: string; kind: string }[];
      },
    };
  }

  /**
   * Fixture: 4 in-range October instances + 1 out-of-range December.
   * Ordered expectations rely on `dueAt asc`.
   */
  async function setup(opts: { assign?: "coach" | "assistant" | "none" } = {}) {
    const w = await ws();
    const ownerU = await user();
    const coachU = await user();
    const asstU = await user();
    const supportU = await user();
    const clientU = await user();
    const owner = await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const coach = await member(w.id, coachU.id, "COACH");
    const asst = await member(w.id, asstU.id, "ASSISTANT_COACH");
    await member(w.id, supportU.id, "SUPPORT");
    await member(w.id, clientU.id, "CLIENT");
    const cp = await prisma.clientProfile.create({
      data: { workspaceId: w.id, userId: clientU.id, name: `Client ${uid()}` },
    });
    await consent(cp.id);
    const assignedMember = opts.assign === "assistant" ? asst : coach;
    if (opts.assign !== "none")
      await assignment(w.id, cp.id, assignedMember.id);

    const form = await publishedForm(ownerU.id, w.id);
    const schedule = (dueAt: string) =>
      scheduleCheckInInstance(
        session(ownerU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          formId: form.formId,
          formVersionId: form.versionId,
          dueAt,
        },
        deps(),
      );

    const lateDue = "2026-10-05T09:00:00.000Z"; // past → late markers
    const scheduled = await schedule("2026-10-15T09:00:00.000Z");
    const submitted = await schedule("2026-10-20T09:00:00.000Z");
    const lateSub = await schedule(lateDue);
    const cancelled = await schedule("2026-10-25T09:00:00.000Z");
    await schedule("2026-12-01T09:00:00.000Z"); // out of October range
    for (const inst of [scheduled, submitted, lateSub, cancelled])
      if (inst.status !== "scheduled") throw new Error("seed schedule failed");

    const answers = () =>
      JSON.stringify([
        { fieldId: form.definition.fields[0].fieldId, value: "ok" },
      ]);
    const sub = await submitCheckInInstance(
      session(clientU.id),
      {
        workspaceId: w.id,
        instanceId: submitted.instanceId,
        answersJson: answers(),
      },
      deps(),
    );
    if (sub.status !== "submitted") throw new Error("submit failed");
    const sub2 = await submitCheckInInstance(
      session(clientU.id),
      {
        workspaceId: w.id,
        instanceId: lateSub.instanceId,
        answersJson: answers(),
      },
      deps(),
    );
    if (sub2.status !== "submitted") throw new Error("late submit failed");
    await cancelCheckInInstance(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        instanceId: cancelled.instanceId,
      },
      deps(),
    );

    const baselineAudits = (await audits(w.id)).length;
    return {
      w,
      cp,
      owner: session(ownerU.id),
      coach: session(coachU.id),
      asst: session(asstU.id),
      support: session(supportU.id),
      client: session(clientU.id),
      clientU,
      coachU,
      ownerMember: owner,
      formId: form.formId,
      baselineAudits,
      instanceIds: {
        lateSub: lateSub.instanceId,
        scheduled: scheduled.instanceId,
        submitted: submitted.instanceId,
        cancelled: cancelled.instanceId,
      },
    };
  }

  it("owner workspace scope returns the bounded range in dueAt order — cancelled visible, late marked, out-of-range absent", async () => {
    const s = await setup();
    const r = await listCheckInInstancesForClient(
      s.owner,
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        range: OCT,
      },
      deps(),
    );
    expect(r.items.map((i) => i.instanceId)).toEqual([
      s.instanceIds.lateSub,
      s.instanceIds.scheduled,
      s.instanceIds.submitted,
      s.instanceIds.cancelled,
    ]);
    expect(r.items.map((i) => i.state)).toEqual([
      "SUBMITTED",
      "SCHEDULED",
      "SUBMITTED",
      "CANCELLED",
    ]);
    expect(r.items.map((i) => i.late)).toEqual([true, false, false, false]);
    // Answer-free — no answers/definition/values on the wire items.
    for (const item of r.items)
      expect(Object.keys(item).sort()).toEqual([
        "dueAt",
        "dueTz",
        "formId",
        "formName",
        "instanceId",
        "late",
        "scheduledAt",
        "state",
        "submittedAt",
        "versionSeq",
      ]);
    expect(await audits(s.w.id)).toHaveLength(s.baselineAudits);
  });

  it("assigned coach and assistant both read the same bounded range", async () => {
    const s = await setup({ assign: "coach" });
    const r = await listCheckInInstancesForClient(
      s.coach,
      { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
      deps(),
    );
    expect(r.items).toHaveLength(4);
    const s2 = await setup({ assign: "assistant" });
    const r2 = await listCheckInInstancesForClient(
      s2.asst,
      { workspaceId: s2.w.id, clientProfileId: s2.cp.id, range: OCT },
      deps(),
    );
    expect(r2.items).toHaveLength(4);
  });

  it("client own scope reads the same bounded range", async () => {
    const s = await setup();
    const r = await listOwnCheckInInstances(
      s.client,
      { workspaceId: s.w.id, range: OCT },
      deps(),
    );
    expect(r.items).toHaveLength(4);
    expect(r.items[0].state).toBe("SUBMITTED");
    for (const item of r.items)
      expect(Object.keys(item).sort()).toEqual([
        "dueAt",
        "formName",
        "instanceId",
        "late",
        "state",
        "submittedAt",
        "versionSeq",
      ]);
  });

  it("denies SUPPORT, platform-only PA, and dual-role PA via the deny-set", async () => {
    const s = await setup({ assign: "coach" });
    await expect(
      listCheckInInstancesForClient(
        s.support,
        { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    const paU = await user("PLATFORM_ADMIN");
    await expect(
      listCheckInInstancesForClient(
        session(paU.id),
        { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    const dualU = await user("PLATFORM_ADMIN");
    const dualM = await member(s.w.id, dualU.id, "COACH");
    await prisma.clientAssignment.updateMany({
      where: { clientProfileId: s.cp.id },
      data: { status: "REMOVED" },
    });
    await assignment(s.w.id, s.cp.id, dualM.id);
    await expect(
      listCheckInInstancesForClient(
        session(dualU.id),
        { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    const s2 = await setup({ assign: "none" });
    const dual2U = await user("PLATFORM_ADMIN");
    const dual2M = await member(s2.w.id, dual2U.id, "COACH");
    await assignment(s2.w.id, s2.cp.id, dual2M.id);
    await expect(
      listCheckInInstancesForClient(
        session(dual2U.id),
        { workspaceId: s2.w.id, clientProfileId: s2.cp.id, range: OCT },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("unassigned coach and inactive member fail closed", async () => {
    const s = await setup({ assign: "none" });
    await expect(
      listCheckInInstancesForClient(
        s.coach,
        { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    const suspU = await user();
    await member(s.w.id, suspU.id, "WORKSPACE_OWNER", "SUSPENDED");
    await expect(
      listCheckInInstancesForClient(
        session(suspU.id),
        { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("cross-workspace and cross-client substitutions fail non-disclosingly", async () => {
    const s = await setup();
    const s2 = await setup();
    await expect(
      listCheckInInstancesForClient(
        s.owner,
        { workspaceId: s.w.id, clientProfileId: s2.cp.id, range: OCT },
        deps(),
      ),
    ).rejects.toThrow();
    await expect(
      listCheckInInstancesForClient(
        s.owner,
        { workspaceId: s2.w.id, clientProfileId: s.cp.id, range: OCT },
        deps(),
      ),
    ).rejects.toThrow();
  });

  it("range is optional: omitted range returns the whole bounded list", async () => {
    const s = await setup();
    const r = await listCheckInInstancesForClient(
      s.owner,
      { workspaceId: s.w.id, clientProfileId: s.cp.id },
      deps(),
    );
    expect(r.items).toHaveLength(5); // incl. the December instance
  });

  it("malformed, inverted, or oversized ranges fail as invalid input", async () => {
    const s = await setup();
    const bad = [
      { from: "2026-10-01", to: "2026-11-01T00:00:00.000Z" },
      { from: OCT.to, to: OCT.from },
      { from: OCT.from, to: "2027-02-01T00:00:00.000Z" },
      { from: "not-a-date", to: OCT.to },
    ];
    for (const range of bad)
      await expect(
        listCheckInInstancesForClient(
          s.owner,
          { workspaceId: s.w.id, clientProfileId: s.cp.id, range },
          deps(),
        ),
      ).rejects.toBeInstanceOf(CheckInInstanceError);
    await expect(
      listOwnCheckInInstances(
        s.client,
        { workspaceId: s.w.id, range: bad[0] },
        deps(),
      ),
    ).rejects.toBeInstanceOf(CheckInInstanceError);
  });

  it("an empty range window returns zero items, no error, no audit", async () => {
    const s = await setup();
    const r = await listCheckInInstancesForClient(
      s.owner,
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        range: {
          from: "2027-03-01T00:00:00.000Z",
          to: "2027-04-01T00:00:00.000Z",
        },
      },
      deps(),
    );
    expect(r.items).toHaveLength(0);
    expect(await audits(s.w.id)).toHaveLength(s.baselineAudits);
  });
});
