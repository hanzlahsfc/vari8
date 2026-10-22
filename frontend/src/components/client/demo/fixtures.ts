import { createExampleHistory } from "@/components/coach/client-tracker-preview/example-history";
import type {
  TrainingPlan,
  TrainingSession,
} from "@/components/coach/plans/types";
import type { SupplementPlan } from "@/components/coach/supplements/model";
import type { TrackerConfig } from "@/components/ethereal/client-tracker/model";
import type { LogSession, PrescriptionVersion } from "../logbook-model";
import type { Macro } from "../nutrition-model";

// Synthetic demo data only. No persistence, no network, no real people.
export const demoAsOf = "2026-03-02";

export const clientPerson = { name: "Maya Chen", initials: "MC" };
export const coachPerson = { name: "Jonas Weber", initials: "JW" };

export const homeSummary = {
  sessionsDone: 3,
  sessionsPlanned: 4,
  nextCheckIn: "6 Mar",
  unreadMessages: 1,
  openTasks: 2,
};

export const trackerConfig: TrackerConfig = {
  parameterIds: [
    "weight",
    "waist",
    "calories",
    "protein",
    "water",
    "sleep",
    "sleep-quality",
    "stress",
    "steps",
    "active-minutes",
  ],
  summaryParameterIds: ["weight", "sleep", "steps"],
  weightUnit: "kg",
  lengthUnit: "cm",
  waterUnit: "L",
  ratingScale: "1-10",
};

export const buildTrackerHistory = () =>
  createExampleHistory(trackerConfig, demoAsOf);

export type NutritionTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export const nutritionTargets: NutritionTargets = {
  calories: 2200,
  protein: 165,
  carbs: 250,
  fat: 60,
};

export type NutritionDay = {
  date: string;
  macros: Macro;
  calorieOnly: boolean;
};

export const nutritionDays: NutritionDay[] = [
  {
    date: demoAsOf,
    macros: { protein: null, carbs: null, fat: null },
    calorieOnly: false,
  },
  {
    date: "2026-03-01",
    macros: { protein: 300, carbs: 400, fat: null },
    calorieOnly: false,
  },
  {
    date: "2026-02-28",
    macros: { protein: null, carbs: null, fat: null },
    calorieOnly: true,
  },
];

export type DemoMessage = {
  id: string;
  from: "client" | "coach";
  text: string;
  at: string;
};

export type DemoThread = {
  id: string;
  subject: string;
  unread: number;
  messages: DemoMessage[];
};

export type DemoTask = {
  id: string;
  title: string;
  due: string;
  done: boolean;
};

export const demoTasks: DemoTask[] = [
  {
    id: "task-1",
    title: "Send week-8 progress photos",
    due: "2026-02-27",
    done: false,
  },
  {
    id: "task-2",
    title: "Fill in Friday check-in",
    due: demoAsOf,
    done: false,
  },
  {
    id: "task-3",
    title: "Read the new deload notes",
    due: "2026-03-09",
    done: true,
  },
];

export const messageThreads: DemoThread[] = [
  {
    id: "thread-coach",
    subject: "Jonas Weber",
    unread: 1,
    messages: [
      {
        id: "m1",
        from: "coach",
        text: "How did the new squat prescription feel this week?",
        at: "2026-03-01 18:20",
      },
      {
        id: "m2",
        from: "client",
        text: "Solid. Bar speed stayed up on the back-off set.",
        at: "2026-03-01 19:02",
      },
      {
        id: "m3",
        from: "coach",
        text: "Good. Keep the rest honest and we add load next week.",
        at: "2026-03-02 08:41",
      },
    ],
  },
  {
    id: "thread-checkins",
    subject: "Check-in notes",
    unread: 0,
    messages: [],
  },
];

export type ClientSettings = {
  displayName: string;
  units: { weight: "kg" | "lb"; distance: "km" | "mi" };
  notifications: { sessions: boolean; nutrition: boolean; messages: boolean };
};

export const clientSettings: ClientSettings = {
  displayName: clientPerson.name,
  units: { weight: "kg", distance: "km" },
  notifications: { sessions: true, nutrition: true, messages: false },
};

