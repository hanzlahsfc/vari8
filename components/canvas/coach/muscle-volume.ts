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
