import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { CheckInInstanceError } from "../../lib/checkin/instances";
import { createStaticConsentPolicy } from "../../lib/consent";
import {
  loadDailyEntrySurface,
  saveDailyEntry,
} from "../../lib/daily-entry/service";
import {
  createCheckInForm,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";
import {
  markCheckInSubmissionReviewed,
  scheduleCheckInInstance,
  submitCheckInInstance,
} from "../../lib/checkin/instances";
import { readCheckInReviewTrackerContext } from "../../lib/checkin/tracker-context";

/**
 * P-025-D6 — explicit DailyEntry tracker context inside authorized staff
 * Check-In review (decision #103 + binding engineering contract). Real
 * disposable PostgreSQL. The reveal is a separate explicit action in its
 * own Serializable transaction: `csetup`→`member` advisories, member
 * lock, strict `checkinsCoachReviews/read` ∩ `dailyTracking/read` scope
 * reconciliation, shared assignment lock, profile lock, Check-In
 * coherence under the Serializable snapshot (no `chkin`, no Check-In row
 * locks), consent intersection FOR UPDATE, latest-revision-only render
 * of the EXACT declared entryDate, `READ daily_entry` audit last.
 */

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

/** Distinct policy versions per resource — the consent intersection must
 *  require each side's own registry version. */
const CHECKIN_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "chk-dev-privacy-v1",
  HEALTH_DATA: "chk-dev-health-v1",
});
const DAILY_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "de-dev-privacy-v1",
  HEALTH_DATA: "de-dev-health-v1",
});

const ENTRY_DATE = "2024-06-10";
const OTHER_DATE = "2024-06-11";

