import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(
  new URL("./muscle-volume.ts", import.meta.url),
  "utf8",
);
const code = stripTypeScriptTypes(source, { mode: "strip" });
const { weeklyMuscleVolume } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const sample = [
  {
    week: 6,
    exercises: [
      { id: "deadlift", sets: 4 },
      { id: "split-squat", sets: 3 },
    ],
  },
  {
    week: 6,
    exercises: [
      { id: "bench", sets: 4 },
      { id: "row", sets: 3 },
    ],
  },
];

test("the existing sample schedule counts working sets by primary muscle per week", () => {
  const before = structuredClone(sample);
  const result = weeklyMuscleVolume(sample, 6);
  assert.equal(result.totalSets, 14);
  assert.equal(result.unassignedSets, 0);
  const groups = Object.fromEntries(
    result.groups.map((group) => [group.id, group]),
  );
  assert.equal(groups.hamstrings.sets, 4);
  assert.equal(groups.glutes.sets, 3);
  assert.equal(groups.chest.sets, 4);
  assert.equal(groups.back.sets, 3);
  assert.equal(groups.quadriceps.sets, 0);
  assert.equal(groups.glutes.intensity, 0.75);
  assert.equal(groups.chest.intensity, 1);
  assert.deepEqual(sample, before);
});

test("different weeks and scheduled sessions remain isolated, with empty intensity safe", () => {
  const workouts = [
    ...sample,
    { week: 7, exercises: [{ id: "hip-thrust", sets: 5 }] },
  ];
  assert.equal(weeklyMuscleVolume(workouts, 6).totalSets, 14);
  assert.equal(
    weeklyMuscleVolume(workouts, 7).groups.find(
      (group) => group.id === "glutes",
    ).sets,
    5,
  );
  const empty = weeklyMuscleVolume(workouts, 8);
  assert.equal(empty.totalSets, 0);
  assert.ok(empty.groups.every((group) => group.intensity === 0));
});

test("unmapped sets are reported rather than assigned a fabricated muscle or silently lost", () => {
  const result = weeklyMuscleVolume(
    [
      {
        week: 1,
        exercises: [
          { id: "unknown", sets: 3 },
          { id: "bench", sets: 2 },
          { id: "bench", sets: -1 },
          { id: "bench", sets: 2.5 },
        ],
      },
    ],
    1,
  );
  assert.equal(result.totalSets, 5);
  assert.equal(result.unassignedSets, 3);
  assert.equal(result.groups.find((group) => group.id === "chest").sets, 2);
});
