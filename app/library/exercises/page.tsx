import { AppNav } from "@/components/app-nav";
import { exerciseFacets } from "@/lib/catalog";
import { getExercises } from "@/lib/spec-artifacts";

import { ExerciseLibrary } from "./exercise-library";

export const metadata = { title: "Exercises — App" };

export default function ExercisesLibraryPage() {
  const exercises = getExercises();
  const facets = exerciseFacets(exercises.records);
  return (
    <main className="app-main">
      <AppNav />
      <h1 className="app-title">Exercises</h1>
      <p className="app-lede">
        Read-only synthetic reference fixture · {exercises.count} placeholder
        rows (no source data), in source order.
      </p>
      <ExerciseLibrary
        records={exercises.records}
        muscleGroups={facets.muscleGroups}
        equipment={facets.equipment}
      />
    </main>
  );
}
