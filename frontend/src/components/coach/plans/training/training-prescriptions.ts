import type {
  ExerciseDefinition,
  TrainingExercise,
  TrainingSet,
} from "../types";

/** Whether every set has the same complete saved prescription. */
export function hasUniformSetPrescriptions(sets: TrainingSet[]): boolean {
  if (sets.length < 2) return true;
  const [first, ...rest] = sets;
  if (!first) return true;
  return rest.every(
    (set) =>
      set.reps === first.reps &&
      set.repsMax === first.repsMax &&
      set.rir === first.rir &&
      set.rpe === first.rpe &&
      set.tempo === first.tempo &&
      set.type === first.type &&
      set.rest === first.rest &&
      set.instructions === first.instructions,
  );
}

/** Parse a draft numeric field without clamping partial or invalid input. */
export function parseTrainingNumberDraft(
  raw: string,
  min: number,
  max?: number,
): number | undefined {
  const parsed = Number(raw);
  if (
    raw.trim() === "" ||
    !Number.isInteger(parsed) ||
    parsed < min ||
    (max !== undefined && parsed > max)
  ) {
    return undefined;
  }
  return parsed;
}

/** Copy one set's prescription to all sets while preserving each set identity. */
export function applySharedSetPrescription(
  sets: TrainingSet[],
  prescription: TrainingSet,
): TrainingSet[] {
  return sets.map((set) => ({
    ...set,
    reps: prescription.reps,
    ...(prescription.repsMax === undefined
      ? { repsMax: undefined }
      : { repsMax: prescription.repsMax }),
    ...(prescription.rir === undefined
      ? { rir: undefined }
      : { rir: prescription.rir }),
    ...(prescription.rpe === undefined
      ? { rpe: undefined }
      : { rpe: prescription.rpe }),
    tempo: prescription.tempo,
    type: prescription.type,
    rest: prescription.rest,
    instructions: prescription.instructions,
  }));
}

/** Change the library reference while preserving the coach's exercise plan. */
export function replaceTrainingExerciseDefinition(
  exercise: TrainingExercise,
  definition: ExerciseDefinition,
): TrainingExercise {
  return {
    ...exercise,
    name: definition.name,
    libraryId: definition.id,
    muscle: definition.muscle,
    secondaryMuscles: [...definition.secondaryMuscles],
    equipment: definition.equipment,
    movementPattern: definition.movementPattern,
    position: definition.position,
    primaryTarget: definition.primaryTarget,
    additionalTargets: definition.additionalTargets,
  };
}
