/**
 * Client setup drift and reset helpers.
 *
 * A client's setup lives only in `client.assignment.snapshot`; the library
 * template is never read at render time. These pure functions compare the two
 * by editor section so the client setup page can mark what was personalized and
 * copy one section back without touching the rest of the snapshot.
 */

import { normalizeTimelineSetup } from "./athlete/timeline-config";
import type { CoachClient, Template, Variant } from "./model";
import { timelineLayoutFrom, trackerLayoutFrom } from "./setup-layout";
import type { SetupSection } from "./setup-preview";
import { DEFAULT_PHASE_OPTIONS, templateSetup } from "./template-setup";

export const SETUP_SECTIONS: SetupSection[] = [
  "Tabs",
  "Tracker",
  "Timeline",
  "Nutrition",
  "Training",
  "Check-In",
  "Habits",
];

const clone = <T>(value: T): T => structuredClone(value);

/** Stable comparison for configuration objects regardless of key insertion. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, stable(source[key])]),
    );
  }
  return value;
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(stable(a)) === JSON.stringify(stable(b));

const nonHabitSummaries = (summaries: string[]) =>
  summaries.filter((summary) => summary !== "habits");

/**
 * The comparable value for one editor section. Values are semantic: an absent
 * timeline or tracker layout compares as its normalised default, so a legacy
 * snapshot does not look customized just because it predates a setting.
 */
export function sectionValue(variant: Variant, section: SetupSection): unknown {
  switch (section) {
    case "Tabs":
      return { views: variant.views };
    case "Tracker":
      return {
        fields: variant.fields,
        layout: trackerLayoutFrom(variant),
        cycleTracking: variant.cycleTrackingEnabled ?? false,
      };
    case "Timeline": {
      const timeline = normalizeTimelineSetup(variant);
      return {
        groups: timelineLayoutFrom(variant),
        showPhases: timeline.showPhases,
        compare: timeline.compare ?? false,
        order: timeline.order ?? "oldest",
        phaseOptions: variant.phaseOptions ?? DEFAULT_PHASE_OPTIONS,
        activityTargets: variant.roadmapActivityTargets ?? [],
      };
    }
    case "Nutrition":
      return variant.nutrition;
    case "Training":
      return variant.training;
    case "Check-In":
      return {
        questions: variant.questions,
        summaries: nonHabitSummaries(variant.summaries),
      };
    case "Habits":
      return {
        habits: variant.habits,
        summary: variant.summaries.includes("habits"),
      };
  }
}

/** Sections whose snapshot value differs from the current library variant. */
export function sectionDiffs(
  snapshotVariant: Variant,
  templateVariant: Variant,
): SetupSection[] {
  return SETUP_SECTIONS.filter(
    (section) =>
      !same(
        sectionValue(snapshotVariant, section),
        sectionValue(templateVariant, section),
      ),
  );
}

const withoutUndefined = <T extends object>(value: T): T => {
  for (const key of Object.keys(value) as (keyof T)[])
    if (value[key] === undefined) delete value[key];
  return value;
};

/**
 * Copy one section from the library variant into the client snapshot variant.
 * Every other section — including plans, logs and history outside the snapshot
 * — is left untouched. The result is a new object; inputs are not mutated.
 */
export function resetSection(
  snapshotVariant: Variant,
  templateVariant: Variant,
  section: SetupSection,
): Variant {
  const next: Variant = { ...snapshotVariant };
  switch (section) {
    case "Tabs":
      next.views = [...templateVariant.views];
      break;
    case "Tracker":
      next.fields = clone(templateVariant.fields);
      next.cycleTrackingEnabled = templateVariant.cycleTrackingEnabled;
      next.trackerLayout = templateVariant.trackerLayout
        ? clone(templateVariant.trackerLayout)
        : undefined;
      break;
    case "Timeline":
      next.timeline = templateVariant.timeline
        ? clone(templateVariant.timeline)
        : undefined;
      next.roadmapPhases = templateVariant.roadmapPhases;
      next.phaseOptions = templateVariant.phaseOptions
        ? [...templateVariant.phaseOptions]
        : undefined;
      next.roadmapActivityTargets = templateVariant.roadmapActivityTargets
        ? [...templateVariant.roadmapActivityTargets]
        : undefined;
      break;
    case "Nutrition":
      next.nutrition = templateVariant.nutrition;
      break;
    case "Training":
      next.training = clone(templateVariant.training);
      break;
    case "Check-In":
      next.questions = clone(templateVariant.questions).map((question) =>
        question.type === "Visual upload"
          ? { ...question, options: "" }
          : question,
      );
      next.summaries = [
        ...nonHabitSummaries(templateVariant.summaries),
        ...(snapshotVariant.summaries.includes("habits") ? ["habits"] : []),
      ];
      break;
    case "Habits":
      next.habits = templateVariant.habits;
      next.summaries = [
        ...nonHabitSummaries(snapshotVariant.summaries),
        ...(templateVariant.summaries.includes("habits") ? ["habits"] : []),
      ];
      break;
  }
  return withoutUndefined(next);
}

/** Copy every listed section; `resetAllSections` covers the whole editor. */
export function resetSections(
  snapshotVariant: Variant,
  templateVariant: Variant,
  sections: readonly SetupSection[],
): Variant {
  return sections.reduce(
    (current, section) => resetSection(current, templateVariant, section),
    snapshotVariant,
  );
}

export function resetAllSections(
  snapshotVariant: Variant,
  templateVariant: Variant,
): Variant {
  return resetSections(snapshotVariant, templateVariant, SETUP_SECTIONS);
}

/** The live library template behind a client assignment, when it still exists. */
export function clientSetupTemplate(
  client: CoachClient,
  templates: readonly Template[],
): Template | undefined {
  if (!client.assignment) return undefined;
  return templates.find(
    (template) => template.id === client.assignment?.templateId,
  );
}

/**
 * Whether the client's own setup differs from its library template. A missing
 * library template counts as customized: the snapshot is all that remains, and
 * reassigning would replace it.
 */
export function clientSetupCustomized(
  client: CoachClient,
  templates: readonly Template[],
): boolean {
  if (!client.assignment) return false;
  const template = clientSetupTemplate(client, templates);
  if (!template) return true;
  return (
    sectionDiffs(
      templateSetup(client.assignment.snapshot, client.assignment.variantId),
      templateSetup(template, client.assignment.variantId),
    ).length > 0
  );
}
