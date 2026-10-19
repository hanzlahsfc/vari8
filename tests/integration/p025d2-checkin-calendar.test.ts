import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
  /**
   * Fixed wall clock for `late`-flag assertions: the service derives
   * lateness from `new Date()` (submittedAt for submitted rows, now for
   * scheduled rows). Frozen at 2026-10-14T12:00Z — after the lateSub
   * dueAt (10-05) and before the scheduled/submitted/cancelled dueAts
   * (10-15/10-20/10-25) — so every expectation is clock-independent.
   * Only `Date` is faked; Prisma/network timers stay real, and the real
   * clock is always restored.
   */
  const FIXED_NOW = "2026-10-14T12:00:00.000Z";
  async function withFixedClock<T>(
    at: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(at));
    try {
      return await fn();
    } finally {
      vi.useRealTimers();
    }
  }
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

  it("owner workspace scope returns the bounded range in dueAt order — cancelled visible, late marked, out-of-range absent", async () =>
    withFixedClock(FIXED_NOW, async () => {
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
    }));

  it("late flag flips around the due instant — before/after-due boundary", async () =>
    withFixedClock(FIXED_NOW, async () => {
      const s = await setup();
      const list = () =>
        listCheckInInstancesForClient(
          s.owner,
          {
            workspaceId: s.w.id,
            clientProfileId: s.cp.id,
            range: OCT,
          },
          deps(),
        );
      const byId = (items: { instanceId: string; late: boolean }[]) =>
        new Map(items.map((i) => [i.instanceId, i.late]));

      // Before the scheduled item's dueAt: not late.
      const before = byId((await list()).items);
      expect(before.get(s.instanceIds.scheduled)).toBe(false);
      expect(before.get(s.instanceIds.lateSub)).toBe(true);

      // After its dueAt the same SCHEDULED row is late — a broken or
      // hard-coded comparator cannot satisfy both sides.
      vi.setSystemTime(new Date("2026-10-16T00:00:00.000Z"));
      const after = byId((await list()).items);
      expect(after.get(s.instanceIds.scheduled)).toBe(true);
      // Submitted/cancelled lateness is immutable once decided.
      expect(after.get(s.instanceIds.lateSub)).toBe(true);
      expect(after.get(s.instanceIds.submitted)).toBe(false);
      expect(after.get(s.instanceIds.cancelled)).toBe(false);
    }));

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

// ── P-025-D2-I1-R2 — overflow detection (P2-1 repair) ──────────────────

