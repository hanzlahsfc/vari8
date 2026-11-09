/**
 * Timeline group defaults: group ids, their display order, their header label
 * and the columns each group owns. `timeline-tab.tsx` derives everything from
 * the normalised timeline setup, which falls back to these defaults.
 *
 * Column metadata (label, default group, requirements) lives in
 * `./timeline-columns`; this module only arranges the default groups.
 */

import { type ColGroup, TIMELINE_COLUMNS } from "./timeline-columns";

export type { ColGroup } from "./timeline-columns";
export {
  TIMELINE_COLUMN_IDS,
  TIMELINE_GROUP_BY_COLUMN,
} from "./timeline-columns";

export type TimelineGroupDefault = {
  id: ColGroup;
  /** Group header label; also the default collapsed-strip label. */
  label: string;
  /** Column ids in display order. */
  columnIds: string[];
};

const GROUP_ORDER: readonly { id: ColGroup; label: string }[] = [
  { id: "Bodyweight", label: "Bodyweight" },
  { id: "Nutrition", label: "Nutrition" },
  { id: "Activity plan", label: "Activity plan" },
  { id: "Recovery", label: "Recovery" },
  { id: "Training", label: "Training" },
  { id: "Check-in", label: "Check-in" },
  { id: "Notes", label: "Notes" },
];

/**
 * Default groups, in display order.
 *
 * Recovery holds only genuinely recovery fields: the field registry groups
 * sleep duration/quality/timing and the energy·stress·soreness ratings under
 * recovery, but the timeline only ever surfaced a weekly `Sleep` average.
 * Water is a nutrition input (registry group "Fluids", which the tracker files
 * under Nutrition) and a check-in is a submission event, not a tracked metric,
 * so both left this group.
 */
export const TIMELINE_GROUP_DEFAULTS: readonly TimelineGroupDefault[] =
  GROUP_ORDER.map((group) => ({
    id: group.id,
    label: group.label,
    columnIds: TIMELINE_COLUMNS.filter(
      (column) => column.defaultGroup === group.id,
    ).map((column) => column.id),
  }));

export const TIMELINE_GROUP_ORDER: ColGroup[] = TIMELINE_GROUP_DEFAULTS.map(
  (group) => group.id,
);

/**
 * Group ids renamed since an earlier persisted layout. Saved pinned/collapsed
 * ids are replayed against the current id.
 */
export const TIMELINE_GROUP_ALIASES: Record<string, ColGroup> = {
  "Nutrition plan": "Nutrition",
};

/**
 * Map restored layout ids onto current groups: aliases are renamed, known ids
 * keep their order and unknown ids (e.g. the retired "Logged" group) are dropped.
 */
export function normalizeTimelineGroupIds(ids: Iterable<string>): string[] {
  const known = new Set<string>(TIMELINE_GROUP_ORDER);
  const out: string[] = [];
  for (const id of ids) {
    const mapped = TIMELINE_GROUP_ALIASES[id] ?? id;
    if (!known.has(mapped) || out.includes(mapped)) continue;
    out.push(mapped);
  }
  return out;
}

/** Restrict saved layout ids to the groups this client actually renders. */
export function normalizeTimelineGroupIdsFor(
  ids: Iterable<string>,
  knownGroups: Iterable<string>,
): string[] {
  const known = new Set(knownGroups);
  const out: string[] = [];
  for (const id of ids) {
    const mapped = TIMELINE_GROUP_ALIASES[id] ?? id;
    if (!known.has(mapped) || out.includes(mapped)) continue;
    out.push(mapped);
  }
  return out;
}
