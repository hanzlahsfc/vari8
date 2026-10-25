import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeRevisionCanonicalHash,
  type HashParam,
  type TaggedValue,
} from "../../lib/daily-entry/canonical";
import type { SeedContext } from "./index";

/**
 * Card 05 — daily-tracker week seed.
 *
 * Gives the seeded sign-in client (00-workspace links it to the first canvas
 * demo client profile) a full week of tracker content so the own daily-entry
 * surface has history without manual entry:
 *
 *   - One CoachingTemplate + version 1 whose definition carries five
 *     GENERAL_HEALTH parameters (measurement, rating 1-5, option, text,
 *     measurement with bounds) — the kind mix the client tracker renders.
 *   - One ParameterDefinition row per snapshot parameter (raw SQL coherence
 *     FKs on version parameters and revision values require real rows).
 *   - The client's ClientSetup plus one ACTIVE ClientSetupPin on that
 *     version, created only when the setup has no ACTIVE pin yet; when
 *     another seed/flow already pinned a version the seed binds to that pin
 *     instead of fighting it, and fills the week from that version's own
 *     snapshot so the rows always match the live surface.
 *   - Seven DailyEntry rows ending today, each with revision seq 1 and one
 *     typed value per snapshot parameter. Value columns follow the service's
 *     own mapping (measurement -> valueNumeric, rating -> valueRating,
 *     option -> valueOptionId, text -> valueText); canonicalHash is computed
 *     with the shared computeRevisionCanonicalHash helper.
 *
 * Synthetic only, deterministic `seed-de-*` ids; re-running skips entries
 * that already carry a current revision. Consent is not seeded: the D19
 * consent gate is parked (ENABLE_CONSENT_GATES off) and the read/write
 * paths short-circuit before touching consent_record.
 */

const WORKSPACE_SLUG = "canvas-demo";
const WEEK_DAYS = 7;

const SEED_PARAMETERS: Array<{
  id: string;
  key: string;
  kind: "MEASUREMENT" | "RATING" | "OPTION" | "TEXT";
  label: string;
  unit?: string;
  ratingScheme?: "SCALE_1_10" | "SCALE_1_5";
  options?: { optionId: string; label: string }[];
  validation?: { min: number; max: number };
}> = [
  {
    id: "seed-de-param-weight",
    key: "p_seed_weight",
    kind: "MEASUREMENT",
    label: "Morning weight",
    unit: "kg",
    validation: { min: 30, max: 300 },
  },
  {
    id: "seed-de-param-sleep",
    key: "p_seed_sleep",
    kind: "RATING",
    label: "Sleep quality",
    ratingScheme: "SCALE_1_5",
  },
  {
    id: "seed-de-param-energy",
    key: "p_seed_energy",
    kind: "OPTION",
    label: "Energy level",
    options: [
      { optionId: "seed-opt-low", label: "Low" },
      { optionId: "seed-opt-ok", label: "Okay" },
      { optionId: "seed-opt-high", label: "High" },
    ],
  },
  {
    id: "seed-de-param-steps",
    key: "p_seed_steps",
    kind: "MEASUREMENT",
    label: "Steps",
    validation: { min: 0, max: 100000 },
  },
  {
    id: "seed-de-param-note",
    key: "p_seed_note",
    kind: "TEXT",
    label: "Daily note",
  },
];

type SnapshotParam = {
  parameterId: string;
  parameterKey: string;
  kind: string;
  required: boolean;
  options: { optionId: string; label: string }[];
  validation: { min: number | null; max: number | null } | null;
  ratingScheme: string | null;
  dataClassification: string | null;
  snapshotRevision: number;
  sectionId: string;
  itemId: string;
};