describe.skipIf(!enabled)("P-025-D2 R2 truncation signal (real PG)", () => {
  let prisma2: PrismaClient;
  let n2 = 0;

  beforeAll(async () => {
    prisma2 = new PrismaClient({ datasources: { db: { url: url as string } } });
  });
  afterAll(async () => {
    await prisma2?.$disconnect();
  });

  const uid2 = () => `p25d2r2${++n2}_${Date.now()}`;
  const session2 = (userId: string) => ({ user: { id: userId } });
  const deps2 = () => ({ db: prisma2 as never, registry: CHECKIN_REGISTRY });

  /** 200+ instances inside one range via createMany (direct Prisma — the
   *  seed volume only; reads go through the production services). */
  async function denseFixture(opts: {
    extraInRange?: number;
    extraOut?: number;
  }) {
    const w = await prisma2.workspace.create({
      data: {
        name: `WS ${uid2()}`,
        slug: `p25d2r2-${uid2()}`,
        status: "ACTIVE",
      },
    });
    const ownerU = await prisma2.user.create({
      data: {
        email: `${uid2()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Fixture ${uid2()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
    const ownerM = await prisma2.workspaceMember.create({
      data: {
        workspaceId: w.id,
        userId: ownerU.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    const clientU = await prisma2.user.create({
      data: {
        email: `${uid2()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Client ${uid2()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
    await prisma2.workspaceMember.create({
      data: {
        workspaceId: w.id,
        userId: clientU.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    const cp = await prisma2.clientProfile.create({
      data: { workspaceId: w.id, userId: clientU.id, name: `Client ${uid2()}` },
    });
    const form = await prisma2.checkInForm.create({
      data: {
        workspaceId: w.id,
        name: `F ${uid2()}`,
        status: "ACTIVE",
        createdByMemberId: ownerM.id,
      },
    });
    const version = await prisma2.checkInFormVersion.create({
      data: {
        workspaceId: w.id,
        formId: form.id,
        versionSeq: 1,
        definition: {
          title: "F",
          fields: [{ kind: "shortText", label: "Q", required: true, order: 0 }],
        } as never,
        publishOriginRevision: 1,
        publishedByMemberId: ownerM.id,
      },
    });
    const base = Date.UTC(2026, 9, 1, 9); // 2026-10-01T09:00Z
    const rows = [];
    for (let i = 0; i < 200; i++)
      rows.push({
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.id,
        formVersionId: version.id,
        dueAt: new Date(base + i * 60_000), // 200 minutes ≈ 3.3h — same window
        scheduledByMemberId: ownerM.id,
      });
    for (let i = 0; i < (opts.extraInRange ?? 0); i++)
      rows.push({
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.id,
        formVersionId: version.id,
        dueAt: new Date(base + (200 + i) * 60_000),
        scheduledByMemberId: ownerM.id,
      });
    for (let i = 0; i < (opts.extraOut ?? 0); i++)
      rows.push({
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.id,
        formVersionId: version.id,
        dueAt: new Date(Date.UTC(2026, 11, 1) + i * 60_000), // December — out of range
        scheduledByMemberId: ownerM.id,
      });
    await prisma2.checkInInstance.createMany({ data: rows });
    return { w, cp, owner: session2(ownerU.id), client: session2(clientU.id) };
  }

  it("exactly 200 eligible → 200 items, truncated false", async () => {
    const s = await denseFixture({ extraOut: 5 });
    const r = await listCheckInInstancesForClient(
      s.owner,
      { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
      deps2(),
    );
    expect(r.items).toHaveLength(200);
    expect(r.truncated).toBe(false);
  });

  it("201 eligible → first 200 items, truncated true; range and scope rows do not count", async () => {
    const s = await denseFixture({ extraInRange: 1, extraOut: 5 });
    const r = await listCheckInInstancesForClient(
      s.owner,
      { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
      deps2(),
    );
    expect(r.items).toHaveLength(200);
    expect(r.truncated).toBe(true);
    // Deterministic dueAt asc, id asc subset.
    const dues = r.items.map((i) => i.dueAt);
    expect([...dues].sort()).toEqual(dues);
    // The December instances never enter the set.
    expect(dues.every((d) => d < "2026-11-01")).toBe(true);
    // Instances on a DIFFERENT client in the same workspace don't count.
    const otherU = await prisma2.user.create({
      data: {
        email: `${uid2()}@example.test`,
        passwordHash: "x",
        name: "x",
        status: "ACTIVE",
      },
    });
    const other = await prisma2.clientProfile.create({
      data: { workspaceId: s.w.id, userId: otherU.id, name: `Other ${uid2()}` },
    });
    const otherForm = await prisma2.checkInForm.findFirstOrThrow({
      where: { workspaceId: s.w.id },
    });
    const otherVersion = await prisma2.checkInFormVersion.findFirstOrThrow({
      where: { formId: otherForm.id },
    });
    const ownerMember = await prisma2.workspaceMember.findFirstOrThrow({
      where: { workspaceId: s.w.id },
    });
    await prisma2.checkInInstance.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        workspaceId: s.w.id,
        clientProfileId: other.id,
        formId: otherForm.id,
        formVersionId: otherVersion.id,
        dueAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000),
        scheduledByMemberId: ownerMember.id,
      })),
    });
    const r2 = await listCheckInInstancesForClient(
      s.owner,
      { workspaceId: s.w.id, clientProfileId: s.cp.id, range: OCT },
      deps2(),
    );
    expect(r2.items).toHaveLength(200);
    expect(r2.truncated).toBe(true); // not 250 — foreign rows invisible
  });

  it("client own list carries the same truncation metadata; unbounded callers keep the legacy shape", async () => {
    const s = await denseFixture({ extraInRange: 1 });
    const own = await listOwnCheckInInstances(
      s.client,
      { workspaceId: s.w.id, range: OCT },
      deps2(),
    );
    expect(own.items).toHaveLength(200);
    expect(own.truncated).toBe(true);
    // No range → legacy {items} shape (no truncation contract).
    const legacy = await listOwnCheckInInstances(
      s.client,
      { workspaceId: s.w.id },
      deps2(),
    );
    expect(legacy.items).toHaveLength(200);
    expect("truncated" in legacy).toBe(false);
  });

  it("empty range → empty items, truncated false", async () => {
    const s = await denseFixture({});
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
      deps2(),
    );
    expect(r.items).toHaveLength(0);
    expect(r.truncated).toBe(false);
  });
});
