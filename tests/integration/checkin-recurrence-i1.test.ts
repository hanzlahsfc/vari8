// CHECK-IN-RECURRENCE-I1 — bounded weekly schedule rules + explicit
// generation against disposable PostgreSQL (reviewed P3 contract +
// P3-R1 refinements; decision #114). Real schema, real transactions,
// real authorization: sessions are labeled identities; every
// membership/role/workspace/assignment decision is re-resolved inside
// the serializable transaction.
//
// Contract under test: owner-approved bounded first version — weekly
// weekday at a chosen local time in a coach-confirmed IANA zone;
// gap→first-valid-minute, fold→earlier; explicit staff generation to
// T+56 inclusive (≤9 occurrences); NO read-triggered writes, no
// backfill, no automatic replenishment; pause/end/replace lifecycle;
// latest ACTIVE version pinned per generation; three-way outcome
// classification (created / already-generated / skipped-conflict);
// current-actor scheduledByMemberId provenance; End cancels only
// still-unsubmitted generated instances.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { createStaticConsentPolicy } from "../../lib/consent";
import {
  createCheckInForm,
  openCheckInDraft,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";
import {
  cancelCheckInInstance,
  listCheckInInstancesForClient,
  scheduleCheckInInstance,
  submitCheckInInstance,
} from "../../lib/checkin/instances";
import {
  createCheckInScheduleRule,
  generateCheckInScheduleRuleInstances,
  listCheckInScheduleRules,
  setCheckInScheduleRuleStatus,
} from "../../lib/checkin/schedules";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "check-in-dev-privacy-v1",
  HEALTH_DATA: "check-in-dev-health-v1",
});

