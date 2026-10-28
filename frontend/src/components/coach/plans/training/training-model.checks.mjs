import assert from "node:assert/strict";
import { MUSCLE_GROUPS } from "../../muscle-volume.ts";
import { defaultExerciseLibrary } from "./library-model.ts";
import {
  cloneExercise,
  cloneSession,
  commitExerciseDraft,
  deleteTrainingSession,
  effectiveSessions,
  freshExercise,
  freshSet,
  groupConsecutiveSetPrescriptions,
  prescribedMuscleVolume,
  prescribedTrainingVolume,
  resizeExerciseSets,
  trainingRotationSchedule,
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
assert.equal(
  freshWithDefaults.sets.length,
  1,
  "a newly added exercise starts with one configurable set",
);
assert.equal(freshWithDefaults.progression, configuredDefaults.progression);
assert.equal(freshWithDefaults.sets[0].type, configuredDefaults.setType);
assert.equal(freshWithDefaults.sets[0].tempo, configuredDefaults.tempo);
assert.equal(freshWithDefaults.sets[0].rest, configuredDefaults.rest);
const addedSet = freshSet(configuredDefaults);
assert.equal(addedSet.type, configuredDefaults.setType);
assert.equal(addedSet.tempo, configuredDefaults.tempo);
assert.equal(addedSet.rest, configuredDefaults.rest);

const singleSetExercise = freshExercise(configuredDefaults);
const threeSetExercise = resizeExerciseSets(
  singleSetExercise,
  3,
  configuredDefaults,
);
assert.equal(threeSetExercise.sets.length, 3);
assert.equal(
  new Set(threeSetExercise.sets.map((set) => set.id)).size,
  3,
  "resized sets receive independent IDs",
);
assert.equal(
  threeSetExercise.sets[0].id,
  singleSetExercise.sets[0].id,
  "growing preserves the existing set ID",
);
assert.ok(
  threeSetExercise.sets.every((set) => set.type === configuredDefaults.setType),
  "new sets use the configured set type",
);
const reducedExercise = resizeExerciseSets(
  threeSetExercise,
  2,
  configuredDefaults,
);
assert.deepEqual(
  reducedExercise.sets.map((set) => set.id),
  threeSetExercise.sets.slice(0, 2).map((set) => set.id),
  "shrinking keeps the first existing sets and their IDs",
);
assert.equal(
  resizeExerciseSets(singleSetExercise, 0, configuredDefaults).sets.length,
  1,
  "set count cannot be reduced below one",
);
assert.equal(
  resizeExerciseSets(singleSetExercise, 25, configuredDefaults).sets.length,
  20,
  "set count is capped at twenty",
);

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
const groupedSets = groupConsecutiveSetPrescriptions(
  plan.overrides["1"][0].exercises[0].sets,
);
assert.deepEqual(
  groupedSets.map((group) => group.count),
  [3],
  "consecutive identical prescriptions collapse to one display group",
);
const variedSets = structuredClone(plan.overrides["1"][0].exercises[0].sets);
variedSets[2].tempo = "3-1-1";
assert.deepEqual(
  groupConsecutiveSetPrescriptions(variedSets).map((group) => group.count),
  [2, 1],
  "a set with a different tempo remains visibly separate",
);
const interveningSet = { ...variedSets[0], id: "set-intervening", reps: 6 };
assert.deepEqual(
  groupConsecutiveSetPrescriptions([
    variedSets[0],
    interveningSet,
    { ...variedSets[0], id: "set-last" },
  ]).map((group) => group.count),
  [1, 1, 1],
  "matching prescriptions separated by another set do not merge",
);
const draftSession = structuredClone(plan.overrides["1"][0]);
const exerciseDraft = structuredClone(draftSession.exercises[0]);
exerciseDraft.name = "Saved only on commit";
assert.equal(
  draftSession.exercises[0].name,
  "Squat",
  "editing a modal draft leaves the controlled session unchanged until save",
);
const committedSession = commitExerciseDraft(draftSession, exerciseDraft);
assert.equal(
  committedSession.exercises[0].name,
  "Saved only on commit",
  "save commits the complete exercise draft",
);
assert.equal(
  draftSession.exercises[0].name,
  "Squat",
  "discarding the local draft leaves the saved prescription unchanged",
);
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

const rotationPlan = structuredClone(plan);
rotationPlan.overrides = {
  1: [
    {
      id: "session-a",
      name: "Session A",
      exercises: [
        {
          ...plan.overrides["1"][0].exercises[0],
          id: "press",
          muscle: "chest",
        },
        {
          ...plan.overrides["1"][0].exercises[0],
          id: "unallocated",
          muscle: undefined,
          sets: plan.overrides["1"][0].exercises[0].sets.slice(0, 1),
        },
      ],
    },
    {
      id: "session-b",
      name: "Session B",
      exercises: [
        {
          ...plan.overrides["1"][0].exercises[0],
          id: "row",
          muscle: "back",
          sets: plan.overrides["1"][0].exercises[0].sets.slice(0, 2),
        },
      ],
    },
  ],
};
rotationPlan.rotation = {
  mode: "weekly",
  weekdays: { Monday: ["session-a"], Wednesday: ["session-a"] },
};
const repeatedWeekly = trainingRotationSchedule(rotationPlan, 1);
assert.deepEqual(
  repeatedWeekly.entries.map((entry) => entry.label),
  ["Monday", "Wednesday"],
  "weekly assignment exposes each scheduled occurrence",
);
const repeatedVolume = prescribedTrainingVolume(rotationPlan, 1);
assert.equal(
  repeatedVolume.groups.find((group) => group.id === "chest")?.sets,
  6,
);
assert.equal(repeatedVolume.totalSets, 8);
assert.equal(repeatedVolume.unassignedSets, 2);
assert.equal(repeatedVolume.periodLabel, "This week");

rotationPlan.rotation = {
  mode: "cycle",
  sessionIds: ["session-b", "session-a"],
};
const cycle = trainingRotationSchedule(rotationPlan, 1);
assert.deepEqual(
  cycle.entries.map((entry) => entry.session.id),
  ["session-b", "session-a"],
  "custom cycle keeps the saved session order",
);
assert.equal(
  prescribedTrainingVolume(rotationPlan, 1).periodLabel,
  "Per rotation",
);

rotationPlan.rotation = {
  mode: "cycle",
  sessionIds: ["session-b", null, "session-a", "session-b"],
};
const orderedCycle = trainingRotationSchedule(rotationPlan, 1);
assert.deepEqual(
  orderedCycle.entries.map((entry) =>
    entry.kind === "rest" ? "Off" : entry.session.id,
  ),
  ["session-b", "Off", "session-a", "session-b"],
  "custom rotations preserve OFF slots, order, and repeated sessions",
);
assert.equal(
  orderedCycle.entries.length,
  4,
  "OFF counts toward rotation length",
);
assert.equal(
  prescribedTrainingVolume(rotationPlan, 1).totalSets,
  8,
  "OFF contributes no prescribed volume",
);
const weekTwoOnlyMissing = trainingRotationSchedule(
  {
    ...rotationPlan,
    overrides: {
      1: rotationPlan.overrides["1"],
      2: [rotationPlan.overrides["1"][0]],
    },
  },
  2,
);
assert.deepEqual(
  weekTwoOnlyMissing.entries.map((entry) =>
    entry.kind === "rest" ? "Off" : entry.session.id,
  ),
  ["Off", "Off", "session-a", "Off"],
  "unavailable session references retain their day slot as Off for that week",
);

const removed = deleteTrainingSession(
  {
    ...rotationPlan,
    rotation: {
      mode: "cycle",
      sessionIds: ["session-b", "deleted", "session-a"],
    },
    overrides: {
      1: rotationPlan.overrides["1"],
      4: structuredClone(rotationPlan.overrides["1"]),
    },
  },
  2,
  "session-b",
);
assert.deepEqual(
  removed.rotation?.mode === "cycle" ? removed.rotation.sessionIds : [],
  ["session-b", null, "session-a"],
  "deletion keeps rest-day position and replaces invalid references while retaining still-used sessions",
);
assert.deepEqual(
  effectiveSessions(removed, 1).map((session) => session.id),
  ["session-a", "session-b"],
  "deleting a week 2 session preserves the week 1 snapshot",
);
assert.deepEqual(
  effectiveSessions(removed, 2).map((session) => session.id),
  ["session-a"],
  "deleting a session updates only the selected week snapshot",
);
assert.deepEqual(
  effectiveSessions(removed, 4).map((session) => session.id),
  ["session-a", "session-b"],
  "deleting a week 2 session preserves the future week 4 snapshot",
);
assert.deepEqual(
  trainingRotationSchedule(removed, 4).entries.map((entry) =>
    entry.kind === "rest" ? "Off" : entry.session.id,
  ),
  ["session-b", "Off", "session-a"],
  "a future session keeps its position in the custom cycle",
);

const legacyPlan = structuredClone(plan);
delete legacyPlan.rotation;
assert.deepEqual(
  trainingRotationSchedule(legacyPlan, 1).entries.map(
    (entry) => entry.session.id,
  ),
  ["day-1"],
  "plans without rotation preserve the existing one-session count",
);
assert.equal(prescribedTrainingVolume(legacyPlan, 1).totalSets, 3);
console.log("training model checks passed");
