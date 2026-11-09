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
const row = (targets, id) => targets.find((t) => t.id === id);

const sample = [
  {
    week: 6,
    exercises: [
      { primaryTarget: "Hamstrings", sets: 4 },
      { primaryTarget: "Gluteus Maximus", sets: 3 },
    ],
  },
  {
    week: 6,
    exercises: [
      { primaryTarget: "Chest", sets: 4 },
      { primaryTarget: "Latissimus", sets: 3 },
    ],
  },
];

test("counts working sets as direct sets on each primary target", () => {
  const before = structuredClone(sample);
  const result = weeklyMuscleVolume(sample, 6);
  assert.equal(result.totalSets, 14);
  assert.equal(result.unassignedSets, 0);
  assert.equal(row(result.targets, "hamstrings").direct, 4);
  assert.equal(row(result.targets, "gluteus-maximus").direct, 3);
  assert.equal(row(result.targets, "chest").direct, 4);
  assert.equal(row(result.targets, "latissimus").direct, 3);
  assert.equal(row(result.targets, "quadriceps").direct, 0);
  // heaviest target normalises to 1; the 3-set targets are 0.75
  assert.equal(row(result.targets, "gluteus-maximus").intensity, 0.75);
  assert.equal(row(result.targets, "chest").intensity, 1);
  assert.deepEqual(sample, before);
});

test("additional targets count as indirect sets, never merged into direct", () => {
  const result = weeklyMuscleVolume(
    [
      {
        week: 1,
        exercises: [
          {
            primaryTarget: "Gluteus Maximus",
            additionalTargets: ["Quadriceps", "Hamstrings"],
            sets: 4,
          },
        ],
      },
    ],
    1,
  );
  assert.equal(row(result.targets, "gluteus-maximus").direct, 4);
  assert.equal(row(result.targets, "gluteus-maximus").indirect, 0);
  assert.equal(row(result.targets, "quadriceps").direct, 0);
  assert.equal(row(result.targets, "quadriceps").indirect, 4);
  assert.equal(row(result.targets, "hamstrings").indirect, 4);
});

test("different weeks and sessions remain isolated; empty intensity is safe", () => {
  const workouts = [
    ...sample,
    { week: 7, exercises: [{ primaryTarget: "Gluteus Maximus", sets: 5 }] },
  ];
  assert.equal(weeklyMuscleVolume(workouts, 6).totalSets, 14);
  assert.equal(
    row(weeklyMuscleVolume(workouts, 7).targets, "gluteus-maximus").direct,
    5,
  );
  const empty = weeklyMuscleVolume(workouts, 8);
  assert.equal(empty.totalSets, 0);
  assert.ok(empty.targets.every((t) => t.intensity === 0));
});

test("unmapped sets are reported rather than fabricating a target", () => {
  const result = weeklyMuscleVolume(
    [
      {
        week: 1,
        exercises: [
          { sets: 3 }, // no target or muscle
          { primaryTarget: "Chest", sets: 2 },
          { primaryTarget: "Chest", sets: -1 },
          { primaryTarget: "Chest", sets: 2.5 },
        ],
      },
    ],
    1,
  );
  assert.equal(result.totalSets, 5);
  assert.equal(result.unassignedSets, 3);
  assert.equal(row(result.targets, "chest").direct, 2);
});

test("an exercise without a primaryTarget falls back to its muscle label", () => {
  const result = weeklyMuscleVolume(
    [{ week: 1, exercises: [{ muscle: "glutes", sets: 3 }] }],
    1,
  );
  assert.equal(row(result.targets, "glutes").direct, 3);
  assert.equal(result.unassignedSets, 0);
  // an unrecognised muscle id stays unassigned
  const bogus = weeklyMuscleVolume(
    [{ week: 1, exercises: [{ muscle: "not-a-muscle", sets: 2 }] }],
    1,
  );
  assert.equal(bogus.unassignedSets, 2);
});
