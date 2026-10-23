/** Athlete profile overview widget registry + layout resolution. */

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

export type AthleteWidgetWidth = "small" | "medium" | "full";

export type AthleteWidget = {
  id: AthleteWidgetId;
  title: string;
  width: AthleteWidgetWidth;
  visible: boolean;
};

/** Default layout — the spec's widget table, in table order. */
export const ATHLETE_WIDGETS: AthleteWidget[] = [
  { id: "bodyweight", title: "Bodyweight", width: "small", visible: true },
  {
    id: "next-check-in",
    title: "Next check-in",
    width: "small",
    visible: true,
  },
  {
    id: "nutrition-targets",
    title: "Nutrition targets",
    width: "medium",
    visible: true,
  },
  {
    id: "activity-targets",
    title: "Activity targets",
    width: "medium",
    visible: true,
  },
  {
    id: "needs-attention",
    title: "Needs attention",
    width: "medium",
    visible: true,
  },
  { id: "timeline", title: "Timeline", width: "full", visible: true },
  {
    id: "recent-training",
    title: "Recent training",
    width: "medium",
    visible: true,
  },
  {
    id: "coaching-setup",
    title: "Coaching setup",
    width: "medium",
    visible: true,
  },
  {
    id: "training-plan",
    title: "Training program",
    width: "medium",
    visible: false,
  },
  {
    id: "supplements",
    title: "Supplements",
    width: "medium",
    visible: false,
  },
];

const WIDGET_IDS = new Set(ATHLETE_WIDGETS.map((widget) => widget.id));
const DEFAULT_INDEX = new Map(
  ATHLETE_WIDGETS.map((widget, index) => [widget.id, index]),
);

export type AthleteOverviewSetting = {
  widgets: { id: AthleteWidgetId; visible: boolean }[];
};

export function isAthleteWidgetId(value: unknown): value is AthleteWidgetId {
  return typeof value === "string" && WIDGET_IDS.has(value as AthleteWidgetId);
}

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
        isAthleteWidgetId((widget as Record<string, unknown>).id) &&
        typeof (widget as Record<string, unknown>).visible === "boolean",
    )
  );
}

/**
 * Ordered widgets for the overview. The saved order (template variant) wins;
 * unknown ids are dropped, and widgets missing from the saved list — e.g.
 * added after the template was saved — re-appear at their default position
 * relative to the already-placed widgets.
 */
export function resolveOverviewWidgets(
  setting: AthleteOverviewSetting | undefined,
): AthleteWidget[] {
  if (!setting) return structuredClone(ATHLETE_WIDGETS);
  const meta = new Map(ATHLETE_WIDGETS.map((widget) => [widget.id, widget]));
  const placed = new Set<AthleteWidgetId>();
  const resolved: AthleteWidget[] = [];
  for (const entry of setting.widgets) {
    if (!isAthleteWidgetId(entry.id) || placed.has(entry.id)) continue;
    const base = meta.get(entry.id);
    if (!base) continue;
    resolved.push({ ...base, visible: entry.visible });
    placed.add(entry.id);
  }
  for (const widget of ATHLETE_WIDGETS) {
    if (placed.has(widget.id)) continue;
    const index = DEFAULT_INDEX.get(widget.id) ?? 0;
    // Insert after the last resolved widget whose default position precedes
    // this one; before everything when none does.
    let at = 0;
    for (let i = 0; i < resolved.length; i++) {
      if ((DEFAULT_INDEX.get(resolved[i].id) ?? 0) < index) at = i + 1;
    }
    resolved.splice(at, 0, { ...widget });
    placed.add(widget.id);
  }
  return resolved;
}

const BASE_SPAN: Record<AthleteWidgetWidth, number> = {
  small: 3,
  medium: 6,
  full: 12,
};

/**
 * Desktop spans for the visible widgets, packed in order into 12-column
 * rows. A medium widget that ends up alone in its row (because the next
 * widget does not fit) widens to 12; small widgets keep their 3 and let
 * following widgets continue the row.
 */
export function layoutOverviewWidgets(
  widgets: AthleteWidget[],
): { id: AthleteWidgetId; span: number }[] {
  const rows: AthleteWidget[][] = [];
  let used = 12;
  for (const widget of widgets) {
    const span = BASE_SPAN[widget.width];
    if (used + span > 12) {
      rows.push([]);
      used = 0;
    }
    rows.at(-1)?.push(widget);
    used += span;
  }
  return rows.flatMap((row) =>
    row.map((widget) => ({
      id: widget.id,
      span:
        row.length === 1 && widget.width === "medium"
          ? 12
          : BASE_SPAN[widget.width],
    })),
  );
}
