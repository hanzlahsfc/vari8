/**
 * Timeline layout model: normalisation of a variant's saved `timeline` setting.
 *
 * The result is always usable by the tab: an old variant, a missing setting or
 * malformed data falls back to TIMELINE_GROUP_DEFAULTS. Configured setups keep
 * only registry column ids, in at most one group, and never auto-add a column
 * the coach removed (a column missing from the configuration stays hidden).
 */

import type {
  TimelineColumnSetting,
  TimelineGroupSetting,
  TimelineSetup,
  Variant,
} from "../model";
import { TIMELINE_COLUMN_BY_ID } from "./timeline-columns";
import { TIMELINE_GROUP_DEFAULTS } from "./timeline-groups";

export type NormalizedTimeline = TimelineSetup & { showPhases: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const AGGREGATIONS = new Set(["avg", "sum", "min", "max", "last", "count"]);

export function isTimelineColumnId(id: string) {
  return TIMELINE_COLUMN_BY_ID.has(id) || /^param:[A-Za-z0-9_-]+$/.test(id);
}

function cleanColumn(raw: unknown): string | TimelineColumnSetting | undefined {
  if (typeof raw === "string") {
    return isTimelineColumnId(raw.trim()) ? raw.trim() : undefined;
  }
  if (!isRecord(raw)) return undefined;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!isTimelineColumnId(id)) return undefined;
  const column: TimelineColumnSetting = { id };
  if (typeof raw.label === "string" && raw.label.trim())
    column.label = raw.label.trim().slice(0, 40);
  if (typeof raw.agg === "string" && AGGREGATIONS.has(raw.agg))
    column.agg = raw.agg as TimelineColumnSetting["agg"];
  if (raw.decimals === 0 || raw.decimals === 1 || raw.decimals === 2)
    column.decimals = raw.decimals;
  return Object.keys(column).length > 1 ? column : id;
}

export function defaultTimelineGroups(): TimelineGroupSetting[] {
  return TIMELINE_GROUP_DEFAULTS.map((group) => ({
    id: group.id,
    label: group.label,
    columns: [...group.columnIds],
  }));
}

const cleanGroups = (
  rawGroups: unknown[],
): { groups: TimelineGroupSetting[]; recognised: number } => {
  const seenColumns = new Set<string>();
  const seenGroups = new Set<string>();
  const groups: TimelineGroupSetting[] = [];
  let recognised = 0;
  for (const entry of rawGroups) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || seenGroups.has(id)) continue;
    seenGroups.add(id);
    recognised += 1;
    const label =
      typeof entry.label === "string" && entry.label.trim()
        ? entry.label.trim()
        : id;
    const columns: (string | TimelineColumnSetting)[] = [];
    if (Array.isArray(entry.columns))
      for (const rawColumn of entry.columns) {
        const column = cleanColumn(rawColumn);
        if (!column) continue;
        const id = typeof column === "string" ? column : column.id;
        if (seenColumns.has(id)) continue;
        seenColumns.add(id);
        columns.push(column);
      }
    // A configured group with no remaining columns is not rendered.
    if (!columns.length) continue;
    const group: TimelineGroupSetting = { id, label, columns };
    if (typeof entry.collapsed === "boolean") group.collapsed = entry.collapsed;
    if (typeof entry.pinned === "boolean") group.pinned = entry.pinned;
    groups.push(group);
  }
  return { groups, recognised };
};

/**
 * Normalise the timeline setting for any variant (or for an unassigned client,
 * where `variant` is undefined). Legacy fields stay valid inputs: when
 * `showPhases` is absent it falls back to `roadmapPhases !== false`.
 */
export function normalizeTimelineSetup(
  variant?: Pick<Variant, "timeline" | "roadmapPhases"> | null,
): NormalizedTimeline {
  const raw = variant?.timeline;
  const showPhases =
    isRecord(raw) && typeof raw.showPhases === "boolean"
      ? raw.showPhases
      : variant?.roadmapPhases !== false;
  const compare =
    isRecord(raw) && typeof raw.compare === "boolean" ? raw.compare : undefined;
  const order =
    isRecord(raw) && (raw.order === "oldest" || raw.order === "newest")
      ? raw.order
      : undefined;

  if (!isRecord(raw) || !Array.isArray(raw.groups))
    return { groups: defaultTimelineGroups(), showPhases, compare, order };

  const { groups, recognised } = cleanGroups(raw.groups);
  // An explicit empty group list is a valid "nothing shown" configuration; a
  // list where no entry could be read is malformed and falls back to defaults.
  const resolved =
    raw.groups.length > 0 && recognised === 0
      ? defaultTimelineGroups()
      : groups;
  return { groups: resolved, showPhases, compare, order };
}
