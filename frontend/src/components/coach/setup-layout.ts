/**
 * Pure layout helpers for the setup editor.
 *
 * The editor works on `LayoutGroup`s (a flat item-id list per group) because
 * both the timeline (`columns`) and the tracker (`fieldIds`) use the same
 * interaction. Converters at the edges produce exactly the shapes the job E
 * normalisers expect; the editor never writes an unknown or duplicated item.
 */

import { TIMELINE_COLUMN_IDS } from "./athlete/timeline-columns";
import { defaultTimelineGroups } from "./athlete/timeline-config";
import { TIMELINE_GROUP_DEFAULTS } from "./athlete/timeline-groups";
import {
  AUTO_TRACKER_GROUPS,
  autoTrackerGroupForField,
} from "./athlete/tracker-layout";
import type {
  TimelineGroupSetting,
  TimelineSetup,
  TrackerLayout,
  Variant,
} from "./model";

export type LayoutGroup = {
  id: string;
  label: string;
  items: string[];
  collapsed: boolean;
  pinned: boolean;
};

/** A group the editor can restore with "Reset to defaults". */
export type LayoutGroupDefault = {
  id: string;
  label: string;
  itemIds: string[];
  builtIn: boolean;
};

export type LayoutItem = {
  id: string;
  label: string;
  hint?: string;
  disabledReason?: string;
  /** Group used when a hidden item is added back. */
  homeGroup?: string;
};

export const CUSTOM_GROUP_PREFIX = "custom-";

export const isCustomGroup = (id: string) => id.startsWith(CUSTOM_GROUP_PREFIX);

export function reorderArray<T>(
  items: readonly T[],
  from: number,
  to: number,
): T[] {
  const result = [...items];
  if (from < 0 || from >= result.length) return result;
  const [item] = result.splice(from, 1);
  result.splice(Math.max(0, Math.min(to, result.length)), 0, item);
  return result;
}

const cleanLabel = (label: string, fallback: string) =>
  label.trim() || fallback;

const dedupe = (values: Iterable<string>) => [...new Set(values)];

/**
 * Normalise a working layout: unique group ids/labels, known items only, each
 * item in at most one group. Empty groups stay (built-ins can be emptied).
 */
export function normalizeLayout(
  groups: readonly LayoutGroup[],
  validItemIds?: Iterable<string>,
): LayoutGroup[] {
  const valid = validItemIds ? new Set(validItemIds) : undefined;
  const seenGroups = new Set<string>();
  const seenItems = new Set<string>();
  const out: LayoutGroup[] = [];
  for (const group of groups) {
    const id = group.id.trim();
    if (!id || seenGroups.has(id)) continue;
    seenGroups.add(id);
    const items: string[] = [];
    for (const item of group.items) {
      if (typeof item !== "string") continue;
      if (valid && !valid.has(item)) continue;
      if (seenItems.has(item)) continue;
      seenItems.add(item);
      items.push(item);
    }
    out.push({
      id,
      label: cleanLabel(group.label, id),
      items,
      collapsed: group.collapsed === true,
      pinned: group.pinned === true,
    });
  }
  return out;
}

// ─── Timeline ──────────────────────────────────────────────────────

export function timelineLayoutDefaults(): LayoutGroupDefault[] {
  return TIMELINE_GROUP_DEFAULTS.map((group) => ({
    id: group.id,
    label: group.label,
    itemIds: [...group.columnIds],
    builtIn: true,
  }));
}

export type TimelineColumnMeta = {
  label?: string;
  agg?: "avg" | "sum" | "min" | "max" | "last" | "count";
  decimals?: 0 | 1 | 2;
};

const timelineColumnId = (column: string | { id: string }) =>
  typeof column === "string" ? column : column.id;

const timelineItemIds = (groups?: readonly TimelineGroupSetting[]) =>
  new Set([
    ...TIMELINE_COLUMN_IDS,
    ...(groups ?? []).flatMap((group) =>
      group.columns
        .map(timelineColumnId)
        .filter((id) => id.startsWith("param:")),
    ),
  ]);

export function timelineColumnMeta(
  groups?: readonly TimelineGroupSetting[],
): Map<string, TimelineColumnMeta> {
  const meta = new Map<string, TimelineColumnMeta>();
  for (const group of groups ?? [])
    for (const column of group.columns) {
      if (typeof column === "string") continue;
      const { id, ...rest } = column;
      if (Object.values(rest).some((value) => value !== undefined))
        meta.set(id, rest);
    }
  return meta;
}

