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

/** MUSCLE_GROUPS plus the database-only groups, for the exercise-library dialog. */
export const LIBRARY_MUSCLE_GROUPS = [
  ...MUSCLE_GROUPS,
  { id: "adductors", label: "Adductors" },
  { id: "forearms", label: "Forearms" },
] as const;

/**
 * The canonical training-target rows for the weekly volume display, ordered by
 * muscle group (chest first, then back, shoulders, arms, core, legs). `region`
 * is the heatmap silhouette that target rolls up into.
 */
export const VOLUME_TARGETS: {
  id: string;
  label: string;
  group: MuscleGroup;
  region: MuscleGroup;
}[] = [
  { id: "chest", label: "Chest", group: "chest", region: "chest" },
  { id: "upper-chest", label: "Upper Chest", group: "chest", region: "chest" },
  {
    id: "mid-lower-chest",
    label: "Mid/Lower Chest",
    group: "chest",
    region: "chest",
  },
  { id: "latissimus", label: "Latissimus", group: "back", region: "back" },
  { id: "upper-back", label: "Upper Back", group: "back", region: "back" },
  {
    id: "spinal-erectors",
    label: "Spinal Erectors",
    group: "back",
    region: "back",
  },
  {
    id: "anterior-deltoids",
    label: "Anterior Deltoids",
    group: "shoulders",
    region: "shoulders",
  },
  {
    id: "lateral-deltoids",
    label: "Lateral Deltoids",
    group: "shoulders",
    region: "shoulders",
  },
  {
    id: "posterior-deltoids",
    label: "Posterior Deltoids",
    group: "shoulders",
    region: "shoulders",
  },
  { id: "biceps", label: "Biceps", group: "biceps", region: "biceps" },
  { id: "triceps", label: "Triceps", group: "triceps", region: "triceps" },
  { id: "abdominals", label: "Abdominals", group: "core", region: "core" },
  { id: "obliques", label: "Obliques", group: "core", region: "core" },
  {
    id: "gluteus-maximus",
    label: "Gluteus Maximus",
    group: "glutes",
    region: "glutes",
  },
  {
    id: "gluteus-medius",
    label: "Gluteus Medius",
    group: "glutes",
    region: "glutes",
  },
  {
    id: "quadriceps",
    label: "Quadriceps",
    group: "quadriceps",
    region: "quadriceps",
  },
  {
    id: "hamstrings",
    label: "Hamstrings",
    group: "hamstrings",
    region: "hamstrings",
  },
  { id: "calves", label: "Calves", group: "calves", region: "calves" },
  { id: "adductors", label: "Adductors", group: "calves", region: "calves" },
  { id: "forearms", label: "Forearms", group: "biceps", region: "biceps" },
];

const normTarget = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
const TARGET_ID: Record<string, string> = {};
for (const t of VOLUME_TARGETS) {
  TARGET_ID[normTarget(t.label)] = t.id;
  TARGET_ID[normTarget(t.id)] = t.id;
}
/** A target label/id from the database → the canonical target id, or undefined. */
export function targetIdFor(label?: string): string | undefined {
  if (!label) return undefined;
  return TARGET_ID[normTarget(label)];
}

export type VolumeExercise = {
  id?: string;
  muscle?: string;
  secondaryMuscles?: string[];
  primaryTarget?: string;
  additionalTargets?: string[];
  sets: number;
};

export type ScheduledWorkout = {
  week: number;
  exercises: VolumeExercise[];
};

export type VolumeTarget = {
  id: string;
  label: string;
  group: MuscleGroup;
  region: MuscleGroup;
  direct: number;
  indirect: number;
  /** (direct + 0.5 × indirect) normalised — colour only; counts are never halved. */
  intensity: number;
};

/**
 * Weekly set volume per training target. A working set counts as a direct set
 * for the exercise's primary target and an indirect set for each additional
 * target. An exercise without a primaryTarget falls back to its muscle-group
 * label (appended after the canonical targets); with neither it is unassigned.
 */
export function weeklyMuscleVolume(
  workouts: readonly ScheduledWorkout[],
  week: number,
) {
  const direct = new Map<string, number>();
  const indirect = new Map<string, number>();
  const customLabels = new Map<
    string,
    { label: string; muscle: MuscleGroup }
  >();
  let unassignedSets = 0;
  let totalSets = 0;
  const bump = (map: Map<string, number>, id: string, n: number) =>
    map.set(id, (map.get(id) ?? 0) + n);
  for (const workout of workouts) {
    if (workout.week !== week) continue;
    for (const ex of workout.exercises) {
      if (!Number.isSafeInteger(ex.sets) || ex.sets < 0) continue;
      totalSets += ex.sets;
      const primary = targetIdFor(ex.primaryTarget);
      if (primary) bump(direct, primary, ex.sets);
      else if (
        ex.muscle &&
        LIBRARY_MUSCLE_GROUPS.some((g) => g.id === ex.muscle)
      ) {
        const gid = `${ex.muscle}`;
        customLabels.set(gid, {
          label: muscleLabel(ex.muscle),
          muscle: (MUSCLE_GROUPS.some((g) => g.id === ex.muscle)
            ? ex.muscle
            : "back") as MuscleGroup,
        });
        bump(direct, gid, ex.sets);
      } else unassignedSets += ex.sets;
      for (const a of ex.additionalTargets ?? []) {
        const aid = targetIdFor(a);
        if (aid) bump(indirect, aid, ex.sets);
      }
    }
  }
  const targetIds = VOLUME_TARGETS.map((t) => t.id);
  const weight = (id: string) =>
    (direct.get(id) ?? 0) + 0.5 * (indirect.get(id) ?? 0);
  const maxSet = Math.max(0, ...targetIds.map(weight));
  const row = (
    id: string,
    label: string,
    group: MuscleGroup,
    region: MuscleGroup,
  ): VolumeTarget => {
    const d = direct.get(id) ?? 0;
    const i = indirect.get(id) ?? 0;
    return {
      id,
      label,
      group,
      region,
      direct: d,
      indirect: i,
      intensity: maxSet ? (d + 0.5 * i) / maxSet : 0,
    };
  };
  const targets = [
    ...VOLUME_TARGETS.map((t) => row(t.id, t.label, t.group, t.region)),
    ...[...customLabels.entries()]
      .filter(([id]) => !targetIds.includes(id))
      .map(([id, info]) => row(id, info.label, info.muscle, info.muscle)),
  ];
  return { totalSets, unassignedSets, targets };
}

function muscleLabel(id: string): string {
  return (
    LIBRARY_MUSCLE_GROUPS.find((g) => g.id === id)?.label ??
    `${id.charAt(0).toUpperCase()}${id.slice(1)}`
  );
}
