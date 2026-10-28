export type TrainingOptionKey = "setType" | "progression" | "tempo" | "rest";
export type TrainingOptions = Record<TrainingOptionKey, string[]>;
export const DEFAULT_TRAINING_OPTIONS: TrainingOptions = {
  setType: ["Working", "Warm-up", "Top set", "Back-off", "Drop set"],
  progression: [
    "Double progression",
    "Add reps, then load",
    "Maintain load",
    "Coach-directed",
  ],
  tempo: ["Controlled", "3-1-1", "2-0-2", "1-0-1"],
  rest: ["60 sec", "90 sec", "2 min", "3 min", "As needed"],
};
export const DEFAULT_TRAINING_DEFAULTS: Record<TrainingOptionKey, string> = {
  setType: "Working",
  progression: "Double progression",
  tempo: "Controlled",
  rest: "90 sec",
};
