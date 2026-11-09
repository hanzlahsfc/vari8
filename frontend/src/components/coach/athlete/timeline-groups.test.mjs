import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeTimelineGroupIds,
  TIMELINE_COLUMN_IDS,
  TIMELINE_GROUP_BY_COLUMN,
  TIMELINE_GROUP_DEFAULTS,
  TIMELINE_GROUP_ORDER,
} from "./timeline-groups.ts";

const tabSource = await readFile(
  new URL("./timeline-tab.tsx", import.meta.url),
  "utf8",
);

test("group order runs Bodyweight → Nutrition → Activity → Recovery → Training → Check-in → Notes", () => {
  assert.deepEqual(TIMELINE_GROUP_ORDER, [
    "Bodyweight",
    "Nutrition",
    "Activity plan",
    "Recovery",
    "Training",
    "Check-in",
    "Notes",
  ]);
  assert.deepEqual(
    TIMELINE_GROUP_DEFAULTS.map((group) => group.label),
    [
      "Bodyweight",
      "Nutrition",
      "Activity plan",
      "Recovery",
      "Training",
      "Check-in",
      "Notes",
    ],
  );
});

test("water sits in Nutrition and Recovery keeps only recovery fields", () => {
  const nutrition = TIMELINE_GROUP_DEFAULTS.find(
    (group) => group.id === "Nutrition",
  );
  assert.ok(nutrition);
  assert.deepEqual(nutrition.columnIds, [
    "kcal-plan",
    "protein",
    "carbs",
    "fat",
    "water",
  ]);
  assert.equal(nutrition.label, "Nutrition");

  const recovery = TIMELINE_GROUP_DEFAULTS.find(
    (group) => group.id === "Recovery",
  );
  assert.ok(recovery);
  assert.deepEqual(recovery.columnIds, ["sleep"]);
  assert.equal(TIMELINE_GROUP_BY_COLUMN.get("water"), "Nutrition");
  assert.equal(TIMELINE_GROUP_BY_COLUMN.get("checkin"), "Check-in");
});

test("check-in is its own group between Training and Notes", () => {
  const order = TIMELINE_GROUP_ORDER;
  const checkin = order.indexOf("Check-in");
  assert.ok(checkin > order.indexOf("Training"));
  assert.ok(checkin < order.indexOf("Notes"));
  assert.deepEqual(TIMELINE_GROUP_BY_COLUMN.get("checkin"), "Check-in");
});

test("normalizeTimelineGroupIds renames retired ids and drops unknown ones", () => {
  assert.deepEqual(normalizeTimelineGroupIds(["Nutrition plan"]), [
    "Nutrition",
  ]);
  assert.deepEqual(normalizeTimelineGroupIds(["Recovery"]), ["Recovery"]);
  assert.deepEqual(
    normalizeTimelineGroupIds(["Nutrition plan", "Recovery", "Logged"]),
    ["Nutrition", "Recovery"],
  );
  assert.deepEqual(normalizeTimelineGroupIds(["Nutrition", "Nutrition plan"]), [
    "Nutrition",
  ]);
  assert.deepEqual(normalizeTimelineGroupIds(["Logged", "Unknown"]), []);
});

test("default column ids are unique and owned by exactly one group", () => {
  assert.equal(new Set(TIMELINE_COLUMN_IDS).size, TIMELINE_COLUMN_IDS.length);
  assert.equal(TIMELINE_GROUP_BY_COLUMN.size, TIMELINE_COLUMN_IDS.length);
});

test("every column in the tab registry is assigned to a default group", () => {
  const registry = tabSource.slice(
    tabSource.indexOf("const COLS:"),
    tabSource.indexOf("const COL_MAP"),
  );
  const ids = [...registry.matchAll(/^\s{4}id: "([^"]+)",$/gm)].map(
    (match) => match[1],
  );
  assert.ok(ids.length > 0, "expected to find registry column ids");
  for (const id of ids)
    assert.ok(
      TIMELINE_GROUP_BY_COLUMN.has(id),
      `${id} is not assigned to a TIMELINE_GROUP_DEFAULTS group`,
    );
  assert.deepEqual(new Set(ids), new Set(TIMELINE_COLUMN_IDS));
});
