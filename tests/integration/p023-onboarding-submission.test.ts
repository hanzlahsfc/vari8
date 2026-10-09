import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Audit-failure injection — pass-through unless the flag is armed, used to
// prove the CREATE audit rolls the whole submit transaction back.
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
import { unconfiguredConsentPolicy } from "../../lib/consent";
import {
  ONBOARDING_SUBMISSION_DEV_CONSENT,
  OnboardingSubmissionError,
  submitOnboardingAssignment,
} from "../../lib/onboarding/submissions";
import {
  listOwnAssignmentsForWorkspace,
  loadOwnDetailForRoute,
  submitOnboardingFromAction,
} from "../../lib/onboarding/submissions-boundary";
import { createStaticConsentPolicy } from "../../lib/consent";

/**
 * P-023 — client onboarding submission (decisions #82–#85, R3) on a
 * dedicated disposable PostgreSQL database (INTEGRATION_DATABASE_URL).
 * Synthetic fixtures only.
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
  { fieldId: "f_start", kind: "date", label: "Start date", required: false },
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

describe.skipIf(!enabled)("P-023 onboarding submission (real PG)", () => {
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
      'TRUNCATE "onboarding_submission_answer","onboarding_submission","audit_event","consent_record","onboarding_form_assignment","onboarding_form_version","onboarding_form","client_assignment","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    if (savedFlag === undefined)
      delete process.env.ENABLE_ONBOARDING_SUBMISSION;
    else process.env.ENABLE_ONBOARDING_SUBMISSION = savedFlag;
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `p023_${++n}_${Date.now()}`;

  /** Creates workspace + owner + client (user/member/profile) + published
   * form version + ACTIVE assignment + both dev consent rows. */
  async function seedAssignment(
    fields: FieldSpec[] = DEFAULT_FIELDS,
    opts: {
      consent?: boolean;
      registry?: ReturnType<typeof createStaticConsentPolicy>;
      definition?: ReturnType<typeof def>;
    } = {},
  ) {
    const tag = uid();
    const ws = await prisma.workspace.create({
      data: { slug: `w-${tag}`, name: tag, status: "ACTIVE" },
    });
    const mkUser = (suffix: string) =>
      prisma.user.create({
        data: {
          email: `${tag}-${suffix}@example.test`,
          passwordHash: "x",
          status: "ACTIVE",
          name: `${tag}-${suffix}`,
        },
      });
    const ownerUser = await mkUser("o");
    const clientUser = await mkUser("c");
    const ownerMember = await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: ownerUser.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    const clientMember = await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: clientUser.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
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
        definition: (opts.definition ?? def(fields)) as never,
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
    const session: SessionLike = { user: { id: clientUser.id } };
    return {
      ws,
      ownerUser,
      ownerMember,
      clientUser,
      clientMember,
      profile,
      form,
      version,
      assignment,
      session,
    };
  }

  const submitInput = (c: Awaited<ReturnType<typeof seedAssignment>>) => ({
    workspaceId: c.ws.id,
    assignmentId: c.assignment.id,
    answersJson: ANSWERS,
  });

  const DEP = () => ({ db: prisma, registry: DEV_REGISTRY });

  describe("migration contract", () => {
    it("rejects incoherent submission tuples via composite FKs", async () => {
      const c = await seedAssignment();
      const good = await submitOnboardingAssignment(
        c.session,
        submitInput(c),
        DEP(),
      );
      expect(good.status).toBe("submitted");
      const other = await seedAssignment();

      // workspace ≠ assignment's workspace
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "onboarding_submission"
           (id, workspace_id, client_profile_id, form_id, form_version_id,
            assignment_id, submitted_by_user_id, submitted_by_member_id,
            submitted_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now(),now())`,
          `bad_${uid()}`,
          other.ws.id, // foreign workspace
          c.profile.id,
          c.form.id,
          c.version.id,
          c.assignment.id,
          c.clientUser.id,
          c.clientMember.id,
        ),
      ).rejects.toThrow();
    });

    it("rejects submission whose version is not in its form", async () => {
      const c = await seedAssignment();
      const other = await seedAssignment();
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "onboarding_submission"
           (id, workspace_id, client_profile_id, form_id, form_version_id,
            assignment_id, submitted_by_user_id, submitted_by_member_id,
            submitted_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now(),now())`,
          `bad_${uid()}`,
          c.ws.id,
          c.profile.id,
          c.form.id,
          other.version.id, // version ∉ form
          c.assignment.id,
          c.clientUser.id,
          c.clientMember.id,
        ),
      ).rejects.toThrow();
    });

    it("rejects answers violating the kind↔column CHECK", async () => {
      const c = await seedAssignment();
      await submitOnboardingAssignment(c.session, submitInput(c), DEP());
      const sub = await prisma.onboardingSubmission.findFirstOrThrow({
        where: { assignmentId: c.assignment.id },
      });
      // kind=NUMBER but value_text populated
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "onboarding_submission_answer"
           (id, submission_id, workspace_id, field_id, kind, value_text)
           VALUES ($1,$2,$3,$4,'NUMBER','oops')`,
          `a_${uid()}`,
          sub.id,
          c.ws.id,
          "f_x",
        ),
      ).rejects.toThrow();
      // kind=SINGLE_CHOICE with 2 options
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "onboarding_submission_answer"
           (id, submission_id, workspace_id, field_id, kind, value_option_ids)
           VALUES ($1,$2,$3,$4,'SINGLE_CHOICE','["a","b"]'::jsonb)`,
          `a_${uid()}`,
          sub.id,
          c.ws.id,
          "f_x",
        ),
      ).rejects.toThrow();
      // kind=MULTI_CHOICE with >50 options
      const many = JSON.stringify(
        Array.from({ length: 51 }, (_, i) => `o${i}`),
      );
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "onboarding_submission_answer"
           (id, submission_id, workspace_id, field_id, kind, value_option_ids)
           VALUES ($1,$2,$3,$4,'MULTI_CHOICE',$5::jsonb)`,
          `a_${uid()}`,
          sub.id,
          c.ws.id,
          "f_x",
          many,
        ),
      ).rejects.toThrow();
      // duplicate (submissionId, fieldId)
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "onboarding_submission_answer"
           (id, submission_id, workspace_id, field_id, kind, value_text)
           VALUES ($1,$2,$3,$4,'SHORT_TEXT','dup')`,
          `a_${uid()}`,
          sub.id,
          c.ws.id,
          "f_name", // already answered
        ),
      ).rejects.toThrow();
    });
  });

  describe("submit transaction", () => {
    it("first submit → submission + ordered answers + COMPLETED + provenance + one audit", async () => {
      const c = await seedAssignment();
      const result = await submitOnboardingAssignment(
        c.session,
        submitInput(c),
        DEP(),
      );
      expect(result).toEqual({
        status: "submitted",
        submissionId: expect.any(String),
      });

      const sub = await prisma.onboardingSubmission.findFirstOrThrow({
        where: { assignmentId: c.assignment.id },
        include: { answers: { orderBy: { id: "asc" } } },
      });
      expect(sub.workspaceId).toBe(c.ws.id);
      expect(sub.clientProfileId).toBe(sub ? c.profile.id : null);
      expect(sub.formId).toBe(c.form.id);
      expect(sub.formVersionId).toBe(c.version.id);
      expect(sub.submittedByUserId).toBe(c.clientUser.id);
      expect(sub.submittedByMemberId).toBe(c.clientMember.id);
      // Definition order: required answered fields present in order.
      expect(sub.answers.map((a) => a.fieldId)).toEqual([
        "f_name",
        "f_weight",
        "f_goal",
        "f_days",
      ]);
      const byField = Object.fromEntries(
        sub.answers.map((a) => [a.fieldId, a]),
      );
      expect(byField.f_name.valueText).toBe("Bob Client");
      expect(String(byField.f_weight.valueNumeric)).toBe("80.5");
      expect(byField.f_goal.valueOptionIds).toEqual(["o_gain"]);
      expect(byField.f_days.valueOptionIds).toEqual(["d_fri", "d_mon"]);

      const assignment =
        await prisma.onboardingFormAssignment.findUniqueOrThrow({
          where: { id: c.assignment.id },
        });
      expect(assignment.status).toBe("COMPLETED");
      expect(assignment.endedAt).not.toBeNull();
      expect(assignment.endedByMemberId).toBe(c.clientMember.id);

      const audits = await prisma.auditEvent.findMany({
        where: {
          workspaceId: c.ws.id,
          resourceType: "onboarding_submission",
          action: "CREATE",
        },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].resourceId).toBe(sub.id);
      expect(audits[0].meta).toEqual({ changed: true });
    });

    it("structurally valid replay → already_submitted, original kept, zero second write/audit", async () => {
      const c = await seedAssignment();
      const first = await submitOnboardingAssignment(
        c.session,
        submitInput(c),
        DEP(),
      );
      const replay = await submitOnboardingAssignment(
        c.session,
        {
          workspaceId: c.ws.id,
          assignmentId: c.assignment.id,
          answersJson: JSON.stringify([
            { fieldId: "f_name", value: "DIFFERENT" },
            { fieldId: "f_weight", value: "1" },
            { fieldId: "f_goal", value: "o_lose" },
          ]),
        },
        DEP(),
      );
      expect(replay).toEqual({
        status: "already_submitted",
        submissionId: first.status === "submitted" ? first.submissionId : "x",
      });
      const subs = await prisma.onboardingSubmission.findMany({
        where: { assignmentId: c.assignment.id },
      });
      expect(subs).toHaveLength(1);
      const answers = await prisma.onboardingSubmissionAnswer.findMany({
        where: { submissionId: subs[0].id },
      });
      const name = answers.find((a) => a.fieldId === "f_name");
      expect(name?.valueText).toBe("Bob Client"); // original retained
      const audits = await prisma.auditEvent.findMany({
        where: {
          workspaceId: c.ws.id,
          resourceType: "onboarding_submission",
        },
      });
      expect(audits).toHaveLength(1);
    });

    it("malformed/oversized replay is rejected BEFORE the idempotency shortcut", async () => {
      const c = await seedAssignment();
      await submitOnboardingAssignment(c.session, submitInput(c), DEP());
      await expect(
        submitOnboardingAssignment(
          c.session,
          {
            workspaceId: c.ws.id,
            assignmentId: c.assignment.id,
            answersJson: "{not json",
          },
          DEP(),
        ),
      ).rejects.toThrow(OnboardingSubmissionError);
      await expect(
        submitOnboardingAssignment(
          c.session,
          {
            workspaceId: c.ws.id,
            assignmentId: c.assignment.id,
            answersJson: "x".repeat(70 * 1024),
          },
          DEP(),
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
      // duplicate fieldIds rejected pre-canonicalization even on replay
      await expect(
        submitOnboardingAssignment(
          c.session,
          {
            workspaceId: c.ws.id,
            assignmentId: c.assignment.id,
            answersJson:
              '[{"fieldId":"f_name","value":"a"},{"fieldId":"f_name","value":"b"}]',
          },
          DEP(),
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("concurrent double-submit → exactly one submission and one audit", async () => {
      const c = await seedAssignment();
      const [a, b] = await Promise.all([
        submitOnboardingAssignment(c.session, submitInput(c), DEP()),
        submitOnboardingAssignment(c.session, submitInput(c), DEP()),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual(["already_submitted", "submitted"]);
      const subs = await prisma.onboardingSubmission.findMany({
        where: { assignmentId: c.assignment.id },
      });
      expect(subs).toHaveLength(1);
      const audits = await prisma.auditEvent.findMany({
        where: {
          workspaceId: c.ws.id,
          resourceType: "onboarding_submission",
          action: "CREATE",
        },
      });
      expect(audits).toHaveLength(1);
    });

    it("audit failure rolls back submission, answers, and completion", async () => {
      const c = await seedAssignment();
      failAudit = true;
      try {
        await expect(
          submitOnboardingAssignment(c.session, submitInput(c), DEP()),
        ).rejects.toThrow("injected_audit_failure");
      } finally {
        failAudit = false;
      }
      expect(
        await prisma.onboardingSubmission.count({
          where: { assignmentId: c.assignment.id },
        }),
      ).toBe(0);
      const assignment =
        await prisma.onboardingFormAssignment.findUniqueOrThrow({
          where: { id: c.assignment.id },
        });
      expect(assignment.status).toBe("ACTIVE");
      expect(
        await prisma.auditEvent.count({
          where: {
            workspaceId: c.ws.id,
            resourceType: "onboarding_submission",
          },
        }),
      ).toBe(0);
    });
  });

  describe("authorization + non-disclosure", () => {
    it("foreign/missing/wrong-workspace assignment IDs fail non-disclosingly", async () => {
      const a = await seedAssignment();
      const b = await seedAssignment();
      for (const assignmentId of [
        b.assignment.id, // foreign own-profile mismatch
        "missing_id",
        "x".repeat(200), // over bound
      ]) {
        await expect(
          submitOnboardingAssignment(
            a.session,
            {
              workspaceId: a.ws.id,
              assignmentId,
              answersJson: ANSWERS,
            },
            DEP(),
          ),
        ).rejects.toThrow(/not_available|invalid_input/);
      }
      // wrong workspace
      await expect(
        submitOnboardingAssignment(
          a.session,
          {
            workspaceId: b.ws.id,
            assignmentId: a.assignment.id,
            answersJson: ANSWERS,
          },
          DEP(),
        ),
      ).rejects.toThrow(/not_available|AccessDenied|denied/i);
    });

    it("denies every non-CLIENT role and inactive memberships", async () => {
      const c = await seedAssignment();
      const tag = uid();
      const mkDenied = async (
        role: "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT",
      ) => {
        const user = await prisma.user.create({
          data: {
            email: `${tag}-${role}@example.test`,
            passwordHash: "x",
            status: "ACTIVE",
          },
        });
        await prisma.workspaceMember.create({
          data: {
            workspaceId: c.ws.id,
            userId: user.id,
            role,
            status: "ACTIVE",
          },
        });
        return { user: { id: user.id } } as SessionLike;
      };
      for (const role of [
        "WORKSPACE_OWNER",
        "COACH",
        "ASSISTANT_COACH",
        "SUPPORT",
      ] as const) {
        const session = await mkDenied(role);
        await expect(
          submitOnboardingAssignment(session, submitInput(c), DEP()),
        ).rejects.toThrow(AccessDeniedError);
        await expect(
          listOwnAssignmentsForWorkspace(session, { workspaceId: c.ws.id }),
        ).resolves.toEqual({ ok: false, message: expect.any(String) });
      }
      // Suspended membership
      await prisma.workspaceMember.update({
        where: { id: c.clientMember.id },
        data: { status: "SUSPENDED" },
      });
      await expect(
        submitOnboardingAssignment(c.session, submitInput(c), DEP()),
      ).rejects.toThrow(AccessDeniedError);
    });

    it("cancelled/superseded terminal assignments refuse", async () => {
      const c = await seedAssignment();
      await prisma.onboardingFormAssignment.update({
        where: { id: c.assignment.id },
        data: {
          status: "CANCELLED",
          endedByMemberId: c.ownerMember.id,
          endedAt: new Date(),
        },
      });
      await expect(
        submitOnboardingAssignment(c.session, submitInput(c), DEP()),
      ).rejects.toMatchObject({ code: "not_available" });
    });
  });

  describe("consent boundary", () => {
    it("missing consent fails the write closed", async () => {
      const c = await seedAssignment(DEFAULT_FIELDS, { consent: false });
      await expect(
        submitOnboardingAssignment(c.session, submitInput(c), DEP()),
      ).rejects.toMatchObject({ code: "consent_missing" });
      expect(
        await prisma.onboardingSubmission.count({
          where: { assignmentId: c.assignment.id },
        }),
      ).toBe(0);
    });

    it("unconfigured production registry fails closed even with flag on", async () => {
      const c = await seedAssignment();
      await expect(
        submitOnboardingAssignment(c.session, submitInput(c), {
          db: prisma,
          registry: unconfiguredConsentPolicy,
        }),
      ).rejects.toMatchObject({ code: "policy_not_configured" });
    });

    it("post-withdrawal: detail read fails closed, list keeps bounded metadata", async () => {
      const c = await seedAssignment();
      await submitOnboardingAssignment(c.session, submitInput(c), DEP());
      await prisma.consentRecord.updateMany({
        where: { clientProfileId: c.profile.id, kind: "PRIVACY_NOTICE" },
        data: { revokedAt: new Date() },
      });
      const detail = await loadOwnDetailForRoute(
        c.session,
        { workspaceId: c.ws.id, assignmentId: c.assignment.id },
        { db: prisma, registry: DEV_REGISTRY },
      );
      expect(detail).toEqual({
        ok: true,
        value: { state: "unavailable" },
      });
      const list = await listOwnAssignmentsForWorkspace(
        c.session,
        { workspaceId: c.ws.id },
        { db: prisma },
      );
      expect(list.ok).toBe(true);
      if (list.ok) {
        expect(list.value.items).toHaveLength(1);
        expect(list.value.items[0].status).toBe("COMPLETED");
        expect(list.value.items[0].submittedAt).not.toBeNull();
        // bounded metadata only — no answers
        expect(JSON.stringify(list.value)).not.toContain("Bob Client");
      }
    });
  });

  describe("pinned-version integrity", () => {
    it("submits against the pinned version even after a later publication", async () => {
      const c = await seedAssignment([
        { fieldId: "f_only_v1", kind: "shortText", required: true },
      ]);
      // Publish v2 with a different field set — the pinned v1 still governs.
      await prisma.onboardingFormVersion.create({
        data: {
          formId: c.form.id,
          versionSeq: 2,
          definition: def([
            { fieldId: "f_only_v2", kind: "number", required: true },
          ]) as never,
          publishOriginRevision: 2,
          publishedByMemberId: c.ownerMember.id,
        },
      });
      // Answers shaped for v2 are rejected (unknown field).
      await expect(
        submitOnboardingAssignment(
          c.session,
          {
            workspaceId: c.ws.id,
            assignmentId: c.assignment.id,
            answersJson: JSON.stringify([{ fieldId: "f_only_v2", value: "5" }]),
          },
          DEP(),
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
      // Answers shaped for the pinned v1 succeed.
      const result = await submitOnboardingAssignment(
        c.session,
        {
          workspaceId: c.ws.id,
          assignmentId: c.assignment.id,
          answersJson: JSON.stringify([
            { fieldId: "f_only_v1", value: "pinned answer" },
          ]),
        },
        DEP(),
      );
      expect(result.status).toBe("submitted");
    });
  });

  describe("own reads", () => {
    it("client lists own assignments with bounded metadata", async () => {
      const c = await seedAssignment();
      const list = await listOwnAssignmentsForWorkspace(
        c.session,
        { workspaceId: c.ws.id },
        { db: prisma },
      );
      expect(list).toEqual({
        ok: true,
        value: {
          items: [
            {
              assignmentId: c.assignment.id,
              formName: "Intake",
              status: "ACTIVE",
              assignedAt: expect.any(String),
              submittedAt: null,
            },
          ],
        },
      });
    });

    it("fillable → submitted → submitted detail round-trips own answers", async () => {
      const c = await seedAssignment();
      const deps = { db: prisma, registry: DEV_REGISTRY };
      const before = await loadOwnDetailForRoute(
        c.session,
        { workspaceId: c.ws.id, assignmentId: c.assignment.id },
        deps,
      );
      expect(before.ok && before.value.state).toBe("ready");

      await submitOnboardingAssignment(c.session, submitInput(c), DEP());

      const after = await loadOwnDetailForRoute(
        c.session,
        { workspaceId: c.ws.id, assignmentId: c.assignment.id },
        deps,
      );
      expect(after.ok).toBe(true);
      if (after.ok && after.value.state === "submitted") {
        const byLabel = Object.fromEntries(
          after.value.answers.map((a) => [a.label, a.display]),
        );
        expect(byLabel["Full name"]).toBe("Bob Client");
        expect(byLabel["Goal"]).toBe("Gain");
        expect(byLabel["Days"]).toBe("Mon, Fri");
      } else {
        throw new Error("expected submitted detail");
      }
      // Foreign detail → unavailable.
      const foreign = await loadOwnDetailForRoute(
        { user: { id: c.ownerUser.id } },
        { workspaceId: c.ws.id, assignmentId: c.assignment.id },
        deps,
      );
      expect(foreign).toEqual({ ok: true, value: { state: "unavailable" } });
    });
  });

  describe("boundary gate", () => {
    it("flag-off returns feature-off before any DB work", async () => {
      const prev = process.env.ENABLE_ONBOARDING_SUBMISSION;
      delete process.env.ENABLE_ONBOARDING_SUBMISSION;
      try {
        const c = await seedAssignment();
        const auditsBefore = await prisma.auditEvent.count();
        const res = await submitOnboardingFromAction(
          c.session,
          submitInput(c),
          { db: prisma, registry: DEV_REGISTRY },
        );
        expect(res).toEqual({
          ok: false,
          message: "This feature is not available.",
        });
        expect(
          await prisma.onboardingSubmission.count({
            where: { assignmentId: c.assignment.id },
          }),
        ).toBe(0);
        expect(await prisma.auditEvent.count()).toBe(auditsBefore);
        const list = await listOwnAssignmentsForWorkspace(
          c.session,
          { workspaceId: c.ws.id },
          { db: prisma },
        );
        expect(list.ok).toBe(false);
      } finally {
        process.env.ENABLE_ONBOARDING_SUBMISSION = prev ?? "1";
      }
    });
  });
});
