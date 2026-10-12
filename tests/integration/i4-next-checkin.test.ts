import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStaticConsentPolicy } from "../../lib/consent";
import { AccessDeniedError } from "../../lib/auth/guard";
import {
  createCheckInForm,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";
import {
  getOwnNextCheckInInstance,
  submitCheckInInstance,
  cancelCheckInInstance,
} from "../../lib/checkin/instances";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "check-in-dev-privacy-v1",
  HEALTH_DATA: "check-in-dev-health-v1",
});

/**
 * FI-I4 / decision #107 — earliest unfinished Check-In for the client
 * Home card. Eligible-state filtering must happen INSIDE the bounded
 * query: `dueAt asc, id asc`, take 1 — never post-filtered.
 */
describe.skipIf(!enabled)("FI-I4 next-Check-In selection (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "checkin_review","checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `i4${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = () => ({ db: prisma as never, registry: DEV_REGISTRY });

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
      data: { name: `WS ${uid()}`, slug: `i4-${uid()}`, status: "ACTIVE" },
    });
  }
  async function member(workspaceId: string, userId: string, role: string) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role: role as never, status: "ACTIVE" },
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
  async function publishedForm(ownerUserId: string, workspaceId: string) {
    const draft = {
      title: `F ${uid()}`,
      fields: [
        { kind: "shortText", label: "Summary", required: true, order: 0 },
      ],
    };
    const created = await createCheckInForm(
      session(ownerUserId),
      { workspaceId, name: `Form ${uid()}` },
      prisma,
    );
    const saved = await saveCheckInFormDraft(
      session(ownerUserId),
      {
        workspaceId,
        formId: created.formId,
        expectedRevision: 1,
        draft,
      },
      prisma,
    );
    const published = await publishCheckInForm(
      session(ownerUserId),
      {
        workspaceId,
        formId: created.formId,
        expectedRevision: saved.revision,
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
    const fieldId = (
      version.definition as { fields: Array<{ fieldId: string }> }
    ).fields[0].fieldId;
    return { formId: created.formId, versionId: version.id, fieldId };
  }

  async function setup() {
    const w = await ws();
    const owner = await user();
    const ownerMember = await member(w.id, owner.id, "WORKSPACE_OWNER");
    const clientUser = await user();
    const clientMember = await member(w.id, clientUser.id, "CLIENT");
    const cp = await profile(w.id, clientUser.id);
    await consent(cp.id);
    const form = await publishedForm(owner.id, w.id);
    return { w, owner, ownerMember, clientUser, clientMember, cp, ...form };
  }

  const schedule = (
    s: Awaited<ReturnType<typeof setup>>,
    dueAt: string,
    id?: string,
    form?: { formId: string; versionId: string },
  ) =>
    prisma.checkInInstance.create({
      data: {
        ...(id ? { id } : {}),
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        formId: form?.formId ?? s.formId,
        formVersionId: form?.versionId ?? s.versionId,
        dueAt: new Date(dueAt),
        scheduledByMemberId: s.ownerMember.id,
      },
    });

  const next = (s: Awaited<ReturnType<typeof setup>>, uid = s.clientUser.id) =>
    getOwnNextCheckInInstance(session(uid), { workspaceId: s.w.id }, deps());

  it("returns null when no eligible instance exists (empty + all-excluded)", async () => {
    const s = await setup();
    expect(await next(s)).toBeNull();
    // A cancelled instance alone is not eligible.
    const inst = await schedule(s, "2020-01-01T09:00:00.000Z");
    await cancelCheckInInstance(
      session(s.owner.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        instanceId: inst.id,
      },
      deps(),
    );
    expect(await next(s)).toBeNull();
  });

  it("picks the earliest eligible dueAt; deterministic id tiebreak", async () => {
    const s = await setup();
    await schedule(s, "2031-01-01T00:00:00.000Z");
    const near = await schedule(s, "2030-01-01T00:00:00.000Z");
    expect((await next(s))?.instanceId).toBe(near.id);
    // Same dueAt on two DIFFERENT forms (the schema uniques
    // client+form+dueAt) → instance id ascending wins.
    const f2 = await publishedForm(s.owner.id, s.w.id);
    const f3 = await publishedForm(s.owner.id, s.w.id);
    await schedule(s, "2029-01-01T00:00:00.000Z", "i4zz_highid", f3);
    await schedule(s, "2029-01-01T00:00:00.000Z", "i4aa_lowid", f2);
    expect((await next(s))?.instanceId).toBe("i4aa_lowid");
  });

  it("overdue scheduled precedes future scheduled", async () => {
    const s = await setup();
    await schedule(s, "2030-01-01T00:00:00.000Z");
    const overdue = await schedule(s, "2020-06-01T09:00:00.000Z");
    const n = await next(s);
    expect(n?.instanceId).toBe(overdue.id);
    expect(n?.late).toBe(true);
  });

  it("submitted and reviewed instances are excluded", async () => {
    const s = await setup();
    const sub = await schedule(s, "2020-01-01T00:00:00.000Z");
    await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId: sub.id,
        answersJson: JSON.stringify([{ fieldId: s.fieldId, value: "done" }]),
      },
      deps(),
    );
    expect(await next(s)).toBeNull();
    // And a reviewed one — attach a CheckInReview on the submission.
    const later = await schedule(s, "2030-01-01T00:00:00.000Z");
    await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId: later.id,
        answersJson: JSON.stringify([{ fieldId: s.fieldId, value: "done2" }]),
      },
      deps(),
    );
    const submission = await prisma.checkInSubmission.findUniqueOrThrow({
      where: { instanceId: later.id },
    });
    await prisma.checkInReview.create({
      data: {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId: submission.id,
        reviewedByMemberId: s.ownerMember.id,
      },
    });
    expect(await next(s)).toBeNull();
  });

  it("hundreds of excluded rows cannot hide one eligible row beyond the list bound", async () => {
    const s = await setup();
    // 250 cancelled + submitted rows — more than the 200-row list bound —
    // must NOT push the one eligible instance out of the result.
    const now = Date.now();
    // 200 CANCELLED rows — distinct dueAts per (client+form+dueAt).
    const cancelledIds: string[] = [];
    for (let i = 0; i < 200; i++)
      cancelledIds.push(
        (await schedule(s, new Date(Date.UTC(2020, 0, 1, 0, i)).toISOString()))
          .id,
      );
    await prisma.checkInInstance.updateMany({
      where: { id: { in: cancelledIds } },
      data: { cancelledAt: new Date(), cancelledByMemberId: s.ownerMember.id },
    });
    // 50 SUBMITTED rows on a second form.
    const f2 = await publishedForm(s.owner.id, s.w.id);
    for (let i = 0; i < 50; i++) {
      const inst = await schedule(
        s,
        new Date(Date.UTC(2019, 0, 1, 0, i)).toISOString(),
        undefined,
        f2,
      );

      await submitCheckInInstance(
        session(s.clientUser.id),
        {
          workspaceId: s.w.id,
          instanceId: inst.id,
          answersJson: JSON.stringify([
            { fieldId: f2.fieldId, value: `s${i}` },
          ]),
        },
        deps(),
      );
    }
    const eligible = await schedule(s, "2030-05-05T00:00:00.000Z");
    expect(Date.now() - now).toBeLessThan(60_000);
    expect((await next(s))?.instanceId).toBe(eligible.id);
  });

  it("foreign workspace/client rows never affect selection", async () => {
    const s = await setup();
    const other = await setup(); // different workspace + client
    const foreignInst = await schedule(other, "2020-01-01T00:00:00.000Z");
    const mine = await schedule(s, "2030-01-01T00:00:00.000Z");
    expect((await next(s))?.instanceId).toBe(mine.id);
    expect((await next(other))?.instanceId).toBe(foreignInst.id);
    // Same workspace but a DIFFERENT client profile — still not mine.
    const otherClient = await user();
    await member(s.w.id, otherClient.id, "CLIENT");
    const otherCp = await profile(s.w.id, otherClient.id);
    await consent(otherCp.id);
    await prisma.checkInInstance.create({
      data: {
        workspaceId: s.w.id,
        clientProfileId: otherCp.id,
        formId: s.formId,
        formVersionId: s.versionId,
        dueAt: new Date("2020-01-01T00:00:00.000Z"),
        scheduledByMemberId: s.ownerMember.id,
      },
    });
    expect((await next(s))?.instanceId).toBe(mine.id);
  });

  // I4-R2 / review P3-1 regression coverage: a WORKSPACE_OWNER who ALSO
  // owns a clientProfile passes profile rebinding, so this exercises the
  // grantedScope === "own" barrier itself — distinct from the
  // PLATFORM_ADMIN dual-role policy.
  it("denies a workspace-scope member who owns a clientProfile — the grantedScope barrier", async () => {
    const s = await setup();
    // The owner user ALSO holds a coherent clientProfile in this
    // workspace, so rebinding succeeds and only the scope gate stops them.
    const ownerProfile = await prisma.clientProfile.create({
      data: {
        workspaceId: s.w.id,
        userId: s.owner.id,
        name: "Owner's own profile",
      },
    });
    await prisma.checkInInstance.create({
      data: {
        workspaceId: s.w.id,
        clientProfileId: ownerProfile.id,
        formId: s.formId,
        formVersionId: s.versionId,
        dueAt: new Date("2020-01-01T00:00:00.000Z"),
        scheduledByMemberId: s.ownerMember.id,
      },
    });
    const auditsBefore = await prisma.auditEvent.count();
    await expect(next(s, s.owner.id)).rejects.toBeInstanceOf(AccessDeniedError);
    // Nothing returned, nothing audited, nothing written.
    await expect(next(s, s.owner.id).catch((e) => e)).resolves.toBeInstanceOf(
      AccessDeniedError,
    );
    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
  });

  it("denies non-own scopes + unauthenticated; returns only header fields; zero audits", async () => {
    const s = await setup();
    await schedule(s, "2030-01-01T00:00:00.000Z");
    // Owner (workspace scope) is not the client — own read denies.
    await expect(next(s, s.owner.id)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      getOwnNextCheckInInstance(
        { user: undefined },
        { workspaceId: s.w.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Header-only fields — no answers, no identities beyond formName.
    const result = await next(s);
    expect(result).toEqual({
      instanceId: expect.any(String),
      formName: expect.any(String),
      dueAt: expect.any(String),
      late: expect.any(Boolean),
    });
    const audits = await prisma.auditEvent.findMany({
      where: {
        resourceType: { in: ["checkin_instance", "checkin_submission"] },
      },
    });
    expect(audits.filter((a) => a.action === "READ")).toHaveLength(0);
  });
});
