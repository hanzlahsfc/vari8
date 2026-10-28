import type { CoachState } from "../../model";
import type {
  ExerciseDefinition,
  TrainingExercise,
  TrainingPlan,
  TrainingSession,
  TrainingSet,
} from "../types";
import { defaultExerciseLibrary } from "./library-model";

export const AMARA_EXAMPLE_REVISION = 1 as const;
export const AMARA_EXAMPLE_CLIENT_ID = "client-007";
export const AMARA_EXAMPLE_START_DATE = "2026-10-13";

const exampleLibrary: ExerciseDefinition[] = [
  {
    id: "library-romanian-deadlift",
    name: "Romanian deadlift",
    muscle: "hamstrings",
    secondaryMuscles: ["glutes", "back"],
    notes:
      "Keep the bar close and stop the hinge before the back position changes.",
  },
  {
    id: "library-cable-kickback",
    name: "Cable glute kickback",
    muscle: "glutes",
    secondaryMuscles: [],
    notes: "Move from the hip and keep the pelvis steady.",
  },
  {
    id: "library-hip-abduction",
    name: "Seated hip abduction",
    muscle: "glutes",
    secondaryMuscles: [],
    notes: "Use a controlled range and pause briefly at the open position.",
  },
  {
    id: "library-lateral-raise",
    name: "Dumbbell lateral raise",
    muscle: "shoulders",
    secondaryMuscles: [],
    notes: "Raise with a soft elbow and keep the torso quiet.",
  },
  {
    id: "library-rear-delt-fly",
    name: "Cable rear-delt fly",
    muscle: "shoulders",
    secondaryMuscles: ["back"],
    notes: "Sweep the arms wide without shrugging.",
  },
  {
    id: "library-split-squat",
    name: "Dumbbell split squat",
    muscle: "glutes",
    secondaryMuscles: ["quadriceps"],
    notes: "Use a steady stance and a comfortable depth.",
  },
  {
    id: "library-glute-bridge",
    name: "Barbell glute bridge",
    muscle: "glutes",
    secondaryMuscles: ["hamstrings"],
    notes: "Finish with the hips while keeping the ribs stacked.",
  },
  {
    id: "library-seated-leg-curl",
    name: "Seated leg curl",
    muscle: "hamstrings",
    secondaryMuscles: [],
    notes: "Control the return and keep the hips settled.",
  },
  {
    id: "library-cable-lateral-raise",
    name: "Cable lateral raise",
    muscle: "shoulders",
    secondaryMuscles: [],
    notes: "Keep tension through the lower half of the range.",
  },
  {
    id: "library-cable-triceps-extension",
    name: "Rope triceps pressdown",
    muscle: "triceps",
    secondaryMuscles: [],
    notes: "Keep the upper arms still as the elbows extend.",
  },
  {
    id: "library-dumbbell-curl",
    name: "Dumbbell curl",
    muscle: "biceps",
    secondaryMuscles: [],
    notes: "Keep the shoulder relaxed and lower under control.",
  },
];

type ExerciseSpec = {
  id: string;
  libraryId: string;
  name: string;
  muscle: string;
  secondaryMuscles: string[];
  sets: number;
  reps: number;
  repsMax: number;
  rest: string;
  cue: string;
};

function exercise(
  spec: ExerciseSpec,
  library: ExerciseDefinition[],
): TrainingExercise {
  const definition = library.find((item) => item.id === spec.libraryId);
  const sets: TrainingSet[] = Array.from({ length: spec.sets }, (_, index) => ({
    id: `${spec.id}-set-${index + 1}`,
    reps: spec.reps,
    repsMax: spec.repsMax,
    tempo: "Controlled",
    type: "Working",
    rest: spec.rest,
    instructions: "",
  }));
  return {
    id: spec.id,
    libraryId: spec.libraryId,
    name: spec.name,
    muscle: spec.muscle,
    secondaryMuscles: spec.secondaryMuscles,
    generalNotes: definition?.notes ?? "",
    instructions: spec.cue,
    progression: "Double progression",
    sets,
  };
}

function session(
  id: string,
  name: string,
  specs: ExerciseSpec[],
  library: ExerciseDefinition[],
): TrainingSession {
  return { id, name, exercises: specs.map((spec) => exercise(spec, library)) };
}

