import { templateDefinitionSlots } from "@/lib/db-types/template-slots";
import type { ClientPlans } from "@/components/canvas/coach/plans/types";
import type { SupplementPlan } from "@/components/canvas/coach/supplements/model";
import type {
  ActivityMetric,
  ActivityTargetVersion,
} from "@/components/canvas/coach/targets/model";
import {
  type Assignment,
  type CoachClient,
  type FieldConfig,
  getParameter,
  type Variant,
} from "@/components/canvas/coach/model";

/**
 * Card w2-c1: the real client shell resolves the coach's variant from the
 * signed-in client's active template version definition. The optional
 * `modules` slot on that definition (lib/db-types/template-slots.ts) mirrors
 * the canvas Variant: when a coach published views/habits they are
 * authoritative; a definition that predates the slot keeps every section the
 * registry knows, because nothing was ever disabled on it.
 *
 * Card w2-c4: the roadmap plan part reads the same definition's `fields`,
 * `roadmap` and `roadmapActivityTargets` slots (the canvas write schema
 * serializes them on publish). Parameter ids are validated against the
 * canvas parameter registry so a malformed row drops out rather than
 * rendering a dead column.
 *
 * These helpers are pure so the section contract is unit-testable; the page
 * supplies the definition JSON and the data-presence counts.
 */

export type ClientAppConfig = {
  views: string[];
  habits: boolean;
  nutrition: "Meal plan" | "IIFYM";
  fields: FieldConfig[];
  roadmap: Variant["roadmap"];
  roadmapActivityTargets: ActivityMetric[] | undefined;
};

const DEFAULT_CLIENT_VIEWS = [
  "Dashboard",
  "Tracker",
  "Nutrition",
  "Timeline / Roadmap",
  "Training Program",
  "Check-In",
];

export function clientConfigFromDefinition(
  definition: unknown,
): ClientAppConfig {
  const parsed = templateDefinitionSlots.safeParse(
    typeof definition === "object" && definition !== null ? definition : {},
  );
  const slots = parsed.success ? parsed.data : {};
  return {
    views: slots.modules?.views ?? [...DEFAULT_CLIENT_VIEWS],
    habits: slots.modules?.habits ?? false,
    nutrition: slots.nutritionMode === "IIFYM" ? "IIFYM" : "Meal plan",
    fields: (slots.fields ?? []).flatMap((field) =>
      getParameter(field.id)
        ? [
            {
              id: field.id,
              unit: field.unit,
              ...(field.options !== undefined
                ? { options: field.options }
                : {}),
            },
          ]
        : [],
    ),
    roadmap: (slots.roadmap ?? []).flatMap((metric) =>
      getParameter(metric.source)
        ? [
            {
              source: metric.source,
              calculation: metric.calculation,
              comparison: metric.comparison,
            },
          ]
        : [],
    ),
    roadmapActivityTargets: slots.roadmapActivityTargets,
  };
}

/**
 * Plan-part presence for `clientAppSections`: only existence and count matter
 * (the section registry checks `supplements !== undefined` and
 * `activityTargets.length`), so the real rows are fetched by the remote
 * section components themselves, not here.
 */
export function clientPlansPresence(presence: {
  hasSupplementPlan?: boolean;
  activityTargetCount?: number;
}): Pick<ClientPlans, "supplements" | "activityTargets"> {
  return {
    supplements: presence.hasSupplementPlan
      ? ({
          id: "remote",
          clientId: "",
          name: "",
          items: [],
          savedAt: "",
        } as SupplementPlan)
      : undefined,
    activityTargets: Array.from(
      { length: presence.activityTargetCount ?? 0 },
      () => ({ id: "remote", effectiveFrom: "" }) as ActivityTargetVersion,
    ),
  };
}

/* -------------------------------------------------------------------------
 * w2-c4: the page binds the signed-in client's own rows into the shared
 * client-app model server-side. Every read is bound to the session's
 * workspaceId + clientProfileId, so the resulting CoachClient is own-scope
 * by construction; no client id ever travels through the browser.
 * ---------------------------------------------------------------------- */

const RECORDED_ENTRY_FIELDS = new Set(["weight", "sleep", "steps", "calories"]);

/**
 * Canvas tracker entries for the roadmap week rows. The weekly calculations
 * only read weight/sleep/steps/calories (roadmap-preview.ts RECORDED_FIELDS),
 * so values for any other parameter are dropped here, not in the view.
 */
export function clientEntriesFromRows(
  rows: { entryDate: string; values: Record<string, number> }[],
): CoachClient["entries"] {
  return rows.map((row) => {
    const entry: Record<string, string | number> = { date: row.entryDate };
    for (const [key, value] of Object.entries(row.values))
      if (RECORDED_ENTRY_FIELDS.has(key)) entry[key] = value;
    return entry as CoachClient["entries"][number];
  });
}

/**
 * The shell's plan views read `client.assignment` for the variant mode and
 * the view set (planTargets, ActiveClientNutrition). The signed-in client has
 * exactly one resolved variant, so the snapshot carries that one variant and
 * the assignment points at it.
 */
export function clientAssignmentFromConfig(configuration: Variant): Assignment {
  return {
    templateId: "remote",
    variantId: configuration.id,
    snapshot: {
      id: "remote",
      name: configuration.name,
      description: "",
      updated: "",
      defaultVariant: configuration.id,
      variants: [configuration],
    },
  };
}
