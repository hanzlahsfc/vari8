import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Audit-failure injection — pass-through unless armed; proves a failed
// audit rolls the whole detail/mark transaction back.
let failAudit = false;
vi.mock("../../lib/audit", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../lib/audit")>();
  return {
    ...orig,
    writeAuditEvent: async (
      tx: Parameters<typeof orig.writeAuditEvent>[0],
      ctx: Parameters<typeof orig.writeAuditEvent>[1],
      input: Parameters<typeof orig.writeAuditEvent>[2],
    ) => {
      if (failAudit) throw new Error("injected_audit_failure");
      return orig.writeAuditEvent(tx, ctx, input);
    },
  };
});

import { AccessDeniedError } from "../../lib/auth/guard";
import type { SessionLike } from "../../lib/auth/guard";
import {
  createStaticConsentPolicy,
  unconfiguredConsentPolicy,
} from "../../lib/consent";
import { ONBOARDING_SUBMISSION_DEV_CONSENT } from "../../lib/onboarding/submissions";
import { submitOnboardingAssignment } from "../../lib/onboarding/submissions";
import {
  listClientOnboardingSubmissions,
  markSubmissionReviewed,
  readSubmissionReviewDetail,
} from "../../lib/onboarding/review";
import {
  listClientSubmissionsForReview,
  markSubmissionReviewedFromAction,
  viewSubmissionReviewDetail,
} from "../../lib/onboarding/review-boundary";
import { OnboardingSubmissionError } from "../../lib/onboarding/submission-gate";

