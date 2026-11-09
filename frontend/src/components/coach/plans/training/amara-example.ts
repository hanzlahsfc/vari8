import type { CoachState } from "../../model";
import type {
  ExerciseDefinition,
  TrainingExercise,
  TrainingPlan,
  TrainingSession,
  TrainingSet,
} from "../types";
import { defaultExerciseLibrary } from "./library-model";

export const AMARA_EXAMPLE_REVISION = 5 as const;
export const AMARA_EXAMPLE_CLIENT_ID = "client-007";
export const AMARA_EXAMPLE_START_DATE = "2026-10-13";

const MAIN_LIFTS = new Set([
  "amara-lower-a-hip-thrust",
  "amara-lower-a-squat",
  "amara-lower-b-rdl",
  "amara-lower-b-lunge",
  "amara-upper-a-press",
  "amara-upper-b-press",
]);

type ExerciseSpec = {
  id: string;
  libraryId: string;
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
  // RIR target: 2 on most working sets, 1 on the last set of the main lifts.
  const sets: TrainingSet[] = Array.from({ length: spec.sets }, (_, index) => ({
    id: `${spec.id}-set-${index + 1}`,
    reps: spec.reps,
    repsMax: spec.repsMax,
    tempo: "Controlled",
    type: "Working",
    rest: spec.rest,
    instructions: "",
    rir: index === spec.sets - 1 && MAIN_LIFTS.has(spec.id) ? 1 : 2,
  }));
  return {
    id: spec.id,
    libraryId: spec.libraryId,
    name: definition?.name ?? spec.libraryId,
    muscle: definition?.muscle,
    secondaryMuscles: definition?.secondaryMuscles ?? [],
    generalNotes: definition?.notes ?? "",
    equipment: definition?.equipment,
    movementPattern: definition?.movementPattern,
    position: definition?.position,
    primaryTarget: definition?.primaryTarget,
    additionalTargets: definition?.additionalTargets,
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
  const library = defaultExerciseLibrary();
  const sessions: TrainingSession[] = [
    session(
      "amara-lower-a",
      "Lower A · Glute emphasis",
      [
        {
          id: "amara-lower-a-hip-thrust",
          libraryId: "exdb-hip-thrust-machine",
          sets: 3,
          reps: 8,
          repsMax: 12,
          rest: "2 min",
          cue: "Pause for a second at the top; keep the ribs stacked.",
        },
        {
          id: "amara-lower-a-squat",
          libraryId: "exdb-hack-squat",
          sets: 3,
          reps: 6,
          repsMax: 8,
          rest: "2 min",
          cue: "Feet mid-platform; sit deep while keeping the lower back on the pad.",
        },
        {
          id: "amara-lower-a-rdl",
          libraryId: "exdb-b-stance-dumbbell-romanian-deadlift",
          sets: 3,
          reps: 10,
          repsMax: 12,
          rest: "90 sec",
          cue: "Most of the weight on the front leg; hinge until you feel the stretch.",
        },
        {
          id: "amara-lower-a-kickback",
          libraryId: "exdb-glute-kickback-machine",
          sets: 2,
          reps: 12,
          repsMax: 15,
          rest: "60 sec",
          cue: "Drive through the heel without arching the lower back.",
        },
        {
          id: "amara-lower-a-abduction",
          libraryId: "exdb-cable-hip-abduction",
          sets: 2,
          reps: 15,
          repsMax: 20,
          rest: "60 sec",
          cue: "Lean slightly into the cable and move only at the hip.",
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
          libraryId: "exdb-lean-away-cable-lateral-raise",
          sets: 3,
          reps: 12,
          repsMax: 15,
          rest: "60 sec",
          cue: "Lead with the elbow and stop just above shoulder height.",
        },
        {
          id: "amara-upper-a-press",
          libraryId: "exdb-shoulder-press-machine",
          sets: 3,
          reps: 8,
          repsMax: 12,
          rest: "2 min",
          cue: "Press in a comfortable range without flaring the ribs.",
        },
        {
          id: "amara-upper-a-pulldown",
          libraryId: "exdb-neutral-grip-lat-pulldown",
          sets: 3,
          reps: 10,
          repsMax: 12,
          rest: "90 sec",
          cue: "Pull the elbows towards the hips and keep the chest tall.",
        },
        {
          id: "amara-upper-a-row",
          libraryId: "exdb-low-row-machine",
          sets: 3,
          reps: 10,
          repsMax: 12,
          rest: "90 sec",
          cue: "Pause with the shoulder blades drawn back.",
        },
        {
          id: "amara-upper-a-rear-delt",
          libraryId: "exdb-reverse-fly-machine",
          sets: 2,
          reps: 15,
          repsMax: 20,
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
          libraryId: "exdb-smith-machine-romanian-deadlift",
          sets: 3,
          reps: 8,
          repsMax: 10,
          rest: "2 min",
          cue: "Push the hips back and keep the bar close to the legs.",
        },
        {
          id: "amara-lower-b-lunge",
          libraryId: "exdb-dumbbell-lunge",
          sets: 3,
          reps: 10,
          repsMax: 12,
          rest: "90 sec",
          cue: "Long stride, slight forward lean, drive through the front heel.",
        },
        {
          id: "amara-lower-b-hip-extension",
          libraryId: "exdb-45-degree-hip-extension",
          sets: 3,
          reps: 12,
          repsMax: 15,
          rest: "90 sec",
          cue: "Round the upper back slightly and squeeze the glutes at the top.",
        },
        {
          id: "amara-lower-b-curl",
          libraryId: "exdb-lying-leg-curl",
          sets: 3,
          reps: 10,
          repsMax: 12,
          rest: "90 sec",
          cue: "Keep the hips pressed into the pad and control the return.",
        },
        {
          id: "amara-lower-b-adduction",
          libraryId: "exdb-hip-adduction-machine",
          sets: 2,
          reps: 12,
          repsMax: 15,
          rest: "60 sec",
          cue: "Use a smooth range and pause briefly when the pads meet.",
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
          libraryId: "exdb-seated-lateral-raise-machine",
          sets: 3,
          reps: 12,
          repsMax: 15,
          rest: "60 sec",
          cue: "Keep tension at the bottom; no swinging.",
        },
        {
          id: "amara-upper-b-press",
          libraryId: "exdb-high-incline-smith-machine-press",
          sets: 3,
          reps: 8,
          repsMax: 10,
          rest: "2 min",
          cue: "Bench at a high incline; lower the bar to the upper chest.",
        },
        {
          id: "amara-upper-b-rear-delt",
          libraryId: "exdb-face-pull",
          sets: 3,
          reps: 12,
          repsMax: 15,
          rest: "60 sec",
          cue: "Pull towards the forehead and rotate the hands back.",
        },
        {
          id: "amara-upper-b-pulldown",
          libraryId: "exdb-single-arm-cable-lat-pulldown",
          sets: 2,
          reps: 10,
          repsMax: 12,
          rest: "90 sec",
          cue: "Reach long at the top and pull the elbow to the hip.",
        },
        {
          id: "amara-upper-b-triceps",
          libraryId: "exdb-rope-overhead-cable-triceps-extension",
          sets: 2,
          reps: 10,
          repsMax: 15,
          rest: "60 sec",
          cue: "Keep the elbows high and still as the arms extend.",
        },
        {
          id: "amara-upper-b-biceps",
          libraryId: "exdb-bayesian-cable-curl",
          sets: 2,
          reps: 10,
          repsMax: 15,
          rest: "60 sec",
          cue: "Let the arm stretch behind the body before each curl.",
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

/**
 * Replace Amara's demo training lifecycle once per revision in old browser
 * saves: draft, active content and history all switch to the current example
 * so no exercise from an earlier demo survives.
 */
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
      activityTargets: client.plans?.activityTargets,
      supplements: client.plans?.supplements,
      training: {
        draft: createAmaraTrainingPlan(client.id),
        active: {
          id: lifecycle.active?.id ?? "amara-training-active",
          activatedAt:
            lifecycle.active?.activatedAt ??
            `${AMARA_EXAMPLE_START_DATE}T08:00:00Z`,
          content: createAmaraTrainingPlan(client.id),
        },
        history: [],
      },
    },
  };

  const library = state.exerciseLibrary ?? defaultExerciseLibrary();
  const _knownIds = new Set(library.map((item) => item.id));
  return {
    ...state,
    clients,
    exerciseLibrary: [...library],
    demoSeeds: { ...state.demoSeeds, amaraTraining: AMARA_EXAMPLE_REVISION },
  };
}
