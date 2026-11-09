import {
  displayWeek,
  effectiveLogFields,
  scheduledSessions,
  startLog,
  updateSet,
} from "../client-app/training-log/model";
import type { CoachClient, CoachState } from "./model";
import { trainingPlanAt } from "./plans/domain";
import type {
  LoggedSet,
  TrainingPlan,
  TrainingSessionLog,
} from "./plans/types";

export const TRAINING_LOG_DEMO_REVISION = 9 as const;
export const TRAINING_LOG_DEMO_CLIENT_ID = "client-007";

// Deterministic fillers keep screenshots stable across reloads and machines.
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Plausible deterministic base load per exercise (20–77.5 kg in 2.5 steps). */
const baseLoad = (key: string) => 20 + (hash32(key) % 24) * 2.5;

function loggedValues(
  prescription: { reps: number; repsMax?: number; rir?: number; rpe?: number },
  key: string,
  week: number,
  setIndex: number,
): Pick<LoggedSet, "weight" | "reps" | "rir" | "rpe"> {
  const span = (prescription.repsMax ?? prescription.reps) - prescription.reps;
  const reps =
    prescription.reps +
    (span > 0 ? hash32(`${key}:${setIndex}`) % (span + 1) : 0);
  // plausible logged intensity: the target, sometimes one notch harder
  const jig = hash32(`${key}:i:${setIndex}:${week}`) % 4 === 0 ? 1 : 0;
  const rir =
    prescription.rir === undefined ? null : Math.max(0, prescription.rir - jig);
  const rpe =
    prescription.rpe === undefined
      ? null
      : Math.min(10, prescription.rpe + 0.5 * jig);
  return { weight: baseLoad(key) + 2.5 * (week - 1), reps, rir, rpe };
}

const isLowerBody = (sessionName: string, sessionId: string) =>
  /lower/i.test(`${sessionName} ${sessionId}`);

function logsForPlan(
  client: CoachClient,
  plan: TrainingPlan,
  logFields: TrainingSessionLog["logFields"],
  loadUnit: TrainingSessionLog["loadUnit"],
  today: string,
): TrainingSessionLog[] {
  const items = [] as {
    week: number;
    item: ReturnType<typeof scheduledSessions>[number];
  }[];
  const lastWeek = displayWeek(plan, today);
  // each week is generated from its own version, not today's
  const weekPlans = Array.from({ length: lastWeek }, (_, i) => {
    const week = i + 1;
    const items0 = scheduledSessions(plan, week);
    return items0.length
      ? (trainingPlanAt(
          client.plans?.training ?? { history: [] },
          items0[0].date,
        ) ?? plan)
      : plan;
  });
  for (let week = 1; week <= lastWeek; week += 1)
    // The demo is viewed in the evening: today's scheduled session is done,
    // later sessions in the current week stay unlogged.
    for (const item of scheduledSessions(weekPlans[week - 1] ?? plan, week))
      if (item.date <= today) items.push({ week, item });
  items.sort((a, b) => a.item.date.localeCompare(b.item.date));
  if (!items.length) return [];

  let flagSpent = false;
  return items.map(({ week, item }) => {
    let log = startLog({
      id: `demo-log-${item.date}-${item.occurrenceKey.replace(/:/g, "-")}`,
      clientId: client.id,
      plan: weekPlans[week - 1] ?? plan,
      item,
      logFields,
      loadUnit,
      now: `${item.date}T18:00:00`,
    });
    for (const [e, exercise] of log.exercises.entries()) {
      for (const [setIndex, set] of exercise.sets.entries()) {
        const prescription = exercise.prescription.sets[setIndex];
        const values = loggedValues(
          prescription,
          exercise.exerciseKey,
          week,
          setIndex,
        );
        const flag =
          !flagSpent &&
          isLowerBody(item.session.name, item.session.id) &&
          e === 0 &&
          setIndex === exercise.sets.length - 1;
        log = updateSet(log, exercise.exerciseId, set.setId, {
          done: true,
          weight: values.weight,
          reps: values.reps,
          ...(values.rir !== null ? { rir: values.rir } : {}),
          ...(values.rpe !== null ? { rpe: values.rpe } : {}),
          ...(flag
            ? {
                note: "Left knee felt tight on the last rep",
                flagged: true,
              }
            : {}),
        });
        if (flag) flagSpent = true;
      }
    }
    return {
      ...log,
      status: "finished" as const,
      finishedAt: `${item.date}T19:00:00`,
    };
  });
}

/**
 * Give the demo client a believable logbook: finished logs for every scheduled
 * session up to and including today (the demo is viewed in the evening), with
 * the rest of the current week left unlogged. On a new revision the demo
 * client's logs are regenerated so they match the current demo plan; other
 * clients' logs (and the rest of the state) are untouched.
 */
export function adoptTrainingLogDemo(
  state: CoachState,
  today: string,
): CoachState {
  if (state.demoSeeds?.trainingLogDemo === TRAINING_LOG_DEMO_REVISION)
    return state;
  const client = state.clients.find(
    (candidate) => candidate.id === TRAINING_LOG_DEMO_CLIENT_ID,
  );
  const plan = client?.plans
    ? trainingPlanAt(client.plans.training, today)
    : undefined;
  if (!client || !plan) return state;

  const variant = client.assignment?.snapshot.variants.find(
    (candidate) => candidate.id === client.assignment?.variantId,
  );
  // Amara prescribes RIR — set it here too so the seeded logs carry `rir` in
  // their logFields snapshot (adoptAthleteDataDemo runs after and sets the same).
  if (variant) {
    variant.training.intensity = "rir";
    variant.training.exerciseInfo = ["equipment", "movementPattern", "cues"];
  }
  const existing = state.trainingLogs ?? [];
  const logs = [
    ...existing.filter((log) => log.clientId !== client.id),
    ...logsForPlan(
      client,
      plan,
      effectiveLogFields(variant?.training),
      variant?.training.loadUnit ?? "kg",
      today,
    ),
  ];

  return {
    ...state,
    trainingLogs: logs,
    demoSeeds: {
      ...state.demoSeeds,
      trainingLogDemo: TRAINING_LOG_DEMO_REVISION,
    },
  };
}
