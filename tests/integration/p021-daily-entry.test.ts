import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DAILY_ENTRY_DEV_CONSENT,
  loadDailyEntrySurface,
  saveDailyEntry,
} from "../../lib/daily-entry/service";
import { createDailyEntryImpactProvider } from "../../lib/coaching/daily-entry-impact";
import { createStaticConsentPolicy } from "../../lib/consent";
import type { SessionLike } from "../../lib/auth/guard";

/**
 * P-021 — DailyEntry persistence (decisions #64–#78, P-021-R2/R3) on a
 * dedicated disposable PostgreSQL database (INTEGRATION_DATABASE_URL).
 * Synthetic fixtures only.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: DAILY_ENTRY_DEV_CONSENT.PRIVACY_NOTICE,
  HEALTH_DATA: DAILY_ENTRY_DEV_CONSENT.HEALTH_DATA,
});

describe.skipIf(!enabled)("P-021 DailyEntry (real PG)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "daily_entry_revision_value","daily_entry_revision","daily_entry","audit_event","client_setup_pin","client_setup","consent_record","coaching_template_version_parameter","coaching_template_version","coaching_template","parameter_definition","client_assignment","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `p021_${++n}_${Date.now()}`;

  const PARAM_DEF = (
    id: string,
    kind: string,
    extra: Record<string, unknown> = {},
  ) => ({
    key: `p_${id}`,
    kind,
    label: `Label ${id}`,
    helpText: null,
    unit: kind === "MEASUREMENT" ? "kg" : null,
    ratingScheme: kind === "RATING" ? "SCALE_1_10" : null,
    options:
      kind === "OPTION"
        ? [
            { optionId: `opt_${id}_a`, label: "A" },
            { optionId: `opt_${id}_b`, label: "B" },
          ]
        : [],
    validation: kind === "MEASUREMENT" ? { min: 0, max: 500 } : null,
    group: null,
    dataClassification: "GENERAL_HEALTH",
    revision: 1,
    ...extra,
  });

  function versionDef(
    params: Array<{
      id: string;
      kind: string;
      required?: boolean;
      extra?: Record<string, unknown>;
    }>,
  ) {
    const parameters: Record<string, unknown> = {};
    const items = params.map((p, i) => ({
      itemId: `itm_${p.id}`,
      parameterId: p.id,
      parameterKey: `p_${p.id}`,
      required: p.required ?? false,
      order: i,
    }));
    for (const p of params)
      parameters[p.id] = PARAM_DEF(p.id, p.kind, p.extra ?? {});
    return {
      title: "T",
      sections: [{ sectionId: "sec_main", label: "Main", order: 0, items }],
      parameters,
    };
  }

  /** Creates workspace, owner, client user+member+profile, params, template,
   * version, setup + ACTIVE pin, and both dev consent rows. */
  async function seedClient(
    params: Array<{
      id: string;
      kind: string;
      required?: boolean;
      extra?: Record<string, unknown>;
    }> = [
      { id: "pd_w", kind: "MEASUREMENT", required: true },
      { id: "pd_m", kind: "RATING" },
      { id: "pd_l", kind: "OPTION" },
      { id: "pd_n", kind: "TEXT" },
    ],
    opts: { consent?: boolean; pin?: boolean } = {},
  ) {
    const tag = uid();
    const ws = await prisma.workspace.create({
      data: { slug: `w-${tag}`, name: tag, status: "ACTIVE" },
    });
    const mkUser = async (suffix: string) =>
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
    const mkMember = (
      userId: string,
      role: "WORKSPACE_OWNER" | "COACH" | "CLIENT",
    ) =>
      prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId, role, status: "ACTIVE" },
      });
    const ownerMember = await mkMember(ownerUser.id, "WORKSPACE_OWNER");
    const clientMember = await mkMember(clientUser.id, "CLIENT");
    const profile = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: clientUser.id, name: "C" },
    });
    const paramIds = params.map((p) => `${p.id}_${tag}`);
    const versionParams = params.map((p, i) => ({
      ...p,
      id: paramIds[i],
    }));
    for (const p of versionParams) {
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
        definition: versionDef(versionParams) as never,
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
      for (const [kind, version] of [
        ["PRIVACY_NOTICE", DAILY_ENTRY_DEV_CONSENT.PRIVACY_NOTICE],
        ["HEALTH_DATA", DAILY_ENTRY_DEV_CONSENT.HEALTH_DATA],
      ] as const)
        await prisma.consentRecord.create({
          data: { clientProfileId: profile.id, kind, version },
        });
    }
    const session: SessionLike = { user: { id: clientUser.id } };
    return {
      ws,
      ownerMember,
      clientMember,
      clientUser,
      profile,
      template,
      version,
      setup,
      pin,
      session,
      paramIds,
    };
  }

  const DATE = "2026-10-01";

  // ── Schema constraints (raw SQL) ────────────────────────────────────────

  describe("schema constraints", () => {
    it("pointer FK binds revision to its own entry (cross-entry rejected)", async () => {
      const c = await seedClient();
      const mkEntry = async () =>
        prisma.dailyEntry.create({
          data: {
            workspaceId: c.ws.id,
            clientProfileId: c.profile.id,
            entryDate: new Date(DATE),
            createdByMemberId: c.clientMember.id,
          },
        });
      const e1 = await mkEntry();
      const e2 = await prisma.dailyEntry.create({
        data: {
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          entryDate: new Date("2026-10-02"),
          createdByMemberId: c.clientMember.id,
        },
      });
      const rev = await prisma.dailyEntryRevision.create({
        data: {
          dailyEntryId: e1.id,
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          clientSetupPinId: c.pin!.id,
          templateVersionId: c.version.id,
          seq: 1,
          canonicalHash: "h1",
          declaredAt: new Date(),
          createdByMemberId: c.clientMember.id,
        },
      });
      // Correct pointer — own revision.
      await prisma.dailyEntry.update({
        where: { id: e1.id },
        data: { currentRevisionId: rev.id },
      });
      // Cross-entry pointer must be rejected.
      await expect(
        prisma.dailyEntry.update({
          where: { id: e2.id },
          data: { currentRevisionId: rev.id },
        }),
      ).rejects.toThrow();
    });

    it("rejects a revision with cross-workspace/pin/client mismatch", async () => {
      const a = await seedClient();
      const b = await seedClient();
      const e = await prisma.dailyEntry.create({
        data: {
          workspaceId: a.ws.id,
          clientProfileId: a.profile.id,
          entryDate: new Date(DATE),
          createdByMemberId: a.clientMember.id,
        },
      });
      // revision claiming b's workspace
      await expect(
        prisma.dailyEntryRevision.create({
          data: {
            dailyEntryId: e.id,
            workspaceId: b.ws.id,
            clientProfileId: a.profile.id,
            clientSetupPinId: a.pin!.id,
            templateVersionId: a.version.id,
            seq: 1,
            canonicalHash: "h",
            declaredAt: new Date(),
            createdByMemberId: a.clientMember.id,
          },
        }),
      ).rejects.toThrow();
      // revision claiming b's pin (cross-client)
      await expect(
        prisma.dailyEntryRevision.create({
          data: {
            dailyEntryId: e.id,
            workspaceId: a.ws.id,
            clientProfileId: a.profile.id,
            clientSetupPinId: b.pin!.id,
            templateVersionId: b.version.id,
            seq: 2,
            canonicalHash: "h",
            declaredAt: new Date(),
            createdByMemberId: a.clientMember.id,
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects entry/revision creator from another workspace", async () => {
      const a = await seedClient();
      const b = await seedClient();
      await expect(
        prisma.dailyEntry.create({
          data: {
            workspaceId: a.ws.id,
            clientProfileId: a.profile.id,
            entryDate: new Date(DATE),
            createdByMemberId: b.clientMember.id,
          },
        }),
      ).rejects.toThrow();
    });

    it("entry cardinality: one per (workspace, client, date)", async () => {
      const c = await seedClient();
      await prisma.dailyEntry.create({
        data: {
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          entryDate: new Date(DATE),
          createdByMemberId: c.clientMember.id,
        },
      });
      await expect(
        prisma.dailyEntry.create({
          data: {
            workspaceId: c.ws.id,
            clientProfileId: c.profile.id,
            entryDate: new Date(DATE),
            createdByMemberId: c.clientMember.id,
          },
        }),
      ).rejects.toThrow();
    });

    it("value CHECK enforces exactly-one-kind column", async () => {
      const c = await seedClient();
      const e = await prisma.dailyEntry.create({
        data: {
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          entryDate: new Date(DATE),
          createdByMemberId: c.clientMember.id,
        },
      });
      const rev = await prisma.dailyEntryRevision.create({
        data: {
          dailyEntryId: e.id,
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          clientSetupPinId: c.pin!.id,
          templateVersionId: c.version.id,
          seq: 1,
          canonicalHash: "h",
          declaredAt: new Date(),
          createdByMemberId: c.clientMember.id,
        },
      });
      // valid measurement row
      await prisma.dailyEntryRevisionValue.create({
        data: {
          revisionId: rev.id,
          workspaceId: c.ws.id,
          parameterId: c.paramIds[0],
          kind: "MEASUREMENT",
          valueNumeric: "75.5",
        },
      });
      // MEASUREMENT row with a rating column → CHECK violation
      await expect(
        prisma.dailyEntryRevisionValue.create({
          data: {
            revisionId: rev.id,
            workspaceId: c.ws.id,
            parameterId: c.paramIds[1],
            kind: "MEASUREMENT",
            valueRating: 5,
          },
        }),
      ).rejects.toThrow();
      // unsupported kind cannot produce a row
      await expect(
        prisma.dailyEntryRevisionValue.create({
          data: {
            revisionId: rev.id,
            workspaceId: c.ws.id,
            parameterId: c.paramIds[1],
            kind: "TIME",
            valueNumeric: "1",
          },
        }),
      ).rejects.toThrow();
      // one value per (revision, parameter)
      await expect(
        prisma.dailyEntryRevisionValue.create({
          data: {
            revisionId: rev.id,
            workspaceId: c.ws.id,
            parameterId: c.paramIds[0],
            kind: "MEASUREMENT",
            valueNumeric: "80",
          },
        }),
      ).rejects.toThrow();
    });
  });

  // ── Service: save lifecycle ─────────────────────────────────────────────

  async function surface(
    session: SessionLike,
    wsId: string,
    date = DATE,
    registry = DEV_REGISTRY,
  ) {
    return loadDailyEntrySurface(
      session,
      { workspaceId: wsId, entryDate: date },
      { registry },
    );
  }

  // ── C2 provider ─────────────────────────────────────────────────────────

  describe("daily-entry C2 impact provider", () => {
    it("counts distinct entries once across superseded revisions", async () => {
      // Deterministic "75" inside an allowed identifier: the parameter id is
      // pd_75_<tag>, proving allowed IDs may contain that substring.
      const c = await seedClient([
        { id: "pd_75", kind: "MEASUREMENT", required: true },
      ]);
      // two entries; pd_w appears in both revisions of entry 1 and in entry 2
      for (const [date, val] of [
        ["2026-10-01", "75"],
        ["2026-10-01", "76"], // edit → second revision, same entry
        ["2026-10-02", "77"],
      ] as const) {
        const s = await surface(c.session, c.ws.id, date);
        if (s.state !== "ready") throw new Error("not ready");
        await saveDailyEntry(
          c.session,
          {
            workspaceId: c.ws.id,
            entryDate: date,
            formToken: s.formToken,
            values: [{ ordinal: 0, raw: val }],
          },
          { registry: DEV_REGISTRY },
        );
      }
      const provider = createDailyEntryImpactProvider(prisma, c.profile.id);
      const out = await provider.evaluate({
        direction: "UPGRADE",
        removed: [
          {
            parameterId: c.paramIds[0],
            parameterKey: `p_${c.paramIds[0]}`,
          },
        ],
        reboundFrom: [],
        reboundTo: [],
      });
      // Exact structural contract: the whole output equals this shape —
      // every permitted field pinned, any unauthorized field (raw answer
      // value, label, unit, option payload, free text) fails the match.
      // count "2": two logical entries, not three revisions.
      expect(out).toStrictEqual({
        consumerKey: "daily-entry",
        contractVersion: 1,
        affectedParameters: [
          {
            parameterId: c.paramIds[0],
            parameterKey: `p_${c.paramIds[0]}`,
            impactRole: "REMOVED",
            reasonCode: "REMOVED_WITH_HISTORY",
            count: "2",
            earliestDate: "2026-10-01",
            latestDate: "2026-10-02",
          },
        ],
        blockedReasonCodes: [],
      });
    });
  });
});