// Mirrors the service's projectSnapshot ordering: sections by order, items
// by order — eligibility is evaluated by the service, not re-checked here.
function projectSnapshot(definition: unknown): SnapshotParam[] {
  const def = definition as {
    sections?: Array<{
      sectionId?: string;
      order?: number;
      items?: Array<{
        itemId?: string;
        parameterId?: string;
        parameterKey?: string;
        required?: boolean;
        order?: number;
      }>;
    }>;
    parameters?: Record<
      string,
      {
        key?: string;
        kind?: string;
        ratingScheme?: string | null;
        options?: Array<{ optionId?: string; label?: string }>;
        validation?: { min?: number | null; max?: number | null } | null;
        dataClassification?: string | null;
        revision?: number;
      }
    >;
  };
  const out: SnapshotParam[] = [];
  for (const section of [...(def.sections ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  )) {
    for (const item of [...(section.items ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    )) {
      const p = def.parameters?.[item.parameterId ?? ""];
      if (!item.parameterId || !item.itemId || !p) continue;
      out.push({
        parameterId: item.parameterId,
        parameterKey: item.parameterKey ?? p.key ?? "",
        kind: p.kind ?? "",
        required: item.required === true,
        ratingScheme: p.ratingScheme ?? null,
        options: (p.options ?? []).map((o) => ({
          optionId: String(o.optionId ?? ""),
          label: String(o.label ?? ""),
        })),
        validation:
          p.validation && typeof p.validation === "object"
            ? {
                min:
                  typeof p.validation.min === "number"
                    ? p.validation.min
                    : null,
                max:
                  typeof p.validation.max === "number"
                    ? p.validation.max
                    : null,
              }
            : null,
        dataClassification: p.dataClassification ?? null,
        snapshotRevision: typeof p.revision === "number" ? p.revision : 0,
        sectionId: String(section.sectionId ?? ""),
        itemId: item.itemId,
      });
    }
  }
  return out;
}

type DefinitionParameter = {
  key: string;
  kind: string;
  label: string;
  helpText: string | null;
  unit: string | null;
  ratingScheme: string | null;
  options: { optionId: string; label: string }[];
  validation: { min: number; max: number } | null;
  dataClassification: string;
  revision: number;
};

function templateDefinition() {
  const parameters: Record<string, DefinitionParameter> = {};
  for (const p of SEED_PARAMETERS) {
    parameters[p.id] = {
      key: p.key,
      kind: p.kind,
      label: p.label,
      helpText: null,
      unit: p.unit ?? null,
      ratingScheme: p.ratingScheme ?? null,
      options: p.options ?? [],
      validation: p.validation ?? null,
      dataClassification: "GENERAL_HEALTH",
      revision: 1,
    };
  }
  return {
    sections: [
      {
        sectionId: "seed-de-section-basics",
        order: 1,
        items: SEED_PARAMETERS.map((p, index) => ({
          itemId: `seed-de-item-${index + 1}`,
          parameterId: p.id,
          parameterKey: p.key,
          required: index < 3,
          order: index + 1,
        })),
      },
    ],
    parameters,
  };
}

function seedValueFor(
  p: SnapshotParam,
  dayIndex: number,
): { column: Record<string, unknown>; tagged: TaggedValue } {
  switch (p.kind) {
    case "MEASUREMENT": {
      const base =
        p.parameterKey === "p_seed_steps" ? 6200 + dayIndex * 480 : 78.4;
      const delta = p.parameterKey === "p_seed_steps" ? 0 : dayIndex * -0.12;
      const value = (base + delta).toFixed(2).replace(/\.?0+$/, "");
      return {
        column: { valueNumeric: value },
        tagged: { tag: "measurement", canonical: value },
      };
    }
    case "RATING": {
      const max = p.ratingScheme === "SCALE_1_10" ? 10 : 5;
      const value = 1 + (dayIndex % max);
      return {
        column: { valueRating: value },
        tagged: { tag: "rating", value },
      };
    }
    case "OPTION": {
      const option = p.options[dayIndex % Math.max(p.options.length, 1)];
      const optionId = option?.optionId ?? "";
      return {
        column: { valueOptionId: optionId },
        tagged: { tag: "option", optionId },
      };
    }
    case "TEXT": {
      const value = `Seed note for day ${dayIndex + 1} of the demo week.`;
      return { column: { valueText: value }, tagged: { tag: "text", value } };
    }
    default:
      return { column: {}, tagged: { tag: "absent" } };
  }
}

function isoDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  const workspace = await prisma.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true },
  });
  if (!workspace)
    throw new Error(
      `workspace ${WORKSPACE_SLUG} missing; run 00-workspace.seed.ts first`,
    );

  // The seeded sign-in client is linked to the first canvas demo profile.
  const dataPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../frontend/src/data/mock-data.json",
  );
  const firstClientName = (
    JSON.parse(readFileSync(dataPath, "utf8")) as {
      clients?: { name: string }[];
    }
  ).clients?.[0]?.name;
  if (!firstClientName)
    throw new Error("no canvas clients found for the week seed");
  const profile = await prisma.clientProfile.findFirst({
    where: { workspaceId: workspace.id, name: firstClientName },
    select: { id: true, userId: true },
  });
  if (!profile?.userId)
    throw new Error(
      `client profile "${firstClientName}" missing or unlinked; ` +
        "run 00/20 seeds first",
    );
  const clientMember = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: workspace.id,
      userId: profile.userId,
      role: "CLIENT",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const staffMember = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: workspace.id,
      role: { in: ["WORKSPACE_OWNER", "COACH"] },
      status: "ACTIVE",
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!clientMember || !staffMember)
    throw new Error("client/staff workspace members missing for the seed");

  // Parameter rows (raw SQL coherence FKs need real parameter_definition).
  for (const p of SEED_PARAMETERS) {
    await prisma.parameterDefinition.upsert({
      where: { workspaceId_key: { workspaceId: workspace.id, key: p.key } },
      update: {},
      create: {
        id: p.id,
        workspaceId: workspace.id,
        key: p.key,
        kind: p.kind,
        label: p.label,
        unit: p.unit ?? null,
        ratingScheme: p.ratingScheme ?? null,
        options: p.options ?? undefined,
        validation: p.validation ?? undefined,
        dataClassification: "GENERAL_HEALTH",
        createdByMemberId: staffMember.id,
        updatedByMemberId: staffMember.id,
      },
      select: { id: true },
    });
  }

  const template = await prisma.coachingTemplate.upsert({
    where: { id: "seed-de-template" },
    update: {},
    create: {
      id: "seed-de-template",
      workspaceId: workspace.id,
      name: "Seed daily tracking",
      description: "Synthetic week seed for the client tracker surface.",
      createdByMemberId: staffMember.id,
    },
    select: { id: true },
  });
  const version = await prisma.coachingTemplateVersion.upsert({
    where: {
      templateId_versionSeq: { templateId: template.id, versionSeq: 1 },
    },
    update: {},
    create: {
      id: "seed-de-tv-1",
      workspaceId: workspace.id,
      templateId: template.id,
      versionSeq: 1,
      definition: templateDefinition(),
      publishOriginRevision: 1,
      publishedByMemberId: staffMember.id,
    },
    select: { id: true, definition: true },
  });
  for (const p of SEED_PARAMETERS) {
    await prisma.coachingTemplateVersionParameter.upsert({
      where: {
        versionId_parameterId: {
          versionId: version.id,
          parameterId: p.id,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        templateId: template.id,
        versionId: version.id,
        parameterId: p.id,
      },
      select: { versionId: true },
    });
  }

  const setup =
    (await prisma.clientSetup.findFirst({
      where: { workspaceId: workspace.id, clientProfileId: profile.id },
      select: { id: true },
    })) ??
    (await prisma.clientSetup.create({
      data: {
        id: "seed-de-setup",
        workspaceId: workspace.id,
        clientProfileId: profile.id,
      },
      select: { id: true },
    }));

  // Bind to whatever pin is ACTIVE — never supersede another flow's pin.
  let pin = await prisma.clientSetupPin.findFirst({
    where: { clientSetupId: setup.id, status: "ACTIVE" },
    select: {
      id: true,
      templateVersionId: true,
      templateVersion: { select: { definition: true } },
    },
  });
  if (!pin) {
    const lastSeq = await prisma.clientSetupPin.aggregate({
      where: { clientSetupId: setup.id },
      _max: { seq: true },
    });
    pin = await prisma.clientSetupPin.create({
      data: {
        id: "seed-de-pin",
        clientSetupId: setup.id,
        workspaceId: workspace.id,
        clientProfileId: profile.id,
        seq: (lastSeq._max.seq ?? 0) + 1,
        templateId: template.id,
        templateVersionId: version.id,
        assignedByMemberId: staffMember.id,
      },
      select: {
        id: true,
        templateVersionId: true,
        templateVersion: { select: { definition: true } },
      },
    });
  }

  const snapshot = projectSnapshot(pin.templateVersion.definition);
  if (snapshot.length === 0)
    throw new Error("active pin's version has no projectable parameters");

  let created = 0;
  let skipped = 0;
  for (let dayIndex = 0; dayIndex < WEEK_DAYS; dayIndex += 1) {
    const dateIso = isoDaysAgo(WEEK_DAYS - 1 - dayIndex);
    const entryDate = new Date(`${dateIso}T00:00:00Z`);
    const entry = await prisma.dailyEntry.upsert({
      where: {
        workspaceId_clientProfileId_entryDate: {
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          entryDate,
        },
      },
      update: {},
      create: {
        id: `seed-de-entry-${dateIso}`,
        workspaceId: workspace.id,
        clientProfileId: profile.id,
        entryDate,
        createdByMemberId: clientMember.id,
      },
      select: { id: true, currentRevisionId: true },
    });
    if (entry.currentRevisionId) {
      skipped += 1;
      continue;
    }
    const hashParams: HashParam[] = [];
    const valueRows: PrismaValueRow[] = [];
    for (const p of snapshot) {
      const { column, tagged } = seedValueFor(p, dayIndex);
      if (tagged.tag === "absent") continue;
      hashParams.push({
        parameterId: p.parameterId,
        parameterKey: p.parameterKey,
        dataClassification: p.dataClassification,
        kind: p.kind,
        snapshotRevision: p.snapshotRevision,
        sectionId: p.sectionId,
        itemId: p.itemId,
        value: tagged,
      });
      valueRows.push({
        revisionId: `seed-de-rev-${dateIso}-1`,
        workspaceId: workspace.id,
        parameterId: p.parameterId,
        kind: p.kind as PrismaValueRow["kind"],
        ...column,
      });
    }
    const revision = await prisma.dailyEntryRevision.create({
      data: {
        id: `seed-de-rev-${dateIso}-1`,
        dailyEntryId: entry.id,
        workspaceId: workspace.id,
        clientProfileId: profile.id,
        clientSetupPinId: pin.id,
        templateVersionId: pin.templateVersionId,
        seq: 1,
        canonicalHash: computeRevisionCanonicalHash({
          pinId: pin.id,
          templateVersionId: pin.templateVersionId,
          params: hashParams,
        }),
        declaredAt: new Date(`${dateIso}T12:00:00Z`),
        createdByMemberId: clientMember.id,
      },
      select: { id: true },
    });
    for (const row of valueRows) {
      row.revisionId = revision.id;
      await prisma.dailyEntryRevisionValue.create({ data: row });
    }
    await prisma.dailyEntry.update({
      where: { id: entry.id },
      data: { currentRevisionId: revision.id },
    });
    created += 1;
  }
  console.log(
    `[seed] daily entries: ${created} day(s) written, ${skipped} already current`,
  );
}

type PrismaValueRow = {
  revisionId: string;
  workspaceId: string;
  parameterId: string;
  kind: "MEASUREMENT" | "RATING" | "OPTION" | "TEXT";
  valueNumeric?: string;
  valueRating?: number;
  valueOptionId?: string;
  valueText?: string;
};
