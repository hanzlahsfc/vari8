/**
 * PR-M6 (D29, S07-15, V3-CP13) — the canvas muscle-volume math ported to
 * the server. Source of truth: the canvas implementation at
 * `frontend/src/components/coach/muscle-volume.ts` and the
 * `prescribedMuscleVolume`/`volumeExerciseId` adapters at
 * `frontend/src/components/coach/plans/training/training-model.ts`.
 *
 * `weeklyMuscleVolume`, `MUSCLE_GROUPS`, `PRIMARY_MUSCLE`,
 * `VOLUME_EXERCISE_ID` and `volumeExerciseId` are verbatim ports — the
 * product must compute the same numbers the canvas panel shows. The
 * frontend copy is not edited; a later wiring PR (PR-W8) switches the
 * canvas to consume this module.
 */

export const MUSCLE_GROUPS = [
  { id: "chest", label: "Chest" },
  { id: "back", label: "Back" },
  { id: "shoulders", label: "Shoulders" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "core", label: "Core" },
  { id: "glutes", label: "Glutes" },
  { id: "quadriceps", label: "Quadriceps" },
  { id: "hamstrings", label: "Hamstrings" },
  { id: "calves", label: "Calves" },
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]["id"];
export const MUSCLE_GROUP_IDS: readonly MuscleGroup[] = MUSCLE_GROUPS.map(
  (group) => group.id,
);
export const MUSCLE_GROUP_ID_SET: ReadonlySet<string> = new Set(
  MUSCLE_GROUP_IDS,
);

export type ScheduledWorkout = {
  week: number;
  exercises: { id: string; sets: number }[];
};
const PRIMARY_MUSCLE: Record<string, MuscleGroup> = {
  deadlift: "hamstrings",
  "split-squat": "glutes",
  "hip-thrust": "glutes",
  "hamstring-curl": "hamstrings",
  "leg-extension": "quadriceps",
  "calf-raise": "calves",
  bench: "chest",
  row: "back",
  "shoulder-press": "shoulders",
  "biceps-curl": "biceps",
  "triceps-extension": "triceps",
  plank: "core",
};

export function weeklyMuscleVolume(
  workouts: readonly ScheduledWorkout[],
  week: number,
) {
  const counts = new Map<MuscleGroup, number>(
    MUSCLE_GROUPS.map((group) => [group.id, 0]),
  );
  let unassignedSets = 0;
  let totalSets = 0;
  for (const workout of workouts) {
    if (workout.week !== week) continue;
    for (const exercise of workout.exercises) {
      if (!Number.isSafeInteger(exercise.sets) || exercise.sets < 0) continue;
      totalSets += exercise.sets;
      const group = PRIMARY_MUSCLE[exercise.id];
      if (group) counts.set(group, (counts.get(group) ?? 0) + exercise.sets);
      else unassignedSets += exercise.sets;
    }
  }
  const maximum = Math.max(0, ...counts.values());
  return {
    totalSets,
    unassignedSets,
    groups: MUSCLE_GROUPS.map((group) => {
      const sets = counts.get(group.id) ?? 0;
      return {
        ...group,
        sets,
        intensity: maximum ? sets / maximum : 0,
      };
    }),
  };
}

const VOLUME_EXERCISE_ID: Record<MuscleGroup, string> = {
  chest: "bench",
  back: "row",
  shoulders: "shoulder-press",
  biceps: "biceps-curl",
  triceps: "triceps-extension",
  core: "plank",
  glutes: "hip-thrust",
  quadriceps: "leg-extension",
  hamstrings: "hamstring-curl",
  calves: "calf-raise",
};

export function volumeExerciseId(id: string, muscle?: string): string {
  return muscle && muscle in VOLUME_EXERCISE_ID
    ? VOLUME_EXERCISE_ID[muscle as MuscleGroup]
    : id;
}

// ── Materialized-program adapter (canvas `prescribedMuscleVolume`) ────────

/**
 * A prescribed set row as materialized by lib/trainingprogram/payload
 * (declared structurally so this module stays a leaf: payload imports
 * this file, never the reverse). Only `type` is read here.
 */
export type PrescribedSetLike = {
  id?: string;
  reps?: number;
  repsMax?: number;
  tempo?: string;
  type?: string;
  rest?: string;
  instructions?: string;
  coachNote?: string;
};

export type VolumeExerciseInput = {
  id: string;
  muscle?: string;
  /** Scalar set count (legacy prescription path). */
  sets?: number;
  /** Ordered per-set rows; warm-up rows are not working sets. */
  setRows?: readonly PrescribedSetLike[];
};

export type VolumeSessionInput = {
  exercises: readonly VolumeExerciseInput[];
};

const WARM_UP_RE = /warm[ -]?up/i;

/**
 * Working sets for one exercise: when ordered set rows exist they are
 * counted with the canvas warm-up filter; otherwise the scalar `sets`
 * count is used verbatim (the canvas illustrative path counts all sets).
 */
export function workingSetCount(exercise: VolumeExerciseInput): number {
  if (exercise.setRows)
    return exercise.setRows.filter((set) => !WARM_UP_RE.test(set.type ?? ""))
      .length;
  return typeof exercise.sets === "number" ? exercise.sets : 0;
}

/**
 * Muscle-group working sets for one program week — the canvas
 * `prescribedMuscleVolume` fed from materialized sessions instead of the
 * canvas TrainingSession shape. Same mapping, same filter, same result.
 */
export function programMuscleVolume(
  sessions: readonly VolumeSessionInput[],
  week: number,
) {
  return weeklyMuscleVolume(
    [
      {
        week,
        exercises: sessions.flatMap((session) =>
          session.exercises.map((exercise) => ({
            id: volumeExerciseId(exercise.id, exercise.muscle),
            sets: workingSetCount(exercise),
          })),
        ),
      },
    ],
    week,
  );
}