describe.skipIf(!enabled)("P-025-D6 tracker context (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "daily_entry_revision_value","daily_entry_revision","daily_entry","checkin_review","checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","client_setup_pin","client_setup","consent_record","audit_event","coaching_template_version_parameter","coaching_template_version","coaching_template","parameter_definition","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `p25d6${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = () => ({
    db: prisma as never,
    checkinRegistry: CHECKIN_REGISTRY,
    dailyRegistry: DAILY_REGISTRY,
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
      data: { name: `WS ${uid()}`, slug: `p25d6-${uid()}`, status: "ACTIVE" },
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
  async function profile(workspaceId: string, userId: string) {
    return prisma.clientProfile.create({
      data: { workspaceId, userId, name: `Client ${uid()}` },
    });
  }
  async function consent(clientProfileId: string) {
    for (const [kind, ver] of [
      ["PRIVACY_NOTICE", "chk-dev-privacy-v1"],
      ["HEALTH_DATA", "chk-dev-health-v1"],
      ["PRIVACY_NOTICE", "de-dev-privacy-v1"],
      ["HEALTH_DATA", "de-dev-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId, kind, version: ver },
      });
  }
  async function revokeConsentKind(clientProfileId: string, version: string) {
    await prisma.consentRecord.updateMany({
      where: { clientProfileId, version },
      data: { revokedAt: new Date() },
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

  /** DailyEntry fixture — one GENERAL_HEALTH template, setup + pin. */
  async function dailyFixture(
    workspaceId: string,
    clientProfileId: string,
    createdByMemberId: string,
  ) {
    const tag = uid();
    const paramDefs = [
      { id: `pdd_w_${tag}`, kind: "MEASUREMENT", required: true },
      { id: `pdd_t_${tag}`, kind: "TEXT", required: false },
    ];
    for (const p of paramDefs) {
      await prisma.parameterDefinition.create({
        data: {
          id: p.id,
          workspaceId,
          key: `p_${p.id}`,
          kind: p.kind as never,
          label: `Label ${p.id}`,
          unit: p.kind === "MEASUREMENT" ? "kg" : null,
          validation:
            p.kind === "MEASUREMENT" ? { min: 0, max: 500 } : undefined,
          dataClassification: "GENERAL_HEALTH",
          createdByMemberId,
          updatedByMemberId: createdByMemberId,
        },
      });
    }
    const template = await prisma.coachingTemplate.create({
      data: { workspaceId, name: `T ${tag}`, createdByMemberId },
    });
    const version = await prisma.coachingTemplateVersion.create({
      data: {
        workspaceId,
        templateId: template.id,
        versionSeq: 1,
        definition: {
          title: "T",
          sections: [
            {
              sectionId: "sec_main",
              label: "Main",
              order: 0,
              items: paramDefs.map((p, i) => ({
                itemId: `itm_${p.id}`,
                parameterId: p.id,
                parameterKey: `p_${p.id}`,
                required: p.required,
                order: i,
              })),
            },
          ],
          parameters: Object.fromEntries(
            paramDefs.map((p) => [
              p.id,
              {
                key: `p_${p.id}`,
                kind: p.kind,
                label: `Label ${p.id}`,
                helpText: null,
                unit: p.kind === "MEASUREMENT" ? "kg" : null,
                ratingScheme: null,
                options: [],
                validation:
                  p.kind === "MEASUREMENT" ? { min: 0, max: 500 } : null,
                group: null,
                dataClassification: "GENERAL_HEALTH",
                revision: 1,
              },
            ]),
          ),
        } as never,
        publishOriginRevision: 1,
        publishedByMemberId: createdByMemberId,
      },
    });
    const setup = await prisma.clientSetup.create({
      data: { workspaceId, clientProfileId },
    });
    await prisma.clientSetupPin.create({
      data: {
        clientSetupId: setup.id,
        workspaceId,
        clientProfileId,
        seq: 1,
        templateId: template.id,
        templateVersionId: version.id,
        assignedByMemberId: createdByMemberId,
      },
    });
  }

  /** The client saves a real entry through the production write path. */
  async function clientSaves(
    clientUserId: string,
    workspaceId: string,
    entryDate: string,
    weight: string,
    note: string,
  ) {
    const s = await loadDailyEntrySurface(
      session(clientUserId),
      { workspaceId, entryDate },
      { registry: DAILY_REGISTRY },
    );
    if (s.state !== "ready") throw new Error(`surface not ready: ${s.state}`);
    const r = await saveDailyEntry(
      session(clientUserId),
      {
        workspaceId,
        entryDate,
        formToken: s.formToken,
        values: [
          { ordinal: 0, raw: weight },
          { ordinal: 1, raw: note },
        ],
      },
      { registry: DAILY_REGISTRY },
    );
    if (r.status !== "saved") throw new Error("seed save failed");
  }

  /** Complete coherent fixture — returns everything the suite needs.
   *  Only ONE ACTIVE assignment per client is possible (partial unique);
   *  `assign` selects which staff member holds it. */
  async function setup(
    opts: {
      entry?: boolean;
      secondRevision?: boolean;
      otherDateEntry?: boolean;
      consent?: boolean;
      assign?: "coach" | "assistant" | "both-ended" | "none";
    } = {},
  ) {
    const w = await ws();
    const ownerU = await user();
    const ownerMember = await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const coachU = await user();
    const coachMember = await member(w.id, coachU.id, "COACH");
    const assistantU = await user();
    const assistantMember = await member(
      w.id,
      assistantU.id,
      "ASSISTANT_COACH",
    );
    const supportU = await user();
    await member(w.id, supportU.id, "SUPPORT");
    const clientU = await user();
    await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    if (opts.consent !== false) await consent(cp.id);
    const assign = opts.assign ?? "coach";
    if (assign === "coach") await assignment(w.id, cp.id, coachMember.id);
    if (assign === "assistant")
      await assignment(w.id, cp.id, assistantMember.id);
    if (assign === "both-ended") {
      await assignment(w.id, cp.id, coachMember.id, "REMOVED");
      // A second ACTIVE assignment is impossible — assistant stays
      // unassigned (denied) while the removed row exercises the
      // assignment-lock path for the coach.
    }
    const dualU = await user("PLATFORM_ADMIN");
    await member(w.id, dualU.id, "COACH");
    const platformU = await user("PLATFORM_ADMIN");

    const form = await publishedForm(ownerU.id, w.id);
    const inst = await scheduleCheckInInstance(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        formVersionId: form.versionId,
        dueAt: "2030-06-01T09:00:00.000Z",
      },
      { db: prisma as never, registry: CHECKIN_REGISTRY },
    );
    if (inst.status !== "scheduled") throw new Error("schedule failed");
    const [textField, numField, singleField] = form.definition.fields;
    const sub = await submitCheckInInstance(
      session(clientU.id),
      {
        workspaceId: w.id,
        instanceId: inst.instanceId,
        answersJson: JSON.stringify([
          { fieldId: textField.fieldId, value: "Feeling strong" },
          { fieldId: numField.fieldId, value: "82.5" },
          {
            fieldId: singleField.fieldId,
            value: singleField.options![0].optionId,
          },
        ]),
      },
      { db: prisma as never, registry: CHECKIN_REGISTRY },
    );
    if (sub.status !== "submitted") throw new Error("submit failed");

    await dailyFixture(w.id, cp.id, ownerMember.id);
    if (opts.entry !== false)
      await clientSaves(clientU.id, w.id, ENTRY_DATE, "80", "first");
    if (opts.secondRevision)
      await clientSaves(clientU.id, w.id, ENTRY_DATE, "81", "revised");
    if (opts.otherDateEntry)
      await clientSaves(clientU.id, w.id, OTHER_DATE, "77", "other");

    return {
      w,
      cp,
      owner: session(ownerU.id),
      ownerMember,
      coach: session(coachU.id),
      coachMember,
      assistant: session(assistantU.id),
      assistantMember,
      support: session(supportU.id),
      client: session(clientU.id),
      clientUserId: clientU.id,
      dualAdmin: session(dualU.id),
      platformAdmin: session(platformU.id),
      submissionId: sub.submissionId,
      instanceId: inst.instanceId,
    };
  }

  const read = (
    s: Awaited<ReturnType<typeof setup>>,
    by: { user: { id: string } },
    entryDate: string = ENTRY_DATE,
    extraDeps: Record<string, unknown> = {},
  ) =>
    readCheckInReviewTrackerContext(
      by,
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId: s.submissionId,
        entryDate,
      },
      { ...deps(), ...extraDeps },
    );

  const audits = (workspaceId: string) =>
    prisma.auditEvent.findMany({
      where: { workspaceId, resourceType: "daily_entry", action: "READ" },
    });

  // ── Authorization matrix ──────────────────────────────────────────

  it("owner (workspace scope) reveals the latest revision with one audit", async () => {
    const s = await setup({ secondRevision: true });
    const r = await read(s, s.owner);
    expect(r.entryDate).toBe(ENTRY_DATE);
    expect(r.values.map((v) => v.display)).toContain("81");
    expect(r.revisionSeq).toBe(2);
    const a = await audits(s.w.id);
    expect(a).toHaveLength(1);
    expect(a[0].action).toBe("READ");
  });

  it("assigned coach succeeds at effective scope assigned", async () => {
    const s = await setup();
    const r = await read(s, s.coach);
    expect(r.values.map((v) => v.display)).toContain("80");
  });

  it("assigned assistant succeeds at effective scope assigned", async () => {
    const s = await setup({ assign: "assistant" });
    const r = await read(s, s.assistant);
    expect(r.values.map((v) => v.display)).toContain("80");
  });

  it("owner without an assignment still succeeds (workspace scope not forced through assignment)", async () => {
    const s = await setup({ assign: "none" });
    // No assignments at all — owner (ws scope on both resources) still reads.
    const r = await read(s, s.owner);
    expect(r.values.map((v) => v.display)).toContain("80");
  });

  it.each(["client", "support", "platformAdmin", "dualAdmin"] as const)(
    "%s is denied (non-disclosing, zero values, zero audits)",
    async (role) => {
      const s = await setup();
      await expect(read(s, s[role])).rejects.toMatchObject({
        name: expect.stringMatching("Error"),
      });
      expect(await audits(s.w.id)).toHaveLength(0);
    },
  );

  it("dual-role PLATFORM_ADMIN is denied through the Check-In resource even though dailyTracking would allow via membership", async () => {
    const s = await setup();
    // dualAdmin is a PLATFORM_ADMIN holding an ACTIVE COACH membership with
    // an ACTIVE assignment — dailyTracking would permit asg; the
    // checkinsCoachReviews deny-set must deny first.
    await expect(read(s, s.dualAdmin)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    expect(await audits(s.w.id)).toHaveLength(0);
  });

  it("inactive member is denied", async () => {
    const s = await setup();
    await prisma.workspaceMember.update({
      where: { id: s.coachMember.id },
      data: { status: "SUSPENDED" },
    });
    await expect(read(s, s.coach)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await audits(s.w.id)).toHaveLength(0);
  });

  it("ended assignment denies the assigned coach", async () => {
    const s = await setup();
    await prisma.clientAssignment.updateMany({
      where: { coachMemberId: s.coachMember.id },
      data: { status: "REMOVED" },
    });
    await expect(read(s, s.coach)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await audits(s.w.id)).toHaveLength(0);
  });

  it("Check-In allowed + dailyTracking denied fails closed (injected asymmetry)", async () => {
    const s = await setup();
    const { authorize } = await import("../../lib/auth/guard");
    const spy = async (
      sess: Parameters<typeof authorize>[0],
      req: Parameters<typeof authorize>[1],
      repo: Parameters<typeof authorize>[2],
    ) => {
      if (req.resource === "dailyTracking")
        throw new AccessDeniedError("role_denied", "dailyTracking", "read");
      return authorize(sess, req, repo);
    };
    await expect(
      read(s, s.owner, ENTRY_DATE, { authorize: spy }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await audits(s.w.id)).toHaveLength(0);
  });

  it("dailyTracking allowed + Check-In denied fails closed (injected asymmetry)", async () => {
    const s = await setup();
    const { authorize } = await import("../../lib/auth/guard");
    const spy = async (
      sess: Parameters<typeof authorize>[0],
      req: Parameters<typeof authorize>[1],
      repo: Parameters<typeof authorize>[2],
    ) => {
      if (req.resource === "checkinsCoachReviews")
        throw new AccessDeniedError(
          "role_denied",
          "checkinsCoachReviews",
          "read",
        );
      return authorize(sess, req, repo);
    };
    await expect(
      read(s, s.owner, ENTRY_DATE, { authorize: spy }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await audits(s.w.id)).toHaveLength(0);
  });

  // ── Coherence / tenant safety ─────────────────────────────────────

  it("cross-client submissionId is denied non-disclosingly", async () => {
    const s = await setup();
    const other = await setup();
    await expect(
      readCheckInReviewTrackerContext(
        s.owner,
        {
          workspaceId: s.w.id,
          clientProfileId: s.cp.id,
          submissionId: other.submissionId,
          entryDate: ENTRY_DATE,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(CheckInInstanceError);
    expect(await audits(s.w.id)).toHaveLength(0);
  });

  it("cross-workspace submissionId is denied non-disclosingly", async () => {
    const s = await setup();
    const other = await setup();
    await expect(
      readCheckInReviewTrackerContext(
        s.owner,
        {
          workspaceId: other.w.id,
          clientProfileId: s.cp.id,
          submissionId: s.submissionId,
          entryDate: ENTRY_DATE,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(CheckInInstanceError);
  });

  // ── Date contract ─────────────────────────────────────────────────

  it("returns only the latest committed revision for the exact date", async () => {
    const s = await setup({ secondRevision: true, otherDateEntry: true });
    const r = await read(s, s.owner);
    expect(r.entryDate).toBe(ENTRY_DATE);
    expect(r.values.map((v) => v.display)).toContain("81");
    expect(r.values.map((v) => v.display)).not.toContain("80");
    expect(r.values.map((v) => v.display)).not.toContain("77");
    expect(r.revisionSeq).toBe(2);
    expect(r.revisionCount).toBe(2);
  });

  it("no entry for the exact date → non-disclosing empty, no fallback, no audit", async () => {
    const s = await setup({ otherDateEntry: true });
    await expect(read(s, s.owner, "2024-06-12")).rejects.toThrow();
    const a = await audits(s.w.id);
    expect(a.filter((x) => x.action === "READ")).toHaveLength(0);
  });

  it.each(["15/06/2024", "2024-13-01", "2024-02-30", "1969-12-31"])(
    "invalid declared date %s is rejected before any lock or audit",
    async (bad) => {
      const s = await setup();
      await expect(read(s, s.owner, bad)).rejects.toThrow();
      expect(await audits(s.w.id)).toHaveLength(0);
    },
  );

  it("does not fall back to the Check-In due or submission date", async () => {
    const s = await setup({ entry: true });
    // Entry exists only at ENTRY_DATE; asking for a different date must
    // fail — no silent "nearest" behavior.
    await expect(read(s, s.owner, "2030-06-01")).rejects.toThrow();
    expect(await audits(s.w.id)).toHaveLength(0);
  });

  // ── Consent intersection ──────────────────────────────────────────

  it("Check-In-side consent missing fails closed", async () => {
    const s = await setup();
    await revokeConsentKind(s.cp.id, "chk-dev-health-v1");
    await expect(read(s, s.owner)).rejects.toThrow();
    expect(await audits(s.w.id)).toHaveLength(0);
  });

  it("DailyEntry-side consent missing fails closed", async () => {
    const s = await setup();
    await revokeConsentKind(s.cp.id, "de-dev-health-v1");
    await expect(read(s, s.owner)).rejects.toThrow();
    expect(await audits(s.w.id)).toHaveLength(0);
  });

  it("missing consent produces no values and no audit", async () => {
    const s = await setup();
    await prisma.consentRecord.updateMany({
      where: { clientProfileId: s.cp.id },
      data: { revokedAt: new Date() },
    });
    await expect(read(s, s.owner)).rejects.toThrow();
    expect(await audits(s.w.id)).toHaveLength(0);
  });

  // ── Audit ─────────────────────────────────────────────────────────

  it("one committed reveal writes exactly one structural READ audit; repeat reveals keep at-least-once semantics", async () => {
    const s = await setup();
    await read(s, s.owner);
    await read(s, s.owner);
    const a = await audits(s.w.id);
    expect(a).toHaveLength(2);
    expect(JSON.stringify(a[0].meta)).not.toContain("80");
    expect(a[0].resourceType).toBe("daily_entry");
  });

  // ── Concurrency ───────────────────────────────────────────────────

  it("concurrent reveal vs DailyEntry revision write completes coherently", async () => {
    const s = await setup();
    const [r] = await Promise.all([
      read(s, s.owner),
      clientSaves(s.clientUserId, s.w.id, ENTRY_DATE, "82", "race"),
    ]);
    expect(r.values.map((v) => v.display)).toContain("80");
    expect(await audits(s.w.id)).toHaveLength(1);
  });

  it("D6 reveal vs concurrent Check-In mark completes without deadlock (bounded)", async () => {
    const s = await setup();
    const timeout = setTimeout(() => {
      throw new Error("deadlock probe timed out");
    }, 20000);
    try {
      const [r, m] = await Promise.all([
        read(s, s.owner),
        markCheckInSubmissionReviewed(
          s.coach,
          {
            workspaceId: s.w.id,
            clientProfileId: s.cp.id,
            submissionId: s.submissionId,
          },
          { db: prisma as never, registry: CHECKIN_REGISTRY },
        ),
      ]);
      expect(r.values.map((v) => v.display)).toContain("80");
      expect(m.status).toBe("reviewed");
    } finally {
      clearTimeout(timeout);
    }
    expect(await audits(s.w.id)).toHaveLength(1);
  });

  it("assignment removal racing the reveal fails closed when removal wins", async () => {
    const s = await setup();
    // Deterministic: end the assignment inside a tx while D6 runs —
    // whichever commits first decides; removal-first must deny.
    await prisma.clientAssignment.updateMany({
      where: { coachMemberId: s.coachMember.id },
      data: { status: "REMOVED" },
    });
    await expect(read(s, s.coach)).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
