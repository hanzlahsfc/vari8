import { weeklyMuscleVolume } from "../../muscle-volume";
import type { ExerciseDefinition } from "../types";
import {
  resolveTrainingWeek,
  setTrainingWeek,
  type TrainingExercise,
  type TrainingPlan,
  type TrainingSession,
  type TrainingSet,
} from "../types";

export function prescribedMuscleVolume(
  sessions: TrainingSession[],
  week: number,
  library: readonly ExerciseDefinition[] = [],
) {
  const byId = new Map(library.map((e) => [e.id, e]));
  const byName = new Map(
    library.map((e) => [e.name.trim().toLocaleLowerCase(), e]),
  );
  return weeklyMuscleVolume(
    [
      {
        week,
        exercises: sessions.flatMap((session) =>
          session.exercises.map((exercise) => {
            // Resolve missing target snapshots from the library (by id, then
            // name) before falling back to the muscle-label row.
            const def = exercise.libraryId
              ? byId.get(exercise.libraryId)
              : undefined;
            const fallback =
              def ??
              (exercise.name
                ? byName.get(exercise.name.trim().toLocaleLowerCase())
                : undefined);
            return {
              id: exercise.id,
              muscle: exercise.muscle ?? fallback?.muscle,
              primaryTarget: exercise.primaryTarget ?? fallback?.primaryTarget,
              additionalTargets:
                exercise.additionalTargets ?? fallback?.additionalTargets,
              sets: exercise.sets.filter(
                (set) => !/warm[ -]?up/i.test(set.type),
              ).length,
            };
          }),
        ),
      },
    ],
    week,
  );
}

export type RotationScheduleEntry =
  | {
      kind: "session";
      key: string;
      label: string;
      session: TrainingSession;
    }
  | {
      kind: "rest";
      key: string;
      label: "Off";
    };

export type TrainingRotationSchedule = {
  mode: "legacy" | "weekly" | "cycle";
  periodLabel: string;
  entries: RotationScheduleEntry[];
};

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function trainingRotationSchedule(
  plan: TrainingPlan,
  week: number,
): TrainingRotationSchedule {
  const sessions = effectiveSessions(plan, week);
  const rotation = plan.rotation;
  if (rotation?.mode === "weekly") {
    const occurrences = new Map<string, number>();
    return {
      mode: "weekly",
      periodLabel: "This week",
      entries: WEEKDAYS.flatMap((day) =>
        (rotation.weekdays[day] ?? [])
          .map((id) => sessions.find((session) => session.id === id))
          .filter(
            (session): session is TrainingSession => session !== undefined,
          )
          .map((session) => {
            const occurrenceKey = `${day}:${session.id}`;
            const occurrence = occurrences.get(occurrenceKey) ?? 0;
            occurrences.set(occurrenceKey, occurrence + 1);
            return {
              kind: "session" as const,
              key: `${occurrenceKey}:${occurrence}`,
              label: day,
              session,
            };
          }),
      ),
    };
  }
  if (rotation?.mode === "cycle") {
    const occurrences = new Map<string, number>();
    return {
      mode: "cycle",
      periodLabel: "Per rotation",
      entries: rotation.sessionIds.reduce<RotationScheduleEntry[]>(
        (entries, id, index) => {
          if (id === null) {
            entries.push({
              kind: "rest",
              key: `cycle:off:${index}`,
              label: "Off",
            });
            return entries;
          }
          const session = sessions.find((candidate) => candidate.id === id);
          if (!session) {
            entries.push({
              kind: "rest",
              key: `cycle:missing:${index}:${id}`,
              label: "Off",
            });
            return entries;
          }
          const occurrence = occurrences.get(session.id) ?? 0;
          occurrences.set(session.id, occurrence + 1);
          entries.push({
            kind: "session",
            key: `cycle:${session.id}:${occurrence}`,
            label: `Session ${session.name}`,
            session,
          });
          return entries;
        },
        [],
      ),
    };
  }
  return {
    mode: "legacy",
    periodLabel: plan.program === "Evergreen" ? "Ongoing plan" : `Week ${week}`,
    entries: sessions.map((session, index) => ({
      kind: "session" as const,
      key: `legacy:${session.id}`,
      label: `Session ${index + 1}`,
      session,
    })),
  };
}

