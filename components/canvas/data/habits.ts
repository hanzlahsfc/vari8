// Habits domain provider (PR-W0). Owns the per-client habit lists, active
// and retired. PR-W5 wires this domain to the server; it edits this file
// only.

import type { CoachClient, CoachState } from "../coach/model";
import type { CoachSlice } from "./provider";

export const HABITS_KEY = "coach-data-habits-v1";

type Habit = CoachClient["habits"][number];
type HabitsSlice = Record<
  string,
  { habits: Habit[]; retiredHabits?: Habit[] }
>;

export const habitsSlice: CoachSlice = {
  key: HABITS_KEY,
  extract: (state): HabitsSlice =>
    Object.fromEntries(
      state.clients.map((client) => [
        client.id,
        client.retiredHabits
          ? { habits: client.habits, retiredHabits: client.retiredHabits }
          : { habits: client.habits },
      ]),
    ),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid habits slice");
    const data = slice as HabitsSlice;
    for (const client of state.clients) {
      const saved = data[client.id];
      if (!saved || typeof saved !== "object") continue;
      if (Array.isArray(saved.habits)) client.habits = saved.habits;
      if (Array.isArray(saved.retiredHabits))
        client.retiredHabits = saved.retiredHabits;
    }
  },
};
