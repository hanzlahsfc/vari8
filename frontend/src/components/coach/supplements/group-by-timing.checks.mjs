import assert from "node:assert/strict";
import { groupByTiming, timingKey, timingRank } from "./group-by-timing.ts";

const names = (groups) => groups.map((group) => group.label);
const order = (groups) =>
  groups.map((group) => group.items.map((item) => item.id));

// Normalization: trimmed, case-insensitive, first spelling wins.
assert.equal(timingKey("  With Breakfast "), "with breakfast");
assert.equal(timingRank("On waking"), 0);
assert.equal(timingRank("Fasted cardio"), 0);
assert.equal(timingRank("Pre workout"), 2);
assert.equal(timingRank("pre-workout"), 2);
assert.equal(timingRank("Before training"), 2);
assert.equal(timingRank("Intra-workout"), 3);
assert.equal(timingRank("After training"), 4);
assert.equal(timingRank("with dinner"), 7);
assert.equal(timingRank("Before bed"), 8);
assert.equal(timingRank("Sleep"), 8);
assert.equal(timingRank(""), null);
assert.equal(timingRank("whenever"), null);

const items = [
  { id: "a", timing: "Before bed" },
  { id: "b", timing: "Unknown 2" },
  { id: "c", timing: "With Breakfast" },
  { id: "d", timing: "  with breakfast " },
  { id: "e", timing: "Unknown 1" },
  { id: "f", timing: "" },
  { id: "g", timing: "Pre-workout" },
  { id: "h", timing: "Post workout" },
  { id: "i", timing: "On waking" },
  { id: "j", timing: "With lunch" },
  { id: "k", timing: "Afternoon" },
  { id: "l", timing: "Intra-workout" },
  { id: "m", timing: "   " },
];
const groups = groupByTiming(items);
assert.deepEqual(names(groups), [
  "On waking",
  "With Breakfast",
  "Pre-workout",
  "Intra-workout",
  "Post workout",
  "With lunch",
  "Afternoon",
  "Before bed",
  "Unknown 2",
  "Unknown 1",
  "No timing set",
]);
assert.deepEqual(order(groups), [
  ["i"],
  ["c", "d"],
  ["g"],
  ["l"],
  ["h"],
  ["j"],
  ["k"],
  ["a"],
  ["b"],
  ["e"],
  ["f", "m"],
]);
// First-seen original spelling, not the later variant.
assert.equal(groups[1].label, "With Breakfast");
// Empty timing is last even when it appears earlier in the array.
assert.equal(groups.at(-1).key, "");
assert.equal(groups.at(-1).label, "No timing set");
// Within-group array order is preserved.
assert.deepEqual(
  groups[1].items.map((item) => item.id),
  ["c", "d"],
);

// Unknown timings keep first-appearance order but always trail known ranks.
const unknownFirst = groupByTiming([
  { id: "x", timing: "Custom slot" },
  { id: "y", timing: "Before bed" },
  { id: "z", timing: "Another slot" },
]);
assert.deepEqual(names(unknownFirst), [
  "Before bed",
  "Custom slot",
  "Another slot",
]);
assert.deepEqual(order(unknownFirst), [["y"], ["x"], ["z"]]);

// No items → no groups; a single empty group is still last.
assert.deepEqual(groupByTiming([]), []);
const onlyEmpty = groupByTiming([{ id: "e", timing: "" }]);
assert.deepEqual(names(onlyEmpty), ["No timing set"]);
