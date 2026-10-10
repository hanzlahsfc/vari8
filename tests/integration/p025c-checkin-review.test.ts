// P-025-C — staff Check-In detail review + terminal acknowledgement
// against disposable PostgreSQL (decisions #86–#91 carried by #96).
// Real schema, real transactions, real authorization: the mocked actor
// is only a labeled session identity; every membership/role/workspace/
// assignment/consent decision is re-resolved inside the serializable
// transaction.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { createStaticConsentPolicy } from "../../lib/consent";
import {
  createCheckInForm,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";
import {
  cancelCheckInInstance,
  listCheckInInstancesForClient,
  listCheckInSubmissionsForClient,
  markCheckInSubmissionReviewed,
  readCheckInSubmissionDetail,
  scheduleCheckInInstance,
  submitCheckInInstance,
} from "../../lib/checkin/instances";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "check-in-dev-privacy-v1",
  HEALTH_DATA: "check-in-dev-health-v1",
});

describe.skipIf(!enabled)("P-025-C check-in staff review (real PG)", () => {
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

  const uid = () => `p25c${++n}_${Date.now()}`;
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
      data: { name: `WS ${uid()}`, slug: `p25c-${uid()}`, status: "ACTIVE" },
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
    role: "PRIMARY" | "COACH" = "PRIMARY",
  ) {
    return prisma.clientAssignment.create({
      data: {
        workspaceId,
        clientProfileId,
        coachMemberId,
        role,
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

  /** Workspace + client w/ consent + owner + form + submitted instance. */
  async function setup() {
    const w = await ws();
    const owner = await user();
    const ownerMember = await member(w.id, owner.id, "WORKSPACE_OWNER");
    const clientUser = await user();
    await member(w.id, clientUser.id, "CLIENT");
    const cp = await profile(w.id, clientUser.id);
    await consent(cp.id);
    const form = await publishedForm(owner.id, w.id);
    return { w, owner, ownerMember, clientUser, cp, ...form };
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
      { fieldId: text.fieldId, value: "Feeling strong" },
      { fieldId: num.fieldId, value: "82.5" },
      { fieldId: single.fieldId, value: single.options![0].optionId },
    ]);
  };

  async function submit(
    s: Awaited<ReturnType<typeof setup>>,
    dueAt = "2030-06-01T09:00:00.000Z",
  ) {
    const { instanceId } = await schedule(s.owner.id, s, dueAt);
    await submitCheckInInstance(
      session(s.clientUser.id),
      {
        workspaceId: s.w.id,
        instanceId,
        answersJson: answersJson(s.definition),
      },
      deps(),
    );
    const submission = await prisma.checkInSubmission.findUniqueOrThrow({
      where: { instanceId },
    });
    return { instanceId, submissionId: submission.id };
  }

  const audits = (workspaceId: string, resourceType: string) =>
    prisma.auditEvent.findMany({
      where: { workspaceId, resourceType },
    });

  // ── Role matrix: staff detail read ──────────────────────────────────

  it("owner + assigned coach + assigned assistant read detail; each commits exactly one READ audit", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    await assignment(s.w.id, s.cp.id, coachMember.id);
    const assistant = await user();
    const assistantMember = await member(
      s.w.id,
      assistant.id,
      "ASSISTANT_COACH",
    );
    await assignment(s.w.id, s.cp.id, assistantMember.id, "COACH");

    const canMarkExpect: Record<string, boolean> = {
      [s.owner.id]: false,
      [coach.id]: true,
      [assistant.id]: false,
    };
    for (const uid2 of [s.owner.id, coach.id, assistant.id]) {
      const detail = await readCheckInSubmissionDetail(
        session(uid2),
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          submissionId,
        },
        deps(),
      );
      expect(detail.submissionId).toBe(submissionId);
      expect(detail.canMark).toBe(canMarkExpect[uid2]);
      expect(detail.fields).toHaveLength(3);
      expect(detail.reviewed).toBeNull();
      expect(detail.fields.map((f) => f.label)).toEqual([
        "How are you?",
        "Weight",
        "Mood",
      ]);
      // Display carries the sanitized values (text + labels, never raw
      // option/field IDs beyond the definition's own fieldId).
      expect(detail.fields[2].display).toBe("Good");
    }
    const reads = await audits(s.w.id, "checkin_submission");
    expect(reads.filter((a) => a.action === "READ")).toHaveLength(3);
    // A second deliberate detail posts a second audit (P-022 analog).
    await readCheckInSubmissionDetail(
      session(s.owner.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId,
      },
      deps(),
    );
    expect(
      (await audits(s.w.id, "checkin_submission")).filter(
        (a) => a.action === "READ",
      ),
    ).toHaveLength(4);
  });

  it("denied roles get a non-disclosing failure and ZERO audits", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    const before = await audits(s.w.id, "checkin_submission");

    const unassigned = await user();
    await member(s.w.id, unassigned.id, "COACH");
    const support = await user();
    await member(s.w.id, support.id, "SUPPORT");
    const dualPa = await user("PLATFORM_ADMIN");
    const dualPaMember = await member(s.w.id, dualPa.id, "COACH");
    // An ACTIVE assignment is required so that ONLY the deny-set denies
    // the dual-role PA — without it, not_assigned masks the cell.
    await assignment(s.w.id, s.cp.id, dualPaMember.id, "COACH");
    const platformOnly = await user("PLATFORM_ADMIN");
    const clientMember = s.clientUser;
    const foreign = await setup();
    const foreignMember = await member(s.w.id, foreign.owner.id, "COACH");
    void foreignMember;

    for (const uid2 of [
      unassigned.id,
      support.id,
      dualPa.id,
      platformOnly.id,
      clientMember.id,
      foreign.owner.id,
    ]) {
      await expect(
        readCheckInSubmissionDetail(
          session(uid2),
          {
            workspaceId: s.w.id,
            clientProfileId: s.cp.id,
            submissionId,
          },
          deps(),
        ),
      ).rejects.toThrow();
    }
    expect(await audits(s.w.id, "checkin_submission")).toHaveLength(
      before.length,
    );
    // The unassigned/foreign coach denial is the closed not_assigned /
    // role_denied class — never a leaked payload.
    await expect(
      readCheckInSubmissionDetail(
        session(unassigned.id),
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          submissionId,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // ── Terminal mark: exactly one acknowledgement per submission ───────

  it("assigned coach marks once: immutable provenance + CREATE audit; replay is idempotent", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    await assignment(s.w.id, s.cp.id, coachMember.id);

    const first = await markCheckInSubmissionReviewed(
      session(coach.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId,
      },
      deps(),
    );
    expect(first.status).toBe("reviewed");
    expect(await prisma.checkInReview.count({ where: { submissionId } })).toBe(
      1,
    );
    const review = await prisma.checkInReview.findUniqueOrThrow({
      where: { submissionId },
      include: { reviewedByMember: { include: { user: true } } },
    });
    expect(review.reviewedByMemberId).toBe(coachMember.id);
    expect(review.workspaceId).toBe(s.w.id);
    expect(review.clientProfileId).toBe(s.cp.id);

    // Replay — zero new rows, zero new audits (#86: later authorized
    // staff see the existing reviewed state rather than re-marking).
    const auditsBefore = await audits(s.w.id, "checkin_review");
    const replay = await markCheckInSubmissionReviewed(
      session(coach.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId,
      },
      deps(),
    );
    expect(replay.status).toBe("already_reviewed");
    expect(replay.reviewedAt).toBe(first.reviewedAt);
    expect(await prisma.checkInReview.count({ where: { submissionId } })).toBe(
      1,
    );
    expect(await audits(s.w.id, "checkin_review")).toHaveLength(
      auditsBefore.length,
    );

    // Another authorized coach — after the first's assignment ends —
    // sees the same reviewed state; no second row.
    const asg1 = await prisma.clientAssignment.findFirstOrThrow({
      where: { coachMemberId: coachMember.id },
    });
    await prisma.clientAssignment.update({
      where: { id: asg1.id },
      data: { status: "REMOVED" },
    });
    const coach2 = await user();
    const coach2Member = await member(s.w.id, coach2.id, "COACH");
    await assignment(s.w.id, s.cp.id, coach2Member.id);
    const second = await markCheckInSubmissionReviewed(
      session(coach2.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId,
      },
      deps(),
    );
    expect(second.status).toBe("already_reviewed");
    expect(await prisma.checkInReview.count({ where: { submissionId } })).toBe(
      1,
    );
  });

  it("owner + assistant + client + SUPPORT + dual-role PA CANNOT mark — and never create a row or audit", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    const assistant = await user();
    const assistantMember = await member(
      s.w.id,
      assistant.id,
      "ASSISTANT_COACH",
    );
    await assignment(s.w.id, s.cp.id, assistantMember.id, "COACH");
    const support = await user();
    await member(s.w.id, support.id, "SUPPORT");
    const dualPa = await user("PLATFORM_ADMIN");
    const dualPaMember = await member(s.w.id, dualPa.id, "COACH");
    await assignment(s.w.id, s.cp.id, dualPaMember.id, "COACH");
    const before = await prisma.checkInReview.count();

    for (const uid2 of [
      s.owner.id,
      assistant.id,
      s.clientUser.id,
      support.id,
      dualPa.id,
    ]) {
      await expect(
        markCheckInSubmissionReviewed(
          session(uid2),
          {
            workspaceId: s.w.id,
            clientProfileId: s.cp.id,
            submissionId,
          },
          deps(),
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }
    expect(await prisma.checkInReview.count()).toBe(before);
    expect(await audits(s.w.id, "checkin_review")).toHaveLength(0);
  });

  it("concurrent double-mark commits exactly one row + one audit", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    await assignment(s.w.id, s.cp.id, coachMember.id);

    // One assigned coach firing two concurrent marks (the
    // double-click/duplicate-request path) — exactly one commits; the
    // other replays idempotently.
    const results = await Promise.allSettled([
      markCheckInSubmissionReviewed(
        session(coach.id),
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          submissionId,
        },
        deps(),
      ),
      markCheckInSubmissionReviewed(
        session(coach.id),
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          submissionId,
        },
        deps(),
      ),
    ]);
    const statuses = results.map((r) =>
      r.status === "fulfilled" ? r.value.status : "rejected",
    );
    expect(statuses.filter((v) => v === "reviewed")).toHaveLength(1);
    expect(statuses.filter((v) => v === "already_reviewed")).toHaveLength(1);
    expect(await prisma.checkInReview.count({ where: { submissionId } })).toBe(
      1,
    );
    expect(await audits(s.w.id, "checkin_review")).toHaveLength(1);
  });

  // ── Database coherence + uniqueness backstop ─────────────────────────

  it("review→submission composite FK rejects an incoherent tuple", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    const other = await setup();
    const reviewer = await member(s.w.id, (await user()).id, "COACH");

    for (const tuple of [
      { workspaceId: other.w.id, clientProfileId: s.cp.id },
      { workspaceId: s.w.id, clientProfileId: other.cp.id },
    ]) {
      await expect(
        prisma.checkInReview.create({
          data: {
            workspaceId: tuple.workspaceId,
            clientProfileId: tuple.clientProfileId,
            submissionId,
            reviewedByMemberId: reviewer.id,
          },
        }),
      ).rejects.toThrow(/coherence|foreign/i);
    }
    expect(await prisma.checkInReview.count({ where: { submissionId } })).toBe(
      0,
    );
  });

  it("unique(submission_id) is an independent DB backstop — two direct creates, one winner", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    const reviewer = await member(s.w.id, (await user()).id, "COACH");

    const results = await Promise.allSettled(
      [0, 1].map(() =>
        prisma.checkInReview.create({
          data: {
            workspaceId: s.w.id,
            clientProfileId: s.cp.id,
            submissionId,
            reviewedByMemberId: reviewer.id,
          },
        }),
      ),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "P2002",
    });
    expect(await prisma.checkInReview.count({ where: { submissionId } })).toBe(
      1,
    );
  });

  // ── Assignment-removal race ─────────────────────────────────────────

  it("assignment revoked while a coach mark holds the lock → the action fails closed", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    const asg = await assignment(s.w.id, s.cp.id, coachMember.id);

    let release!: () => void;
    const barrier = new Promise<void>((r) => (release = r));
    const revoker = prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT id FROM "client_assignment" WHERE id = $1 FOR UPDATE`,
        asg.id,
      );
      await barrier;
      await tx.clientAssignment.update({
        where: { id: asg.id },
        data: { status: "REMOVED" },
      });
    });
    // The revoker holds the assignment row; the mark's lock attempt
    // blocks until the REMOVED commit lands.
    await new Promise((r) => setTimeout(r, 300));
    const mark = markCheckInSubmissionReviewed(
      session(coach.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId,
      },
      deps(),
    );
    await new Promise((r) => setTimeout(r, 300));
    release();
    await Promise.allSettled([revoker, mark]);
    await expect(mark).rejects.toMatchObject({ reason: "not_assigned" });
    expect(await prisma.checkInReview.count({ where: { submissionId } })).toBe(
      0,
    );
    expect(await audits(s.w.id, "checkin_review")).toHaveLength(0);
    expect(
      (
        await prisma.clientAssignment.findUniqueOrThrow({
          where: { id: asg.id },
        })
      ).status,
    ).toBe("REMOVED");
  });

  // ── Consent boundary (#85) ──────────────────────────────────────────

  it("consent withdrawal closes detail + mark; the header list stays bounded", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    await assignment(s.w.id, s.cp.id, coachMember.id);
    await revokeConsent(s.cp.id);

    await expect(
      readCheckInSubmissionDetail(
        session(s.owner.id),
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          submissionId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
    await expect(
      markCheckInSubmissionReviewed(
        session(coach.id),
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          submissionId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
    // List headers remain — bounded operational metadata only.
    const list = await listCheckInSubmissionsForClient(
      session(s.owner.id),
      { workspaceId: s.w.id, clientProfileId: s.cp.id },
      deps(),
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0].submissionId).toBe(submissionId);
  });

  it("withdrawn consent produces ZERO answer-row reads in the detail path", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    await revokeConsent(s.cp.id);

    let answerQueries = 0;
    const proxied = new Proxy(prisma, {
      get(target, prop) {
        if (prop === "checkInSubmissionAnswer") {
          return new Proxy(target.checkInSubmissionAnswer, {
            get(t, m) {
              return (...args: unknown[]) => {
                answerQueries += 1;
                return (
                  t[m as keyof typeof t] as never as (
                    ...a: unknown[]
                  ) => unknown
                )(...args);
              };
            },
          });
        }
        if (prop === "$transaction") {
          return (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) =>
            (target.$transaction as (...a: unknown[]) => unknown).call(
              target,
              (tx: unknown) => {
                const ptx = new Proxy(tx as object, {
                  get(t, p) {
                    if (p === "checkInSubmissionAnswer") {
                      return new Proxy(
                        (t as { checkInSubmissionAnswer: object })
                          .checkInSubmissionAnswer,
                        {
                          get(tt, m) {
                            return (...args: unknown[]) => {
                              answerQueries += 1;
                              return (
                                tt[m as keyof typeof tt] as never as (
                                  ...a: unknown[]
                                ) => unknown
                              )(...args);
                            };
                          },
                        },
                      );
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

    await expect(
      readCheckInSubmissionDetail(
        session(s.owner.id),
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          submissionId,
        },
        { db: proxied as never, registry: DEV_REGISTRY },
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
    expect(answerQueries).toBe(0);
  });

  // ── Derived state + staff visibility ────────────────────────────────

  it("derived state flows REVIEWED through the staff instance list; client surfaces are unchanged", async () => {
    const s = await setup();
    const { instanceId, submissionId } = await submit(s);
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    await assignment(s.w.id, s.cp.id, coachMember.id);
    await markCheckInSubmissionReviewed(
      session(coach.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId,
      },
      deps(),
    );

    const staff = await listCheckInInstancesForClient(
      session(s.owner.id),
      { workspaceId: s.w.id, clientProfileId: s.cp.id },
      deps(),
    );
    const item = staff.items.find((i) => i.instanceId === instanceId);
    expect(item?.state).toBe("REVIEWED");
    void coachMember;
  });

  it("staff submission list carries bounded reviewer metadata only after review (#91)", async () => {
    const s = await setup();
    const { submissionId } = await submit(s);
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    await assignment(s.w.id, s.cp.id, coachMember.id);

    const pre = await listCheckInSubmissionsForClient(
      session(s.owner.id),
      { workspaceId: s.w.id, clientProfileId: s.cp.id },
      deps(),
    );
    expect(pre.items[0].reviewedAt).toBeNull();
    expect(pre.items[0].reviewedByName).toBeNull();

    await markCheckInSubmissionReviewed(
      session(coach.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId,
      },
      deps(),
    );
    const post = await listCheckInSubmissionsForClient(
      session(s.owner.id),
      { workspaceId: s.w.id, clientProfileId: s.cp.id },
      deps(),
    );
    expect(post.items[0].reviewedAt).not.toBeNull();
    expect(post.items[0].reviewedByName).toMatch(/^Fixture p25c/);

    // The detail exposes the same bounded provenance.
    const detail = await readCheckInSubmissionDetail(
      session(s.owner.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId,
      },
      deps(),
    );
    expect(detail.reviewed?.byName).toMatch(/^Fixture p25c/);
    expect(detail.reviewed?.at).not.toBeNull();
  });

  // ── Lifecycle boundary: no SUBMITTED→CANCELLED, no REVIEWED→CANCELLED ─

  it("cancellation fails closed on a submitted and on a reviewed instance", async () => {
    const s = await setup();
    const { instanceId, submissionId } = await submit(s);
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    await assignment(s.w.id, s.cp.id, coachMember.id);

    // SUBMITTED → CANCELLED does not exist.
    await expect(
      cancelCheckInInstance(
        session(s.owner.id),
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          instanceId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "not_available" });

    await markCheckInSubmissionReviewed(
      session(coach.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId,
      },
      deps(),
    );
    // REVIEWED → CANCELLED does not exist either.
    await expect(
      cancelCheckInInstance(
        session(s.owner.id),
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          instanceId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "not_available" });
  });

  // ── Foreign tuple → zero advisory acquisition ────────────────────────

  it("a foreign submission acquires ZERO advisories for detail AND mark", async () => {
    const s = await setup();
    const other = await setup();
    const { submissionId } = await submit(s);
    const foreignCoach = await member(other.w.id, (await user()).id, "COACH");
    void foreignCoach;

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
            return (target[prop] as never as (...a: unknown[]) => unknown)(
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
                          t[p as keyof typeof t] as never as (
                            ...a: unknown[]
                          ) => unknown
                        )(query, ...args);
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
    const pdeps = { db: proxied as never, registry: DEV_REGISTRY };

    await expect(
      readCheckInSubmissionDetail(
        session(other.owner.id),
        {
          workspaceId: other.w.id,
          clientProfileId: other.cp.id,
          submissionId, // foreign — belongs to s
        },
        pdeps,
      ),
    ).rejects.toMatchObject({ code: "not_available" });
    await expect(
      markCheckInSubmissionReviewed(
        session(other.owner.id),
        {
          workspaceId: other.w.id,
          clientProfileId: other.cp.id,
          submissionId,
        },
        pdeps,
      ),
    ).rejects.toMatchObject({ code: "not_available" });
    expect(advisoryKeys.filter((k) => k.startsWith("chkin:"))).toHaveLength(0);
    expect(advisoryKeys.filter((k) => k.startsWith("member:"))).toHaveLength(0);

    // Legitimate calls DO take the chkin+member advisories.
    advisoryKeys.length = 0;
    const coachUser = await user();
    const cm = await member(s.w.id, coachUser.id, "COACH");
    await assignment(s.w.id, s.cp.id, cm.id);
    await markCheckInSubmissionReviewed(
      session(coachUser.id),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId,
      },
      pdeps,
    );
    expect(advisoryKeys[0]).toBe(`chkin:${s.w.id}:${s.cp.id}:${s.formId}`);
    expect(advisoryKeys[1]).toBe(`member:${s.w.id}:${coachUser.id}`);
  });

  // ── Mark requires a real submission (SCHEDULED instance → not_available)

  it("mark on an instance with no submission fails closed", async () => {
    const s = await setup();
    await schedule(s.owner.id, s); // SCHEDULED — no submission
    const coach = await user();
    const coachMember = await member(s.w.id, coach.id, "COACH");
    await assignment(s.w.id, s.cp.id, coachMember.id);
    await expect(
      markCheckInSubmissionReviewed(
        session(coach.id),
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          submissionId: "nonexistent-submission",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "not_available" });
  });
});