/**
 * P-024 — staff onboarding-submission review (decisions #86–#91 + the
 * binding R2 contract) on a dedicated disposable PostgreSQL database
 * (INTEGRATION_DATABASE_URL). Synthetic fixtures only.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: ONBOARDING_SUBMISSION_DEV_CONSENT.PRIVACY_NOTICE,
  HEALTH_DATA: ONBOARDING_SUBMISSION_DEV_CONSENT.HEALTH_DATA,
});

type FieldSpec = {
  fieldId: string;
  kind:
    | "shortText"
    | "longText"
    | "number"
    | "date"
    | "singleChoice"
    | "multiChoice";
  label?: string;
  required?: boolean;
  options?: { optionId: string; label: string }[];
};

const DEFAULT_FIELDS: FieldSpec[] = [
  { fieldId: "f_name", kind: "shortText", label: "Full name", required: true },
  { fieldId: "f_notes", kind: "longText", label: "Notes", required: false },
  { fieldId: "f_weight", kind: "number", label: "Weight", required: true },
  {
    fieldId: "f_goal",
    kind: "singleChoice",
    label: "Goal",
    required: true,
    options: [
      { optionId: "o_gain", label: "Gain" },
      { optionId: "o_lose", label: "Lose" },
    ],
  },
  {
    fieldId: "f_days",
    kind: "multiChoice",
    label: "Days",
    required: false,
    options: [
      { optionId: "d_mon", label: "Mon" },
      { optionId: "d_wed", label: "Wed" },
      { optionId: "d_fri", label: "Fri" },
    ],
  },
];

const def = (fields: FieldSpec[]) => ({
  title: "Intake Form",
  fields: fields.map((f, i) => ({
    fieldId: f.fieldId,
    kind: f.kind,
    label: f.label ?? f.fieldId,
    required: f.required ?? false,
    order: i,
    helpText: null,
    options: f.options ?? [],
  })),
});

const ANSWERS = JSON.stringify([
  { fieldId: "f_name", value: "Bob Client" },
  { fieldId: "f_weight", value: "80.5" },
  { fieldId: "f_goal", value: "o_gain" },
  { fieldId: "f_days", value: ["d_fri", "d_mon"] },
]);

const DEP = (db: PrismaClient) => ({ db, registry: DEV_REGISTRY });

describe.skipIf(!enabled)("P-024 staff onboarding review (real PG)", () => {
  let prisma: PrismaClient;
  let savedFlag: string | undefined;

  beforeAll(async () => {
    savedFlag = process.env.ENABLE_ONBOARDING_SUBMISSION;
    process.env.ENABLE_ONBOARDING_SUBMISSION = "1";
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "onboarding_submission_review","onboarding_submission_answer","onboarding_submission","audit_event","consent_record","onboarding_form_assignment","onboarding_form_version","onboarding_form","client_assignment","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    if (savedFlag === undefined)
      delete process.env.ENABLE_ONBOARDING_SUBMISSION;
    else process.env.ENABLE_ONBOARDING_SUBMISSION = savedFlag;
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `p024_${++n}_${Date.now()}`;

  async function mkUser(
    suffix: string,
    platformRole: "USER" | "PLATFORM_ADMIN" = "USER",
  ) {
    return prisma.user.create({
      data: {
        email: `${uid()}-${suffix}@example.test`,
        passwordHash: "x",
        status: "ACTIVE",
        name: `${suffix}-${uid()}`,
        platformRole,
      },
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

  /** Workspace + owner + client (user/member/profile) + published form
   * + ACTIVE assignment + dev consents, then a committed submission via
   * the real P-023 service → COMPLETED assignment + answers. */
  async function seedSubmitted(
    opts: {
      consent?: boolean;
      coach?: boolean;
      assistant?: boolean;
      support?: boolean;
      platformAdminCoach?: boolean;
    } = {},
  ) {
    const tag = uid();
    const ws = await prisma.workspace.create({
      data: { slug: `w-${tag}`, name: tag, status: "ACTIVE" },
    });
    const ownerUser = await mkUser("o");
    const clientUser = await mkUser("c");
    const ownerMember = await member(ws.id, ownerUser.id, "WORKSPACE_OWNER");
    await member(ws.id, clientUser.id, "CLIENT");
    const profile = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: clientUser.id, name: "C" },
    });
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "Intake",
        createdByMemberId: ownerMember.id,
      },
    });
    const version = await prisma.onboardingFormVersion.create({
      data: {
        formId: form.id,
        versionSeq: 1,
        definition: def(DEFAULT_FIELDS) as never,
        publishOriginRevision: 1,
        publishedByMemberId: ownerMember.id,
      },
    });
    const assignment = await prisma.onboardingFormAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        formId: form.id,
        formVersionId: version.id,
        assignedByMemberId: ownerMember.id,
      },
    });
    if (opts.consent !== false) {
      for (const [kind, v] of [
        ["PRIVACY_NOTICE", ONBOARDING_SUBMISSION_DEV_CONSENT.PRIVACY_NOTICE],
        ["HEALTH_DATA", ONBOARDING_SUBMISSION_DEV_CONSENT.HEALTH_DATA],
      ] as const)
        await prisma.consentRecord.create({
          data: { clientProfileId: profile.id, kind, version: v },
        });
    }
    const result = await submitOnboardingAssignment(
      { user: { id: clientUser.id } },
      {
        workspaceId: ws.id,
        assignmentId: assignment.id,
        answersJson: ANSWERS,
      },
      DEP(prisma),
    );
    if (result.status !== "submitted")
      throw new Error(`seed submit failed: ${result.status}`);

    let coachUser, coachMember;
    if (opts.coach !== false) {
      coachUser = await mkUser("ch");
      coachMember = await member(ws.id, coachUser.id, "COACH");
      await prisma.clientAssignment.create({
        data: {
          workspaceId: ws.id,
          clientProfileId: profile.id,
          coachMemberId: coachMember.id,
          role: "PRIMARY",
        },
      });
    }
    let assistantUser;
    if (opts.assistant) {
      assistantUser = await mkUser("as");
      const am = await member(ws.id, assistantUser.id, "ASSISTANT_COACH");
      await prisma.clientAssignment.create({
        data: {
          workspaceId: ws.id,
          clientProfileId: profile.id,
          coachMemberId: am.id,
          role: "COACH",
        },
      });
    }
    let supportUser;
    if (opts.support) {
      supportUser = await mkUser("s");
      await member(ws.id, supportUser.id, "SUPPORT");
    }
    let adminCoachUser;
    if (opts.platformAdminCoach) {
      adminCoachUser = await mkUser("pa", "PLATFORM_ADMIN");
      const pm = await member(ws.id, adminCoachUser.id, "COACH");
      await prisma.clientAssignment.create({
        data: {
          workspaceId: ws.id,
          clientProfileId: profile.id,
          coachMemberId: pm.id,
          role: "COACH",
        },
      });
    }

    const submission = await prisma.onboardingSubmission.findUniqueOrThrow({
      where: { assignmentId: assignment.id },
    });
    return {
      ws,
      ownerUser,
      clientUser,
      profile,
      form,
      version,
      assignment,
      submission,
      coachUser,
      assistantUser,
      supportUser,
      adminCoachUser,
    };
  }

  const audits = (
    workspaceId: string,
    resourceType?: string,
    action?: string,
  ) =>
    prisma.auditEvent.findMany({
      where: {
        workspaceId,
        ...(resourceType ? { resourceType: resourceType as never } : {}),
        ...(action ? { action: action as never } : {}),
      },
      orderBy: { id: "asc" },
    });

  // ── Role matrix ────────────────────────────────────────────────────

  it("owner reads the header list at workspace scope with NO ClientAssignment", async () => {
    const s = await seedSubmitted({ coach: false });
    const list = await listClientOnboardingSubmissions(
      { user: { id: s.ownerUser.id } },
      { workspaceId: s.ws.id, clientProfileId: s.profile.id },
      DEP(prisma),
    );
    expect(list.state).toBe("ready");
    if (list.state !== "ready") return;
    expect(list.items).toHaveLength(1);
    expect(list.items[0].formName).toBe("Intake");
    expect(list.items[0].versionSeq).toBe(1);
    expect(list.items[0].reviewed).toBeNull();
    // Owner performs zero ClientAssignment work — the profile has none.
    expect(await prisma.clientAssignment.count()).toBe(0);
  });

  it("owner detail returns answers + canMark=false; owner mark is denied", async () => {
    const s = await seedSubmitted({ coach: false });
    const detail = await readSubmissionReviewDetail(
      { user: { id: s.ownerUser.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
      DEP(prisma),
    );
    expect(detail.canMark).toBe(false);
    expect(detail.answers.map((a) => a.fieldId)).toContain("f_name");
    await expect(
      markSubmissionReviewed(
        { user: { id: s.ownerUser.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        DEP(prisma),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("assigned coach reads detail with canMark=true and marks reviewed once", async () => {
    const s = await seedSubmitted();
    const detail = await readSubmissionReviewDetail(
      { user: { id: s.coachUser!.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
      DEP(prisma),
    );
    expect(detail.canMark).toBe(true);
    expect(detail.answers.find((a) => a.fieldId === "f_name")?.display).toBe(
      "Bob Client",
    );
    expect(detail.answers.find((a) => a.fieldId === "f_goal")?.display).toBe(
      "Gain",
    );

    const mark = await markSubmissionReviewed(
      { user: { id: s.coachUser!.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
      DEP(prisma),
    );
    expect(mark.status).toBe("reviewed");
    const reviews = await prisma.onboardingSubmissionReview.findMany({
      where: { submissionId: s.submission.id },
    });
    expect(reviews).toHaveLength(1);
    expect(await audits(s.ws.id, "onboarding_submission_review")).toHaveLength(
      1,
    );
  });

  it("assigned assistant reads but cannot mark", async () => {
    const s = await seedSubmitted({ assistant: true });
    const detail = await readSubmissionReviewDetail(
      { user: { id: s.assistantUser!.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
      DEP(prisma),
    );
    expect(detail.canMark).toBe(false);
    await expect(
      markSubmissionReviewed(
        { user: { id: s.assistantUser!.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        DEP(prisma),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("client, SUPPORT, and dual-role PLATFORM_ADMIN are denied all paths", async () => {
    const s = await seedSubmitted({ support: true, platformAdminCoach: true });
    for (const uid_ of [
      s.clientUser.id,
      s.supportUser!.id,
      s.adminCoachUser!.id,
    ]) {
      await expect(
        listClientOnboardingSubmissions(
          { user: { id: uid_ } },
          { workspaceId: s.ws.id, clientProfileId: s.profile.id },
          DEP(prisma),
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        readSubmissionReviewDetail(
          { user: { id: uid_ } },
          {
            workspaceId: s.ws.id,
            clientProfileId: s.profile.id,
            submissionId: s.submission.id,
          },
          DEP(prisma),
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        markSubmissionReviewed(
          { user: { id: uid_ } },
          {
            workspaceId: s.ws.id,
            clientProfileId: s.profile.id,
            submissionId: s.submission.id,
          },
          DEP(prisma),
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }
  });

  it("denied responses carry no values or identifiers", async () => {
    const s = await seedSubmitted({ support: true });
    let error: unknown;
    try {
      await readSubmissionReviewDetail(
        { user: { id: s.supportUser!.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        DEP(prisma),
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AccessDeniedError);
    expect(String((error as Error).message)).not.toMatch(
      /Bob|Intake|f_name|s\.submission\.id/,
    );
  });

  // ── Audits ───────────────────────────────────────────────────────────

  it("one READ audit per committed detail; zero from list/GET work", async () => {
    const s = await seedSubmitted();
    await listClientOnboardingSubmissions(
      { user: { id: s.coachUser!.id } },
      { workspaceId: s.ws.id, clientProfileId: s.profile.id },
      DEP(prisma),
    );
    await listClientOnboardingSubmissions(
      { user: { id: s.coachUser!.id } },
      { workspaceId: s.ws.id, clientProfileId: s.profile.id },
      DEP(prisma),
    );
    expect(await audits(s.ws.id, "onboarding_submission", "READ")).toHaveLength(
      0,
    );

    await readSubmissionReviewDetail(
      { user: { id: s.coachUser!.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
      DEP(prisma),
    );
    const reads = await audits(s.ws.id, "onboarding_submission", "READ");
    expect(reads).toHaveLength(1);
    expect(reads[0].action).toBe("READ");
    expect((reads[0].meta as { changed?: boolean }).changed).toBe(false);

    // At-least-once: a second committed detail writes a second audit.
    await readSubmissionReviewDetail(
      { user: { id: s.coachUser!.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
      DEP(prisma),
    );
    expect(await audits(s.ws.id, "onboarding_submission", "READ")).toHaveLength(
      2,
    );
  });

  it("audit failure rolls back the detail read (no values, no audit)", async () => {
    const s = await seedSubmitted();
    failAudit = true;
    try {
      await expect(
        readSubmissionReviewDetail(
          { user: { id: s.coachUser!.id } },
          {
            workspaceId: s.ws.id,
            clientProfileId: s.profile.id,
            submissionId: s.submission.id,
          },
          DEP(prisma),
        ),
      ).rejects.toThrow();
    } finally {
      failAudit = false;
    }
    // The seed's submit CREATE audit remains; the failed detail leaves
    // no READ audit and returned no values.
    expect(await audits(s.ws.id, "onboarding_submission", "READ")).toHaveLength(
      0,
    );
  });

  it("audit failure rolls back the review insert (no row, no audit)", async () => {
    const s = await seedSubmitted();
    failAudit = true;
    try {
      await expect(
        markSubmissionReviewed(
          { user: { id: s.coachUser!.id } },
          {
            workspaceId: s.ws.id,
            clientProfileId: s.profile.id,
            submissionId: s.submission.id,
          },
          DEP(prisma),
        ),
      ).rejects.toThrow();
    } finally {
      failAudit = false;
    }
    expect(
      await prisma.onboardingSubmissionReview.count({
        where: { submissionId: s.submission.id },
      }),
    ).toBe(0);
    // The seed's submit CREATE audit remains; no review audit commits.
    expect(await audits(s.ws.id, "onboarding_submission_review")).toHaveLength(
      0,
    );
  });

  // ── Idempotency / replay / concurrency ──────────────────────────────

  it("valid replay returns already_reviewed with zero new rows/audits", async () => {
    const s = await seedSubmitted();
    const first = await markSubmissionReviewed(
      { user: { id: s.coachUser!.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
      DEP(prisma),
    );
    const second = await markSubmissionReviewed(
      { user: { id: s.coachUser!.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
      DEP(prisma),
    );
    expect(second.status).toBe("already_reviewed");
    expect(second.reviewedAt).toBe(first.reviewedAt);
    expect(
      await prisma.onboardingSubmissionReview.count({
        where: { submissionId: s.submission.id },
      }),
    ).toBe(1);
    expect(await audits(s.ws.id, "onboarding_submission_review")).toHaveLength(
      1,
    );
  });

  it("concurrent double-mark commits exactly one review + one audit", async () => {
    const s = await seedSubmitted();
    const other = await mkUser("ch2");
    const om = await member(s.ws.id, other.id, "COACH");
    await prisma.clientAssignment.create({
      data: {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        coachMemberId: om.id,
        role: "COACH",
      },
    });
    const [a, b] = await Promise.allSettled([
      markSubmissionReviewed(
        { user: { id: s.coachUser!.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        DEP(prisma),
      ),
      markSubmissionReviewed(
        { user: { id: other.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        DEP(prisma),
      ),
    ]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("fulfilled");
    const statuses = [a, b].map((r) =>
      r.status === "fulfilled" ? r.value.status : "failed",
    );
    expect(statuses.sort()).toEqual(["already_reviewed", "reviewed"]);
    expect(
      await prisma.onboardingSubmissionReview.count({
        where: { submissionId: s.submission.id },
      }),
    ).toBe(1);
    expect(await audits(s.ws.id, "onboarding_submission_review")).toHaveLength(
      1,
    );
  });

  it("foreign submissionId fails closed BEFORE any advisory is acquired", async () => {
    const s = await seedSubmitted();
    const foreign = await seedSubmitted();
    // Count advisory executions through a wrapped client.
    let advisories = 0;
    const wrapped = new Proxy(prisma, {
      get(target, prop) {
        if (prop === "$executeRawUnsafe") {
          return (sql: string, ...args: unknown[]) => {
            if (String(sql).includes("pg_advisory_xact_lock")) advisories++;
            return target.$executeRawUnsafe(sql, ...args);
          };
        }
        if (prop === "$transaction")
          return (fn: never, opts: never) => target.$transaction(fn, opts);
        return target[prop as keyof PrismaClient];
      },
    }) as unknown as PrismaClient;

    await expect(
      readSubmissionReviewDetail(
        { user: { id: s.coachUser!.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: foreign.submission.id,
        },
        DEP(wrapped),
      ),
    ).rejects.toThrow();
    // The pre-read fails first — zero advisories may have been taken.
    expect(advisories).toBe(0);
  });

  it("consent withdrawal fails closed: detail unavailable + zero audits; replay after withdrawal fails", async () => {
    const s = await seedSubmitted();
    await prisma.consentRecord.updateMany({
      where: { clientProfileId: s.profile.id },
      data: { revokedAt: new Date() },
    });
    await expect(
      readSubmissionReviewDetail(
        { user: { id: s.coachUser!.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        DEP(prisma),
      ),
    ).rejects.toBeInstanceOf(OnboardingSubmissionError);
    expect(await audits(s.ws.id, "onboarding_submission", "READ")).toHaveLength(
      0,
    );

    // Review never committed before withdrawal — mark also fails.
    await expect(
      markSubmissionReviewed(
        { user: { id: s.coachUser!.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        DEP(prisma),
      ),
    ).rejects.toBeInstanceOf(OnboardingSubmissionError);
  });

  it("replay after consent withdrawal returns consent_missing, never the timestamp", async () => {
    const s = await seedSubmitted();
    await markSubmissionReviewed(
      { user: { id: s.coachUser!.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
      DEP(prisma),
    );
    await prisma.consentRecord.updateMany({
      where: { clientProfileId: s.profile.id },
      data: { revokedAt: new Date() },
    });
    await expect(
      markSubmissionReviewed(
        { user: { id: s.coachUser!.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        DEP(prisma),
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
  });

  it("unconfigured consent policy fails closed everywhere", async () => {
    const s = await seedSubmitted();
    const deps = { db: prisma, registry: unconfiguredConsentPolicy };
    await expect(
      listClientOnboardingSubmissions(
        { user: { id: s.coachUser!.id } },
        { workspaceId: s.ws.id, clientProfileId: s.profile.id },
        deps,
      ),
    ).resolves.toEqual({ state: "consent_missing" });
    await expect(
      readSubmissionReviewDetail(
        { user: { id: s.coachUser!.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(OnboardingSubmissionError);
  });

  it("inactive membership and removed ClientAssignment fail closed", async () => {
    const s = await seedSubmitted();
    // Remove the coach's assignment — the assigned branch must deny.
    await prisma.clientAssignment.updateMany({
      where: { workspaceId: s.ws.id, coachMemberId: { not: undefined } },
      data: { status: "REMOVED" },
    });
    await expect(
      readSubmissionReviewDetail(
        { user: { id: s.coachUser!.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        DEP(prisma),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // Suspended membership fails even for the owner.
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: s.ws.id, userId: s.ownerUser.id },
      data: { status: "SUSPENDED" },
    });
    await expect(
      readSubmissionReviewDetail(
        { user: { id: s.ownerUser.id } },
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
        },
        DEP(prisma),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // ── Schema contract on real PostgreSQL ───────────────────────────────

  it("unique(submission_id) is the terminal anchor — second insert fails", async () => {
    const s = await seedSubmitted();
    await markSubmissionReviewed(
      { user: { id: s.coachUser!.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
      DEP(prisma),
    );
    await expect(
      prisma.onboardingSubmissionReview.create({
        data: {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
          submissionId: s.submission.id,
          reviewedByMemberId: (
            await prisma.workspaceMember.findFirstOrThrow({
              where: { workspaceId: s.ws.id },
            })
          ).id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("composite coherence FK rejects a review on a foreign tuple", async () => {
    const s = await seedSubmitted();
    const foreign = await seedSubmitted();
    const anyMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: s.ws.id },
    });
    // submission_id from workspace A but client/workspace ids from B —
    // the composite FK must reject the incoherent insert.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "onboarding_submission_review"
         (id, workspace_id, client_profile_id, submission_id,
          reviewed_by_member_id, reviewed_at, created_at)
         VALUES ($1,$2,$3,$4,$5,now(),now())`,
        `bad_${uid()}`,
        foreign.ws.id,
        foreign.profile.id,
        s.submission.id,
        anyMember.id,
      ),
    ).rejects.toThrow();
  });

  // ── Boundary surface ─────────────────────────────────────────────────

  it("boundary returns non-disclosing messages; flag-off returns feature-off", async () => {
    const s = await seedSubmitted({ support: true });
    const session: SessionLike = { user: { id: s.supportUser!.id } };
    const denied = await viewSubmissionReviewDetail(session, {
      workspaceId: s.ws.id,
      clientProfileId: s.profile.id,
      submissionId: s.submission.id,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.message).toBe("You don't have access to do that.");

    process.env.ENABLE_ONBOARDING_SUBMISSION = "0";
    try {
      const off = await listClientSubmissionsForReview(session, {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
      });
      expect(off).toEqual({
        ok: false,
        message: "This feature is not available.",
      });
    } finally {
      process.env.ENABLE_ONBOARDING_SUBMISSION = "1";
    }
  });

  it("boundary mark: assigned coach reviews; owner gets the denied message", async () => {
    const s = await seedSubmitted();
    const coachResult = await markSubmissionReviewedFromAction(
      { user: { id: s.coachUser!.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
    );
    expect(coachResult).toMatchObject({
      ok: true,
      value: { status: "reviewed" },
    });
    const ownerResult = await markSubmissionReviewedFromAction(
      { user: { id: s.ownerUser.id } },
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
        submissionId: s.submission.id,
      },
    );
    expect(ownerResult.ok).toBe(false);
  });
});
