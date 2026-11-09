import { displayWeek } from "../../../client-app/training-log/model";
import type {
  PlanLifecycle,
  TrainingCoachNote,
  TrainingPlan,
  TrainingSession,
} from "../types";

/**
 * Shape client-007's training lifecycle so the coach logbook shows real plan
 * changes anchored to the *current* week: Hip thrust gains a set the week
 * before `cur`, then a new plan version activates on the Monday of `cur` (in
 * effect now) in which the Back squat rep range tightens, the Cable glute
 * kickback is removed and the Seated hip abduction is added. Deterministic —
 * fixed ids, no random, anchor-relative dates.
 */

const LOWER_A = "amara-lower-a";
const HIP = "amara-lower-a-hip-thrust";
const SQUAT = "amara-lower-a-squat";
const KICKBACK = "amara-lower-a-kickback";
const ABDUCTION = "amara-lower-a-abduction";

const clone = <T>(v: T): T => structuredClone(v);
const monday = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const editSet = (
  ex: { sets: { reps: number; repsMax?: number }[] },
  reps: number,
  repsMax?: number,
) => {
  ex.sets.forEach((s) => {
    s.reps = reps;
    if (repsMax === undefined) delete s.repsMax;
    else s.repsMax = repsMax;
  });
};

/** The four sessions for a given week-version of Lower A. */
function sessionsForWeek(
  base: TrainingSession[],
  lowerA: TrainingSession,
): TrainingSession[] {
  return base.map((s) => (s.id === LOWER_A ? lowerA : s));
}
const exById = (s: TrainingSession, id: string) =>
  s.exercises.find((e) => e.id === id);

function lowerAVariant(
  base: TrainingSession,
  mods: {
    hipSets?: number;
    squatReps?: [number, number?];
    remove?: string[];
    add?: {
      id: string;
      name: string;
      muscle: string;
      reps: number;
      repsMax?: number;
      sets: number;
      rest: string;
    }[];
  },
): TrainingSession {
  const s = clone(base);
  const hip = exById(s, HIP);
  if (hip && mods.hipSets !== undefined) {
    const count = mods.hipSets;
    hip.sets = Array.from({ length: count }, (_, i) => ({
      ...hip.sets[Math.min(i, hip.sets.length - 1)],
      id: `${HIP}-set-${i + 1}`,
    }));
  }
  const squat = exById(s, SQUAT);
  if (squat && mods.squatReps)
    editSet(squat, mods.squatReps[0], mods.squatReps[1]);
  if (mods.remove?.length)
    s.exercises = s.exercises.filter((e) => !mods.remove?.includes(e.id));
  for (const a of mods.add ?? []) {
    s.exercises = s.exercises.filter((e) => e.id !== a.id);
    s.exercises.push({
      id: a.id,
      name: a.name,
      muscle: a.muscle,
      instructions: "",
      progression: "",
      sets: Array.from({ length: a.sets }, (_, i) => ({
        id: `${a.id}-set-${i + 1}`,
        reps: a.reps,
        repsMax: a.repsMax,
        tempo: "Controlled",
        type: "Working",
        rest: a.rest,
        instructions: "",
      })),
    });
  }
  return s;
}

/**
 * Returns a `plans.training` lifecycle with the demo story applied, or the
 * input untouched when it can't be reshaped. Before `cur−1`: Hip thrust 3
 * sets, Back squat 6–8, kickback, no abduction. From `cur−1`: +1 Hip thrust
 * set (per-week override). From `cur` (a new version activated its Monday):
 * squat 5–7, kickback removed, hip abduction added.
 */
export function shapeLogbookTraining(
  life: PlanLifecycle<TrainingPlan> | undefined,
  today: string,
): PlanLifecycle<TrainingPlan> | undefined {
  const current = life?.active?.content;
  if (!life || !current) return life;
  const baseSessions = current.overrides["1"] ?? [];
  const lowerBase = baseSessions.find((s) => s.id === LOWER_A);
  if (!lowerBase) return life;
  const start = current.startDate;
  const cur = Math.max(2, displayWeek(current, today));
  const addWk = Math.max(2, cur - 1); // +1 set from the week before `cur`
  const verMonday = addDays(monday(start), (cur - 1) * 7); // Monday of `cur`

  // v1 (up to `cur`): kickback present, no abduction, Hip thrust 3→4 at `cur−1`.
  const lowerA_early = lowerAVariant(lowerBase, {
    squatReps: [6, 8],
    remove: [ABDUCTION],
  });
  const lowerA_bump = lowerAVariant(lowerA_early, { hipSets: 4 });
  const v1: TrainingPlan = {
    ...clone(current),
    overrides: {
      "1": sessionsForWeek(baseSessions, lowerA_early),
      [String(addWk)]: sessionsForWeek(baseSessions, lowerA_bump),
    },
  };
  // v2 (activated Monday of `cur`): squat 5–7, kickback removed, abduction in.
  const lowerA_v2 = lowerAVariant(lowerBase, {
    hipSets: 4,
    squatReps: [5, 7],
    remove: [KICKBACK],
  });
  const v2: TrainingPlan = {
    ...clone(current),
    overrides: { "1": sessionsForWeek(baseSessions, lowerA_v2) },
  };
  return {
    draft: structuredClone(v2),
    active: {
      id: `demo-training-v${cur}`,
      content: v2,
      activatedAt: `${verMonday}T08:00:00Z`,
    },
    history: [
      {
        id: "demo-training-v1",
        content: v1,
        activatedAt: `${start}T08:00:00Z`,
        archivedOn: verMonday,
      },
    ],
  };
}

/**
 * Deterministic coach notes anchored to the current week: a per-set review
 * note two weeks back (or the earliest logged week) and an "onwards" note
 * starting next week.
 */
export function logbookDemoNotes(
  clientId: string,
  sessionId: string,
  exerciseId: string,
  today: string,
  cur: number,
): TrainingCoachNote[] {
  // per-set review note: two weeks back when that week was logged, else W2
  // (W1 isn't scheduled when the plan starts mid-week)
  const setNoteWeek = cur - 2 >= 2 ? cur - 2 : 2;
  const onwardsWeek = cur + 1;
  return [
    {
      id: "demo-note-hips-early",
      clientId,
      sessionId,
      exerciseKey: exerciseId,
      setIndex: 2,
      field: "reps",
      fromWeek: setNoteWeek,
      untilWeek: setNoteWeek,
      text: "Hips rose early, keep ribs down",
      createdAt: `${addDays(monday(today), -9)}T09:00:00Z`,
    },
    {
      id: "demo-note-pause-top",
      clientId,
      sessionId,
      exerciseKey: exerciseId,
      // exercise-level ("All sets") note — no setIndex/field
      fromWeek: onwardsWeek,
      text: "Add a 2 s pause at the top on every set.",
      createdAt: `${today}T09:00:00Z`,
    },
  ];
}
