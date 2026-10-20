import type { CoachState, Template, Variant } from "./model";

export const DEFAULT_PHASE_OPTIONS = [
  "Fat loss",
  "Maintenance",
  "Muscle gain",
  "Recovery",
];
export const WEEKLY_VOLUME_BREAKDOWN = "Muscle groups / week";

export function templateSetup(
  template: Template,
  preferredId = template.defaultVariant,
): Variant {
  return (
    template.variants.find(
      (configuration) => configuration.id === preferredId,
    ) ??
    template.legacyConfigurations?.find(
      (configuration) => configuration.id === preferredId,
    ) ??
    template.variants.find(
      (configuration) => configuration.id === template.defaultVariant,
    ) ??
    template.variants[0]
  );
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
  const configuration: Variant = {
    ...selected,
    views: [
      ...new Set(
        selected.views.map((tab) => (tab === "Mealplan" ? "Nutrition" : tab)),
      ),
    ],
    roadmapPhases: selected.roadmapPhases ?? true,
    phaseOptions: selected.phaseOptions ?? [...DEFAULT_PHASE_OPTIONS],
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