export const supplementPlan: SupplementPlan = {
  id: "demo-supplement-plan",
  clientId: "demo-client",
  name: "Foundation stack",
  savedAt: "2026-02-24T09:00:00.000Z",
  items: [
    {
      id: "demo-supp-1",
      product: {
        id: "demo-product-1",
        brand: "Creavitalis",
        name: "Creatine monohydrate",
        referenceQuantity: 5,
        quantityUnit: "g",
        declaredAmount: 5,
        declaredUnit: "g",
        url: "https://supplements.example.com/creatine-monohydrate",
      },
      quantity: 1,
      doseUnit: "g",
      timing: "Post training",
      status: "must-have",
      notes: "",
    },
    {
      id: "demo-supp-2",
      product: {
        id: "demo-product-2",
        brand: "VitaLabs",
        name: "Vitamin D3 4000 IU",
        referenceQuantity: 1,
        quantityUnit: "capsule",
        declaredAmount: 4000,
        declaredUnit: "IU",
        url: null,
      },
      quantity: 1,
      doseUnit: "capsule",
      timing: "With breakfast",
      status: "optional",
      notes: "Take with a fat-containing meal.",
    },
  ],
};

export const trainingSessions: TrainingSession[] = [
  {
    id: "demo-session-a",
    name: "Session A - Lower body",
    exercises: [
      {
        id: "demo-ex-squat",
        name: "Back squat",
        muscle: "Quadriceps",
        instructions: "Brace hard, knees track over toes.",
        progression: "Add 2.5 kg when all sets hit the top of the range.",
        sets: [
          {
            id: "sq-1",
            reps: 6,
            tempo: "3010",
            type: "Work",
            rest: "3:00",
            instructions: "",
          },
          {
            id: "sq-2",
            reps: 6,
            tempo: "3010",
            type: "Work",
            rest: "3:00",
            instructions: "",
          },
          {
            id: "sq-3",
            reps: 8,
            repsMax: 10,
            tempo: "2010",
            type: "Back-off",
            rest: "2:00",
            instructions: "",
          },
        ],
      },
      {
        id: "demo-ex-rdl",
        name: "Romanian deadlift",
        muscle: "Hamstrings",
        instructions: "Soft knees, hips back.",
        progression: "Add a rep per set each week.",
        sets: [
          {
            id: "rdl-1",
            reps: 8,
            tempo: "3010",
            type: "Work",
            rest: "2:30",
            instructions: "",
          },
          {
            id: "rdl-2",
            reps: 8,
            tempo: "3010",
            type: "Work",
            rest: "2:30",
            instructions: "",
          },
        ],
      },
    ],
  },
  {
    id: "demo-session-b",
    name: "Session B - Upper body",
    exercises: [
      {
        id: "demo-ex-bench",
        name: "Bench press",
        muscle: "Chest",
        instructions: "Shoulder blades pinned, touch the chest.",
        progression: "Add 1.25 kg after two clean sessions.",
        sets: [
          {
            id: "bp-1",
            reps: 8,
            tempo: "2010",
            type: "Work",
            rest: "2:30",
            instructions: "",
          },
          {
            id: "bp-2",
            reps: 8,
            tempo: "2010",
            type: "Work",
            rest: "2:30",
            instructions: "",
          },
          {
            id: "bp-3",
            reps: 10,
            repsMax: 12,
            tempo: "2010",
            type: "Back-off",
            rest: "2:00",
            instructions: "",
          },
        ],
      },
      {
        id: "demo-ex-row",
        name: "Chest supported row",
        muscle: "Upper back",
        instructions: "Pull to the lower chest.",
        progression: "Add a rep per set each week.",
        sets: [
          {
            id: "row-1",
            reps: 10,
            tempo: "2011",
            type: "Work",
            rest: "2:00",
            instructions: "",
          },
          {
            id: "row-2",
            reps: 10,
            tempo: "2011",
            type: "Work",
            rest: "2:00",
            instructions: "",
          },
        ],
      },
    ],
  },
];

export const trainingPlan: TrainingPlan = {
  id: "demo-training-plan",
  clientId: "demo-client",
  name: "Hypertrophy block A",
  startDate: "2026-02-16",
  program: "Week-based",
  weeks: 4,
  overrides: {},
  rotation: {
    mode: "cycle",
    sessionIds: ["demo-session-a", "demo-session-b", null],
  },
};