export function createAmaraTrainingPlan(
  clientId: string,
  startDate = AMARA_EXAMPLE_START_DATE,
): TrainingPlan {
  const library = [...defaultExerciseLibrary(), ...exampleLibrary];
  const sessions: TrainingSession[] = [
    session(
      "amara-lower-a",
      "Lower A · Glute emphasis",
      [
        {
          id: "amara-lower-a-hip-thrust",
          libraryId: "library-hip-thrust",
          name: "Hip thrust",
          muscle: "glutes",
          secondaryMuscles: ["hamstrings"],
          sets: 3,
          reps: 8,
          repsMax: 12,
          rest: "2 min",
          cue: "Pause briefly at the top; keep the ribs stacked.",
        },
        {
          id: "amara-lower-a-squat",
          libraryId: "library-back-squat",
          name: "Back squat",
          muscle: "quadriceps",
          secondaryMuscles: ["glutes", "core"],
          sets: 3,
          reps: 8,
          repsMax: 10,
          rest: "2 min",
          cue: "Brace before each rep and keep the whole foot grounded.",
        },
        {
          id: "amara-lower-a-rdl",
          libraryId: "library-romanian-deadlift",
          name: "Romanian deadlift",
          muscle: "hamstrings",
          secondaryMuscles: ["glutes", "back"],
          sets: 3,
          reps: 8,
          repsMax: 12,
          rest: "2 min",
          cue: "Keep the weights close and use a controlled hip hinge.",
        },
        {
          id: "amara-lower-a-kickback",
          libraryId: "library-cable-kickback",
          name: "Cable glute kickback",
          muscle: "glutes",
          secondaryMuscles: [],
          sets: 2,
          reps: 12,
          repsMax: 15,
          rest: "60 sec",
          cue: "Move from the hip without rotating the pelvis.",
        },
        {
          id: "amara-lower-a-abduction",
          libraryId: "library-hip-abduction",
          name: "Seated hip abduction",
          muscle: "glutes",
          secondaryMuscles: [],
          sets: 2,
          reps: 15,
          repsMax: 20,
          rest: "60 sec",
          cue: "Use a smooth range and pause briefly at the open position.",
        },
      ],
      library,
    ),
    session(
      "amara-upper-a",
      "Upper A · Delts and back",
      [
        {
          id: "amara-upper-a-lateral-raise",
          libraryId: "library-lateral-raise",
          name: "Dumbbell lateral raise",
          muscle: "shoulders",
          secondaryMuscles: [],
          sets: 3,
          reps: 12,
          repsMax: 15,
          rest: "60 sec",
          cue: "Keep a soft elbow and a quiet torso.",
        },
        {
          id: "amara-upper-a-press",
          libraryId: "library-shoulder-press",
          name: "Dumbbell shoulder press",
          muscle: "shoulders",
          secondaryMuscles: ["triceps"],
          sets: 3,
          reps: 8,
          repsMax: 12,
          rest: "2 min",
          cue: "Press in a comfortable range without arching the lower back.",
        },
        {
          id: "amara-upper-a-pulldown",
          libraryId: "library-lat-pulldown",
          name: "Lat pulldown",
          muscle: "back",
          secondaryMuscles: ["biceps"],
          sets: 3,
          reps: 8,
          repsMax: 12,
          rest: "90 sec",
          cue: "Lead with the elbows and keep the torso steady.",
        },
        {
          id: "amara-upper-a-row",
          libraryId: "library-row",
          name: "Chest-supported row",
          muscle: "back",
          secondaryMuscles: ["biceps"],
          sets: 2,
          reps: 10,
          repsMax: 12,
          rest: "90 sec",
          cue: "Pause briefly with the shoulder blades drawn back.",
        },
        {
          id: "amara-upper-a-rear-delt",
          libraryId: "library-rear-delt-fly",
          name: "Cable rear-delt fly",
          muscle: "shoulders",
          secondaryMuscles: ["back"],
          sets: 2,
          reps: 12,
          repsMax: 15,
          rest: "60 sec",
          cue: "Sweep the arms wide without shrugging.",
        },
      ],
      library,
    ),
    session(
      "amara-lower-b",
      "Lower B · Glutes and hamstrings",
      [
        {
          id: "amara-lower-b-rdl",
          libraryId: "library-romanian-deadlift",
          name: "Romanian deadlift",
          muscle: "hamstrings",
          secondaryMuscles: ["glutes", "back"],
          sets: 3,
          reps: 8,
          repsMax: 12,
          rest: "2 min",
          cue: "Keep the weights close and use a controlled hip hinge.",
        },
        {
          id: "amara-lower-b-split-squat",
          libraryId: "library-split-squat",
          name: "Dumbbell split squat",
          muscle: "glutes",
          secondaryMuscles: ["quadriceps"],
          sets: 3,
          reps: 8,
          repsMax: 12,
          rest: "90 sec",
          cue: "Use a steady stance and a comfortable depth on each side.",
        },
        {
          id: "amara-lower-b-bridge",
          libraryId: "library-glute-bridge",
          name: "Barbell glute bridge",
          muscle: "glutes",
          secondaryMuscles: ["hamstrings"],
          sets: 3,
          reps: 10,
          repsMax: 12,
          rest: "2 min",
          cue: "Finish with the hips while keeping the ribs stacked.",
        },
        {
          id: "amara-lower-b-curl",
          libraryId: "library-seated-leg-curl",
          name: "Seated leg curl",
          muscle: "hamstrings",
          secondaryMuscles: [],
          sets: 3,
          reps: 10,
          repsMax: 15,
          rest: "90 sec",
          cue: "Control the return and keep the hips settled.",
        },
        {
          id: "amara-lower-b-abduction",
          libraryId: "library-hip-abduction",
          name: "Seated hip abduction",
          muscle: "glutes",
          secondaryMuscles: [],
          sets: 2,
          reps: 15,
          repsMax: 20,
          rest: "60 sec",
          cue: "Use a smooth range and pause briefly at the open position.",
        },
      ],
      library,
    ),
    session(
      "amara-upper-b",
      "Upper B · Delts and arms",
      [
        {
          id: "amara-upper-b-lateral-raise",
          libraryId: "library-cable-lateral-raise",
          name: "Cable lateral raise",
          muscle: "shoulders",
          secondaryMuscles: [],
          sets: 3,
          reps: 12,
          repsMax: 15,
          rest: "60 sec",
          cue: "Keep tension through the lower half of the range.",
        },
        {
          id: "amara-upper-b-press",
          libraryId: "library-shoulder-press",
          name: "Dumbbell shoulder press",
          muscle: "shoulders",
          secondaryMuscles: ["triceps"],
          sets: 2,
          reps: 8,
          repsMax: 12,
          rest: "2 min",
          cue: "Press in a comfortable range without arching the lower back.",
        },
        {
          id: "amara-upper-b-rear-delt",
          libraryId: "library-rear-delt-fly",
          name: "Cable rear-delt fly",
          muscle: "shoulders",
          secondaryMuscles: ["back"],
          sets: 3,
          reps: 12,
          repsMax: 15,
          rest: "60 sec",
          cue: "Sweep the arms wide without shrugging.",
        },
        {
          id: "amara-upper-b-pulldown",
          libraryId: "library-lat-pulldown",
          name: "Lat pulldown",
          muscle: "back",
          secondaryMuscles: ["biceps"],
          sets: 2,
          reps: 8,
          repsMax: 12,
          rest: "90 sec",
          cue: "Lead with the elbows and keep the torso steady.",
        },
        {
          id: "amara-upper-b-triceps",
          libraryId: "library-cable-triceps-extension",
          name: "Rope triceps pressdown",
          muscle: "triceps",
          secondaryMuscles: [],
          sets: 2,
          reps: 10,
          repsMax: 15,
          rest: "60 sec",
          cue: "Keep the upper arms still as the elbows extend.",
        },
        {
          id: "amara-upper-b-biceps",
          libraryId: "library-dumbbell-curl",
          name: "Dumbbell curl",
          muscle: "biceps",
          secondaryMuscles: [],
          sets: 2,
          reps: 10,
          repsMax: 15,
          rest: "60 sec",
          cue: "Keep the shoulder relaxed and lower under control.",
        },
      ],
      library,
    ),
  ];
  return {
    id: "amara-training-example",
    clientId,
    name: "Amara · Bikini training example",
    startDate,
    program: "Week-based",
    weeks: 8,
    overrides: { "1": sessions },
    rotation: {
      mode: "weekly",
      weekdays: {
        Monday: ["amara-lower-a"],
        Tuesday: ["amara-upper-a"],
        Wednesday: [],
        Thursday: ["amara-lower-b"],
        Friday: [],
        Saturday: ["amara-upper-b"],
        Sunday: [],
      },
    },
  };
}

