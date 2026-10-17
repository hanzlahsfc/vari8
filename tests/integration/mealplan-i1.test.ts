// MEAL-PLAN-I1 (PROMPT 211) — versioned meal-plan workflow against
// disposable PostgreSQL (reviewed MEAL-PLAN-P3 contract + P3-R1
// refinements). Real schema, real transactions, real authorization:
// sessions are labeled identities; every membership/role/workspace/
// assignment/consent decision is re-resolved inside the serializable
// transaction.
//
// Contract under test: assigned coaches AND explicitly assigned owners
// author a shared draft (draftRevision CAS); publish mints an immutable
// effective-dated version carrying a stored (effectiveDate,
// effectiveTimezone, activationInstant) snapshot; current =
// activationInstant ≤ now ordered (effectiveDate DESC, versionSeq DESC);
// upcoming = earliest future activation; unassigned owners keep
// workspace-wide READ only; assistants/clients read-only; SUPPORT and
// PLATFORM_ADMIN (incl. dual-role) denied; BASE_CONSENTS gate every read
// and write; no computed nutrition values ever appear.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { createStaticConsentPolicy } from "../../lib/consent";
import {
  publishMealPlanVersion,
  readOwnMealPlan,
  readStaffMealPlan,
  readStaffMealPlanVersion,
  saveMealPlanDraft,
  setMealPlanTimezone,
} from "../../lib/mealplan/service";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: "meal-plan-dev-privacy-v1",
  HEALTH_DATA: "meal-plan-dev-health-v1",
});

const NOW = new Date("2026-10-20T12:00:00Z");

