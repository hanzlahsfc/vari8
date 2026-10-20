// Check-ins domain provider (PR-W0). Owns the additional check-in extras,
// the submissions, the per-submission review drafts, and the per-client
// recurring check-in schedules that drive the event calendar. PR-W6 wires
// this domain to the server; it edits this file only.

import type {
  CoachState,
  Extra,
  ReviewDraft,
  Schedule,
  Submission,
} from "../coach/model";
import type { CoachSlice } from "./provider";

export const CHECKINS_KEY = "coach-data-checkins-v1";

type CheckinsData = {
  extras: Extra[];
  submissions: Submission[];
  reviewDrafts: Record<string, ReviewDraft>;
  /** Recurring check-in weekdays per client id. */
  schedules: Record<string, Schedule[]>;
};

export const checkinsSlice: CoachSlice = {
  key: CHECKINS_KEY,
  extract: (state): CheckinsData => ({
    extras: state.extras,
    submissions: state.submissions,
    reviewDrafts: state.reviewDrafts,
    schedules: Object.fromEntries(
      state.clients.map((client) => [client.id, client.schedules]),
    ),
  }),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid check-ins slice");
    const data = slice as Partial<CheckinsData>;
    state.extras = data.extras as Extra[];
    state.submissions = data.submissions as Submission[];
    state.reviewDrafts = data.reviewDrafts as Record<string, ReviewDraft>;
    if (data.schedules && typeof data.schedules === "object")
      for (const client of state.clients)
        if (client.id in data.schedules)
          client.schedules = data.schedules[client.id];
  },
};
