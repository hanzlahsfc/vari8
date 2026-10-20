// Training domain provider (PR-W0). Owns the coach exercise library and the
// per-client training plan lifecycles. PR-W8 wires this domain to the
// server; it edits this file only.

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
  }),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid training slice");
    const data = slice as Partial<TrainingData>;
    if (data.exerciseLibrary) state.exerciseLibrary = data.exerciseLibrary;
    if (data.training && typeof data.training === "object")
      for (const client of state.clients) {
        const training = data.training[client.id];
        if (training !== undefined)
          (client.plans ??= emptyClientPlans()).training = training;
      }
  },
};