export function prescribedTrainingVolume(
  plan: TrainingPlan,
  week: number,
  library: readonly ExerciseDefinition[] = [],
) {
  const schedule = trainingRotationSchedule(plan, week);
  return {
    ...prescribedMuscleVolume(
      schedule.entries.flatMap((entry) =>
        entry.kind === "session" ? [entry.session] : [],
      ),
      week,
      library,
    ),
    mode: schedule.mode,
    periodLabel: schedule.periodLabel,
  };
}

export function deleteTrainingSession(
  plan: TrainingPlan,
  week: number,
  sessionId: string,
): TrainingPlan {
  const remainingWeek = effectiveSessions(plan, week).filter(
    (session) => session.id !== sessionId,
  );
  const nextPlan = writeTrainingWeek(plan, week, remainingWeek);
  const remainingIds = new Set([
    ...Object.values(nextPlan.overrides).flatMap((sessions) =>
      sessions.map((session) => session.id),
    ),
    ...(nextPlan.adjustments ?? []).flatMap((adjustment) =>
      Object.values(adjustment.manual ?? {}).flatMap((sessions) =>
        sessions.map((session) => session.id),
      ),
    ),
  ]);
  const rotation =
    nextPlan.rotation?.mode === "weekly"
      ? {
          ...nextPlan.rotation,
          weekdays: Object.fromEntries(
            Object.entries(nextPlan.rotation.weekdays).map(([day, ids]) => [
              day,
              ids.filter((id) => remainingIds.has(id)),
            ]),
          ),
        }
      : nextPlan.rotation?.mode === "cycle"
        ? {
            ...nextPlan.rotation,
            sessionIds: nextPlan.rotation.sessionIds.map((id) =>
              id === null || remainingIds.has(id) ? id : null,
            ),
          }
        : undefined;
  return { ...nextPlan, ...(rotation ? { rotation } : {}) };
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
    sets: [freshSet(defaults)],
  };
}

export function resizeExerciseSets(
  exercise: TrainingExercise,
  requestedCount: number,
  defaults: TrainingDefaults = {},
): TrainingExercise {
  const count = Math.max(1, Math.min(20, Math.round(requestedCount)));
  if (count === exercise.sets.length) return exercise;
  if (count < exercise.sets.length) {
    return { ...exercise, sets: exercise.sets.slice(0, count) };
  }

  const seed = exercise.sets[0];
  const additionalSets = Array.from(
    { length: count - exercise.sets.length },
    () => {
      const set = freshSet({
        setType: defaults.setType ?? seed?.type,
        tempo: defaults.tempo ?? seed?.tempo,
        rest: defaults.rest ?? seed?.rest,
      });
      return seed
        ? { ...set, reps: seed.reps, instructions: seed.instructions }
        : set;
    },
  );
  return { ...exercise, sets: [...exercise.sets, ...additionalSets] };
}

export type SetPrescriptionGroup = {
  firstSetId: string;
  prescription: Omit<TrainingSet, "id">;
  count: number;
};

/** Groups only adjacent sets whose complete saved prescriptions match. */
export function groupConsecutiveSetPrescriptions(
  sets: TrainingSet[],
): SetPrescriptionGroup[] {
  return sets.reduce<SetPrescriptionGroup[]>((groups, set) => {
    const prescription = {
      reps: set.reps,
      ...(set.repsMax === undefined ? {} : { repsMax: set.repsMax }),
      ...(set.rir === undefined ? {} : { rir: set.rir }),
      ...(set.rpe === undefined ? {} : { rpe: set.rpe }),
      tempo: set.tempo,
      type: set.type,
      rest: set.rest,
      instructions: set.instructions,
    };
    const previous = groups.at(-1);
    if (
      previous &&
      previous.prescription.reps === prescription.reps &&
      previous.prescription.repsMax === prescription.repsMax &&
      previous.prescription.rir === prescription.rir &&
      previous.prescription.rpe === prescription.rpe &&
      previous.prescription.tempo === prescription.tempo &&
      previous.prescription.type === prescription.type &&
      previous.prescription.rest === prescription.rest &&
      previous.prescription.instructions === prescription.instructions
    ) {
      previous.count += 1;
      return groups;
    }
    groups.push({ firstSetId: set.id, prescription, count: 1 });
    return groups;
  }, []);
}

/** Save a modal draft as one exercise-level update, preserving session order. */
export function commitExerciseDraft(
  session: TrainingSession,
  draft: TrainingExercise,
): TrainingSession {
  return {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.id === draft.id ? structuredClone(draft) : exercise,
    ),
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
