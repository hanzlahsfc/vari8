/** Guard for the legacy `variant.athleteOverview` setting. The v3 overview is
 *  a fixed layout; saved values are retained so existing templates keep
 *  validating, but nothing reads them. */

export type AthleteWidgetId =
  | "bodyweight"
  | "next-check-in"
  | "nutrition-targets"
  | "activity-targets"
  | "needs-attention"
  | "recent-training"
  | "timeline"
  | "coaching-setup"
  | "training-plan"
  | "supplements";

export type AthleteOverviewSetting = {
  widgets: { id: AthleteWidgetId; visible: boolean }[];
};

const WIDGET_IDS = new Set<string>([
  "bodyweight",
  "next-check-in",
  "nutrition-targets",
  "activity-targets",
  "needs-attention",
  "recent-training",
  "timeline",
  "coaching-setup",
  "training-plan",
  "supplements",
]);

/** Structural guard for the variant.athleteOverview setting. */
export function isAthleteOverviewSetting(
  value: unknown,
): value is AthleteOverviewSetting {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const widgets = (value as Record<string, unknown>).widgets;
  return (
    Array.isArray(widgets) &&
    widgets.every(
      (widget) =>
        typeof widget === "object" &&
        widget !== null &&
        WIDGET_IDS.has((widget as Record<string, unknown>).id as string) &&
        typeof (widget as Record<string, unknown>).visible === "boolean",
    )
  );
}
