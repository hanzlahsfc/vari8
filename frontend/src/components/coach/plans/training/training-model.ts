import { type MuscleGroup, weeklyMuscleVolume } from "../../muscle-volume";
import {
  resolveTrainingWeek,
  setTrainingWeek,
  type TrainingExercise,
  type TrainingPlan,
  type TrainingSession,
  type TrainingSet,
} from "../types";

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

export function prescribedMuscleVolume(
  sessions: TrainingSession[],
  week: number,
) {
  return weeklyMuscleVolume(
    [
      {
        week,
        exercises: sessions.flatMap((session) =>
          session.exercises.map((exercise) => ({
            id: volumeExerciseId(exercise.id, exercise.muscle),
            sets: exercise.sets.filter((set) => !/warm[ -]?up/i.test(set.type))
              .length,
          })),
        ),
      },
    ],
    week,
  );
}

export const makeId = (kind: string) =>
  `${kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

export type TrainingDefaults = {
  setType?: string;
  progression?: string;
  tempo?: string;
  rest?: string;
};

export function freshSet(defaults: TrainingDefaults = {}): TrainingSet {
  return {
    id: makeId("set"),
    reps: 8,
    tempo: defaults.tempo ?? "",
    type: defaults.setType ?? "Working",
    rest: defaults.rest ?? "",
    instructions: "",
  };
}

export function freshExercise(
  defaults: TrainingDefaults = {},
): TrainingExercise {
  return {
    id: makeId("exercise"),
    name: "New exercise",
    instructions: "",
    progression: defaults.progression ?? "",
    sets: [freshSet(defaults), freshSet(defaults), freshSet(defaults)],
  };
}

export function freshSession(index: number): TrainingSession {
  return { id: makeId("session"), name: `Session ${index + 1}`, exercises: [] };
}

export function cloneSet(set: TrainingSet): TrainingSet {
  return { ...structuredClone(set), id: makeId("set") };
}

export function cloneExercise(exercise: TrainingExercise): TrainingExercise {
  return {
    ...structuredClone(exercise),
    id: makeId("exercise"),
    sets: exercise.sets.map(cloneSet),
  };
}

export function cloneSession(session: TrainingSession): TrainingSession {
  return {
    ...structuredClone(session),
    id: makeId("session"),
    exercises: session.exercises.map(cloneExercise),
  };
}

export function cloneSessions(sessions: TrainingSession[]): TrainingSession[] {
  return sessions.map(cloneSession);
}

/** Store an explicit snapshot at this week; later overrides remain independent. */
export function writeTrainingWeek(
  plan: TrainingPlan,
  week: number,
  sessions: TrainingSession[],
): TrainingPlan {
  return setTrainingWeek(plan, week, sessions);
}

export function effectiveSessions(
  plan: TrainingPlan,
  week: number,
): TrainingSession[] {
  return resolveTrainingWeek(plan, week);
}

export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (
    from < 0 ||
    from >= items.length ||
    to < 0 ||
    to >= items.length ||
    from === to
  )
    return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