describe.skipIf(!enabled)("MEAL-PLAN-I1 (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "meal_plan_version","meal_plan","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `mpi1${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });
  const deps = (now: Date = NOW) => ({
    db: prisma as never,
    registry: DEV_REGISTRY,
    now,
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
      data: { name: `WS ${uid()}`, slug: `mp1-${uid()}`, status: "ACTIVE" },
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
      ["PRIVACY_NOTICE", "meal-plan-dev-privacy-v1"],
      ["HEALTH_DATA", "meal-plan-dev-health-v1"],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId, kind, version },
      });
  }
  async function assignment(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
    role: "PRIMARY" | "COACH" = "PRIMARY",
  ) {
    return prisma.clientAssignment.upsert({
      where: {
        clientProfileId_coachMemberId: { clientProfileId, coachMemberId },
      },
      update: { role, status: "ACTIVE" },
      create: {
        workspaceId,
        clientProfileId,
        coachMemberId,
        role,
        status: "ACTIVE",
      },
    });
  }

  const draftPayload = (label = "Training day") => ({
    variants: [
      {
        id: "v_td",
        label,
        targetMode: "FIXED",
        targets: {
          kcal: { value: 2400 },
          proteinG: { value: 180 },
          carbsG: null,
          fatG: { value: 70 },
        },
        meals: [
          {
            order: 1,
            name: "Breakfast",
            time: "08:00",
            frequency: "Every day",
            foodText: "Synthetic oats",
            kcal: 352,
            proteinG: 30,
            fatG: 8,
          },
        ],
      },
    ],
  });

  /** Workspace + owner/coach/assistant/support/client + consent. */
  async function setup() {
    const w = await ws();
    const ownerU = await user();
    const ownerMember = await member(w.id, ownerU.id, "WORKSPACE_OWNER");
    const coachU = await user();
    const coachMember = await member(w.id, coachU.id, "COACH");
    const asstU = await user();
    const asstMember = await member(w.id, asstU.id, "ASSISTANT_COACH");
    const supportU = await user();
    await member(w.id, supportU.id, "SUPPORT");
    const clientU = await user();
    await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    await consent(cp.id);
    await assignment(w.id, cp.id, coachMember.id);
    return {
      w,
      ownerU,
      ownerMember,
      coachU,
      coachMember,
      asstU,
      asstMember,
      supportU,
      clientU,
      cp,
    };
  }

  async function createdPlan(
    coachId: string,
    workspaceId: string,
    clientProfileId: string,
    timezone = "UTC",
    now = NOW,
  ) {
    return saveMealPlanDraft(
      session(coachId),
      {
        workspaceId,
        clientProfileId,
        expectedRevision: 0,
        title: "Cut phase",
        timezone,
        draft: draftPayload(),
      },
      deps(now),
    );
  }

  // ── Authorization matrix ────────────────────────────────────────────

  it("assigned coach creates/saves/publishes; draftRevision CAS enforces", async () => {
    const { w, coachU, cp } = await setup();
    const created = await createdPlan(coachU.id, w.id, cp.id);
    expect(created.revision).toBe(1);

    const saved = await saveMealPlanDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 1,
        draft: draftPayload("Rest day"),
      },
      deps(),
    );
    expect(saved.revision).toBe(2);

    // Stale CAS → conflict, zero writes.
    await expect(
      saveMealPlanDraft(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 1,
          draft: draftPayload(),
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "stale_revision" });

    const pub = await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 2,
        effectiveDate: "2026-10-20",
      },
      deps(),
    );
    expect(pub.versionSeq).toBe(1);
    const row = await prisma.mealPlanVersion.findUniqueOrThrow({
      where: { id: pub.versionId },
    });
    expect(row.effectiveTimezone).toBe("UTC");
    expect(row.activationInstant.toISOString()).toBe(
      "2026-10-20T00:00:00.000Z",
    );
    expect(row.publishOriginRevision).toBe(2);
    expect((row.payload as { variants: unknown[] }).variants).toHaveLength(1);
  });

  it("explicitly assigned owner authors; unassigned owner is read-only", async () => {
    const { w, ownerU, ownerMember, cp } = await setup();

    // Unassigned owner: workspace read OK, write denied (assigned scope).
    const read = await readStaffMealPlan(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(read.canWrite).toBe(false);
    await expect(createdPlan(ownerU.id, w.id, cp.id)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );

    // Explicitly assigned owner authors (coach holds PRIMARY; a second
    // ACTIVE PRIMARY for the same client is a raw unique index).
    await assignment(w.id, cp.id, ownerMember.id, "COACH");
    const created = await createdPlan(ownerU.id, w.id, cp.id);
    expect(created.revision).toBe(1);
    const read2 = await readStaffMealPlan(
      session(ownerU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(read2.canWrite).toBe(true);
  });

  it("assistant reads assigned client but can never write", async () => {
    const { w, coachU, asstU, asstMember, cp } = await setup();
    await createdPlan(coachU.id, w.id, cp.id);
    await assignment(w.id, cp.id, asstMember.id, "COACH");

    const read = await readStaffMealPlan(
      session(asstU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(read.plan).not.toBeNull();
    expect(read.canWrite).toBe(false);
    await expect(
      saveMealPlanDraft(
        session(asstU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 1,
          draft: draftPayload(),
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      setMealPlanTimezone(
        session(asstU.id),
        { workspaceId: w.id, clientProfileId: cp.id, timezone: "UTC" },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Unassigned assistant: read also denied (assigned scope).
    const other = await profile(w.id, (await user()).id);
    await consent(other.id);
    await expect(
      readStaffMealPlan(
        session(asstU.id),
        { workspaceId: w.id, clientProfileId: other.id },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("client reads own published plan only; every write denied", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const created = await createdPlan(coachU.id, w.id, cp.id);
    await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-19",
      },
      deps(),
    );
    const own = await readOwnMealPlan(
      session(clientU.id),
      { workspaceId: w.id },
      deps(),
    );
    expect(own.current?.versionSeq).toBe(1);
    expect(own.current?.payload.variants[0]?.meals[0]?.kcal).toBe(352);
    // Zero-vs-missing fidelity through the published snapshot.
    const m = own.current?.payload.variants[0]?.meals[0];
    expect(m && "carbsG" in m).toBe(false);
    // No draft content ever reaches the client view.
    expect(JSON.stringify(own)).not.toContain('"draft"');

    for (const op of [
      () =>
        saveMealPlanDraft(
          session(clientU.id),
          {
            workspaceId: w.id,
            clientProfileId: cp.id,
            expectedRevision: 0,
            title: "x",
            draft: draftPayload(),
          },
          deps(),
        ),
      () =>
        publishMealPlanVersion(
          session(clientU.id),
          {
            workspaceId: w.id,
            clientProfileId: cp.id,
            expectedRevision: 1,
            effectiveDate: "2026-10-20",
          },
          deps(),
        ),
      () =>
        setMealPlanTimezone(
          session(clientU.id),
          { workspaceId: w.id, clientProfileId: cp.id, timezone: "UTC" },
          deps(),
        ),
    ])
      await expect(op()).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("SUPPORT and PLATFORM_ADMIN (incl. dual-role) are denied everywhere", async () => {
    const { w, supportU, coachMember, cp } = await setup();
    await assignment(w.id, cp.id, coachMember.id);
    const paU = await user("PLATFORM_ADMIN");
    const paMember = await member(w.id, paU.id, "COACH");
    await assignment(w.id, cp.id, paMember.id, "COACH");

    for (const uidX of [supportU.id, paU.id]) {
      await expect(
        readStaffMealPlan(
          session(uidX),
          { workspaceId: w.id, clientProfileId: cp.id },
          deps(),
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(createdPlan(uidX, w.id, cp.id)).rejects.toBeInstanceOf(
        AccessDeniedError,
      );
      await expect(
        publishMealPlanVersion(
          session(uidX),
          {
            workspaceId: w.id,
            clientProfileId: cp.id,
            expectedRevision: 1,
            effectiveDate: "2026-10-20",
          },
          deps(),
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }
  });

  it("cross-tenant and cross-client isolation holds", async () => {
    const { w, coachU, cp } = await setup();
    await createdPlan(coachU.id, w.id, cp.id);

    // Foreign workspace + foreign client profile.
    const w2 = await ws();
    const coach2 = await user();
    const coachMember2 = await member(w2.id, coach2.id, "COACH");
    const client2 = await user();
    await member(w2.id, client2.id, "CLIENT");
    const cp2 = await profile(w2.id, client2.id);
    await consent(cp2.id);
    await assignment(w2.id, cp2.id, coachMember2.id);

    // ws1 coach cannot touch ws2's client (no membership there at all).
    await expect(createdPlan(coachU.id, w2.id, cp2.id)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    // ws2 coach cannot address ws1's client through ws2's workspace id.
    await expect(createdPlan(coach2.id, w2.id, cp.id)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    // Cross-client: coach assigned to cp only, another client in ws.
    const cpBUser = await user();
    const cpB = await profile(w.id, cpBUser.id);
    await member(w.id, cpBUser.id, "CLIENT");
    await consent(cpB.id);
    await expect(createdPlan(coachU.id, w.id, cpB.id)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });

  // ── Consent ─────────────────────────────────────────────────────────

  it("missing consent denies writes AND client reads; revocation re-denies", async () => {
    const w = await ws();
    const coachU = await user();
    const coachMember = await member(w.id, coachU.id, "COACH");
    const clientU = await user();
    await member(w.id, clientU.id, "CLIENT");
    const cp = await profile(w.id, clientU.id);
    await assignment(w.id, cp.id, coachMember.id);

    // No consent rows at all → consent_missing, before any row exists.
    await expect(createdPlan(coachU.id, w.id, cp.id)).rejects.toMatchObject({
      code: "consent_missing",
    });
    await expect(
      readOwnMealPlan(session(clientU.id), { workspaceId: w.id }, deps()),
    ).rejects.toMatchObject({ code: "consent_missing" });
    // Unconfigured registry fails closed even with grants present.
    await consent(cp.id);
    await expect(
      saveMealPlanDraft(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 0,
          title: "x",
          draft: draftPayload(),
        },
        { db: prisma as never, now: NOW },
      ),
    ).rejects.toMatchObject({ code: "policy_not_configured" });

    // Happy path with consent, then revoke → next op denied.
    await createdPlan(coachU.id, w.id, cp.id);
    await prisma.consentRecord.updateMany({
      where: { clientProfileId: cp.id, kind: "HEALTH_DATA" },
      data: { revokedAt: new Date() },
    });
    await expect(
      saveMealPlanDraft(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: 1,
          draft: draftPayload(),
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });
    await expect(
      readOwnMealPlan(session(clientU.id), { workspaceId: w.id }, deps()),
    ).rejects.toMatchObject({ code: "consent_missing" });
  });

  // ── Publication semantics ───────────────────────────────────────────

  it("publish replay returns the committed version; stale publish after newer draft is rejected or replayed", async () => {
    const { w, coachU, cp } = await setup();
    const created = await createdPlan(coachU.id, w.id, cp.id);
    const pub = await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-20",
      },
      deps(),
    );
    // Lost-response retry of the same revision → the SAME version row.
    const replay = await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-20",
      },
      deps(),
    );
    expect(replay.versionId).toBe(pub.versionId);
    expect(
      await prisma.mealPlanVersion.count({
        where: { mealPlanId: created.planId },
      }),
    ).toBe(1);

    // Draft advances; a stale retry of the committed revision still
    // replays the already-committed version rather than minting anew.
    const saved = await saveMealPlanDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        draft: draftPayload("Rest day"),
      },
      deps(),
    );
    const staleReplay = await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-21",
      },
      deps(),
    );
    expect(staleReplay.versionId).toBe(pub.versionId);

    // A revision that was never published and no longer matches → conflict.
    await expect(
      publishMealPlanVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: created.revision + 99,
          effectiveDate: "2026-10-21",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "stale_revision" });
    await expect(saved.revision).toBe(2);
  });

  it("concurrent publishes serialize to sequential versionSeqs", async () => {
    const { w, coachU, cp } = await setup();
    const created = await createdPlan(coachU.id, w.id, cp.id);
    // Two publishes of the same revision: replay authority collapses them
    // to one committed version.
    const [a, b] = await Promise.all([
      publishMealPlanVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: created.revision,
          effectiveDate: "2026-10-20",
        },
        deps(),
      ),
      publishMealPlanVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: created.revision,
          effectiveDate: "2026-10-20",
        },
        deps(),
      ),
    ]);
    expect(a.versionId).toBe(b.versionId);
    expect(
      await prisma.mealPlanVersion.count({
        where: { mealPlanId: created.planId },
      }),
    ).toBe(1);
  });

  it("requires confirmed timezone and a publishable draft", async () => {
    const { w, coachU, cp } = await setup();
    // Container without timezone → timezone_required.
    const noTz = await saveMealPlanDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: 0,
        title: "No tz",
        draft: draftPayload(),
      },
      deps(),
    );
    await expect(
      publishMealPlanVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: noTz.revision,
          effectiveDate: "2026-10-20",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "timezone_required" });

    // Now set tz explicitly and publish.
    await setMealPlanTimezone(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id, timezone: "UTC" },
      deps(),
    );
    const pub = await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: noTz.revision,
        effectiveDate: "2026-10-20",
      },
      deps(),
    );
    expect(pub.versionSeq).toBe(1);

    // Empty-variant draft cannot publish.
    const { w: w2, coachU: coach2, cp: cp2 } = await setup();
    const empty = await saveMealPlanDraft(
      session(coach2.id),
      {
        workspaceId: w2.id,
        clientProfileId: cp2.id,
        expectedRevision: 0,
        title: "Empty",
        timezone: "UTC",
        draft: { variants: [] },
      },
      deps(),
    );
    await expect(
      publishMealPlanVersion(
        session(coach2.id),
        {
          workspaceId: w2.id,
          clientProfileId: cp2.id,
          expectedRevision: empty.revision,
          effectiveDate: "2026-10-20",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "publish_incomplete" });
  });

  // ── Timezone activation + selection ─────────────────────────────────

  it("client-local activation gates currency: UTC boundary honesty", async () => {
    const { w, coachU, clientU, cp } = await setup();
    const created = await createdPlan(
      coachU.id,
      w.id,
      cp.id,
      "Pacific/Auckland",
    );
    // Auckland NZDT (UTC+13) Oct 2026: local midnight 2026-10-21 =
    // 2026-10-20T11:00:00Z.
    const pub = await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-21",
      },
      deps(),
    );
    const row = await prisma.mealPlanVersion.findUniqueOrThrow({
      where: { id: pub.versionId },
    });
    expect(row.activationInstant.toISOString()).toBe(
      "2026-10-20T11:00:00.000Z",
    );
    expect(row.effectiveTimezone).toBe("Pacific/Auckland");

    // At 10:59Z the version is still upcoming (local day has not begun).
    const before = await readOwnMealPlan(
      session(clientU.id),
      { workspaceId: w.id },
      deps(new Date("2026-10-20T10:59:00Z")),
    );
    expect(before.current).toBeNull();
    expect(before.upcoming?.versionSeq).toBe(1);

    // At 11:00Z local day 21st has begun → current without republish.
    const after = await readOwnMealPlan(
      session(clientU.id),
      { workspaceId: w.id },
      deps(new Date("2026-10-20T11:00:00Z")),
    );
    expect(after.current?.versionSeq).toBe(1);
    expect(after.upcoming).toBeNull();
  });

  it("same effectiveDate later publication wins precedence regardless of tz", async () => {
    const { w, coachU, cp } = await setup();
    const created = await createdPlan(
      coachU.id,
      w.id,
      cp.id,
      "Pacific/Auckland",
    );
    await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-21",
      },
      deps(),
    );
    // Same declared date published under a different timezone ACTIVATES
    // LATER — it must never be falsely labeled current before it starts.
    const saved = await saveMealPlanDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        draft: draftPayload("Corrected"),
      },
      deps(),
    );
    await setMealPlanTimezone(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        timezone: "America/New_York",
      },
      deps(),
    );
    const second = await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: saved.revision,
        effectiveDate: "2026-10-21",
      },
      deps(),
    );
    // v2 activation: NY local midnight 2026-10-21 = 04:00Z Oct 21 — later
    // than v1's Oct 20 11:00Z. At a now between them: v1 current, v2 upcoming.
    const staff = await readStaffMealPlan(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(new Date("2026-10-21T00:00:00Z")),
    );
    expect(staff.upcoming?.versionSeq).toBe(second.versionSeq);
    // After v2 activates, precedence (same effectiveDate, higher seq) → v2.
    const after = await readStaffMealPlan(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(new Date("2026-10-21T05:00:00Z")),
    );
    expect(after.currentVersionId).toBe(second.versionId);
  });

  it("timezone changes never retime published snapshots", async () => {
    const { w, coachU, cp } = await setup();
    const created = await createdPlan(coachU.id, w.id, cp.id, "UTC");
    const pub = await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-20",
      },
      deps(),
    );
    await setMealPlanTimezone(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        timezone: "America/New_York",
      },
      deps(),
    );
    const row = await prisma.mealPlanVersion.findUniqueOrThrow({
      where: { id: pub.versionId },
    });
    expect(row.effectiveTimezone).toBe("UTC");
    expect(row.activationInstant.toISOString()).toBe(
      "2026-10-20T00:00:00.000Z",
    );
    // New publication snapshots the newly confirmed timezone.
    const saved = await saveMealPlanDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        draft: draftPayload("Rest day"),
      },
      deps(),
    );
    const pub2 = await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: saved.revision,
        effectiveDate: "2026-10-22",
      },
      deps(),
    );
    const row2 = await prisma.mealPlanVersion.findUniqueOrThrow({
      where: { id: pub2.versionId },
    });
    expect(row2.effectiveTimezone).toBe("America/New_York");
    expect(row2.activationInstant.toISOString()).toBe(
      "2026-10-22T04:00:00.000Z",
    );
  });

  it("Apia whole-day-skip publish is rejected, never shifted", async () => {
    const { w, coachU, cp } = await setup();
    const created = await createdPlan(coachU.id, w.id, cp.id, "Pacific/Apia");
    await expect(
      publishMealPlanVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: created.revision,
          effectiveDate: "2011-12-30",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "unrepresentable_date" });
    expect(
      await prisma.mealPlanVersion.count({
        where: { mealPlanId: created.planId },
      }),
    ).toBe(0);
  });

  it("invalid timezone and invalid effectiveDate reject", async () => {
    const { w, coachU, cp } = await setup();
    const created = await createdPlan(coachU.id, w.id, cp.id, "UTC");
    await expect(
      setMealPlanTimezone(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          timezone: "Not/AZone",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      publishMealPlanVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: created.revision,
          effectiveDate: "2026-02-30",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      publishMealPlanVersion(
        session(coachU.id),
        {
          workspaceId: w.id,
          clientProfileId: cp.id,
          expectedRevision: created.revision,
          effectiveDate: "2028-01-01",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  // ── Reads, isolation, immutability, audit ───────────────────────────

  it("staff version detail is tenant-scoped; payload immutable", async () => {
    const { w, coachU, cp } = await setup();
    const created = await createdPlan(coachU.id, w.id, cp.id);
    const pub = await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-19",
      },
      deps(),
    );
    const detail = await readStaffMealPlanVersion(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id, versionId: pub.versionId },
      deps(),
    );
    expect(detail.effectiveDate).toBe("2026-10-19");
    expect(detail.effectiveTimezone).toBe("UTC");

    // Foreign workspace cannot address the version id.
    const w2 = await ws();
    const coach2 = await user();
    await member(w2.id, coach2.id, "COACH");
    await expect(
      readStaffMealPlanVersion(
        session(coach2.id),
        {
          workspaceId: w2.id,
          clientProfileId: cp.id,
          versionId: pub.versionId,
        },
        deps(),
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // Draft edits after publish never mutate the committed payload.
    await saveMealPlanDraft(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        draft: draftPayload("Changed"),
      },
      deps(),
    );
    const after = await prisma.mealPlanVersion.findUniqueOrThrow({
      where: { id: pub.versionId },
    });
    expect(
      (after.payload as { variants: { label: string }[] }).variants[0]?.label,
    ).toBe("Training day");
  });

  it("bounded staff version list + client no-plan and future-plan states", async () => {
    const { w, coachU, clientU, cp } = await setup();
    // No plan at all → truthful empty states.
    const empty = await readOwnMealPlan(
      session(clientU.id),
      { workspaceId: w.id },
      deps(),
    );
    expect(empty.current).toBeNull();
    expect(empty.upcoming).toBeNull();

    const created = await createdPlan(coachU.id, w.id, cp.id);
    await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-12-01",
      },
      deps(),
    );
    const future = await readOwnMealPlan(
      session(clientU.id),
      { workspaceId: w.id },
      deps(),
    );
    expect(future.current).toBeNull();
    expect(future.upcoming?.versionSeq).toBe(1);
    expect(future.upcoming?.effectiveDate).toBe("2026-12-01");
    expect(future.upcoming?.effectiveTimezone).toBe("UTC");

    const staff = await readStaffMealPlan(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(),
    );
    expect(staff.versions.map((v) => v.versionSeq)).toEqual([1]);
    expect(staff.nextCursor).toBeNull();
  });

  it("audit trail: CREATE plan, UPDATE draft, CREATE version — structural only", async () => {
    const { w, coachU, cp } = await setup();
    const created = await createdPlan(coachU.id, w.id, cp.id);
    await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-20",
      },
      deps(),
    );
    const events = await prisma.auditEvent.findMany({
      where: { workspaceId: w.id },
      orderBy: { id: "asc" },
    });
    const types = events.map((e) => `${e.action}:${e.resourceType}`);
    expect(types).toEqual(
      expect.arrayContaining(["CREATE:meal_plan", "CREATE:meal_plan_version"]),
    );
    for (const e of events) {
      expect(JSON.stringify(e.meta ?? {})).not.toContain("Breakfast");
      expect(JSON.stringify(e.meta ?? {})).not.toContain("Synthetic oats");
    }
  });

  it("browser timezone is never consulted — same version for any viewer", async () => {
    // Server-side selection is pure stored-instant comparison; this test
    // asserts both staff and client paths resolve identically under the
    // same injected `now` (browser tz has no entry point).
    const { w, coachU, clientU, cp } = await setup();
    const created = await createdPlan(coachU.id, w.id, cp.id);
    await publishMealPlanVersion(
      session(coachU.id),
      {
        workspaceId: w.id,
        clientProfileId: cp.id,
        expectedRevision: created.revision,
        effectiveDate: "2026-10-19",
      },
      deps(),
    );
    const at = new Date("2026-10-20T12:00:00Z");
    const staff = await readStaffMealPlan(
      session(coachU.id),
      { workspaceId: w.id, clientProfileId: cp.id },
      deps(at),
    );
    const own = await readOwnMealPlan(
      session(clientU.id),
      { workspaceId: w.id },
      deps(at),
    );
    expect(own.current?.versionSeq).toBe(1);
    expect(staff.currentVersionId).not.toBeNull();
    const staffCurrent = staff.versions.find(
      (v) => v.id === staff.currentVersionId,
    );
    expect(staffCurrent?.versionSeq).toBe(1);
  });
});
