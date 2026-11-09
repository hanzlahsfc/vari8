import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeTimelineSetup } from "./athlete/timeline-config.ts";
import { TIMELINE_GROUP_DEFAULTS } from "./athlete/timeline-groups.ts";
import { normalizeTrackerLayout } from "./athlete/tracker-layout.ts";
import {
  addGroup,
  addItemToGroup,
  hiddenItems,
  hideItem,
  moveItem,
  moveItemToGroup,
  removeGroup,
  renameGroup,
  reorderGroup,
  resetLayout,
  setGroupFlag,
  timelineLayout,
  timelineLayoutDefaults,
  timelineLayoutFrom,
  toggleVisibility,
  toTimelineGroups,
  toTrackerLayout,
  trackerLayoutDefaults,
  trackerLayoutFrom,
} from "./setup-layout.ts";

test("timeline editor starts from the configured default groups", () => {
  const groups = timelineLayout();
  assert.deepEqual(
    groups.map((group) => ({ id: group.id, items: group.items })),
    TIMELINE_GROUP_DEFAULTS.map((group) => ({
      id: group.id,
      items: group.columnIds,
    })),
  );
  assert.equal(
    new Set(groups.flatMap((group) => group.items)).size,
    groups.flatMap((group) => group.items).length,
  );
});

test("timeline items move within and between groups", () => {
  const groups = timelineLayout();
  const notesIndex = groups.findIndex((group) => group.id === "Notes");
  const within = moveItem(groups, "Notes", 1, 0);
  assert.deepEqual(within[notesIndex].items, ["note", "changes"]);
  const moved = moveItemToGroup(groups, "weight-avg", "Notes");
  assert.deepEqual(moved[notesIndex].items, ["changes", "note", "weight-avg"]);
  assert.ok(
    !moved
      .find((group) => group.id === "Bodyweight")
      ?.items.includes("weight-avg"),
  );
  assert.deepEqual(
    hiddenItems(groups, [
      { id: "weight-avg", label: "Ø kg", homeGroup: "Bodyweight" },
    ]),
    [],
  );
  // Selecting the item's current group is a no-op, not a move to the end.
  const sameGroup = moveItemToGroup(groups, "weight-avg", "Bodyweight");
  assert.deepEqual(
    sameGroup.find((group) => group.id === "Bodyweight")?.items,
    ["weight-avg", "weight-change", "weight-rate"],
  );
});

test("groups reorder, rename, add, flag and delete", () => {
  const groups = timelineLayout();
  assert.equal(reorderGroup(groups, 0, 2)[2].id, "Bodyweight");
  assert.equal(
    renameGroup(groups, "Notes", "  Coach notes ")[6].label,
    "Coach notes",
  );
  const withCustom = addGroup(groups, "custom-weight", "Weight");
  assert.equal(withCustom.at(-1)?.id, "custom-weight");
  assert.equal(addGroup(withCustom, "custom-weight").length, withCustom.length);
  const flagged = setGroupFlag(withCustom, "custom-weight", "collapsed", true);
  assert.equal(flagged.at(-1)?.collapsed, true);
  assert.equal(removeGroup(flagged, "custom-weight").length, groups.length);
});

test("visibility hides an item and adds it back to its home group", () => {
  const groups = timelineLayout();
  const hidden = toggleVisibility(groups, "weight-avg", false);
  assert.ok(!hidden.some((group) => group.items.includes("weight-avg")));
  const restored = toggleVisibility(hidden, "weight-avg", true, "Bodyweight");
  assert.ok(
    restored
      .find((group) => group.id === "Bodyweight")
      ?.items.includes("weight-avg"),
  );
  // Adding an already visible item never duplicates it.
  const again = toggleVisibility(restored, "weight-avg", true, "Bodyweight");
  assert.deepEqual(again, restored);
});

test("reset restores the configured defaults without flags", () => {
  const changed = setGroupFlag(timelineLayout(), "Notes", "pinned", true);
  assert.deepEqual(resetLayout(timelineLayoutDefaults()), timelineLayout());
  assert.ok(changed.some((group) => group.pinned));
});

test("timeline conversions match the job E normaliser shape", () => {
  const groups = addGroup(timelineLayout(), "custom-a", "Custom A");
  const withFlag = setGroupFlag(groups, "custom-a", "pinned", true);
  const moved = moveItemToGroup(withFlag, "note", "custom-a");
  const converted = toTimelineGroups(moved);
  assert.deepEqual(
    converted.find((group) => group.id === "custom-a"),
    {
      id: "custom-a",
      label: "Custom A",
      columns: ["note"],
      pinned: true,
    },
  );
  const normalised = normalizeTimelineSetup({
    timeline: { groups: converted },
  });
  assert.deepEqual(normalised.groups, converted);
  // No unseen or duplicate column survives the converter.
  const duplicated = toTimelineGroups(
    moved.map((group, index) =>
      index === 0 ? { ...group, items: [...group.items, "note"] } : group,
    ),
  );
  assert.equal(
    duplicated.filter((group) => group.columns.includes("note")).length,
    1,
  );
});

test("timeline layout reads the raw stored groups, including empty groups", () => {
  const variant = {
    timeline: {
      groups: [
        { id: "custom-a", label: "Custom A", columns: ["weight-avg"] },
        { id: "custom-empty", label: "Empty", columns: [] },
      ],
    },
  };
  assert.deepEqual(
    timelineLayoutFrom(variant).map((group) => group.id),
    ["custom-a", "custom-empty"],
  );
});

