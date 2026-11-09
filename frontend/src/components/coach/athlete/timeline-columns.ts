/**
 * Timeline column registry: the stable identity and metadata for every column
 * the timeline can render. `timeline-tab.tsx` keeps the cell renderers and
 * widths keyed by id; saved configuration refers to ids from this list.
 *
 * `defaultGroup` is the group a column belongs to until a variant overrides the
 * layout. `requires` records the client feature a column needs, so the future
 * configuration editor can hide irrelevant columns without guessing.
 */

export type ColGroup =
  | "Bodyweight"
  | "Nutrition"
  | "Activity plan"
  | "Recovery"
  | "Training"
  | "Check-in"
  | "Notes";

export type TimelineColumnRequirement = "nutrition" | "training" | "activity";

export type TimelineColumnDef = {
  id: string;
  label: string;
  defaultGroup: ColGroup;
  requires?: TimelineColumnRequirement;
};

/** All renderable timeline columns, in their default group/display order. */
export const TIMELINE_COLUMNS: readonly TimelineColumnDef[] = [
  { id: "weight-avg", label: "Ø kg", defaultGroup: "Bodyweight" },
  { id: "weight-change", label: "Δ kg", defaultGroup: "Bodyweight" },
  { id: "weight-rate", label: "Δ %", defaultGroup: "Bodyweight" },
  {
    id: "kcal-plan",
    label: "kcal",
    defaultGroup: "Nutrition",
    requires: "nutrition",
  },
  {
    id: "protein",
    label: "P",
    defaultGroup: "Nutrition",
    requires: "nutrition",
  },
  {
    id: "carbs",
    label: "C",
    defaultGroup: "Nutrition",
    requires: "nutrition",
  },
  { id: "fat", label: "F", defaultGroup: "Nutrition", requires: "nutrition" },
  {
    id: "water",
    label: "Water L",
    defaultGroup: "Nutrition",
    requires: "nutrition",
  },
  {
    id: "steps-plan",
    label: "Steps",
    defaultGroup: "Activity plan",
    requires: "activity",
  },
  {
    id: "cardio-plan",
    label: "Cardio",
    defaultGroup: "Activity plan",
    requires: "activity",
  },
  { id: "sleep", label: "Sleep", defaultGroup: "Recovery" },
  {
    id: "sessions",
    label: "Sess.",
    defaultGroup: "Training",
    requires: "training",
  },
  {
    id: "plan-name",
    label: "Plan",
    defaultGroup: "Training",
    requires: "training",
  },
  { id: "checkin", label: "Check-in", defaultGroup: "Check-in" },
  { id: "changes", label: "Changes", defaultGroup: "Notes" },
  { id: "note", label: "Note", defaultGroup: "Notes" },
];

export const TIMELINE_COLUMN_BY_ID: Map<string, TimelineColumnDef> = new Map(
  TIMELINE_COLUMNS.map((column) => [column.id, column]),
);

/** Every registry column id, in default display order. */
export const TIMELINE_COLUMN_IDS: string[] = TIMELINE_COLUMNS.map(
  (column) => column.id,
);

/** Column id → default group. */
export const TIMELINE_GROUP_BY_COLUMN: Map<string, ColGroup> = new Map(
  TIMELINE_COLUMNS.map((column) => [column.id, column.defaultGroup]),
);
