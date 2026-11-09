import { normalizeTimelineSetup } from "./athlete/timeline-config";
import { normalizeTrackerLayout } from "./athlete/tracker-layout";
import type { CoachClient, CoachState, Template, Variant } from "./model";

export const DEFAULT_PHASE_OPTIONS = [
  "Fat loss",
  "Maintenance",
  "Muscle gain",
  "Recovery",
];
export const WEEKLY_VOLUME_BREAKDOWN = "Primary / additional targets per week";

/**
 * Fill a variant's optional presentation settings with their normalised shape.
 * Timeline defaults are always returned; tracker layout stays absent when the
 * variant has no saved configuration (absent means automatic grouping).
 */
export function normalizeVariantSetup(variant: Variant): Variant {
  const timeline = normalizeTimelineSetup(variant);
  const trackerLayout = normalizeTrackerLayout(variant);
  const rest: Variant = { ...variant };
  delete rest.trackerLayout;
  return trackerLayout
    ? { ...rest, timeline, trackerLayout }
    : { ...rest, timeline };
}

export function templateSetup(
  template: Template,
  preferredId = template.defaultVariant,
): Variant {
  const selected =
    template.variants.find(
      (configuration) => configuration.id === preferredId,
    ) ??
    template.legacyConfigurations?.find(
      (configuration) => configuration.id === preferredId,
    ) ??
    template.variants.find(
      (configuration) => configuration.id === template.defaultVariant,
    ) ??
    template.variants[0];
  return normalizeVariantSetup(selected);
}

/**
 * The variant an assigned client renders. Assigned clients read only their
 * snapshot; live library templates are used when assigning or editing.
 */
export function assignedVariant(client: CoachClient): Variant | undefined {
  if (!client.assignment) return undefined;
  return templateSetup(client.assignment.snapshot, client.assignment.variantId);
}

/** Client-level habit visibility, derived from the assignment snapshot. */
export function clientHabitsEnabled(client: CoachClient): boolean {
  return assignedVariant(client)?.habits ?? true;
}

export function singleTemplateSetup(
  template: Template,
  preferredId = template.defaultVariant,
): Template {
  const source = structuredClone(template);
  const selected = templateSetup(source, preferredId);
  const archived = new Map<string, Variant>();
  for (const configuration of [
    ...(source.legacyConfigurations ?? []),
    ...source.variants,
  ])
    if (configuration.id !== selected.id)
      archived.set(configuration.id, configuration);
  const trackerLayout = normalizeTrackerLayout(selected);
  const configuration: Variant = {
    ...selected,
    views: [
      ...new Set(
        selected.views.map((tab) => (tab === "Mealplan" ? "Nutrition" : tab)),
      ),
    ],
    roadmapPhases: selected.roadmapPhases ?? true,
    phaseOptions: selected.phaseOptions ?? [...DEFAULT_PHASE_OPTIONS],
    timeline: normalizeTimelineSetup(selected),
    ...(trackerLayout ? { trackerLayout } : {}),
    training: {
      ...selected.training,
      breakdown: WEEKLY_VOLUME_BREAKDOWN,
    },
  };
  return {
    ...source,
    defaultVariant: configuration.id,
    variants: [configuration],
    legacyConfigurations: [...archived.values()],
  };
}

export function normalizeTemplateSetups(state: CoachState): CoachState {
  return {
    ...state,
    templates: state.templates.map((template) => singleTemplateSetup(template)),
    editorDrafts: Object.fromEntries(
      Object.entries(state.editorDrafts).map(([id, template]) => [
        id,
        singleTemplateSetup(template),
      ]),
    ),
    clientSetupDrafts: Object.fromEntries(
      Object.entries(state.clientSetupDrafts ?? {}).map(([id, template]) => [
        id,
        singleTemplateSetup(template),
      ]),
    ),
    clients: state.clients.map((client) => {
      if (!client.assignment) return client;
      const snapshot = singleTemplateSetup(
        client.assignment.snapshot,
        client.assignment.variantId,
      );
      return {
        ...client,
        assignment: {
          ...client.assignment,
          variantId: snapshot.defaultVariant,
          snapshot,
        },
      };
    }),
  };
}
