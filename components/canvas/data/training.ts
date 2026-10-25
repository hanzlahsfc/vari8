// Training domain provider (PR-W0). Owns the coach exercise library, the
// per-client training plan lifecycles and the per-client activity target
// versions. PR-W8 wires this domain to the server; it edits this file only.

import type { CoachState } from "../coach/model";
import {
  emptyClientPlans,
  type ClientPlans,
  type ExerciseDefinition,
} from "../coach/plans/types";
import type { CoachSlice } from "./provider";

export const TRAINING_KEY = "coach-data-training-v1";

type TrainingData = {
  exerciseLibrary?: ExerciseDefinition[];
  /** Training plan lifecycle per client id. */
  training: Record<string, ClientPlans["training"]>;
  /** Activity target versions per client id (prescriptions sit with training). */
  activityTargets?: Record<string, ClientPlans["activityTargets"]>;
  /** Client-logged training sessions (the client app's logbook). */
  trainingLogs?: CoachState["trainingLogs"];
  /** One-shot demo seeds, kept so the Amara example is adopted exactly once. */
  demoSeeds?: CoachState["demoSeeds"];
};

export const trainingSlice: CoachSlice = {
  key: TRAINING_KEY,
  extract: (state): TrainingData => ({
    exerciseLibrary: state.exerciseLibrary,
    training: Object.fromEntries(
      state.clients.flatMap((client) =>
        client.plans ? [[client.id, client.plans.training]] : [],
      ),
    ),
    activityTargets: Object.fromEntries(
      state.clients.flatMap((client) =>
        client.plans ? [[client.id, client.plans.activityTargets]] : [],
      ),
    ),
    trainingLogs: state.trainingLogs,
    demoSeeds: state.demoSeeds,
  }),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid training slice");
    const data = slice as Partial<TrainingData>;
    if (data.exerciseLibrary) state.exerciseLibrary = data.exerciseLibrary;
    if (data.trainingLogs) state.trainingLogs = data.trainingLogs;
    if (data.demoSeeds) state.demoSeeds = data.demoSeeds;
    if (data.training && typeof data.training === "object")
      for (const client of state.clients) {
        const training = data.training[client.id];
        if (training !== undefined)
          (client.plans ??= emptyClientPlans()).training = training;
      }
    if (data.activityTargets && typeof data.activityTargets === "object")
      for (const client of state.clients) {
        const targets = data.activityTargets[client.id];
        if (client.plans) client.plans.activityTargets = targets;
      }
  },
};
