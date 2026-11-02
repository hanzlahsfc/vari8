import {
  DEFAULT_LOG_FIELDS,
  displayWeek,
  scheduledSessions,
  startLog,
  updateSet,
} from "../client-app/training-log/model";
import type { CoachClient, CoachState } from "./model";
import { applicablePlan } from "./plans/domain";
import type {
  LoggedSet,
  TrainingPlan,
  TrainingSessionLog,
} from "./plans/types";

export const TRAINING_LOG_DEMO_REVISION = 1 as const;
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

/** Plausible deterministic base load per exercise (20-77.5 kg in 2.5 steps). */
const baseLoad = (key: string) => 20 + (hash32(key) % 24) * 2.5;

function loggedValues(
  prescription: { reps: number; repsMax?: number },
  key: string,
  week: number,
  setIndex: number,
): Pick<LoggedSet, "weight" | "reps"> {
  const span = (prescription.repsMax ?? prescription.reps) - prescription.reps;
  const reps =
    prescription.reps +
    (span > 0 ? hash32(`${key}:${setIndex}`) % (span + 1) : 0);
  return { weight: baseLoad(key) + 2.5 * (week - 1), reps };
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
  for (let week = 1; week <= lastWeek; week += 1)
    for (const item of scheduledSessions(plan, week))
      if (item.date < today) items.push({ week, item });
  items.sort((a, b) => a.item.date.localeCompare(b.item.date));
  if (!items.length) return [];

  // The most recent past session stays in progress so Resume is demonstrable.
  const resumeIndex = items.length - 1;
  let flagSpent = false;
  return items.map(({ week, item }, index) => {
    const finished = index < resumeIndex;
    let log = startLog({
      id: `demo-log-${item.date}-${item.occurrenceKey.replace(/:/g, "-")}`,
      clientId: client.id,
      plan,
      item,
      logFields,
      loadUnit,
      now: `${item.date}T18:00:00`,
    });
    const exercisesToLog = finished
      ? log.exercises.length
      : Math.min(2, log.exercises.length);
    for (let e = 0; e < exercisesToLog; e += 1) {
      const exercise = log.exercises[e];
      for (const [setIndex, set] of exercise.sets.entries()) {
        const prescription = exercise.prescription.sets[setIndex];
        const values = loggedValues(
          prescription,
          exercise.exerciseKey,
          week,
          setIndex,
        );
        const flag =
          finished &&
          !flagSpent &&
          isLowerBody(item.session.name, item.session.id) &&
          e === 0 &&
          setIndex === exercise.sets.length - 1;
        log = updateSet(log, exercise.exerciseId, set.setId, {
          done: true,
          weight: values.weight,
          reps: values.reps,
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
    return finished
      ? {
          ...log,
          status: "finished" as const,
          finishedAt: `${item.date}T19:00:00`,
        }
      : log;
  });
}

/**
 * Give the demo client a believable logbook: finished logs for every scheduled
 * session up to yesterday except the latest, which stays resumable. Only fills
 * an empty logbook - existing logs (and the rest of the state) are untouched.
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
    ? applicablePlan(client.plans.training, today)
    : undefined;
  if (!client || !plan) return state;

  const variant = client.assignment?.snapshot.variants.find(
    (candidate) => candidate.id === client.assignment?.variantId,
  );
  const existing = state.trainingLogs ?? [];
  const logs = existing.some((log) => log.clientId === client.id)
    ? existing
    : [
        ...existing,
        ...logsForPlan(
          client,
          plan,
          variant?.training.logFields ?? DEFAULT_LOG_FIELDS,
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
