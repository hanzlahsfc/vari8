import assert from "node:assert/strict";
import test from "node:test";
import {
  applySharedSetPrescription,
  hasUniformSetPrescriptions,
  parseTrainingNumberDraft,
  replaceTrainingExerciseDefinition,
} from "../src/components/coach/plans/training/training-prescriptions.ts";
import type { TrainingSet } from "../src/components/coach/plans/types.ts";

const set = (id: string, patch: Partial<TrainingSet> = {}): TrainingSet => ({
  id,
  reps: 8,
  tempo: "3-1-1",
  type: "Working",
  rest: "90 sec",
  instructions: "",
  ...patch,
});

test("grouped mode recognizes uniform prescriptions and keeps varied sets individual", () => {
  assert.equal(hasUniformSetPrescriptions([set("a"), set("b")]), true);
  assert.equal(
    hasUniformSetPrescriptions([set("a"), set("b", { reps: 12 })]),
    false,
  );
});

test("applying one shared prescription preserves each set identity and all cue fields", () => {
  const sets = [set("a"), set("b", { reps: 12, instructions: "Pause" })];
  const reference = sets[0] ?? set("fallback");
  const [first, second] = applySharedSetPrescription(sets, {
    ...reference,
    reps: 10,
    repsMax: 12,
    type: "Drop set",
    instructions: "Control the lowering",
  });
  assert.equal(first?.id, "a");
  assert.equal(second?.id, "b");
  assert.equal(second?.reps, 10);
  assert.equal(second?.repsMax, 12);
  assert.equal(second?.type, "Drop set");
  assert.equal(second?.instructions, "Control the lowering");
});

test("numeric draft accepts 8 → empty → 1 → 12 without clamping intermediate typing", () => {
  const drafts = ["8", "", "1", "12"];
  assert.deepEqual(
    drafts.map((draft) => parseTrainingNumberDraft(draft, 1, 999)),
    [8, undefined, 1, 12],
  );
});

test("swapping a library reference keeps coach notes and prescription data", () => {
  const exercise = {
    id: "row-1",
    name: "Old movement",
    libraryId: "old-library-id",
    muscle: "back",
    secondaryMuscles: ["biceps"],
    generalNotes: "Coach-authored note",
    instructions: "Keep the wrist neutral",
    progression: "Add load next week",
    sets: [set("set-1", { reps: 10, instructions: "Pause at the top" })],
  };
  const swapped = replaceTrainingExerciseDefinition(exercise, {
    id: "new-library-id",
    name: "Cable row",
    muscle: "back",
    secondaryMuscles: ["biceps", "rear-delts"],
    notes: "Library cue should not replace the coach note",
  });

  assert.equal(swapped.id, "row-1");
  assert.equal(swapped.name, "Cable row");
  assert.equal(swapped.libraryId, "new-library-id");
  assert.deepEqual(swapped.secondaryMuscles, ["biceps", "rear-delts"]);
  assert.equal(swapped.generalNotes, "Coach-authored note");
  assert.equal(swapped.instructions, exercise.instructions);
  assert.equal(swapped.progression, exercise.progression);
  assert.deepEqual(swapped.sets, exercise.sets);
});
