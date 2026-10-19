import assert from "node:assert/strict";
import { MUSCLE_GROUPS } from "../../muscle-volume.ts";
import { defaultExerciseLibrary } from "./library-model.ts";
import {
  cloneExercise,
  cloneSession,
  effectiveSessions,
  freshExercise,
  freshSet,
  prescribedMuscleVolume,
  volumeExerciseId,
  writeTrainingWeek,
} from "./training-model.ts";

const seededLibrary = defaultExerciseLibrary();
const seededLibraryAgain = defaultExerciseLibrary();
assert.equal(
  seededLibrary.length,
  10,
  "the starter library is intentionally small",
);
assert.equal(
  new Set(seededLibrary.map((item) => item.id)).size,
  seededLibrary.length,
  "starter library IDs are unique",
);
assert.deepEqual(
  seededLibrary.map((item) => item.id),
  seededLibraryAgain.map((item) => item.id),
  "starter IDs stay stable across loads",
);
assert.ok(
  seededLibrary.every((item) =>
    MUSCLE_GROUPS.some((group) => group.id === item.muscle),
  ),
  "each starter uses a supported primary muscle group",
);
const configuredDefaults = {
  setType: "Top set",
  progression: "Add reps, then load",
  tempo: "2-0-2",
  rest: "2 min",
};
const freshWithDefaults = freshExercise(configuredDefaults);
assert.equal(freshWithDefaults.progression, configuredDefaults.progression);
assert.equal(freshWithDefaults.sets[0].type, configuredDefaults.setType);
assert.equal(freshWithDefaults.sets[0].tempo, configuredDefaults.tempo);
assert.equal(freshWithDefaults.sets[0].rest, configuredDefaults.rest);
const addedSet = freshSet(configuredDefaults);
assert.equal(addedSet.type, configuredDefaults.setType);
assert.equal(addedSet.tempo, configuredDefaults.tempo);
assert.equal(addedSet.rest, configuredDefaults.rest);

const plan = {
  id: "p",
  clientId: "c",
  name: "Strength",
  startDate: "2026-01-01",
  program: "Week-based",
  weeks: 8,
  overrides: {
    1: [
      {
        id: "day-1",
        name: "A",
        exercises: [
          {
            id: "lift-1",
            name: "Squat",
            instructions: "",
            progression: "",
            sets: [
              {
                id: "set-1",
                reps: 8,
                tempo: "",
                type: "Working",
                rest: "",
                instructions: "",
              },
              {
                id: "set-2",
                reps: 8,
                tempo: "",
                type: "Working",
                rest: "",
                instructions: "",
              },
              {
                id: "set-3",
                reps: 8,
                tempo: "",
                type: "Working",
                rest: "",
                instructions: "",
              },
            ],
          },
        ],
      },
    ],
  },
};
const week2 = writeTrainingWeek(plan, 2, effectiveSessions(plan, 2));
assert.equal(
  effectiveSessions(week2, 2)[0].exercises[0].sets.length,
  3,
  "week 1 prescription carries to week 2",
);
assert.equal(
  effectiveSessions(week2, 3)[0].exercises[0].sets.length,
  3,
  "week 2 prescription carries to week 3",
);
const week4Sessions = structuredClone(effectiveSessions(week2, 4));
week4Sessions[0].exercises[0].sets.push({
  id: "set-4",
  reps: 8,
  tempo: "",
  type: "Working",
  rest: "",
  instructions: "",
});
const week4 = writeTrainingWeek(week2, 4, week4Sessions);
const week6Sessions = structuredClone(effectiveSessions(week4, 6));
week6Sessions[0].exercises[0].sets.push({
  id: "set-5",
  reps: 6,
  tempo: "",
  type: "Working",
  rest: "",
  instructions: "",
});
const week6 = writeTrainingWeek(week4, 6, week6Sessions);
const revisedWeek4 = structuredClone(effectiveSessions(week6, 4));
revisedWeek4[0].exercises[0].sets.push({
  id: "set-6",
  reps: 10,
  tempo: "",
  type: "Working",
  rest: "",
  instructions: "",
});
const revised = writeTrainingWeek(week6, 4, revisedWeek4);
assert.equal(
  effectiveSessions(revised, 4)[0].exercises[0].sets.length,
  5,
  "week 4 can be edited directly",
);
assert.equal(
  effectiveSessions(revised, 5)[0].exercises[0].sets.length,
  5,
  "week 4 change carries until the next override",
);
assert.equal(
  effectiveSessions(revised, 6)[0].exercises[0].sets.length,
  5,
  "later week 6 override survives a week 4 edit",
);

const duplicate = cloneSession(plan.overrides["1"][0]);
assert.notEqual(duplicate.id, plan.overrides["1"][0].id);
assert.notEqual(
  duplicate.exercises[0].id,
  plan.overrides["1"][0].exercises[0].id,
);
assert.notEqual(
  duplicate.exercises[0].sets[0].id,
  plan.overrides["1"][0].exercises[0].sets[0].id,
);
const duplicateExercise = cloneExercise(plan.overrides["1"][0].exercises[0]);
assert.notEqual(duplicateExercise.id, plan.overrides["1"][0].exercises[0].id);
assert.notEqual(
  duplicateExercise.sets[0].id,
  plan.overrides["1"][0].exercises[0].sets[0].id,
);
for (const group of MUSCLE_GROUPS) {
  assert.notEqual(
    volumeExerciseId("custom-exercise", group.id),
    "custom-exercise",
    `${group.id} maps to a supported exercise id`,
  );
  const volume = prescribedMuscleVolume(
    [
      {
        id: "session",
        name: "A",
        exercises: [
          {
            id: "custom-exercise",
            name: "Custom",
            muscle: group.id,
            instructions: "",
            progression: "",
            sets: plan.overrides["1"][0].exercises[0].sets,
          },
        ],
      },
    ],
    1,
  );
  assert.equal(
    volume.groups.find((item) => item.id === group.id)?.sets,
    3,
    `${group.id} receives explicitly allocated sets`,
  );
  assert.equal(volume.unassignedSets, 0);
}
const unassigned = prescribedMuscleVolume(
  [
    {
      id: "session",
      name: "A",
      exercises: [
        {
          id: "custom-exercise",
          name: "My movement",
          instructions: "",
          progression: "",
          sets: plan.overrides["1"][0].exercises[0].sets,
        },
      ],
    },
  ],
  1,
);
assert.equal(
  unassigned.unassignedSets,
  3,
  "unknown custom exercises remain explicitly unassigned",
);
assert.equal(unassigned.totalSets, 3);
const unsupportedMuscle = prescribedMuscleVolume(
  [
    {
      id: "session-unknown-muscle",
      name: "A",
      exercises: [
        {
          id: "custom-exercise",
          name: "Custom movement",
          muscle: "not-a-supported-group",
          instructions: "",
          progression: "",
          sets: plan.overrides["1"][0].exercises[0].sets,
        },
      ],
    },
  ],
  1,
);
assert.equal(
  unsupportedMuscle.unassignedSets,
  3,
  "unsupported stored muscle identifiers remain unassigned",
);
console.log("training model checks passed");