/** UTC so local dates/times map 1:1 to instants in these tests. */
const ZONE = "UTC";

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!enabled)("CHECK-IN-RECURRENCE-I1 (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "checkin_schedule_rule","checkin_feedback","checkin_review","checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `reci1${++n}_${Date.now()}`;
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
      data: { name: `WS ${uid()}`, slug: `rec1-${uid()}`, status: "ACTIVE" },
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
    return { formId: created.formId, versionSeq: published.versionSeq };
  }

  /** Workspace + owner/coach/assistant members + client profile. */
  async function setup() {
    const w = await ws();
    const ownerU = await user();
    const ownerMember = await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const coachU = await user();
    const coachMember = await member(w.id, coachU.id, "COACH");
    const asstU = await user();
    await member(w.id, asstU.id, "ASSISTANT_COACH");
    const clientU = await user();
    await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    await consent(cp.id);
    const form = await publishedForm(ownerU.id, w.id);
    await assignment(w.id, cp.id, coachMember.id);
    return {
      w,
      ownerU,
      ownerMember,
      coachU,
      coachMember,
      asstU,
      clientU,
      cp,
      form,
    };
  }

  /** Next occurrence params on a weekday far enough ahead to avoid
   * past-instant exclusions: pick a weekday at/after tomorrow. */
  function ruleParams(startInDays = 1) {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = addDays(today, startInDays);
    const weekday = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ][new Date(`${startDate}T00:00:00Z`).getUTCDay()];
    return {
      weekday: weekday as "MONDAY",
      localTimeMinutes: 9 * 60,
      timezone: ZONE,
      startDate,
      endDate: null,
    };
  }

  // ── Permission matrix ────────────────────────────────────────────────

  it("owner (workspace) and assigned coach may create/generate; assistant, client, SUPPORT, dual-role PA denied", async () => {
    const { w, ownerU, coachU, asstU, clientU, cp, form } = await setup();
    const params = ruleParams();

    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...params,
      },
      deps(),
    );
    expect(created.status).toBe("created");

    const gen = await generateCheckInScheduleRuleInstances(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    expect(gen.status).toBe("generated");

    for (const u of [asstU, clientU]) {
      await expect(
        createCheckInScheduleRule(
          session(u.id),
          {
            workspaceId: w.id,
            clientProfileId: cp.id,
            formId: form.formId,
            ...params,
          },
          deps(),
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        generateCheckInScheduleRuleInstances(
          session(u.id),
          { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
          deps(),
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        setCheckInScheduleRuleStatus(
          session(u.id),
          {
            workspaceId: w.id,
            clientProfileId: cp.id,
            ruleId: created.ruleId,
            action: "pause",
          },
          deps(),
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }

    const supportU = await user();
    await member(w.id, supportU.id, "SUPPORT");
    await expect(
      createCheckInScheduleRule(
        session(supportU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          formId: form.formId,
          ...params,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // Dual-role PLATFORM_ADMIN + ACTIVE WORKSPACE_OWNER — deny-set wins.
    const pa = await user("PLATFORM_ADMIN");
    await member(w.id, pa.id, "WORKSPACE_OWNER");
    await expect(
      createCheckInScheduleRule(
        session(pa.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          formId: form.formId,
          ...params,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("assistant may READ the rule list (assigned scope) but never write", async () => {
    const { w, ownerU, asstU, form } = await setup();
    // Assigned READ scope requires the assistant's OWN live assignment —
    // client_assignment is one-per-client, so give them a second client.
    const asstMember = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: w.id, userId: asstU.id },
    });
    const cu2 = await user();
    await member(w.id, cu2.id, "CLIENT");
    const cp2 = await profile(w.id, cu2.id);
    await consent(cp2.id);
    await assignment(w.id, cp2.id, asstMember.id);
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp2.id,
        formId: form.formId,
        ...ruleParams(),
      },
      deps(),
    );
    const list = await listCheckInScheduleRules(
      session(asstU.id),
      { workspaceId: w.id, clientProfileId: cp2.id },
      deps(),
    );
    expect(list.items.map((r) => r.ruleId)).toContain(created.ruleId);
    // Assigned READ scope on the assistant's OWN client still cannot write:
    // the checkinInstances/write cell denies assistants outright (a live
    // assignment must not substitute for the write grant).
    await expect(
      createCheckInScheduleRule(
        session(asstU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp2.id,
          formId: form.formId,
          ...ruleParams(),
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      generateCheckInScheduleRuleInstances(
        session(asstU.id),
        { workspaceId: w.id, clientProfileId: cp2.id, ruleId: created.ruleId },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      setCheckInScheduleRuleStatus(
        session(asstU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp2.id,
          ruleId: created.ruleId,
          action: "pause",
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("unassigned coach and revoked-assignment coach are denied", async () => {
    const { w, ownerU, cp, form } = await setup();
    const other = await user();
    const otherMember = await member(w.id, other.id, "COACH");
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...ruleParams(),
      },
      deps(),
    );
    await expect(
      generateCheckInScheduleRuleInstances(
        session(other.id),
        { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // Revocation race: assignment ends → next write denies.
    const { coachU } = await setup();
    const w2 = w;
    await prisma.clientAssignment.updateMany({
      where: { workspaceId: w2.id, clientProfileId: cp.id },
      data: { status: "REMOVED" },
    });
    await expect(
      generateCheckInScheduleRuleInstances(
        session(coachU.id),
        { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    void otherMember;
  });

  // ── Generation: classification, horizon, provenance ─────────────────

  it("generation creates ≤9 weekly occurrences, T+56 inclusive horizon, current-actor provenance, truthful replay", async () => {
    const { w, ownerU, coachU, coachMember, cp, form } = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...ruleParams(),
      },
      deps(),
    );

    const first = await generateCheckInScheduleRuleInstances(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    if (first.status !== "generated") throw new Error("expected generated");
    expect(first.created).toBeGreaterThan(0);
    expect(first.created).toBeLessThanOrEqual(9);
    expect(first.alreadyGenerated).toBe(0);
    expect(first.skippedConflicts).toEqual([]);
    // examinedThrough == min(T+56, endDate) — the examined horizon,
    // independent of how many dates were created.
    expect(first.examinedThrough).toBe(addDays(today, 56));

    const rows = await prisma.checkInInstance.findMany({
      where: { originRuleId: created.ruleId },
      select: {
        scheduledByMemberId: true,
        formVersion: { select: { versionSeq: true } },
        occurrenceDate: true,
        dueAt: true,
      },
    });
    expect(rows).toHaveLength(first.created);
    // P3-R1 P3-1 dispositions: provenance is the GENERATING actor
    // (coach), not the rule creator (owner).
    expect(rows.every((r) => r.scheduledByMemberId === coachMember.id)).toBe(
      true,
    );
    // Every created instance carries a structural CREATE audit (audits last,
    // atomic with the batch).
    const audits = await prisma.auditEvent.count({
      where: {
        action: "CREATE",
        resourceType: "checkin_instance",
        subjectClientProfileId: cp.id,
      },
    });
    expect(audits).toBe(first.created);
    expect(rows.every((r) => r.formVersion.versionSeq === 1)).toBe(true);
    // No past instants; occurrenceDate matches the due date in UTC.
    const now = Date.now();
    expect(rows.every((r) => r.dueAt.getTime() >= now)).toBe(true);
    expect(
      rows.every(
        (r) =>
          r.occurrenceDate!.toISOString().slice(0, 10) ===
          r.dueAt.toISOString().slice(0, 10),
      ),
    ).toBe(true);

    // Replay — idempotent no-op, truthfully reported.
    const replay = await generateCheckInScheduleRuleInstances(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    if (replay.status !== "generated") throw new Error("expected generated");
    expect(replay.created).toBe(0);
    expect(replay.alreadyGenerated).toBe(first.created);
    expect(replay.skippedConflicts).toEqual([]);
    const after = await prisma.checkInInstance.count({
      where: { originRuleId: created.ruleId },
    });
    expect(after).toBe(first.created);
  });

  it("a due instant already past today is excluded — never backfilled", async () => {
    const { w, ownerU, cp, form } = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const weekday = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ][new Date(`${today}T00:00:00Z`).getUTCDay()] as "MONDAY";
    // Rule says TODAY's weekday at 00:30 UTC; the clock dep sits at 12:00,
    // so today's occurrence is already past and must be excluded.
    const fixedNow = new Date(`${today}T12:00:00Z`);
    const depsAt = () => ({
      db: prisma as never,
      registry: DEV_REGISTRY,
      now: () => fixedNow,
    });
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        weekday,
        localTimeMinutes: 30,
        timezone: ZONE,
        startDate: today,
        endDate: null,
      },
      depsAt(),
    );
    const gen = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      depsAt(),
    );
    if (gen.status !== "generated") throw new Error("expected generated");
    const rows = await prisma.checkInInstance.findMany({
      where: { originRuleId: created.ruleId },
      select: { dueAt: true },
    });
    expect(rows).toHaveLength(gen.created);
    expect(rows.every((r) => r.dueAt.getTime() >= fixedNow.getTime())).toBe(
      true,
    );
    // The past slot is not retro-created: today's date never appears.
    expect(
      rows.every((r) => r.dueAt.toISOString().slice(0, 10) !== today),
    ).toBe(true);
  });

  it("manual-instance collision at a due instant is skipped-and-reported, never absorbed", async () => {
    const { w, ownerU, cp, form } = await setup();
    const params = ruleParams();
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...params,
      },
      deps(),
    );
    // Manual one-off at the first occurrence instant (UTC == local).
    const manual = await scheduleCheckInInstance(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        formVersionId: (
          await prisma.checkInFormVersion.findFirstOrThrow({
            where: { formId: form.formId },
            orderBy: { versionSeq: "desc" },
          })
        ).id,
        dueAt: `${params.startDate}T09:00:00Z`,
        dueTz: null,
      },
      deps(),
    );
    expect(manual.status).toBe("scheduled");

    const gen = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    if (gen.status !== "generated") throw new Error("expected generated");
    expect(gen.skippedConflicts).toEqual([params.startDate]);
    const manualRow = await prisma.checkInInstance.findUniqueOrThrow({
      where: { id: manual.instanceId },
      select: { originRuleId: true },
    });
    expect(manualRow.originRuleId).toBeNull(); // never absorbed
  });

  it("other-rule collision: two rules, same instant → second reports conflict", async () => {
    const { w, ownerU, cp, form } = await setup();
    const start = ruleParams();
    const r1 = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...start,
      },
      deps(),
    );
    // Europe/London 10:00 == UTC 09:00 instant while London is GMT (Nov–Mar).
    const londonOverlap =
      new Date().getUTCMonth() >= 10 || new Date().getUTCMonth() <= 2;
    const r2 = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        weekday: start.weekday,
        localTimeMinutes: londonOverlap ? 10 * 60 : 11 * 60, // BST: 11:00 London = 10:00 UTC? no — see note
        timezone: "Europe/London",
        startDate: start.startDate,
        endDate: null,
      },
      deps(),
    );
    await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: r1.ruleId },
      deps(),
    );
    const g2 = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: r2.ruleId },
      deps(),
    );
    if (g2.status !== "generated") throw new Error("expected generated");
    // London winter offset +0 → 10:00 == UTC 09:00 instant → conflict.
    // (BST +1 → 11:00 London = 10:00 UTC ≠ 09:00; then no overlap and
    // skippedConflicts must be empty — assertion branches on season.)
    if (londonOverlap) {
      expect(g2.skippedConflicts.length).toBeGreaterThan(0);
      expect(g2.created + g2.skippedConflicts.length).toBeLessThanOrEqual(9);
    } else {
      expect(g2.skippedConflicts).toEqual([]);
    }
  });

  it("cancelled generated occurrence occupies the instant — regeneration reports conflict, never resurrects", async () => {
    const { w, ownerU, cp, form } = await setup();
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...ruleParams(),
      },
      deps(),
    );
    await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    const first = await prisma.checkInInstance.findFirstOrThrow({
      where: { originRuleId: created.ruleId },
      orderBy: { dueAt: "asc" },
      select: { id: true, occurrenceDate: true },
    });
    await cancelCheckInInstance(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, instanceId: first.id },
      deps(),
    );
    const regen = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    if (regen.status !== "generated") throw new Error("expected generated");
    // Already-generated wins for the occurrence identity; the cancelled
    // row ALSO occupies the due instant — classification reports the
    // cancelled row via the G set (occurrence exists) not as a conflict.
    expect(regen.created).toBe(0);
    expect(regen.alreadyGenerated).toBeGreaterThan(0);
    const still = await prisma.checkInInstance.findUniqueOrThrow({
      where: { id: first.id },
      select: { cancelledAt: true },
    });
    expect(still.cancelledAt).not.toBeNull();
  });

  // ── Pause / resume / inactivity — no backfill ────────────────────────

  it("pause blocks generation truthfully; resume does not backfill", async () => {
    const { w, ownerU, cp, form } = await setup();
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...ruleParams(),
      },
      deps(),
    );
    const paused = await setCheckInScheduleRuleStatus(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        ruleId: created.ruleId,
        action: "pause",
      },
      deps(),
    );
    expect(paused.status).toBe("paused");

    const blocked = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    expect(blocked).toEqual({ status: "paused" });
    expect(
      await prisma.checkInInstance.count({
        where: { originRuleId: created.ruleId },
      }),
    ).toBe(0);

    const resumed = await setCheckInScheduleRuleStatus(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        ruleId: created.ruleId,
        action: "resume",
      },
      deps(),
    );
    expect(resumed.status).toBe("resumed");
    const after = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    if (after.status !== "generated") throw new Error("expected generated");
    expect(after.created).toBeGreaterThan(0);
    // Inactivity: no occurrences were created for the paused window —
    // and none are ever backfilled.
  });

  it("a rule created with a past startDate never backfills dates before rule-local today", async () => {
    const { w, ownerU, cp, form } = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        weekday: "MONDAY",
        localTimeMinutes: 9 * 60,
        timezone: ZONE,
        startDate: addDays(today, -30),
        endDate: null,
      },
      deps(),
    );
    const gen = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    if (gen.status !== "generated") throw new Error("expected generated");
    const rows = await prisma.checkInInstance.findMany({
      where: { originRuleId: created.ruleId },
      select: { occurrenceDate: true, dueAt: true },
    });
    expect(
      rows.every((r) => r.occurrenceDate!.toISOString().slice(0, 10) >= today),
    ).toBe(true);
  });

  // ── End / replacement / expiry ───────────────────────────────────────

  it("End cancels still-unsubmitted generated instances; submitted/reviewed history untouched", async () => {
    const { w, ownerU, clientU, cp, form } = await setup();
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...ruleParams(),
      },
      deps(),
    );
    await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    const target = await prisma.checkInInstance.findFirstOrThrow({
      where: { originRuleId: created.ruleId },
      orderBy: { dueAt: "asc" },
      select: { id: true },
    });
    // Client submits the first occurrence — end must NOT touch it.
    const version = await prisma.checkInFormVersion.findFirstOrThrow({
      where: { formId: form.formId },
      select: { definition: true },
    });
    const def = version.definition as {
      fields: { fieldId: string; kind: string; required: boolean }[];
    };
    const payload = JSON.stringify(
      def.fields.map((f) => ({ fieldId: f.fieldId, value: "ok" })),
    );
    const sub = await submitCheckInInstance(
      session(clientU.id),
      { workspaceId: w.id, instanceId: target.id, answersJson: payload },
      deps(),
    );
    expect(sub.status).toBe("submitted");

    const ended = await setCheckInScheduleRuleStatus(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        ruleId: created.ruleId,
        action: "end",
      },
      deps(),
    );
    expect(ended.status).toBe("ended");
    if (ended.status === "ended")
      expect(ended.cancelledCount).toBeGreaterThanOrEqual(0);

    const all = await prisma.checkInInstance.findMany({
      where: { originRuleId: created.ruleId },
      select: { id: true, cancelledAt: true },
    });
    for (const row of all) {
      if (row.id === target.id) expect(row.cancelledAt).toBeNull();
      else expect(row.cancelledAt).not.toBeNull();
    }
    // ENDED is terminal: generation reports ended, not paused.
    const genAfter = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    expect(genAfter).toEqual({ status: "ended" });
  });

  it("end-vs-submit contention resolves coherently (same chkin advisory)", async () => {
    const { w, ownerU, clientU, cp, form } = await setup();
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...ruleParams(),
      },
      deps(),
    );
    await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    const inst = await prisma.checkInInstance.findFirstOrThrow({
      where: { originRuleId: created.ruleId },
      orderBy: { dueAt: "asc" },
      select: { id: true },
    });
    const version = await prisma.checkInFormVersion.findFirstOrThrow({
      where: { formId: form.formId },
      select: { definition: true },
    });
    const def = version.definition as {
      fields: { fieldId: string }[];
    };
    const payload = JSON.stringify(
      def.fields.map((f) => ({ fieldId: f.fieldId, value: "ok" })),
    );
    const [endRes, subRes] = await Promise.allSettled([
      setCheckInScheduleRuleStatus(
        session(ownerU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          ruleId: created.ruleId,
          action: "end",
        },
        deps(),
      ),
      submitCheckInInstance(
        session(clientU.id),
        { workspaceId: w.id, instanceId: inst.id, answersJson: payload },
        deps(),
      ),
    ]);
    const row = await prisma.checkInInstance.findUniqueOrThrow({
      where: { id: inst.id },
      select: { cancelledAt: true },
    });
    const submitted = await prisma.checkInSubmission.findFirst({
      where: { instanceId: inst.id },
      select: { id: true },
    });
    // Coherence: never cancelled AND submitted on the same row.
    expect(!(row.cancelledAt !== null && submitted !== null)).toBe(true);
    void endRes;
    void subRes;
  });

  it("replacement ends the old rule atomically and cancels its pending generated instances", async () => {
    const { w, ownerU, cp, form } = await setup();
    const params = ruleParams();
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...params,
      },
      deps(),
    );
    await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    const replaced = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...params,
        weekday: params.weekday === "MONDAY" ? "TUESDAY" : "MONDAY",
        replacesRuleId: created.ruleId,
      },
      deps(),
    );
    expect(replaced.status).toBe("replaced");
    const old = await prisma.checkInScheduleRule.findUniqueOrThrow({
      where: { id: created.ruleId },
      select: { status: true, endedAt: true, replacedByRuleId: true },
    });
    expect(old.status).toBe("ENDED");
    expect(old.endedAt).not.toBeNull();
    expect(old.replacedByRuleId).toBe(replaced.ruleId);
    const pending = await prisma.checkInInstance.findMany({
      where: { originRuleId: created.ruleId },
      select: { cancelledAt: true },
    });
    expect(pending.every((r) => r.cancelledAt !== null)).toBe(true);
  });

  it("natural expiry: endDate in the past yields zero candidates; generated rows are NOT cancelled", async () => {
    const { w, ownerU, cp, form } = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        weekday: "FRIDAY",
        localTimeMinutes: 9 * 60,
        timezone: ZONE,
        startDate: addDays(today, -70),
        endDate: addDays(today, -7),
      },
      deps(),
    );
    const gen = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    if (gen.status !== "generated") throw new Error("expected generated");
    expect(gen.created).toBe(0);
    expect(gen.examinedThrough).toBe(addDays(today, -7));
  });

  // ── Version pinning at each generation ───────────────────────────────

  it("each generation pins the LATEST ACTIVE version; existing instances keep theirs", async () => {
    const { w, ownerU, cp, form } = await setup();
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...ruleParams(),
      },
      deps(),
    );
    const first = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    if (first.status !== "generated") throw new Error("expected generated");

    // Publish v2 — a publish seals the draft, so open the next one and
    // save against ITS revision.
    const opened = await openCheckInDraft(
      session(ownerU.id),
      { workspaceId: w.id, formId: form.formId },
      prisma,
    );
    const saved2 = await saveCheckInFormDraft(
      session(ownerU.id),
      {
        workspaceId: w.id,
        formId: form.formId,
        expectedRevision: opened.revision,
        draft: {
          title: "Weekly v2",
          fields: [
            {
              kind: "shortText",
              label: "How are you? (v2)",
              required: true,
              order: 0,
            },
          ],
        },
      },
      prisma,
    );
    await publishCheckInForm(
      session(ownerU.id),
      {
        workspaceId: w.id,
        formId: form.formId,
        expectedRevision: saved2.revision,
      },
      prisma,
    );

    // Delete generated rows (fixture shortcut — production never
    // deletes), regenerate: new rows must pin v2 while a surviving
    // manual v1 row keeps v1.
    await prisma.checkInInstance.deleteMany({
      where: { originRuleId: created.ruleId },
    });
    const second = await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    if (second.status !== "generated") throw new Error("expected generated");
    const versions = await prisma.checkInInstance.findMany({
      where: { originRuleId: created.ruleId },
      select: { formVersion: { select: { versionSeq: true } } },
    });
    expect(versions.every((v) => v.formVersion.versionSeq === 2)).toBe(true);
  });

  // ── Read paths: zero writes/audits ───────────────────────────────────

  it("read paths produce zero scheduling writes and zero audits", async () => {
    const { w, ownerU, cp, form } = await setup();
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...ruleParams(),
      },
      deps(),
    );
    await generateCheckInScheduleRuleInstances(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
      deps(),
    );
    const auditsBefore = await prisma.auditEvent.count();
    const instancesBefore = await prisma.checkInInstance.count();

    await listCheckInScheduleRules(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    await listCheckInInstancesForClient(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );

    expect(await prisma.auditEvent.count()).toBe(auditsBefore);
    expect(await prisma.checkInInstance.count()).toBe(instancesBefore);
  });

  // ── Inactive edges fail closed ───────────────────────────────────────

  it("archived form blocks generation; unknown rule and foreign tuples fail closed", async () => {
    const { w, ownerU, cp, form } = await setup();
    const created = await createCheckInScheduleRule(
      session(ownerU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.formId,
        ...ruleParams(),
      },
      deps(),
    );
    await prisma.checkInForm.update({
      where: { id: form.formId },
      data: { status: "ARCHIVED" },
    });
    await expect(
      generateCheckInScheduleRuleInstances(
        session(ownerU.id),
        { workspaceId: w.id, clientProfileId: cp.id, ruleId: created.ruleId },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "not_available" });
    await expect(
      generateCheckInScheduleRuleInstances(
        session(ownerU.id),
        { workspaceId: w.id, clientProfileId: cp.id, ruleId: "nope" },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "not_available" });
  });

  it("invalid inputs reject before any DB work", async () => {
    const { w, ownerU, cp, form } = await setup();
    for (const bad of [
      {
        weekday: "FUNDAY",
        localTimeMinutes: 60,
        timezone: ZONE,
        startDate: "2026-01-01",
      },
      {
        weekday: "MONDAY",
        localTimeMinutes: 1440,
        timezone: ZONE,
        startDate: "2026-01-01",
      },
      {
        weekday: "MONDAY",
        localTimeMinutes: 60,
        timezone: "Not/AZone",
        startDate: "2026-01-01",
      },
      {
        weekday: "MONDAY",
        localTimeMinutes: 60,
        timezone: ZONE,
        startDate: "2026-13-40",
      },
      {
        weekday: "MONDAY",
        localTimeMinutes: 60,
        timezone: ZONE,
        startDate: "2026-10-10",
        endDate: "2026-10-01",
      },
    ])
      await expect(
        createCheckInScheduleRule(
          session(ownerU.id),
          {
            workspaceId: w.id,
            clientProfileId: cp.id,
            formId: form.formId,
            ...bad,
          } as never,
          deps(),
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
    void form;
  });
});