export const photoDates = ["2026-01-05", "2026-02-02", "2026-03-02"];

// Version 1 of session A, superseded by the current prescription. Kept so a
// logged session still renders the prescription it was performed against.
export const logbookSessionV1: TrainingSession = {
  id: "demo-session-a",
  name: "Session A - Lower body",
  exercises: [
    {
      id: "demo-ex-squat",
      name: "Back squat",
      muscle: "Quadriceps",
      instructions: "Brace hard, knees track over toes.",
      progression: "Add 2.5 kg when all sets hit the top of the range.",
      sets: [
        {
          id: "v1-sq-1",
          reps: 5,
          tempo: "3010",
          type: "Work",
          rest: "3:00",
          instructions: "",
        },
        {
          id: "v1-sq-2",
          reps: 5,
          tempo: "3010",
          type: "Work",
          rest: "3:00",
          instructions: "",
        },
        {
          id: "v1-sq-3",
          reps: 5,
          tempo: "3010",
          type: "Work",
          rest: "3:00",
          instructions: "",
        },
      ],
    },
    {
      id: "demo-ex-rdl",
      name: "Romanian deadlift",
      muscle: "Hamstrings",
      instructions: "Soft knees, hips back.",
      progression: "Add a rep per set each week.",
      sets: [
        {
          id: "v1-rdl-1",
          reps: 6,
          tempo: "3010",
          type: "Work",
          rest: "2:30",
          instructions: "",
        },
        {
          id: "v1-rdl-2",
          reps: 6,
          tempo: "3010",
          type: "Work",
          rest: "2:30",
          instructions: "",
        },
      ],
    },
  ],
};

export const prescriptionVersions: PrescriptionVersion[] = [
  { version: 1, session: logbookSessionV1 },
  { version: 2, session: trainingSessions[0] },
];

const logged = (reps: number, load: number, rpe: number) => ({
  reps,
  load,
  rpe,
});

export const logbookSessions: LogSession[] = [
  {
    id: "log-1",
    planId: "demo-training-plan",
    version: 1,
    sessionId: "demo-session-a",
    status: "done",
    result: "complete",
    setIds: ["v1-sq-1", "v1-sq-2", "v1-sq-3", "v1-rdl-1", "v1-rdl-2"],
    sets: {
      "v1-sq-1": logged(5, 100, 8),
      "v1-sq-2": logged(5, 100, 8),
      "v1-sq-3": logged(5, 100, 9),
      "v1-rdl-1": logged(6, 120, 8),
      "v1-rdl-2": logged(6, 120, 8),
    },
  },
  {
    id: "log-2",
    planId: "demo-training-plan",
    version: 2,
    sessionId: "demo-session-a",
    status: "in-progress",
    result: null,
    setIds: ["sq-1", "sq-2", "sq-3", "rdl-1", "rdl-2"],
    sets: {
      "sq-1": logged(6, 102.5, 8),
      "sq-2": { reps: 6, load: 102.5, rpe: null },
      "sq-3": { reps: null, load: null, rpe: null },
      "rdl-1": { reps: null, load: null, rpe: null },
      "rdl-2": { reps: null, load: null, rpe: null },
    },
  },
  {
    id: "log-3",
    planId: "demo-training-plan",
    version: 2,
    sessionId: "demo-session-b",
    status: "planned",
    result: null,
    setIds: ["bp-1", "bp-2", "bp-3", "row-1", "row-2"],
    sets: {},
  },
  {
    id: "log-0",
    planId: "demo-training-plan",
    version: 1,
    sessionId: "demo-session-b",
    status: "skipped",
    result: "skipped",
    setIds: [],
    sets: {},
  },
];

// Check-in form definition handed to the shared FormPreview component.
export const checkInForm = {
  id: "demo-check-in",
  name: "Weekly check-in",
  nutrition: "IIFYM" as const,
  views: ["Check-In"],
  habits: false,
  widgets: [],
  fields: [
    { id: "weight", unit: "kg" },
    { id: "sleep", unit: "h" },
    { id: "stress", unit: "/10" },
    { id: "steps", unit: "steps" },
  ],
  roadmap: [],
  questions: [],
  summaries: [],
  training: {
    fields: [],
    volume: false,
    breakdown: "None",
    presentation: "Compact",
  },
};