export function timelineLayout(
  groups?: readonly TimelineGroupSetting[],
): LayoutGroup[] {
  const source = groups ?? defaultTimelineGroups();
  return normalizeLayout(
    source.map((group) => ({
      id: group.id,
      label: group.label,
      items: group.columns.map(timelineColumnId),
      collapsed: group.collapsed === true,
      pinned: group.pinned === true,
    })),
    timelineItemIds(groups),
  );
}

/** The stored layout, or the defaults when the variant has no timeline yet. */
export function timelineLayoutFrom(variant: Variant): LayoutGroup[] {
  return timelineLayout(variant.timeline?.groups);
}

export function toTimelineGroups(
  groups: readonly LayoutGroup[],
  meta?: ReadonlyMap<string, TimelineColumnMeta>,
): TimelineSetup["groups"] {
  return normalizeLayout(groups, [
    ...TIMELINE_COLUMN_IDS,
    ...(meta ? [...meta.keys()] : []),
    ...groups.flatMap((group) =>
      group.items.filter((id) => id.startsWith("param:")),
    ),
  ]).map((group) => ({
    id: group.id,
    label: group.label,
    columns: group.items.map((id) => {
      const entry = meta?.get(id);
      return entry && Object.keys(entry).length ? { id, ...entry } : id;
    }),
    ...(group.collapsed ? { collapsed: true } : {}),
    ...(group.pinned ? { pinned: true } : {}),
  }));
}

// ─── Tracker ───────────────────────────────────────────────────────

const AUTO_GROUP_ORDER = AUTO_TRACKER_GROUPS.map(([group]) => group);