/** Apply the user-requested draft once to old browser saves, without changing active/history records. */
export function adoptAmaraTrainingExample(state: CoachState): CoachState {
  if (state.demoSeeds?.amaraTraining === AMARA_EXAMPLE_REVISION) return state;

  const clients = [...state.clients];
  const index = clients.findIndex(
    (client) =>
      client.id === AMARA_EXAMPLE_CLIENT_ID ||
      client.name.trim().toLocaleLowerCase() === "amara lewis",
  );
  if (index < 0) return state;

  const client = clients[index];
  const lifecycle = client.plans?.training ?? { history: [] };
  clients[index] = {
    ...client,
    plans: {
      nutrition: client.plans?.nutrition ?? {
        mealPlan: { history: [] },
        iifym: { history: [] },
      },
      goals: client.plans?.goals ?? [],
      activityTargets: client.plans?.activityTargets ?? [],
      supplements: client.plans?.supplements,
      training: {
        ...lifecycle,
        draft: createAmaraTrainingPlan(client.id),
      },
    },
  };

  const library = state.exerciseLibrary ?? defaultExerciseLibrary();
  const knownIds = new Set(library.map((item) => item.id));
  return {
    ...state,
    clients,
    exerciseLibrary: [
      ...library,
      ...exampleLibrary.filter((item) => !knownIds.has(item.id)),
    ],
    demoSeeds: { ...state.demoSeeds, amaraTraining: AMARA_EXAMPLE_REVISION },
  };
}
