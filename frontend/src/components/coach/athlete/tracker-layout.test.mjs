import assert from "node:assert/strict";
import test from "node:test";
import { isCoachState, seedState } from "../model.ts";
import { buildGroups, trackerFields } from "./tracker-columns.ts";
import { normalizeTrackerLayout } from "./tracker-layout.ts";

/**
 * Captured from the pre-configuration automatic grouping (2026-11-03 seed).
 * Absent trackerLayout must keep producing exactly this output.
 */
const AUTOMATIC = {
  "Emma Anders": [
    { id: "Body", label: "Body", cols: ["weight", "time"] },
    { id: "Nutrition", label: "Nutrition", cols: ["calories", "protein"] },
    { id: "Recovery", label: "Recovery", cols: ["sleep", "energy"] },
    { id: "Activity", label: "Activity", cols: ["steps"] },
    { id: "Notes", label: "Notes", cols: ["@coach"] },
  ],
  "Maya Patel": [
    { id: "Body", label: "Body", cols: ["weight", "time"] },
    { id: "Nutrition", label: "Nutrition", cols: ["calories", "protein"] },
    { id: "Recovery", label: "Recovery", cols: ["sleep", "energy"] },
    { id: "Activity", label: "Activity", cols: ["steps"] },
    { id: "Notes", label: "Notes", cols: ["@coach"] },
  ],
  "Amara Lewis": [
    { id: "Body", label: "Body", cols: ["weight", "time"] },
    { id: "Health", label: "Health", cols: ["rhr", "fbg", "bp"] },
    {
      id: "Cycle",
      label: "Cycle",
      cols: ["bleeding-level", "cramps", "pms-symptoms"],
    },
    {
      id: "Nutrition",
      label: "Nutrition",
      cols: [
        "@day",
        "@plan",
        "calories",
        "protein",
        "carbs",
        "fat",
        "water",
        "salt-intake",
        "caffeine-intake",
        "hunger",
        "bloating",
      ],
    },
    {
      id: "Recovery",
      label: "Recovery",
      cols: ["sleep", "energy", "sleep-quality", "muscle-soreness", "stress"],
    },
    {
      id: "Training",
      label: "Training",
      cols: ["@session", "energy-in-gym", "mood-in-gym"],
    },
    {
      id: "Activity",
      label: "Activity",
      cols: ["steps", "cardio-duration"],
    },
    { id: "Notes", label: "Notes", cols: ["daily-note", "@coach"] },
  ],
};

const shaped = (groups) =>
  groups.map((group) => ({
    id: group.id,
    label: group.label,
    cols: group.cols.map((col) => col.key),
  }));

const seeded = () => {
  const state = seedState("2026-11-03");
  const byName = (name) => state.clients.find((client) => client.name === name);
  return { state, byName };
};

test("absent tracker layout keeps the automatic grouping byte-identical", () => {
  const { state, byName } = seeded();
  for (const [name, expected] of Object.entries(AUTOMATIC)) {
    const client = byName(name);
    assert.ok(client, name);
    assert.equal(
      client.assignment?.snapshot.variants.find(
        (variant) => variant.id === client.assignment?.variantId,
      )?.trackerLayout,
      undefined,
    );
    assert.deepEqual(shaped(buildGroups(client)), expected, name);
    assert.deepEqual(shaped(buildGroups(client)), expected, `${name} again`);
    assert.equal(isCoachState(state), true);
  }
});

test("tracker layout keeps order/labels, drops unknown ids and de-duplicates fields", () => {
  const { byName } = seeded();
  const client = byName("Emma Anders");
  const variant = client.assignment.snapshot.variants.find(
    (item) => item.id === client.assignment.variantId,
  );
  variant.trackerLayout = {
    groups: [
      {
        id: "Recovery",
        label: "Recovery",
        fieldIds: ["sleep", "missing-field", "sleep"],
      },
      {
        id: "custom-main",
        label: "Main",
        fieldIds: ["weight", "calories"],
        collapsed: true,
        pinned: true,
      },
      { id: "Recovery", label: "Duplicate", fieldIds: ["energy"] },
    ],
  };
  const normalized = normalizeTrackerLayout(variant);
  assert.deepEqual(normalized, {
    groups: [
      { id: "Recovery", label: "Recovery", fieldIds: ["sleep", "energy"] },
      {
        id: "custom-main",
        label: "Main",
        fieldIds: ["weight", "calories"],
        collapsed: true,
        pinned: true,
      },
      { id: "Body", label: "Body", fieldIds: ["time"] },
      { id: "Activity", label: "Activity", fieldIds: ["steps"] },
      { id: "Nutrition", label: "Nutrition", fieldIds: ["protein"] },
    ],
  });
  assert.deepEqual(shaped(buildGroups(client)), [
    { id: "Recovery", label: "Recovery", cols: ["sleep", "energy"] },
    { id: "custom-main", label: "Main", cols: ["weight", "calories"] },
    { id: "Body", label: "Body", cols: ["time"] },
    { id: "Activity", label: "Activity", cols: ["steps"] },
    { id: "Nutrition", label: "Nutrition", cols: ["protein"] },
    { id: "Notes", label: "Notes", cols: ["@coach"] },
  ]);
});

test("a newly added tracker parameter is appended to its automatic group", () => {
  const { byName } = seeded();
  const client = byName("Emma Anders");
  const variant = client.assignment.snapshot.variants.find(
    (item) => item.id === client.assignment.variantId,
  );
  variant.trackerLayout = {
    groups: [{ id: "custom-main", label: "Main", fieldIds: ["weight"] }],
  };
  variant.fields.push({ id: "water", unit: "L" });
  const groups = buildGroups(client);
  const nutrition = groups.find((group) => group.id === "Nutrition");
  assert.ok(nutrition);
  assert.ok(nutrition.cols.some((col) => col.key === "water"));
  assert.deepEqual(
    trackerFields(client).map((field) => field.id),
    variant.fields.map((field) => field.id),
  );
});

test("malformed tracker layout falls back to automatic grouping", () => {
  const { byName } = seeded();
  const client = byName("Emma Anders");
  const variant = client.assignment.snapshot.variants.find(
    (item) => item.id === client.assignment.variantId,
  );
  const expected = shaped(buildGroups(client));
  for (const bad of [
    "nope",
    3,
    [],
    { groups: "not-an-array" },
    { groups: [{ id: 3, fieldIds: ["weight"] }] },
  ]) {
    variant.trackerLayout = bad;
    assert.equal(normalizeTrackerLayout(variant), undefined);
    assert.deepEqual(shaped(buildGroups(client)), expected);
  }
});

test("an empty configured layout still renders every field through its auto group", () => {
  const { byName } = seeded();
  const client = byName("Emma Anders");
  const variant = client.assignment.snapshot.variants.find(
    (item) => item.id === client.assignment.variantId,
  );
  const expected = shaped(buildGroups(client)).flatMap((group) => group.cols);
  variant.trackerLayout = { groups: [] };
  const actual = shaped(buildGroups(client));
  assert.deepEqual(
    actual.flatMap((group) => group.cols).sort(),
    [...expected].sort(),
  );
  assert.equal(
    actual.flatMap((group) => group.cols).length,
    new Set(actual.flatMap((group) => group.cols)).size,
  );
});
