import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type SessionLike } from "../../lib/auth/guard";
import {
  DAILY_ENTRY_DEV_CONSENT,
  DailyEntryError,
  listStaffDailyEntries,
  loadDailyEntrySurface,
  readStaffDailyEntryDetail,
  saveDailyEntry,
  STAFF_ENTRY_PAGE_SIZE,
} from "../../lib/daily-entry/service";
import { createStaticConsentPolicy } from "../../lib/consent";

/**
 * P-022 — read-only staff DailyEntry review (decisions #79–#81, P-022-R4
 * contract) on a dedicated disposable PostgreSQL database
 * (INTEGRATION_DATABASE_URL). Synthetic fixtures only.
 *
 * The client persists real entries through `saveDailyEntry`; staff read them
 * back through the new list/detail services — including authorization scope,
 * consent gating, lock/serialization races, and audit atomicity.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: DAILY_ENTRY_DEV_CONSENT.PRIVACY_NOTICE,
  HEALTH_DATA: DAILY_ENTRY_DEV_CONSENT.HEALTH_DATA,
});

describe.skipIf(!enabled)("P-022 staff DailyEntry review (real PG)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    // Defensive cleanup — a crashed prior run could leave the forced-failure
    // trigger behind and poison every audit insert.
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS p022_audit_fail_t ON "audit_event"`,
    );
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS p022_audit_fail()`);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "daily_entry_revision_value","daily_entry_revision","daily_entry","audit_event","client_setup_pin","client_setup","consent_record","coaching_template_version_parameter","coaching_template_version","coaching_template","parameter_definition","client_assignment","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `p022_${++n}_${Date.now()}`;

  type SeedOpts = {
    consent?: boolean;
    pin?: boolean;
    assignCoach?: boolean;
    assignAssistant?: boolean;
  };

  /** Workspace with owner/coach/assistant/support/client members, the
   * client's profile, params/template/version/setup/pin, dev consent rows,
   * and ACTIVE COACH-role assignments for coach + assistant. */
  async function seedWorkspace(opts: SeedOpts = {}) {
    const tag = uid();
    const ws = await prisma.workspace.create({
      data: { slug: `w-${tag}`, name: tag, status: "ACTIVE" },
    });
    const mkUser = async (
      suffix: string,
      platformRole: "USER" | "PLATFORM_ADMIN" = "USER",
    ) =>
      prisma.user.create({
        data: {
          email: `${tag}-${suffix}@example.test`,
          passwordHash: "x",
          status: "ACTIVE",
          platformRole,
          name: `${tag}-${suffix}`,
        },
      });
    const mkMember = (
      userId: string,
      role:
        "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT",
    ) =>
      prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId, role, status: "ACTIVE" },
      });

    const ownerUser = await mkUser("o");
    const coachUser = await mkUser("ch");
    const assistantUser = await mkUser("a");
    const supportUser = await mkUser("s");
    const clientUser = await mkUser("c");
    const platformUser = await mkUser("p", "PLATFORM_ADMIN");
    const dualUser = await mkUser("d", "PLATFORM_ADMIN");

    const ownerMember = await mkMember(ownerUser.id, "WORKSPACE_OWNER");
    const coachMember = await mkMember(coachUser.id, "COACH");
    const assistantMember = await mkMember(assistantUser.id, "ASSISTANT_COACH");
    const supportMember = await mkMember(supportUser.id, "SUPPORT");
    const clientMember = await mkMember(clientUser.id, "CLIENT");
    const dualMember = await mkMember(dualUser.id, "WORKSPACE_OWNER");

    const profile = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: clientUser.id, name: "P022 Client" },
    });

    const paramDefs = [
      { id: `pd_w_${tag}`, kind: "MEASUREMENT", required: true },
      { id: `pd_m_${tag}`, kind: "RATING", required: false },
      { id: `pd_l_${tag}`, kind: "OPTION", required: false },
      { id: `pd_n_${tag}`, kind: "TEXT", required: false },
    ];
    for (const p of paramDefs) {
      await prisma.parameterDefinition.create({
        data: {
          id: p.id,
          workspaceId: ws.id,
          key: `p_${p.id}`,
          kind: p.kind as never,
          label: `Label ${p.id}`,
          unit: p.kind === "MEASUREMENT" ? "kg" : null,
          ratingScheme: p.kind === "RATING" ? "SCALE_1_10" : null,
          options:
            p.kind === "OPTION"
              ? [
                  { optionId: `opt_${p.id}_a`, label: "A" },
                  { optionId: `opt_${p.id}_b`, label: "B" },
                ]
              : [],
          validation:
            p.kind === "MEASUREMENT" ? { min: 0, max: 500 } : undefined,
          dataClassification: "GENERAL_HEALTH",
          createdByMemberId: ownerMember.id,
          updatedByMemberId: ownerMember.id,
        },
      });
    }
    const template = await prisma.coachingTemplate.create({
      data: {
        workspaceId: ws.id,
        name: "T",
        createdByMemberId: ownerMember.id,
      },
    });
    const version = await prisma.coachingTemplateVersion.create({
      data: {
        workspaceId: ws.id,
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
                ratingScheme: p.kind === "RATING" ? "SCALE_1_10" : null,
                options:
                  p.kind === "OPTION"
                    ? [
                        { optionId: `opt_${p.id}_a`, label: "A" },
                        { optionId: `opt_${p.id}_b`, label: "B" },
                      ]
                    : [],
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
        publishedByMemberId: ownerMember.id,
      },
    });
    let setup = null;
    let pin = null;
    if (opts.pin !== false) {
      setup = await prisma.clientSetup.create({
        data: { workspaceId: ws.id, clientProfileId: profile.id },
      });
      pin = await prisma.clientSetupPin.create({
        data: {
          clientSetupId: setup.id,
          workspaceId: ws.id,
          clientProfileId: profile.id,
          seq: 1,
          templateId: template.id,
          templateVersionId: version.id,
          assignedByMemberId: ownerMember.id,
        },
      });
    }
    if (opts.consent !== false) {
      for (const [kind, ver] of [
        ["PRIVACY_NOTICE", DAILY_ENTRY_DEV_CONSENT.PRIVACY_NOTICE],
        ["HEALTH_DATA", DAILY_ENTRY_DEV_CONSENT.HEALTH_DATA],
      ] as const)
        await prisma.consentRecord.create({
          data: { clientProfileId: profile.id, kind, version: ver },
        });
    }
    if (opts.assignCoach !== false)
      await prisma.clientAssignment.create({
        data: {
          workspaceId: ws.id,
          clientProfileId: profile.id,
          coachMemberId: coachMember.id,
          role: "PRIMARY",
          status: "ACTIVE",
        },
      });
    if (opts.assignAssistant !== false)
      await prisma.clientAssignment.create({
        data: {
          workspaceId: ws.id,
          clientProfileId: profile.id,
          coachMemberId: assistantMember.id,
          role: "COACH",
          status: "ACTIVE",
        },
      });

    const sessionOf = (userId: string): SessionLike => ({
      user: { id: userId },
    });
    return {
      ws,
      profile,
      template,
      version,
      setup,
      pin,
      ownerMember,
      coachMember,
      assistantMember,
      supportMember,
      clientMember,
      dualMember,
      owner: sessionOf(ownerUser.id),
      coach: sessionOf(coachUser.id),
      assistant: sessionOf(assistantUser.id),
      support: sessionOf(supportUser.id),
      client: sessionOf(clientUser.id),
      platformOnly: sessionOf(platformUser.id),
      dualAdmin: sessionOf(dualUser.id),
      outsider: sessionOf((await mkUser("x")).id),
    };
  }

  /** The client saves a real entry through the production write path. */
  async function clientSaves(
    c: Awaited<ReturnType<typeof seedWorkspace>>,
    date: string,
    weight: string,
  ) {
    const s = await loadDailyEntrySurface(
      c.client,
      { workspaceId: c.ws.id, entryDate: date },
      { registry: DEV_REGISTRY },
    );
    if (s.state !== "ready") throw new Error(`surface not ready: ${s.state}`);
    const r = await saveDailyEntry(
      c.client,
      {
        workspaceId: c.ws.id,
        entryDate: date,
        formToken: s.formToken,
        values: [
          { ordinal: 0, raw: weight },
          { ordinal: 1, raw: "7" },
          { ordinal: 2, raw: "0" },
          { ordinal: 3, raw: `note-${weight}` },
        ],
      },
      { registry: DEV_REGISTRY },
    );
    if (r.status !== "saved") throw new Error("seed save failed");
  }

  const readAuditCount = (profileId: string) =>
    prisma.auditEvent.count({
      where: {
        resourceType: "daily_entry",
        action: "READ",
        subjectClientProfileId: profileId,
      },
    });

  const listInput = (
    c: Awaited<ReturnType<typeof seedWorkspace>>,
    cursor?: string,
  ) => ({
    workspaceId: c.ws.id,
    clientProfileId: c.profile.id,
    cursor,
  });

  const detailInput = (
    c: Awaited<ReturnType<typeof seedWorkspace>>,
    entryDate: string,
  ) => ({
    workspaceId: c.ws.id,
    clientProfileId: c.profile.id,
    entryDate,
  });

  // ── List: authorization matrix ──────────────────────────────────────────

  // ── List: consent + pagination + audit-free ──────────────────────────────

  describe("list consent and paging", () => {
    it("missing consent hides headers; revoked consent hides headers; unconfigured registry fails closed", async () => {
      const noConsent = await seedWorkspace({ consent: false });
      const res0 = await listStaffDailyEntries(
        noConsent.owner,
        listInput(noConsent),
        { registry: DEV_REGISTRY },
      );
      expect(res0.state).toBe("consent_missing");

      const c = await seedWorkspace();
      await clientSaves(c, "2026-10-01", "75");
      await prisma.consentRecord.updateMany({
        where: { clientProfileId: c.profile.id },
        data: { revokedAt: new Date() },
      });
      const res1 = await listStaffDailyEntries(c.owner, listInput(c), {
        registry: DEV_REGISTRY,
      });
      expect(res1.state).toBe("consent_missing");

      const c2 = await seedWorkspace();
      await clientSaves(c2, "2026-10-01", "75");
      const res2 = await listStaffDailyEntries(c2.owner, listInput(c2), {
        /* no registry → unconfigured (production shape) */
      });
      expect(res2.state).toBe("consent_missing");
    });

    it("list reads create zero audit events", async () => {
      const c = await seedWorkspace();
      await clientSaves(c, "2026-10-01", "75");
      const before = await prisma.auditEvent.count({
        where: { subjectClientProfileId: c.profile.id },
      });
      for (const who of [c.owner, c.coach, c.assistant])
        await listStaffDailyEntries(who, listInput(c), {
          registry: DEV_REGISTRY,
        });
      expect(
        await prisma.auditEvent.count({
          where: { subjectClientProfileId: c.profile.id },
        }),
      ).toBe(before);
      expect(await readAuditCount(c.profile.id)).toBe(0);
    });

    it("newest-first bounded keyset pagination", async () => {
      const c = await seedWorkspace();
      const total = STAFF_ENTRY_PAGE_SIZE + 2;
      for (let i = 1; i <= total; i++) {
        const date = `2026-09-${String(i).padStart(2, "0")}`;
        await clientSaves(c, date, "70");
      }
      const p1 = await listStaffDailyEntries(c.owner, listInput(c), {
        registry: DEV_REGISTRY,
      });
      if (p1.state !== "ready") throw new Error("not ready");
      expect(p1.items).toHaveLength(STAFF_ENTRY_PAGE_SIZE);
      expect(p1.nextCursor).not.toBeNull();
      const dates = p1.items.map((i) => i.entryDate);
      expect(dates).toEqual([...dates].sort().reverse());
      expect(dates[0]).toBe(`2026-09-${String(total).padStart(2, "0")}`);

      const p2 = await listStaffDailyEntries(
        c.owner,
        listInput(c, p1.nextCursor ?? undefined),
        { registry: DEV_REGISTRY },
      );
      if (p2.state !== "ready") throw new Error("not ready");
      expect(p2.items).toHaveLength(total - STAFF_ENTRY_PAGE_SIZE);
      expect(p2.nextCursor).toBeNull();
      // No overlap between pages.
      const p1set = new Set(dates);
      for (const item of p2.items)
        expect(p1set.has(item.entryDate)).toBe(false);
    });

    it("malformed cursor is rejected; foreign cursor stays scoped", async () => {
      const c = await seedWorkspace();
      await clientSaves(c, "2026-10-01", "75");
      const other = await seedWorkspace();
      await clientSaves(other, "2026-10-02", "80");

      await expect(
        listStaffDailyEntries(c.owner, listInput(c, "not-a-date"), {
          registry: DEV_REGISTRY,
        }),
      ).rejects.toThrow(DailyEntryError);

      // A well-formed cursor copied from another client's page stays bound to
      // (workspace, client) and leaks nothing foreign.
      const res = await listStaffDailyEntries(
        c.owner,
        listInput(c, "2026-10-02"),
        { registry: DEV_REGISTRY },
      );
      if (res.state !== "ready") throw new Error("not ready");
      for (const item of res.items)
        expect(item.entryDate < "2026-10-02").toBe(true);
    });
  });

  // ── Detail: authorization + minimization + snapshot ─────────────────────

  // ── Detail: audit atomicity ──────────────────────────────────────────────

  describe("detail audit atomicity", () => {
    it("one committed detail read writes exactly one structural READ audit", async () => {
      const c = await seedWorkspace();
      await clientSaves(c, "2026-10-01", "75");
      const before = await readAuditCount(c.profile.id);
      await readStaffDailyEntryDetail(c.coach, detailInput(c, "2026-10-01"), {
        registry: DEV_REGISTRY,
      });
      expect(await readAuditCount(c.profile.id)).toBe(before + 1);
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: {
          resourceType: "daily_entry",
          action: "READ",
          subjectClientProfileId: c.profile.id,
        },
      });
      const entry = await prisma.dailyEntry.findFirstOrThrow({
        where: { clientProfileId: c.profile.id },
      });
      expect(audit.resourceId).toBe(entry.id);
      expect(audit.meta).toEqual({ changed: false });
      expect(audit.actorRole).toBe("COACH");
      expect(audit.workspaceId).toBe(c.ws.id);
      // No value/label/free-text material in the audit row (distinctive
      // sentinels — bare digits could collide with ids/timestamps).
      const raw = JSON.stringify(audit);
      expect(raw).not.toContain("note-75");
      expect(raw).not.toContain("Label");
      expect(raw).not.toContain("opt_");
    });

    it("a second committed read writes a second audit (at-least-once)", async () => {
      const c = await seedWorkspace();
      await clientSaves(c, "2026-10-01", "75");
      await readStaffDailyEntryDetail(c.owner, detailInput(c, "2026-10-01"), {
        registry: DEV_REGISTRY,
      });
      await readStaffDailyEntryDetail(c.owner, detailInput(c, "2026-10-01"), {
        registry: DEV_REGISTRY,
      });
      expect(await readAuditCount(c.profile.id)).toBe(2);
    });

    it("forced audit-write failure rolls back the detail (zero values, zero audit)", async () => {
      const c = await seedWorkspace();
      await clientSaves(c, "2026-10-01", "75");
      // A real DB-level failure for any audit insert on this workspace's
      // subject — the detail transaction must roll back with it.
      await prisma.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION p022_audit_fail() RETURNS trigger AS $$
         BEGIN RAISE EXCEPTION 'p022 forced audit failure'; END; $$ LANGUAGE plpgsql`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER p022_audit_fail_t BEFORE INSERT ON "audit_event"
         FOR EACH ROW EXECUTE FUNCTION p022_audit_fail()`,
      );
      try {
        await expect(
          readStaffDailyEntryDetail(c.owner, detailInput(c, "2026-10-01"), {
            registry: DEV_REGISTRY,
          }),
        ).rejects.toThrow();
        expect(await readAuditCount(c.profile.id)).toBe(0);
      } finally {
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS p022_audit_fail_t ON "audit_event"`,
        );
        await prisma.$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS p022_audit_fail()`,
        );
      }
    });
  });

  // ── Detail: serialization races ──────────────────────────────────────────


  // ── Query bounds ─────────────────────────────────────────────────────────

  describe("query bounds", () => {
    it("detail read stays bounded (no per-value N+1)", async () => {
      const c = await seedWorkspace();
      await clientSaves(c, "2026-10-01", "75");
      const counted = new PrismaClient({
        datasources: { db: { url: url as string } },
        log: [{ emit: "event", level: "query" }],
      });
      try {
        let queries = 0;
        let valueQueries = 0;
        counted.$on(
          "query" as never,
          ((e: { query: string }) => {
            queries += 1;
            if (e.query.includes("daily_entry_revision_value"))
              valueQueries += 1;
          }) as never,
        );
        await readStaffDailyEntryDetail(c.owner, detailInput(c, "2026-10-01"), {
          registry: DEV_REGISTRY,
          db: counted as PrismaClient,
        });
        // Advisories + row locks + authz + consent + entry/revision/version +
        // count + audit — a fixed count independent of value cardinality.
        expect(queries).toBeLessThanOrEqual(30);
        expect(valueQueries).toBeLessThanOrEqual(1);
      } finally {
        await counted.$disconnect();
      }
    });
  });
});
