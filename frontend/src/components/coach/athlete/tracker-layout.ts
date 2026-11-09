/**
 * Tracker layout model: the automatic parameter-group mapping plus the
 * normalisation of a variant's saved `trackerLayout`.
 *
 * Absent configuration keeps today's automatic grouping untouched. A saved
 * layout controls group order, labels and field order, but fields that are not
 * listed are appended to their automatic group, so adding a tracker parameter
 * never hides it. The renderer (`tracker-columns.ts`) stays responsible for
 * turning parameters into display columns.
 */

import {
  allParameters,
  type TrackerLayout,
  type TrackerLayoutGroup,
  type Variant,
} from "../model";

/** Parameter registry group → tracker display group. */
export const AUTO_TRACKER_GROUPS: readonly (readonly [string, string[]])[] = [
  ["Body", ["Weight basics"]],
  ["Health", ["Health readings"]],
  ["Cycle", ["Cycle tracking"]],
  [
    "Nutrition",
    [
      "Nutrition",
      "Fluids",
      "Salt & sodium",
      "Caffeine & alcohol",
      "Fruit & vegetables",
      "Hunger & appetite",
      "Digestion",
    ],
  ],
  [
    "Recovery",
    [
      "Sleep",
      "Energy and readiness",
      "Stress, mood and focus",
      "Soreness & discomfort",
      "Recovery context note",
    ],
  ],
  ["Training", ["How training feels"]],
  ["Activity", ["Movement and cardio", "Activity context note"]],
  ["Notes", ["Day context", "Notes"]],
];

export function autoTrackerGroup(parameterGroup: string): string {
  const builtIn = AUTO_TRACKER_GROUPS.find(
    ([id, sources]) =>
      id === parameterGroup || sources.includes(parameterGroup),
  )?.[0];
  if (builtIn) return builtIn;
  // Custom parameters are created from a board group, so that group id/label
  // is their home. Unknown groups still fall back to Notes.
  return parameterGroup.trim() || "Notes";
}

export function autoTrackerGroupForField(fieldId: string): string {
  const parameter = allParameters().find((item) => item.id === fieldId);
  return parameter ? autoTrackerGroup(parameter.group) : "Notes";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const cleanGroup = (
  raw: Record<string, unknown>,
  fieldsById: Set<string>,
  placed: Set<string>,
  seenGroups: Set<string>,
): TrackerLayoutGroup | undefined => {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id || seenGroups.has(id)) return undefined;
  seenGroups.add(id);
  const label =
    typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : id;
  const fieldIds: string[] = [];
  if (Array.isArray(raw.fieldIds))
    for (const fieldId of raw.fieldIds) {
      if (
        typeof fieldId !== "string" ||
        !fieldsById.has(fieldId) ||
        placed.has(fieldId)
      )
        continue;
      placed.add(fieldId);
      fieldIds.push(fieldId);
    }
  const group: TrackerLayoutGroup = { id, label, fieldIds };
  if (typeof raw.collapsed === "boolean") group.collapsed = raw.collapsed;
  if (typeof raw.pinned === "boolean") group.pinned = raw.pinned;
  return group;
};

/**
 * Normalise a variant's saved tracker layout. Returns `undefined` when there is
 * no usable configuration, which keeps the automatic grouping byte-identical.
 */
export function normalizeTrackerLayout(
  variant: Pick<Variant, "fields" | "trackerLayout"> | undefined,
): TrackerLayout | undefined {
  if (!variant) return undefined;
  const raw = variant.trackerLayout;
  if (!isRecord(raw) || !Array.isArray(raw.groups)) return undefined;
  const fieldsById = new Set(variant.fields.map((field) => field.id));
  const placed = new Set<string>();
  const seenGroups = new Set<string>();
  const groups: TrackerLayoutGroup[] = [];
  let recognised = 0;
  for (const entry of raw.groups) {
    if (!isRecord(entry)) continue;
    const group = cleanGroup(entry, fieldsById, placed, seenGroups);
    if (!group) continue;
    recognised += 1;
    groups.push(group);
  }
  // Nothing usable: keep the automatic grouping rather than hiding everything.
  if (raw.groups.length > 0 && recognised === 0) return undefined;
  // A tracker parameter that is not listed is appended to its automatic group
  // (creating that group when the layout removed it) so it can never vanish.
  for (const field of variant.fields) {
    if (placed.has(field.id)) continue;
    const auto = autoTrackerGroupForField(field.id);
    let group = groups.find((candidate) => candidate.id === auto);
    if (!group) {
      group = { id: auto, label: auto, fieldIds: [] };
      groups.push(group);
    }
    group.fieldIds.push(field.id);
    placed.add(field.id);
  }
  return { groups };
}
