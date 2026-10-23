/**
 * PR-SV5 (issue #171, C05): the staff check-in submission detail embeds
 * the tracker-parameter packet for the check-in date plus the flagged
 * set-notes, progress-photo and nutrition availability slots. Contract:
 *
 * - parameterValues = the daily packet for the Vienna local date of the
 *   instance's dueAt — served under the strict intersection of
 *   checkinsCoachReviews/read and dailyTracking/read inside the same
 *   audited transaction. `null` = withheld (denied/consent/policy);
 *   `[]` = authorized but no committed entry for the date.
 * - flags (issue 14), photos (issue 11) and nutrition (issue 12a)
 *   return `null` = unavailable — never an empty array that would
 *   read as "authorized but none", never fabricated rows.
 * - Withdrawn check-in consent refuses the whole read — answers and
 *   packet alike; one READ audit per view, zero on passive reads;
 *   foreign workspace gets nothing.
 */

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError, authorize } from "../../lib/auth/guard";
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
  readCheckInSubmissionDetail,
  scheduleCheckInInstance,
  submitCheckInInstance,
} from "../../lib/checkin/instances";
import { localDateInZone } from "../../lib/checkin/timezone";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const CHECKIN_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "sv5-chk-privacy-v1",
  HEALTH_DATA: "sv5-chk-health-v1",
});
const DAILY_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "sv5-de-privacy-v1",
  HEALTH_DATA: "sv5-de-health-v1",
});

const DUE_AT = "2024-06-10T09:00:00.000Z";
const ENTRY_DATE = "2024-06-10";

