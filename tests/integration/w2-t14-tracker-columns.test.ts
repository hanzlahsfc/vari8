import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError, type SessionLike } from "../../lib/auth/guard";
import { createStaticConsentPolicy } from "../../lib/consent";
import {
  DAILY_ENTRY_DEV_CONSENT,
  loadOwnTrackerColumns,
  loadStaffTrackerColumns,
} from "../../lib/daily-entry/service";

/**
 * w2-t14 - tracker column groups read model on a dedicated disposable
 * PostgreSQL database (INTEGRATION_DATABASE_URL). Synthetic fixtures only.
 * Proves: own/staff pin resolution, template-owned grouping, section/item
 * ordering by (order ?? 0), definition-array tie-break, nullable decimals /
 * summary / max projection, scope denial, and unavailable states.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: DAILY_ENTRY_DEV_CONSENT.PRIVACY_NOTICE,
  HEALTH_DATA: DAILY_ENTRY_DEV_CONSENT.HEALTH_DATA,
});

type ReadyResult = {
  state: "ready";
  templateVersionId: string;
  groups: Array<{
    group: string | null;
    columns: Array<{
      key: string;
      label: string;
      unit: string | null;
      decimals: number | null;
      summary: string | null;
      group: string | null;
      sectionId: string;
      order: number;
      type: string;
      max: number | null;
    }>;
  }>;
};

describe.skipIf(!enabled)("w2-t14 tracker column groups (real PG)", () => {
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
  const uid = () => `w2t14_${++n}_${Date.now()}`;

  const PARAM = (
    key: string,
    kind: string,
    extra: Record<string, unknown> = {},
  ) => ({
    key,
    kind,
    label: `Label ${key}`,
    helpText: null,
    unit: kind === "MEASUREMENT" ? "kg" : null,
    ratingScheme: kind === "RATING" ? "SCALE_1_10" : null,
    options:
      kind === "OPTION"
        ? [
            { optionId: `opt_${key}_a`, label: "A" },
            { optionId: `opt_${key}_b`, label: "B" },
          ]
        : [],
    validation: null,
    group: null,
    dataClassification: "GENERAL_HEALTH",
    revision: 1,
    ...extra,
  });

  /** Pinned definition exercising: section (order ?? 0) sort incl. absent
   * order, item (order ?? 0) sort, two equal-order array ties (item ids
   * deliberately anti-alphabetical so a key-sorted mutant flips), template
   * group labels shared across sections, and a null-group parameter. */
  function columnsDefinition() {
    return {
      title: "T",
      sections: [
        {
          sectionId: "sec_hi",
          label: "High",
          order: 10,
          items: [
            {
              itemId: "z_slp",
              parameterId: "pd_sleep",
              parameterKey: "sleep",
              required: false,
            },
            {
              itemId: "m_kcal",
              parameterId: "pd_kcal",
              parameterKey: "kcal",
              required: false,
              order: 4,
            },
            {
              itemId: "a_str",
              parameterId: "pd_stress",
              parameterKey: "stress",
              required: false,
            },
          ],
        },
        {
          sectionId: "sec_mid",
          label: "Mid",
          order: 5,
          items: [
            {
              itemId: "z_w",
              parameterId: "pd_weight",
              parameterKey: "weight",
              required: false,
              order: 2,
            },
            {
              itemId: "a_bp",
              parameterId: "pd_bp",
              parameterKey: "bp",
              required: false,
              order: 2,
            },
            {
              itemId: "m_mood",
              parameterId: "pd_mood",
              parameterKey: "mood",
              required: false,
              order: 9,
            },
          ],
        },
        {
          sectionId: "sec_lo",
          label: "Low",
          items: [
            {
              itemId: "i_note",
              parameterId: "pd_note",
              parameterKey: "note",
              required: false,
            },
          ],
        },
      ],
      parameters: {
        pd_note: PARAM("note", "TEXT", { label: "Day note", group: "Notes" }),
        pd_weight: PARAM("weight", "MEASUREMENT", {
          label: "Body weight",
          group: "Body",
          decimals: 1,
          summary: "avg",
          validation: { min: 0, max: 300 },
        }),
        pd_bp: PARAM("bp", "MEASUREMENT", {
          label: "Blood pressure",
          unit: "mmHg",
          group: "Body",
        }),
        pd_mood: PARAM("mood", "RATING", { label: "Mood", group: "Mind" }),
        pd_sleep: PARAM("sleep", "RATING", {
          label: "Sleep quality",
          ratingScheme: "SCALE_1_5",
        }),
        pd_stress: PARAM("stress", "TEXT", {
          label: "Stress note",
          group: "Mind",
        }),
        pd_kcal: PARAM("kcal", "MEASUREMENT", {
          label: "Calories",
          unit: "kcal",
          group: "Body",
          decimals: 0,
          summary: "sum",
          validation: { min: 0, max: 6000 },
        }),
      },
    };
  }

  /** Creates workspace + owner + client (profile, setup, ACTIVE pin to a
   * version carrying `definition`, dev consent rows) and staff fixtures. */
  async function seedClient(
    opts: {
      definition?: unknown;
      pin?: boolean;
      consent?: boolean;
      staff?: boolean;
      foreignClient?: boolean;
    } = {},
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
      role: "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "CLIENT",
    ) =>
      prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId, role, status: "ACTIVE" },
      });
    const ownerMember = await mkMember(ownerUser.id, "WORKSPACE_OWNER");
    await mkMember(clientUser.id, "CLIENT");
    const profile = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: clientUser.id, name: "C" },
    });
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
        definition: (opts.definition ?? columnsDefinition()) as never,
        publishOriginRevision: 1,
        publishedByMemberId: ownerMember.id,
      },
    });
    if (opts.pin !== false) {
      const setup = await prisma.clientSetup.create({
        data: { workspaceId: ws.id, clientProfileId: profile.id },
      });
      await prisma.clientSetupPin.create({
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
      for (const [kind, consentVersion] of [
        ["PRIVACY_NOTICE", DAILY_ENTRY_DEV_CONSENT.PRIVACY_NOTICE],
        ["HEALTH_DATA", DAILY_ENTRY_DEV_CONSENT.HEALTH_DATA],
      ] as const)
        await prisma.consentRecord.create({
          data: { clientProfileId: profile.id, kind, version: consentVersion },
        });
    }
    const staff: {
      coachSession?: SessionLike;
      assistantSession?: SessionLike;
      unassignedAssistantSession?: SessionLike;
    } = {};
    if (opts.staff) {
      const coachUser = await mkUser("coach");
      await mkMember(coachUser.id, "COACH");
      staff.coachSession = { user: { id: coachUser.id } };
      const assistantUser = await mkUser("asst");
      const assistantMember = await mkMember(
        assistantUser.id,
        "ASSISTANT_COACH",
      );
      await prisma.clientAssignment.create({
        data: {
          workspaceId: ws.id,
          clientProfileId: profile.id,
          coachMemberId: assistantMember.id,
          role: "COACH",
        },
      });
      staff.assistantSession = { user: { id: assistantUser.id } };
      const strayUser = await mkUser("asst2");
      await mkMember(strayUser.id, "ASSISTANT_COACH");
      staff.unassignedAssistantSession = { user: { id: strayUser.id } };
    }
    let foreignProfile = null;
    let foreignSession: SessionLike | undefined;
    if (opts.foreignClient) {
      const foreignUser = await mkUser("c2");
      await mkMember(foreignUser.id, "CLIENT");
      foreignProfile = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, userId: foreignUser.id, name: "C2" },
      });
      foreignSession = { user: { id: foreignUser.id } };
    }
    return {
      ws,
      ownerMember,
      version,
      profile,
      foreignProfile,
      clientSession: { user: { id: clientUser.id } } as SessionLike,
      ownerSession: { user: { id: ownerUser.id } } as SessionLike,
      foreignSession,
      ...staff,
    };
  }

  it("own read resolves the caller's active pin and returns template-owned grouped columns", async () => {
    const s = await seedClient();
    const result = (await loadOwnTrackerColumns(
      s.clientSession,
      {
        workspaceId: s.ws.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    )) as ReadyResult;
    expect(result.state).toBe("ready");
    expect(result.templateVersionId).toBe(s.version.id);
    // First-appearance group order from the snapshot stream - NOT locale sort.
    expect(result.groups.map((g) => g.group)).toEqual([
      "Notes",
      "Body",
      "Mind",
      null,
    ]);
    const byGroup = Object.fromEntries(
      result.groups.map((g) => [String(g.group), g.columns.map((c) => c.key)]),
    );
    expect(byGroup.Notes).toEqual(["note"]);
    // weight before bp: equal order (2) keeps definition array order
    // (itemId z_w precedes a_bp in the array despite sorting after it).
    expect(byGroup.Body).toEqual(["weight", "bp", "kcal"]);
    expect(byGroup.Mind).toEqual(["mood", "stress"]);
    expect(byGroup.null).toEqual(["sleep"]);
    // Cross-section stream order inside the Body bucket: kcal's section sorts
    // last, so kcal trails bp even though Body spans both sections.
    const weight = result.groups[1].columns[0];
    expect(weight).toMatchObject({
      key: "weight",
      label: "Body weight",
      unit: "kg",
      decimals: 1,
      summary: "avg",
      group: "Body",
      sectionId: "sec_mid",
      order: 2,
      type: "MEASUREMENT",
      max: 300,
    });
    const kcal = result.groups[1].columns[2];
    expect(kcal).toMatchObject({
      sectionId: "sec_hi",
      order: 4,
      max: 6000,
      decimals: 0,
      summary: "sum",
    });
    const sleep = result.groups[3].columns[0];
    expect(sleep).toMatchObject({
      key: "sleep",
      group: null,
      sectionId: "sec_hi",
      order: 0,
      type: "RATING",
      max: null,
      decimals: null,
      summary: null,
    });
    const mood = result.groups[2].columns[0];
    expect(mood).toMatchObject({ order: 9, max: null, decimals: null });
    // Deterministic for the same pin.
    const again = await loadOwnTrackerColumns(
      s.clientSession,
      {
        workspaceId: s.ws.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    );
    expect(again).toEqual(result);
  });

  it("orders items inside one section and one group by declared order, not array order", async () => {
    // Mutation guard for the item sort: both items share the section and the
    // group while the definition array holds `late` (order 20) before `early`
    // (order 5), so only the declared (order ?? 0) sort emits `early` first.
    const s = await seedClient({
      definition: {
        title: "pair",
        sections: [
          {
            sectionId: "sec_pair",
            label: "Pair",
            items: [
              {
                itemId: "z_late",
                parameterId: "pd_late",
                parameterKey: "late",
                required: false,
                order: 20,
              },
              {
                itemId: "a_early",
                parameterId: "pd_early",
                parameterKey: "early",
                required: false,
                order: 5,
              },
            ],
          },
        ],
        parameters: {
          pd_late: PARAM("late", "MEASUREMENT", {
            label: "Late metric",
            group: "Probe",
          }),
          pd_early: PARAM("early", "MEASUREMENT", {
            label: "Early metric",
            group: "Probe",
          }),
        },
      },
    });
    const result = (await loadOwnTrackerColumns(
      s.clientSession,
      {
        workspaceId: s.ws.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    )) as ReadyResult;
    expect(result.state).toBe("ready");
    expect(result.groups).toEqual([
      {
        group: "Probe",
        columns: [
          expect.objectContaining({ key: "early", order: 5 }),
          expect.objectContaining({ key: "late", order: 20 }),
        ],
      },
    ]);
  });

  it("staff read returns the same pinned groups for a named client", async () => {
    const s = await seedClient({ staff: true });
    const own = (await loadOwnTrackerColumns(
      s.clientSession,
      {
        workspaceId: s.ws.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    )) as ReadyResult;
    for (const session of [
      s.ownerSession,
      s.coachSession,
      s.assistantSession,
    ]) {
      const result = (await loadStaffTrackerColumns(
        session,
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
        },
        { db: prisma, registry: DEV_REGISTRY },
      )) as ReadyResult;
      expect(result.state).toBe("ready");
      expect(result.templateVersionId).toBe(s.version.id);
      expect(result.groups).toEqual(own.groups);
    }
  });

  it("denies client callers and unassigned staff before any read", async () => {
    const s = await seedClient({ staff: true, foreignClient: true });
    // Client own scope reaches authorize but is not workspace|assigned.
    await expect(
      loadStaffTrackerColumns(
        s.clientSession,
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
        },
        { db: prisma, registry: DEV_REGISTRY },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Foreign clientProfileId is denied inside authorize (not_owner).
    await expect(
      loadStaffTrackerColumns(
        s.clientSession,
        {
          workspaceId: s.ws.id,
          clientProfileId: s.foreignProfile!.id,
        },
        { db: prisma, registry: DEV_REGISTRY },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // The foreign client reading ITS OWN profile via the staff path: still
    // denied (own scope is not staff scope).
    await expect(
      loadStaffTrackerColumns(
        s.foreignSession!,
        {
          workspaceId: s.ws.id,
          clientProfileId: s.foreignProfile!.id,
        },
        { db: prisma, registry: DEV_REGISTRY },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Unassigned assistant coach: grantedScope resolves but no assignment.
    await expect(
      loadStaffTrackerColumns(
        s.unassignedAssistantSession!,
        {
          workspaceId: s.ws.id,
          clientProfileId: s.profile.id,
        },
        { db: prisma, registry: DEV_REGISTRY },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // A staff caller naming a profile outside the workspace is denied.
    await expect(
      loadStaffTrackerColumns(
        s.ownerSession,
        {
          workspaceId: s.ws.id,
          clientProfileId: "clp_does_not_exist",
        },
        { db: prisma, registry: DEV_REGISTRY },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("reports unavailable when the client has no active pin", async () => {
    const s = await seedClient({ pin: false });
    const own = await loadOwnTrackerColumns(
      s.clientSession,
      {
        workspaceId: s.ws.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    );
    expect(own.state).toBe("unavailable");
    const staff = await loadStaffTrackerColumns(
      s.ownerSession,
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    );
    expect(staff.state).toBe("unavailable");
  });

  it("refuses a pin the daily-entry form would reject", async () => {
    const s = await seedClient({
      definition: {
        title: "bad",
        sections: [
          {
            sectionId: "s",
            items: [
              {
                itemId: "i",
                parameterId: "pd_x",
                parameterKey: "x",
                required: false,
              },
            ],
          },
        ],
        parameters: {
          pd_x: {
            key: "x",
            kind: "WIDGET",
            label: "X",
            dataClassification: "GENERAL_HEALTH",
          },
        },
      },
    });
    const own = await loadOwnTrackerColumns(
      s.clientSession,
      {
        workspaceId: s.ws.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    );
    expect(own.state).toBe("ineligible");
    const staff = await loadStaffTrackerColumns(
      s.ownerSession,
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    );
    expect(staff.state).toBe("ineligible");
  });

  it("reports consent_missing when required consent rows are absent", async () => {
    const s = await seedClient({ consent: false });
    const own = await loadOwnTrackerColumns(
      s.clientSession,
      {
        workspaceId: s.ws.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    );
    expect(own.state).toBe("consent_missing");
    const staff = await loadStaffTrackerColumns(
      s.ownerSession,
      {
        workspaceId: s.ws.id,
        clientProfileId: s.profile.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    );
    expect(staff.state).toBe("consent_missing");
  });

  it("reports not_applicable for a caller without a client profile", async () => {
    const s = await seedClient();
    const own = await loadOwnTrackerColumns(
      s.ownerSession,
      {
        workspaceId: s.ws.id,
      },
      { db: prisma, registry: DEV_REGISTRY },
    );
    expect(own.state).toBe("not_applicable");
  });
});