test("tracker layout starts from automatic groups and keeps unlisted fields visible", () => {
  const fields = [
    { id: "weight", unit: "kg" },
    { id: "sleep", unit: "h" },
    { id: "steps", unit: "steps" },
  ];
  const defaults = trackerLayoutDefaults(fields.map((field) => field.id));
  assert.deepEqual(
    defaults.map((group) => group.id),
    ["Body", "Recovery", "Activity"],
  );
  const variant = {
    fields,
    trackerLayout: {
      groups: [
        { id: "Body", label: "Body", fieldIds: ["weight"], collapsed: true },
      ],
    },
  };
  const groups = trackerLayoutFrom(variant);
  assert.deepEqual(
    groups.map((group) => [group.id, group.items]),
    [
      ["Body", ["weight"]],
      ["Recovery", ["sleep"]],
      ["Activity", ["steps"]],
    ],
  );
  assert.equal(groups[0].collapsed, true);
  const layout = toTrackerLayout(
    groups,
    fields.map((field) => field.id),
  );
  assert.deepEqual(layout.groups[0], {
    id: "Body",
    label: "Body",
    fieldIds: ["weight"],
    collapsed: true,
  });
  assert.deepEqual(
    normalizeTrackerLayout({ ...variant, trackerLayout: layout }),
    layout,
  );
});

test("tracker conversions drop removed fields and empty requested items", () => {
  const fields = [{ id: "weight", unit: "kg" }];
  const groups = trackerLayoutFrom({ fields });
  const layout = toTrackerLayout(
    groups.map((group) => ({ ...group, items: [...group.items, "gone"] })),
    fields.map((field) => field.id),
  );
  assert.deepEqual(layout.groups, [
    { id: "Body", label: "Body", fieldIds: ["weight"] },
  ]);
});

test("an item moves between groups at the requested index", () => {
  const groups = timelineLayout();
  const moved = moveItemToGroup(groups, "note", "Bodyweight", 1);
  assert.deepEqual(moved.find((group) => group.id === "Bodyweight")?.items, [
    "weight-avg",
    "note",
    "weight-change",
    "weight-rate",
  ]);
  assert.ok(
    !moved.find((group) => group.id === "Notes")?.items.includes("note"),
  );
  const atEnd = moveItemToGroup(groups, "note", "Bodyweight");
  assert.equal(
    atEnd.find((group) => group.id === "Bodyweight")?.items.at(-1),
    "note",
  );
});

test("a parameter is added into a group once", () => {
  const groups = trackerLayoutFrom({ fields: [{ id: "weight", unit: "kg" }] });
  const appended = addItemToGroup(groups, "sleep", "Body");
  assert.deepEqual(appended[0].items, ["weight", "sleep"]);
  const atStart = addItemToGroup(groups, "sleep", "Body", 0);
  assert.deepEqual(atStart[0].items, ["sleep", "weight"]);
  assert.deepEqual(addItemToGroup(appended, "sleep", "Body")[0].items, [
    "weight",
    "sleep",
  ]);
  assert.deepEqual(addItemToGroup(groups, "sleep", "missing"), groups);
});

test("hiding an item keeps it available for the hidden tray", () => {
  const groups = timelineLayout();
  const hidden = hideItem(groups, "note");
  assert.ok(!hidden.some((group) => group.items.includes("note")));
  assert.deepEqual(
    hiddenItems(hidden, [
      { id: "note", label: "Note", homeGroup: "Notes" },
    ]).map((item) => item.id),
    ["note"],
  );
  const restored = toggleVisibility(hidden, "note", true, "Notes");
  assert.ok(
    restored.find((group) => group.id === "Notes")?.items.includes("note"),
  );
});

test("the structure board uses pointer drag without a new dependency", async () => {
  const source = await readFile(
    new URL("./structure-board.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /from "\.\/setup-layout"/);
  assert.match(source, /beginDrag/);
  assert.match(source, /cd-structure-drop/);
  assert.doesNotMatch(
    source,
    /from "(?:@dnd-kit|react-dnd|react-beautiful-dnd)/,
  );
});

test("timeline layout preserves param columns and their metadata", () => {
  const groups = timelineLayout([
    {
      id: "Bodyweight",
      label: "Bodyweight",
      columns: [
        "weight-avg",
        { id: "param:stress", label: "Stress load", agg: "avg", decimals: 0 },
      ],
    },
  ]);
  assert.deepEqual(groups[0].items, ["weight-avg", "param:stress"]);
  const meta = new Map([
    ["param:stress", { label: "Stress load", agg: "avg", decimals: 0 }],
  ]);
  const stored = toTimelineGroups(groups, meta);
  assert.deepEqual(stored[0].columns, [
    "weight-avg",
    { id: "param:stress", label: "Stress load", agg: "avg", decimals: 0 },
  ]);
});

test("a custom parameter can be added to a chosen tracker group", () => {
  const id = "custom-1234abcd";
  const groups = resetLayout(trackerLayoutDefaults(["weight", "stress"]));
  const next = addItemToGroup(groups, id, "Recovery");
  assert.deepEqual(next.find((group) => group.id === "Recovery")?.items, [
    "stress",
    id,
  ]);
  assert.deepEqual(next.find((group) => group.id === "Body")?.items, [
    "weight",
  ]);
});
