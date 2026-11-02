// FULL-PACKAGE SLICE of #175
/**
 * Card 10 (#175): IIFYM macro targets on a disposable PostgreSQL
 * database (INTEGRATION_DATABASE_URL). Synthetic fixtures only.
 *
 * Asserts the card contract end to end at the service seam: a coach
 * publishes two weekday options, the client's own read resolves the
 * option that applies on a given weekday, a replayed publish returns
 * the stored version unchanged (same id, same frozen payload bytes),
 * publishing a new version never mutates the old one, a foreign
 * workspace write is denied, and derived calories at 4/4/9 are never
 * stored for macros-style options.
 */

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { IIFYM_DEV_CONSENT } from "../../lib/consent";
import {
  publishIifymVersion,
  readOwnIifymPlan,
  readStaffIifymPlan,
  saveIifymDraft,
  setIifymTimezone,
  type IifymDraft,
  type VariantSchedule,
} from "../../lib/iifym/service";
import { caloriesFromMacros } from "../../lib/nutrition/math";
import { createStaticConsentPolicy } from "../../lib/consent";
import type { SessionLike } from "../../lib/auth/guard";
import { scheduledOption } from "../../components/canvas/coach/plans/domain";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: IIFYM_DEV_CONSENT.PRIVACY_NOTICE,
  HEALTH_DATA: IIFYM_DEV_CONSENT.HEALTH_DATA,
});

const NOW = new Date("2026-10-26T12:00:00Z"); // a Monday
const EFFECTIVE = "2026-10-26";
const TIMEZONE = "Europe/Berlin";

/** The client screen's own resolver - asserts the published payload
 * resolves through the exact function the canvas ships (ISO weekday
 * keys "1" Mon .. "7" Sun), not a re-implementation. */
const optionFor = (schedule: VariantSchedule, ids: string[], date: string) =>
  scheduledOption(schedule as never, ids, date);

