import type { Variant } from "../coach/model";
import type { ClientPlans } from "../coach/plans/types";

export type ClientAppSectionId =
  | "home"
  | "plans"
  | "tracker"
  | "training"
  | "check-ins"
  | "photos";
export type ClientPlanPart =
  | "nutrition"
  | "supplements"
  | "activity-targets"
  | "roadmap";
export type ClientAppSection = {
  id: ClientAppSectionId;
  label: string;
  planParts: ClientPlanPart[];
};

export const PLAN_PART_LABELS: Record<ClientPlanPart, string> = {
  nutrition: "Nutrition",
  supplements: "Supplements",
  "activity-targets": "Activity targets",
  roadmap: "Timeline / Roadmap",
};

const SECTION_LABELS: Record<ClientAppSectionId, string> = {
  home: "Home",
  plans: "Plans",
  tracker: "Tracker",
  training: "Training",
  "check-ins": "Check-ins",
  photos: "Photos",
};

const SECTION_ORDER: ClientAppSectionId[] = [
  "home",
  "plans",
  "tracker",
  "training",
  "check-ins",
  "photos",
];

const PLAN_PART_ORDER: ClientPlanPart[] = [
  "nutrition",
  "supplements",
  "activity-targets",
  "roadmap",
];

export function clientAppSections(
  configuration: Pick<Variant, "views" | "habits">,
  plans: Pick<ClientPlans, "supplements" | "activityTargets"> | undefined,
  options?: { remote?: boolean },
): ClientAppSection[] {
  const views = new Set(configuration.views);
  const planParts = PLAN_PART_ORDER.filter((part) => {
    if (part === "nutrition")
      return views.has("Nutrition") || views.has("Mealplan");
    if (part === "supplements") return plans?.supplements !== undefined;
    if (part === "activity-targets")
      return (plans?.activityTargets?.length ?? 0) > 0;
    return views.has("Timeline / Roadmap");
  });
  const enabled: Record<ClientAppSectionId, boolean> = {
    home: views.has("Dashboard"),
    plans: planParts.length > 0,
    tracker: views.has("Tracker") || configuration.habits === true,
    training: views.has("Training Program"),
    "check-ins": views.has("Check-In"),
    // Card 08: the gallery reads live own-scope data, so the section only
    // exists when a signed-in client's own binding is mounted — a preview
    // configuration has no entries to show.
    photos: options?.remote === true,
  };
  return SECTION_ORDER.filter((id) => enabled[id]).map((id) => ({
    id,
    label: SECTION_LABELS[id],
    planParts: id === "plans" ? planParts : [],
  }));
}

const LEGACY_TAB_SECTIONS: Record<
  string,
  { section: ClientAppSectionId; planPart?: ClientPlanPart }
> = {
  Dashboard: { section: "home" },
  Tracker: { section: "tracker" },
  Habits: { section: "tracker" },
  Supplements: { section: "plans", planPart: "supplements" },
  "Timeline / Roadmap": { section: "plans", planPart: "roadmap" },
  Nutrition: { section: "plans", planPart: "nutrition" },
  Mealplan: { section: "plans", planPart: "nutrition" },
  "Activity targets": { section: "plans", planPart: "activity-targets" },
  "Training Program": { section: "training" },
  "Check-In": { section: "check-ins" },
};

export function sectionForLegacyTab(
  tab: string | undefined,
): { section: ClientAppSectionId; planPart?: ClientPlanPart } | undefined {
  if (tab === undefined) return undefined;
  return LEGACY_TAB_SECTIONS[tab];
}