describe.skipIf(!enabled)("PR-SV5 review read model (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "daily_entry_revision_value","daily_entry_revision","daily_entry","checkin_feedback","checkin_review","checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","client_setup_pin","client_setup","consent_record","audit_event","coaching_template_version_parameter","coaching_template_version","coaching_template","parameter_definition","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `sv5${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = () => ({
    db: prisma as never,
    registry: CHECKIN_REGISTRY,
    dailyRegistry: DAILY_REGISTRY,
  });

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
      data: { name: `WS ${uid()}`, slug: `sv5-${uid()}`, status: "ACTIVE" },
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
  async function consents(
    clientProfileId: string,
    opts: { daily?: boolean } = {},
  ) {
    for (const [kind, version] of [
      ["PRIVACY_NOTICE", "sv5-chk-privacy-v1"],
      ["HEALTH_DATA", "sv5-chk-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId, kind, version },
      });
    if (opts.daily === false) return;
    for (const [kind, version] of [
      ["PRIVACY_NOTICE", "sv5-de-privacy-v1"],
      ["HEALTH_DATA", "sv5-de-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId, kind, version },
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

  async function publishedForm(ownerId: string, workspaceId: string) {
    const created = await createCheckInForm(
      session(ownerId),
      { workspaceId, name: `Form ${uid()}` },
      prisma as never,
    );
    const saved = await saveCheckInFormDraft(
      session(ownerId),
      {
        workspaceId,
        formId: created.formId,
        expectedRevision: 1,
        draft: draftJson(),
      },
      prisma as never,
    );
    const published = await publishCheckInForm(
      session(ownerId),
      {
        workspaceId,
        formId: created.formId,
        expectedRevision: saved.revision,
      },
      prisma as never,
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

  async function setup(
    opts: {
      dailyConsent?: boolean;
      entries?: { date: string; weight: string; note: string }[];
      dueAt?: string;
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
    const clientU = await user();
    await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    await consents(cp.id, { daily: opts.dailyConsent !== false });
    await assignment(w.id, cp.id, coachMember.id);
    const form = await publishedForm(ownerU.id, w.id);

    const inst = await scheduleCheckInInstance(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        formVersionId: form.versionId,
        dueAt: opts.dueAt ?? DUE_AT,
      },
      deps(),
    );
    const [text, num, single] = form.definition.fields;
    await submitCheckInInstance(
      session(clientU.id),
      {
        workspaceId: w.id,
        instanceId: inst.instanceId,
        answersJson: JSON.stringify([
          { fieldId: text.fieldId, value: "Feeling strong" },
          { fieldId: num.fieldId, value: "82.5" },
          { fieldId: single.fieldId, value: single.options![0].optionId },
        ]),
      },
      deps(),
    );
    const submission = await prisma.checkInSubmission.findUniqueOrThrow({
      where: { instanceId: inst.instanceId },
    });

    await dailyFixture(w.id, cp.id, ownerMember.id);
    if (opts.dailyConsent !== false)
      for (const e of opts.entries ?? [
        { date: ENTRY_DATE, weight: "80", note: "first" },
      ])
        await clientSaves(clientU.id, w.id, e.date, e.weight, e.note);

    return {
      w,
      cp,
      owner: session(ownerU.id),
      coach: session(coachU.id),
      coachUserId: coachU.id,
      assistant: session(assistantU.id),
      assistantMember,
      clientUserId: clientU.id,
      submissionId: submission.id,
    };
  }

  const read = (
    s: Awaited<ReturnType<typeof setup>>,
    by: { user: { id: string } },
    extraDeps: Record<string, unknown> = {},
  ) =>
    readCheckInSubmissionDetail(
      by,
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId: s.submissionId,
      },
      { ...deps(), ...extraDeps },
    );

  const audits = (workspaceId: string, resourceType: string) =>
    prisma.auditEvent.findMany({
      where: { workspaceId, resourceType },
    });

  it("parameter packet serves the seeded daily values with unavailable slots explicit — one READ audit, no daily_entry audit", async () => {
    const s = await setup();
    const detail = await read(s, s.owner);
    expect(detail.submissionId).toBe(s.submissionId);
    expect(detail.fields).toHaveLength(3);
    // The packet carries the latest committed revision's rows for the
    // check-in date — the weight answer plus the note.
    expect(detail.parameterValues).not.toBeNull();
    const rows = detail.parameterValues!;
    expect(rows.map((r) => [r.display, r.unit])).toEqual([
      ["80", "kg"],
      ["first", null],
    ]);
    // Availability slots — `null` = the feature has not landed
    // (unavailable), distinguishable from an authorized-but-empty `[]`;
    // never fabricated.
    expect(detail.flags).toBeNull();
    expect(detail.photos).toBeNull();
    expect(detail.nutrition).toBeNull();
    // One structural audit for the whole view — no daily_entry audit.
    expect(
      (await audits(s.w.id, "checkin_submission")).filter(
        (a) => a.action === "READ",
      ),
    ).toHaveLength(1);
    expect(
      (await audits(s.w.id, "daily_entry")).filter((a) => a.action === "READ"),
    ).toHaveLength(0);
  });

  it("latest committed revision only — the packet is not a stale first save", async () => {
    const s = await setup({
      entries: [
        { date: ENTRY_DATE, weight: "80", note: "first" },
        { date: ENTRY_DATE, weight: "81", note: "revised" },
      ],
    });
    const detail = await read(s, s.owner);
    expect(detail.parameterValues!.map((r) => r.display)).toEqual([
      "81",
      "revised",
    ]);
  });

  it("the packet selects by the Vienna date of dueAt — spring DST, autumn DST, midnight, year boundary", async () => {
    const vectors: { dueAt: string; expectedDate: string; decoy: string }[] = [
      // Spring forward (CEST starts 2024-03-31 02:00→03:00): 22:30Z is
      // already 2024-04-01 00:30 CEST.
      {
        dueAt: "2024-03-31T22:30:00.000Z",
        expectedDate: "2024-04-01",
        decoy: "2024-03-31",
      },
      // Autumn back (CET resumes 2024-10-27): 22:30Z is 2024-10-27
      // 00:30 CEST — still daylight time.
      {
        dueAt: "2024-10-26T22:30:00.000Z",
        expectedDate: "2024-10-27",
        decoy: "2024-10-26",
      },
      // Local midnight exactly: 22:00Z = 2024-06-11 00:00 CEST.
      {
        dueAt: "2024-06-10T22:00:00.000Z",
        expectedDate: "2024-06-11",
        decoy: "2024-06-10",
      },
      // Year boundary: 23:30Z on New Year's Eve = 2025-01-01 00:30 CET.
      {
        dueAt: "2024-12-31T23:30:00.000Z",
        expectedDate: "2025-01-01",
        decoy: "2024-12-31",
      },
    ];
    for (const v of vectors) {
      const s = await setup({
        dueAt: v.dueAt,
        entries: [
          { date: v.expectedDate, weight: "90", note: "expected-day" },
          { date: v.decoy, weight: "11", note: "decoy-day" },
        ],
      });
      const detail = await read(s, s.owner);
      expect(
        detail.parameterValues!.map((r) => [r.display, r.unit]),
        `dueAt ${v.dueAt} must select ${v.expectedDate}, not ${v.decoy}`,
      ).toEqual([
        ["90", "kg"],
        ["expected-day", null],
      ]);
    }
  });

  it("the packet follows dueAt, not submittedAt", async () => {
    // The submission's submittedAt is real "now" — a different Vienna
    // date than the 2024 dueAt. A decoy entry on today's date must not
    // leak into the packet.
    const today = localDateInZone(new Date(), "Europe/Vienna");
    expect(today).not.toBe(ENTRY_DATE);
    const s = await setup({
      entries: [
        { date: ENTRY_DATE, weight: "80", note: "due-day" },
        { date: today!, weight: "55", note: "submitted-day" },
      ],
    });
    const detail = await read(s, s.owner);
    expect(detail.parameterValues!.map((r) => [r.display, r.unit])).toEqual([
      ["80", "kg"],
      ["due-day", null],
    ]);
  });

  it("authorized date with no entry returns an honest empty packet", async () => {
    const s = await setup({ entries: [] });
    const detail = await read(s, s.owner);
    expect(detail.parameterValues).toEqual([]);
    expect(detail.fields).toHaveLength(3);
  });

  it("check-in detail allowed but dailyTracking denied → answers served, packet withheld", async () => {
    const s = await setup();
    const detail = await read(s, s.owner, {
      // Asymmetric capability — checkinsCoachReviews still delegates
      // normally, dailyTracking/read refuses.
      authorizeDaily: async (
        sess: Parameters<typeof authorize>[0],
        input: { resource: string; action: string },
        repo: Parameters<typeof authorize>[2],
      ) => {
        if (input.resource === "dailyTracking")
          throw new AccessDeniedError("role_denied", "dailyTracking", "read");
        return authorize(sess, input as never, repo);
      },
    });
    expect(detail.fields.map((f) => f.display)).toEqual([
      "Feeling strong",
      "82.5",
      "Good",
    ]);
    expect(detail.parameterValues).toBeNull();
    expect(
      (await audits(s.w.id, "checkin_submission")).filter(
        (a) => a.action === "READ",
      ),
    ).toHaveLength(1);
  });

  it("assigned coach (assigned scope on both resources) still receives the packet", async () => {
    const s = await setup();
    const detail = await read(s, s.coach);
    expect(detail.parameterValues!.map((r) => r.display)).toEqual([
      "80",
      "first",
    ]);
  });

  it("unassigned staff still sees the packet at workspace scope (owner without assignment)", async () => {
    const s = await setup();
    // The owner has no assignment row — workspace scope on both sides.
    const detail = await read(s, s.owner);
    expect(detail.parameterValues).not.toBeNull();
  });

  it("daily consent revocation withholds the packet while answers still serve", async () => {
    const s = await setup();
    await prisma.consentRecord.updateMany({
      where: {
        clientProfileId: s.cp.id,
        version: "sv5-de-health-v1",
      },
      data: { revokedAt: new Date() },
    });
    const detail = await read(s, s.owner);
    expect(detail.parameterValues).toBeNull();
    expect(detail.fields).toHaveLength(3);
  });

  it("a required daily version change withholds the packet under the test registries", async () => {
    const s = await setup();
    const detail = await read(s, s.owner, {
      dailyRegistry: createStaticConsentPolicy({
        PRIVACY_NOTICE: "sv5-de-privacy-v2",
        HEALTH_DATA: "sv5-de-health-v2",
      }),
    });
    expect(detail.parameterValues).toBeNull();
    expect(detail.fields).toHaveLength(3);
  });

  it("daily consent missing withholds the packet while answers still serve", async () => {
    const s = await setup({ dailyConsent: false });
    const detail = await read(s, s.owner);
    expect(detail.parameterValues).toBeNull();
    expect(detail.fields.map((f) => f.display)).toEqual([
      "Feeling strong",
      "82.5",
      "Good",
    ]);
    expect(
      (await audits(s.w.id, "checkin_submission")).filter(
        (a) => a.action === "READ",
      ),
    ).toHaveLength(1);
  });

  it("check-in consent withdrawal refuses the whole read — answers and packet alike, zero audits", async () => {
    const s = await setup({ dailyConsent: false });
    await prisma.consentRecord.updateMany({
      where: {
        clientProfileId: s.cp.id,
        version: "sv5-chk-privacy-v1",
      },
      data: { revokedAt: new Date() },
    });
    await expect(read(s, s.owner)).rejects.toMatchObject({
      code: "consent_missing",
    });
    expect(
      (await audits(s.w.id, "checkin_submission")).filter(
        (a) => a.action === "READ",
      ),
    ).toHaveLength(0);
  });

  it("a coach in another workspace gets nothing — no detail, no packet, no audit", async () => {
    const s = await setup();
    const w2 = await ws();
    const foreign = await user();
    await member(w2.id, foreign.id, "COACH");
    const foreignCp = await profile(w2.id, (await user()).id);
    await expect(
      readCheckInSubmissionDetail(
        session(foreign.id),
        {
          workspaceId: w2.id,
          clientProfileId: foreignCp.id,
          submissionId: s.submissionId,
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "not_available" });
    expect(
      (await audits(s.w.id, "checkin_submission")).filter(
        (a) => a.action === "READ",
      ),
    ).toHaveLength(0);
  });

  it("the three review states stay distinct in the read model", async () => {
    const s = await setup();
    // Open review — no review, no feedback.
    const open = await read(s, s.owner);
    expect(open.reviewed).toBeNull();
    expect(open.feedback).toEqual([]);
    // Marked — reviewed provenance present, thread still empty. The
    // canvas's "draft feedback" state is client-local; the committed
    // server side only ever distinguishes unreviewed vs reviewed vs
    // answered (feedback row).
    const marked = await markCheckInSubmissionReviewed(
      session(s.coachUserId),
      {
        workspaceId: s.w.id,
        clientProfileId: s.cp.id,
        submissionId: s.submissionId,
      },
      deps(),
    );
    expect(marked.status).toBe("reviewed");
    const after = await read(s, s.owner);
    expect(after.reviewed).not.toBeNull();
    expect(after.feedback).toEqual([]);
  });
});
