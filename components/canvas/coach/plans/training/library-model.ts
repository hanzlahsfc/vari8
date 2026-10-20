import type { ExerciseDefinition } from "../types";

/** Stable starter library. Each selected item is copied into a plan as a snapshot. */
export function defaultExerciseLibrary(): ExerciseDefinition[] {
  return [
    {
      id: "library-back-squat",
      name: "Back squat",
      muscle: "quadriceps",
      secondaryMuscles: ["glutes", "core"],
      notes: "Brace before each rep; keep the whole foot grounded.",
    },
    {
      id: "library-bench-press",
      name: "Bench press",
      muscle: "chest",
      secondaryMuscles: ["triceps", "shoulders"],
      notes: "Set the shoulder blades before unracking.",
    },
    {
      id: "library-deadlift",
      name: "Deadlift",
      muscle: "hamstrings",
      secondaryMuscles: ["glutes", "back"],
      notes: "Build tension against the bar before lifting.",
    },
    {
      id: "library-row",
      name: "Chest-supported row",
      muscle: "back",
      secondaryMuscles: ["biceps"],
      notes: "Pause briefly with the shoulder blades drawn back.",
    },
    {
      id: "library-lat-pulldown",
      name: "Lat pulldown",
      muscle: "back",
      secondaryMuscles: ["biceps"],
      notes: "Lead with the elbows and keep the torso steady.",
    },
    {
      id: "library-shoulder-press",
      name: "Dumbbell shoulder press",
      muscle: "shoulders",
      secondaryMuscles: ["triceps"],
      notes: "Use a comfortable range without arching the lower back.",
    },
    {
      id: "library-hip-thrust",
      name: "Hip thrust",
      muscle: "glutes",
      secondaryMuscles: ["hamstrings"],
      notes: "Finish with the hips, keeping the ribs stacked over the pelvis.",
    },
    {
      id: "library-leg-extension",
      name: "Leg extension",
      muscle: "quadriceps",
      secondaryMuscles: [],
      notes: "Control the lowering phase; avoid bouncing at the bottom.",
    },
    {
      id: "library-calf-raise",
      name: "Standing calf raise",
      muscle: "calves",
      secondaryMuscles: [],
      notes: "Use a full stretch and controlled pause at the top.",
    },
    {
      id: "library-plank",
      name: "Forearm plank",
      muscle: "core",
      secondaryMuscles: ["shoulders"],
      notes:
        "Maintain a straight line from head to heels; stop before form changes.",
    },
  ];
}