export function trackerLayoutDefaults(
  fieldIds: readonly string[],
): LayoutGroupDefault[] {
  const order = new Map(AUTO_GROUP_ORDER.map((group, index) => [group, index]));
  const groups = new Map<string, LayoutGroupDefault>();
  for (const fieldId of fieldIds) {
    const group = autoTrackerGroupForField(fieldId);
    const current = groups.get(group);
    if (current) {
      if (!current.itemIds.includes(fieldId)) current.itemIds.push(fieldId);
      continue;
    }
    groups.set(group, {
      id: group,
      label: group,
      itemIds: [fieldId],
      builtIn: true,
    });
  }
  return [...groups.values()].sort(
    (a, b) =>
      (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Seed the editor from the saved layout. Fields missing from a saved layout are
 * appended to their automatic group (the same rule as the tracker normaliser),
 * so a newly selected parameter never starts out hidden.
 */
export function trackerLayoutFrom(variant: Variant): LayoutGroup[] {
  const fieldIds = variant.fields.map((field) => field.id);
  const raw = variant.trackerLayout?.groups;
  if (!Array.isArray(raw))
    return normalizeLayout(
      trackerLayoutDefaults(fieldIds).map((group) => ({
        ...group,
        items: [...group.itemIds],
        collapsed: false,
        pinned: false,
      })),
      fieldIds,
    );
  const groups: LayoutGroup[] = raw.map((group) => ({
    id: group.id,
    label: group.label,
    items: [...group.fieldIds],
    collapsed: group.collapsed === true,
    pinned: group.pinned === true,
  }));
  const placed = new Set(groups.flatMap((group) => group.items));
  for (const fieldId of fieldIds) {
    if (placed.has(fieldId)) continue;
    const auto = autoTrackerGroupForField(fieldId);
    let group = groups.find((candidate) => candidate.id === auto);
    if (!group) {
      group = {
        id: auto,
        label: auto,
        items: [],
        collapsed: false,
        pinned: false,
      };
      groups.push(group);
    }
    group.items.push(fieldId);
    placed.add(fieldId);
  }
  return normalizeLayout(groups, fieldIds);
}

export function toTrackerLayout(
  groups: readonly LayoutGroup[],
  fieldIds: readonly string[],
): TrackerLayout {
  const valid = new Set(fieldIds);
  const cleaned = normalizeLayout(groups, valid);
  return {
    groups: cleaned.map((group) => ({
      id: group.id,
      label: group.label,
      fieldIds: [...group.items],
      ...(group.collapsed ? { collapsed: true } : {}),
      ...(group.pinned ? { pinned: true } : {}),
    })),
  };
}

// ─── Editing operations ────────────────────────────────────────────

const cloneGroups = (groups: readonly LayoutGroup[]): LayoutGroup[] =>
  groups.map((group) => ({
    ...group,
    items: [...group.items],
  }));

export function reorderGroup(
  groups: readonly LayoutGroup[],
  from: number,
  to: number,
): LayoutGroup[] {
  return reorderArray(groups, from, to);
}

export function renameGroup(
  groups: readonly LayoutGroup[],
  groupId: string,
  label: string,
): LayoutGroup[] {
  return groups.map((group) =>
    group.id === groupId
      ? { ...group, label: cleanLabel(label, group.label) }
      : group,
  );
}

export function setGroupFlag(
  groups: readonly LayoutGroup[],
  groupId: string,
  flag: "collapsed" | "pinned",
  value: boolean,
): LayoutGroup[] {
  return groups.map((group) =>
    group.id === groupId ? { ...group, [flag]: value } : group,
  );
}

export function addGroup(
  groups: readonly LayoutGroup[],
  id: string,
  label = "New group",
): LayoutGroup[] {
  const taken = new Set(groups.map((group) => group.id));
  if (!id.trim() || taken.has(id)) return cloneGroups(groups);
  return [
    ...cloneGroups(groups),
    {
      id,
      label: cleanLabel(label, "New group"),
      items: [],
      collapsed: false,
      pinned: false,
    },
  ];
}

export function removeGroup(
  groups: readonly LayoutGroup[],
  groupId: string,
): LayoutGroup[] {
  return groups.filter((group) => group.id !== groupId);
}

/** Move an item within its group. */
export function moveItem(
  groups: readonly LayoutGroup[],
  groupId: string,
  from: number,
  to: number,
): LayoutGroup[] {
  return groups.map((group) =>
    group.id === groupId
      ? { ...group, items: reorderArray(group.items, from, to) }
      : group,
  );
}

/** Move an item to another group, appended at the end unless an index is given. */
export function moveItemToGroup(
  groups: readonly LayoutGroup[],
  itemId: string,
  groupId: string,
  index?: number,
): LayoutGroup[] {
  const target = groups.find((group) => group.id === groupId);
  if (!target) return cloneGroups(groups);
  const source = groups.find((group) => group.items.includes(itemId));
  if (!source) return cloneGroups(groups);
  if (source.id === groupId) {
    if (index === undefined) return cloneGroups(groups);
    const from = source.items.indexOf(itemId);
    return moveItem(groups, groupId, from, index);
  }
  return groups.map((group) => {
    if (group.id === source.id)
      return { ...group, items: group.items.filter((item) => item !== itemId) };
    if (group.id !== groupId) return { ...group, items: [...group.items] };
    const items = group.items.filter((item) => item !== itemId);
    items.splice(
      Math.max(0, Math.min(index ?? items.length, items.length)),
      0,
      itemId,
    );
    return { ...group, items };
  });
}

/**
 * Place an item that is not in any group yet. Adding an already placed item is
 * a no-op, so the move operation above stays the only way to reorder it.
 */
export function addItemToGroup(
  groups: readonly LayoutGroup[],
  itemId: string,
  groupId: string,
  index?: number,
): LayoutGroup[] {
  const target = groups.find((group) => group.id === groupId);
  if (!target) return cloneGroups(groups);
  if (groups.some((group) => group.items.includes(itemId)))
    return cloneGroups(groups);
  return groups.map((group) => {
    if (group.id !== groupId) return { ...group, items: [...group.items] };
    const items = [...group.items];
    items.splice(
      Math.max(0, Math.min(index ?? items.length, items.length)),
      0,
      itemId,
    );
    return { ...group, items };
  });
}

/** Hide an item; the inverse of `addItemToGroup`/`toggleVisibility`. */
export function hideItem(
  groups: readonly LayoutGroup[],
  itemId: string,
): LayoutGroup[] {
  return toggleVisibility(groups, itemId, false);
}

/** Show or hide an item. Showing appends it to `groupId`. */
export function toggleVisibility(
  groups: readonly LayoutGroup[],
  itemId: string,
  visible: boolean,
  groupId?: string,
): LayoutGroup[] {
  const current = groups.find((group) => group.items.includes(itemId));
  if (!visible)
    return groups.map((group) =>
      group.items.includes(itemId)
        ? { ...group, items: group.items.filter((item) => item !== itemId) }
        : { ...group, items: [...group.items] },
    );
  if (current) return cloneGroups(groups);
  const target = groups.find((group) => group.id === groupId);
  if (!target) return cloneGroups(groups);
  return groups.map((group) =>
    group.id === target.id
      ? { ...group, items: dedupe([...group.items, itemId]) }
      : { ...group, items: [...group.items] },
  );
}

export function resetLayout(
  defaults: readonly LayoutGroupDefault[],
): LayoutGroup[] {
  return defaults.map((group) => ({
    id: group.id,
    label: group.label,
    items: [...group.itemIds],
    collapsed: false,
    pinned: false,
  }));
}

/** Item ids that are not placed in any group, in registry order. */
export function hiddenItems(
  groups: readonly LayoutGroup[],
  items: readonly LayoutItem[],
): LayoutItem[] {
  const placed = new Set(groups.flatMap((group) => group.items));
  return items.filter((item) => !placed.has(item.id));
}
