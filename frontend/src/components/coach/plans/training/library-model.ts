import exerciseDb from "@/data/exercise-database.json";
import type { ExerciseDefinition } from "../types";

/** Bump to re-seed persisted libraries from the database (keeps custom entries). */
export const EXERCISE_LIBRARY_REVISION = 1 as const;

/**
 * The exercise library — the coach's exercise database. Each selected item is
 * copied into a plan as a snapshot, so later library edits don't retro-change
 * plans. Custom exercises (ids from `makeId("library-exercise")`) are kept on
 * top of this list.
 */
export function defaultExerciseLibrary(): ExerciseDefinition[] {
  return exerciseDb as ExerciseDefinition[];
}

/** True for coach-authored custom exercises (kept when the library is re-seeded). */
export const isCustomExerciseId = (id: string) =>
  id.startsWith("library-exercise");