describe.skipIf(!enabled)("card 10 IIFYM macro targets (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  // The service checks ENABLE_IIFYM_PLANS + trusted runtime at its
  // boundary (the flag is not just a page gate); stub it on per test so
  // the developer shell's flags can never leak in either direction.
  beforeEach(() => {
    vi.stubEnv("ENABLE_IIFYM_PLANS", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "iifym_plan_version","iifym_plan","consent_record","audit_event","client_assignment","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `p175_${++n}_${Date.now()}`;
  const session = (userId: string): SessionLike => ({ user: { id: userId } });
  const deps = (now: Date = NOW) => ({
    db: prisma as never,
    registry: DEV_REGISTRY,
    now,
  });

  async function seed() {
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
    const coachUser = await mkUser("coach");
    const clientUser = await mkUser("client");
    const coachMember = await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: coachUser.id,
        role: "COACH",
        status: "ACTIVE",
      },
    });
    await prisma.workspaceMember.create({
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
    for (const [kind, version] of [
      ["PRIVACY_NOTICE", IIFYM_DEV_CONSENT.PRIVACY_NOTICE],
      ["HEALTH_DATA", IIFYM_DEV_CONSENT.HEALTH_DATA],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId: profile.id, kind, version },
      });
    // mealPlans write scope is `assigned` - the coach needs an ACTIVE
    // assignment to author the client's targets.
    await prisma.clientAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        coachMemberId: coachMember.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
    return {
      ws,
      profile,
      coachSession: session(coachUser.id),
      clientSession: session(clientUser.id),
    };
  }

  it("feature flag off closes every surface (plan_not_accessible)", async () => {
    const { ws, profile, coachSession, clientSession } = await seed();
    vi.stubEnv("ENABLE_IIFYM_PLANS", "0");
    const args = { workspaceId: ws.id, clientProfileId: profile.id };
    await expect(
      saveIifymDraft(
        coachSession,
        { ...args, expectedRevision: 0, title: "T", draft: { options: [] } },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "plan_not_accessible" });
    await expect(
      readStaffIifymPlan(coachSession, args, deps()),
    ).rejects.toMatchObject({ code: "plan_not_accessible" });
    await expect(
      publishIifymVersion(
        coachSession,
        { ...args, expectedRevision: 1, effectiveDate: EFFECTIVE },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "plan_not_accessible" });
    await expect(
      readOwnIifymPlan(clientSession, { workspaceId: ws.id }, deps()),
    ).rejects.toMatchObject({ code: "plan_not_accessible" });
    await expect(
      setIifymTimezone(coachSession, { ...args, timezone: TIMEZONE }, deps()),
    ).rejects.toMatchObject({ code: "plan_not_accessible" });
  });

  /** Two options: weekday macros + weekend calorie-only. */
  const twoOptionDraft = () => ({
    name: "Individual nutrition targets",
    startDate: EFFECTIVE,
    options: [
      {
        id: "opt_training",
        label: "Training day",
        targets: {
          style: "macros",
          protein: { kind: "fixed", value: 200 },
          carbs: { kind: "fixed", value: 250 },
          fat: { kind: "fixed", value: 70 },
        },
      },
      {
        id: "opt_rest",
        label: "Rest day",
        targets: {
          style: "calories",
          calories: { kind: "fixed", value: 1800 },
        },
      },
    ],
    schedule: {
      mode: "weekly",
      days: {
        "1": "opt_training",
        "2": "opt_training",
        "3": "opt_training",
        "4": "opt_training",
        "5": "opt_training",
        "6": "opt_rest",
        "7": "opt_rest",
      },
    },
  });

  it("publishes two weekday options; the client resolves today's set and the matching-weekday set", async () => {
    const { ws, profile, coachSession, clientSession } = await seed();

    const saved = await saveIifymDraft(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 0,
        title: "Nutrition targets",
        timezone: TIMEZONE,
        draft: twoOptionDraft(),
      },
      deps(),
    );
    expect(saved.revision).toBe(1);

    const published = await publishIifymVersion(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 1,
        effectiveDate: EFFECTIVE,
      },
      deps(),
    );
    expect(published.versionSeq).toBe(1);

    const own = await readOwnIifymPlan(
      clientSession,
      { workspaceId: ws.id },
      deps(),
    );
    expect(own.current?.versionSeq).toBe(1);
    const payload = own.current?.payload as IifymDraft;

    // Today is Monday 2026-10-26 → the training option applies.
    const ids = payload.options.map((o) => o.id);
    const today = optionFor(payload.schedule!, ids, "2026-10-26");
    expect(today).toBe("opt_training");
    // The matching-weekday set: Saturday resolves the rest option.
    const saturday = optionFor(payload.schedule!, ids, "2026-10-31");
    expect(saturday).toBe("opt_rest");

    const training = payload.options.find((o) => o.id === today);
    expect(training?.label).toBe("Training day");
    expect(training?.targets.style).toBe("macros");
    // Derived, never stored: 200*4 + 250*4 + 70*9 = 2430 kcal.
    expect(training?.targets).not.toHaveProperty("calories");
    const num = (v: unknown) => (v as { kind: string; value: number }).value;
    expect(
      caloriesFromMacros({
        protein: num(training?.targets.protein),
        carbohydrate: num(training?.targets.carbs),
        fat: num(training?.targets.fat),
      }),
    ).toBe(2430);

    const rest = payload.options.find((o) => o.id === saturday);
    expect(rest?.targets.style).toBe("calories");
    expect(num(rest?.targets.calories)).toBe(1800);
  });

  it("replayed publish returns the stored version unchanged", async () => {
    const { ws, profile, coachSession } = await seed();
    await saveIifymDraft(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 0,
        title: "Nutrition targets",
        timezone: TIMEZONE,
        draft: twoOptionDraft(),
      },
      deps(),
    );
    const first = await publishIifymVersion(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 1,
        effectiveDate: EFFECTIVE,
      },
      deps(),
    );

    const stored = await prisma.iifymPlanVersion.findUniqueOrThrow({
      where: { id: first.versionId },
    });
    const payloadBefore = JSON.stringify(stored.payload);
    const publishedAtBefore = stored.publishedAt;

    // Same call again: the stored version comes back, nothing written.
    const replay = await publishIifymVersion(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 1,
        effectiveDate: EFFECTIVE,
      },
      deps(),
    );
    expect(replay.versionId).toBe(first.versionId);
    expect(replay.versionSeq).toBe(first.versionSeq);

    const after = await prisma.iifymPlanVersion.findUniqueOrThrow({
      where: { id: first.versionId },
    });
    expect(JSON.stringify(after.payload)).toBe(payloadBefore);
    expect(after.publishedAt).toEqual(publishedAtBefore);
    // Still exactly one version row.
    const count = await prisma.iifymPlanVersion.count({
      where: { iifymPlanId: after.iifymPlanId },
    });
    expect(count).toBe(1);
  });

  it("a second publish never mutates the first version", async () => {
    const { ws, profile, coachSession } = await seed();
    await saveIifymDraft(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 0,
        title: "Nutrition targets",
        timezone: TIMEZONE,
        draft: twoOptionDraft(),
      },
      deps(),
    );
    const v1 = await publishIifymVersion(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 1,
        effectiveDate: EFFECTIVE,
      },
      deps(),
    );
    const v1Row = await prisma.iifymPlanVersion.findUniqueOrThrow({
      where: { id: v1.versionId },
    });
    const v1Payload = JSON.stringify(v1Row.payload);

    const draft2 = twoOptionDraft();
    draft2.options[0].targets.protein = { kind: "fixed", value: 220 };
    await saveIifymDraft(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 1,
        draft: draft2,
      },
      deps(),
    );
    const v2 = await publishIifymVersion(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 2,
        effectiveDate: EFFECTIVE,
      },
      deps(),
    );
    expect(v2.versionSeq).toBe(2);
    const v1After = await prisma.iifymPlanVersion.findUniqueOrThrow({
      where: { id: v1.versionId },
    });
    expect(JSON.stringify(v1After.payload)).toBe(v1Payload);
    // v2 carries the updated protein target.
    const v2Row = await prisma.iifymPlanVersion.findUniqueOrThrow({
      where: { id: v2.versionId },
    });
    expect(JSON.stringify(v2Row.payload)).toContain('"value":220');
  });

  it("stale draft revisions are rejected by CAS", async () => {
    const { ws, profile, coachSession } = await seed();
    await saveIifymDraft(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 0,
        title: "Nutrition targets",
        timezone: TIMEZONE,
        draft: twoOptionDraft(),
      },
      deps(),
    );
    await expect(
      saveIifymDraft(
        coachSession,
        {
          workspaceId: ws.id,
          clientProfileId: profile.id,
          expectedRevision: 0,
          draft: twoOptionDraft(),
        },
        deps(),
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "stale_revision" }));
    await expect(
      publishIifymVersion(
        coachSession,
        {
          workspaceId: ws.id,
          clientProfileId: profile.id,
          expectedRevision: 7,
          effectiveDate: EFFECTIVE,
        },
        deps(),
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "stale_revision" }));
  });

  it("a foreign workspace write is denied", async () => {
    const { ws, profile } = await seed();
    // Foreign actor: a coach in a DIFFERENT workspace, holding no
    // assignment to this client.
    const foreignUser = await prisma.user.create({
      data: {
        email: `${uid()}-foreign@example.test`,
        passwordHash: "x",
        status: "ACTIVE",
        name: "Foreign",
      },
    });
    const foreignWs = await prisma.workspace.create({
      data: { slug: `w-${uid()}`, name: "Foreign", status: "ACTIVE" },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: foreignWs.id,
        userId: foreignUser.id,
        role: "COACH",
        status: "ACTIVE",
      },
    });
    const foreignSession = session(foreignUser.id);
    await expect(
      saveIifymDraft(
        foreignSession,
        {
          workspaceId: ws.id,
          clientProfileId: profile.id,
          expectedRevision: 0,
          title: "Nope",
          timezone: TIMEZONE,
          draft: twoOptionDraft(),
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      publishIifymVersion(
        foreignSession,
        {
          workspaceId: ws.id,
          clientProfileId: profile.id,
          expectedRevision: 1,
          effectiveDate: EFFECTIVE,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // And a client-role caller can never write in their own workspace.
    const { ws: ws2, profile: profile2 } = await seed();
    const clientOnly = await prisma.user.create({
      data: {
        email: `${uid()}-c2@example.test`,
        passwordHash: "x",
        status: "ACTIVE",
        name: "C2",
      },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ws2.id,
        userId: clientOnly.id,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    await expect(
      saveIifymDraft(
        session(clientOnly.id),
        {
          workspaceId: ws2.id,
          clientProfileId: profile2.id,
          expectedRevision: 0,
          title: "Nope",
          draft: twoOptionDraft(),
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("staff read exposes draft + versions; own read never exposes the draft", async () => {
    const { ws, profile, coachSession, clientSession } = await seed();
    await saveIifymDraft(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 0,
        title: "Nutrition targets",
        timezone: TIMEZONE,
        draft: twoOptionDraft(),
      },
      deps(),
    );
    await publishIifymVersion(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 1,
        effectiveDate: EFFECTIVE,
      },
      deps(),
    );
    const staff = await readStaffIifymPlan(
      coachSession,
      { workspaceId: ws.id, clientProfileId: profile.id },
      deps(),
    );
    expect(staff.plan?.draftRevision).toBe(1);
    expect(staff.versions).toHaveLength(1);
    expect(staff.currentVersionId).toBe(staff.versions[0]?.id);
    expect(staff.canWrite).toBe(true);

    const own = await readOwnIifymPlan(
      clientSession,
      { workspaceId: ws.id },
      deps(),
    );
    expect(own.current).not.toBeNull();
    expect(JSON.stringify(own)).not.toContain('"draft"');
    expect(own.current?.payload.options).toHaveLength(2);
  });

  it("a flexible draft saves, publishes and reads back through staff and own reads", async () => {
    const { ws, profile, coachSession, clientSession } = await seed();
    const flexibleDraft = () => ({
      ...twoOptionDraft(),
      schedule: { mode: "flexible" },
    });

    const saved = await saveIifymDraft(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 0,
        title: "Nutrition targets",
        timezone: TIMEZONE,
        draft: flexibleDraft(),
      },
      deps(),
    );
    expect(saved.revision).toBe(1);

    const published = await publishIifymVersion(
      coachSession,
      {
        workspaceId: ws.id,
        clientProfileId: profile.id,
        expectedRevision: 1,
        effectiveDate: EFFECTIVE,
      },
      deps(),
    );
    expect(published.versionSeq).toBe(1);

    const staff = await readStaffIifymPlan(
      coachSession,
      { workspaceId: ws.id, clientProfileId: profile.id },
      deps(),
    );
    expect((staff.plan?.draft as IifymDraft | null)?.schedule).toEqual({
      mode: "flexible",
    });

    const own = await readOwnIifymPlan(
      clientSession,
      { workspaceId: ws.id },
      deps(),
    );
    expect((own.current?.payload as IifymDraft).schedule).toEqual({
      mode: "flexible",
    });
  });
});
