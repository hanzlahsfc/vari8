import { createInitialMealPlan } from "../ethereal/mealplan/model";
import {
  addDays,
  CORE_VIEWS,
  type CoachClient,
  type CoachState,
  getParameter,
  type Question,
  type Submission,
} from "./model";
import { activateLifecycle, emptyIifymPlan, foodCatalog } from "./plans/domain";
import { emptyClientPlans } from "./plans/types";
import { productById } from "./supplements/catalogue";
import type { SupplementItem, SupplementPlan } from "./supplements/model";
import {
  type ActivityChange,
  type ActivityTargetVersion,
  writeActivityTarget,
} from "./targets/model";

export const CLIENT_APP_DEMO_REVISION = 1 as const;
export const CLIENT_APP_DEMO_CLIENT_ID = "client-007";

const DEMO_QUESTIONS: Question[] = [
  {
    id: "demo-q-energy",
    label: "How was your energy this week?",
    type: "Rating",
    required: true,
    options: "1-10",
  },
  {
    id: "demo-q-bodyweight",
    label: "Bodyweight average",
    type: "Numeric",
    required: true,
    options: "kg",
  },
  {
    id: "demo-q-wins",
    label: "Wins this week",
    type: "Long text",
    required: false,
    options: "",
  },
  {
    id: "demo-q-photos",
    label: "Progress photos",
    type: "Visual upload",
    required: false,
    options: "",
  },
];

const REQUIRED_TRACKER_FIELDS = ["weight", "sleep", "steps", "calories"];

// Deterministic filler keeps screenshots stable across reloads and machines.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MISSING_DAY_INDEXES = new Set([5, 17, 31, 44, 50]);
const ZERO_STEPS_INDEX = 9;

function demoEntries(today: string): {
  date: string;
  weight: number;
  sleep: number;
  steps: number;
  calories: number;
}[] {
  const rand = mulberry32(0xa4a7a);
  const rows: NonNullable<CoachClient["entries"]>[number][] = [];
  for (let i = 0; i < 56; i += 1) {
    if (MISSING_DAY_INDEXES.has(i)) continue;
    const date = addDays(today, i - 56);
    rows.push({
      date,
      weight: +(73.4 - (i / 55) * 1.6 + (rand() - 0.5) * 0.6).toFixed(1),
      sleep: +(6.2 + rand() * 2.2).toFixed(1),
      steps: i === ZERO_STEPS_INDEX ? 0 : Math.round(5500 + rand() * 7000),
      calories: Math.round(1850 + rand() * 450),
    });
  }
  return rows;
}

const SUPPLEMENT_ROWS: {
  productId: string;
  timing: string;
  status: SupplementItem["status"];
  notes: string;
}[] = [
  {
    productId: "supplement-011",
    timing: "With breakfast",
    status: "must-have",
    notes: "",
  },
  {
    productId: "supplement-010",
    timing: "With breakfast",
    status: "must-have",
    notes: "",
  },
  {
    productId: "supplement-113",
    timing: "Post-workout",
    status: "optional",
    notes: "",
  },
  {
    productId: "supplement-007",
    timing: "Before bed",
    status: "optional",
    notes: "Helps wind down after late training sessions.",
  },
];

function demoSupplementPlan(
  clientId: string,
  today: string,
): SupplementPlan | undefined {
  const items: SupplementItem[] = [];
  for (const row of SUPPLEMENT_ROWS) {
    const product = productById(row.productId);
    if (!product) continue;
    // Same defaults the supplement editor applies when a product is chosen.
    items.push({
      id: `demo-supp-${row.productId}`,
      product: { ...product },
      quantity: product.referenceQuantity ?? 1,
      doseUnit: product.quantityUnit ?? "reference units",
      timing: row.timing,
      status: row.status,
      notes: row.notes,
    });
  }
  if (!items.length) return undefined;
  return {
    id: "demo-supplement-plan",
    clientId,
    name: "Amara · daily stack",
    items,
    savedAt: `${today}T08:00:00Z`,
  };
}

function demoActivityTargets(today: string): ActivityTargetVersion[] {
  let versions: ActivityTargetVersion[] = [];
  const writes: [ActivityChange, string, string][] = [
    [
      { metric: "steps", target: { kind: "minimum", value: 8000 } },
      addDays(today, -14),
      "demo-targets-steps-1",
    ],
    [
      {
        metric: "cardio",
        target: { sessionsPerWeek: 3, minutesPerSession: 20 },
      },
      addDays(today, -14),
      "demo-targets-cardio-1",
    ],
    [
      { metric: "steps", target: { kind: "range", min: 8000, max: 10000 } },
      addDays(today, -3),
      "demo-targets-steps-2",
    ],
  ];
  for (const [change, effectiveFrom, id] of writes) {
    const result = writeActivityTarget({ versions, change, effectiveFrom, id });
    if (result.kind === "saved") versions = result.versions;
  }
  return versions;
}

function demoHabits(): CoachClient["habits"] {
  return [
    {
      id: "demo-habit-walk",
      name: "10-minute walk after dinner",
      frequency: "Daily",
      goal: "10 minutes",
      reason: "Keeps digestion and step count moving on low-activity days.",
      completed: 6,
    },
    {
      id: "demo-habit-water",
      name: "Water before coffee",
      frequency: "Daily",
      goal: "500 ml",
      reason: "Hydration first keeps morning appetite steadier.",
      completed: 5,
    },
    {
      id: "demo-habit-lights",
      name: "Lights out by 23:00",
      frequency: "Weekdays",
      goal: "By 23:00",
      reason: "Consistent bedtime keeps the training week recovering well.",
      completed: 4,
    },
  ];
}

function answerFor(question: Question, today: string): string {
  switch (question.type) {
    case "Rating":
      return "8 / 10 - energy held up even on the busy days";
    case "Numeric":
      return /weight/i.test(question.label) ? "71.9 kg" : "7";
    case "Long text":
      return /win/i.test(question.label)
        ? "Hit all four sessions and kept steps above target every weekday."
        : "Solid week overall - training felt strong and the evening routine stuck.";
    case "Visual upload":
      return `Uploaded front and side photos for ${today}`;
    case "Choice": {
      const [first] = question.options.split(/[,;]/).map((s) => s.trim());
      return first || "Yes";
    }
    default:
      return "On track";
  }
}

function demoSubmissions(
  clientId: string,
  questions: Question[],
  today: string,
): Submission[] {
  const answeredDate = addDays(today, -7);
  const pendingDate = addDays(today, -1);
  return [
    {
      id: "demo-submission-week",
      clientId,
      date: answeredDate,
      eventId: `recurring:${clientId}:${answeredDate}`,
      type: "Full",
      answers: questions.map((q) => ({
        question: q.label,
        answer: answerFor(q, answeredDate),
      })),
      metrics: ["weight", "calories", "sleep", "habits"],
      visuals: [`Front · ${answeredDate}`, `Side · ${answeredDate}`],
      note: "Submitted from the client app.",
      flags: [],
      response: {
        text: "Great week, Amara - the step consistency is showing in the trend. Keep the same approach; we'll review photos at the next check-in.",
        changes: [],
        date: `${answeredDate}T18:30:00Z`,
      },
    },
    {
      id: "demo-submission-latest",
      clientId,
      date: pendingDate,
      eventId: `recurring:${clientId}:${pendingDate}`,
      type: "Full",
      answers: questions.map((q) => ({
        question: q.label,
        answer: answerFor(q, pendingDate),
      })),
      metrics: ["weight", "calories", "sleep", "habits"],
      visuals: [],
      note: "Submitted from the client app.",
      flags: [],
    },
  ];
}

/**
 * Populate the client-app demo client (Amara Lewis) with the data the client
 * views already render. Fills only empty/missing slots - anything the owner
 * already set on client-007 is left untouched. Runs once per saved state via
 * demoSeeds.clientAppDemo.
 */
export function adoptClientAppDemo(
  state: CoachState,
  today: string,
): CoachState {
  if (state.demoSeeds?.clientAppDemo === CLIENT_APP_DEMO_REVISION) return state;

  const index = state.clients.findIndex(
    (client) =>
      client.id === CLIENT_APP_DEMO_CLIENT_ID ||
      client.name.trim().toLocaleLowerCase() === "amara lewis",
  );
  if (index < 0) return state;

  const client = state.clients[index];
  if (!client.assignment) return state;

  // --- Snapshot variant only (never the shared template) ---
  const snapshot = structuredClone(client.assignment.snapshot);
  const variant =
    snapshot.variants.find((v) => v.id === client.assignment?.variantId) ??
    snapshot.variants.find((v) => v.id === snapshot.defaultVariant) ??
    snapshot.variants[0];
  if (variant) {
    if (!CORE_VIEWS.every((view) => variant.views.includes(view)))
      variant.views = [...CORE_VIEWS];
    variant.habits = true;
    if (variant.questions.length < 4)
      variant.questions = [...variant.questions, ...DEMO_QUESTIONS];
    const fieldIds = new Set(variant.fields.map((field) => field.id));
    for (const id of REQUIRED_TRACKER_FIELDS)
      if (!fieldIds.has(id))
        variant.fields.push({ id, unit: getParameter(id)?.units[0] ?? "" });
  }

  // --- Plans: fill empty slots only ---
  const plans = structuredClone(client.plans ?? emptyClientPlans());
  if (!plans.supplements) {
    const supplements = demoSupplementPlan(client.id, today);
    if (supplements) plans.supplements = supplements;
  }
  if (!plans.activityTargets?.length)
    plans.activityTargets = demoActivityTargets(today);

  const nutritionKind = variant?.nutrition === "IIFYM" ? "iifym" : "mealPlan";
  const nutrition = plans.nutrition[nutritionKind];
  if (!nutrition.active) {
    if (nutritionKind === "mealPlan") {
      const plan = createInitialMealPlan(client.id, foodCatalog);
      plan.startDate = addDays(today, -14);
      plan.name = "Amara · prep nutrition";
      plans.nutrition.mealPlan = activateLifecycle(
        plans.nutrition.mealPlan,
        plan,
        `${addDays(today, -14)}T08:00:00Z`,
      );
    } else {
      const plan = emptyIifymPlan(client.id, addDays(today, -14));
      plan.name = "Amara · macro targets";
      plan.options[0].targets = {
        style: "macros",
        calories: { kind: "fixed", value: 2050 },
        protein: { kind: "fixed", value: 130 },
        carbs: { kind: "fixed", value: 210 },
        fat: { kind: "fixed", value: 60 },
      };
      plans.nutrition.iifym = activateLifecycle(
        plans.nutrition.iifym,
        plan,
        `${addDays(today, -14)}T08:00:00Z`,
      );
    }
  }

  // The seeded demo training plan sits in draft; activate only that known seed
  // (never an owner-authored draft) so the Training view, which reads
  // active/history only, can display it.
  if (
    plans.training.draft?.id === "amara-training-example" &&
    !plans.training.active
  )
    plans.training = activateLifecycle(
      plans.training,
      plans.training.draft,
      `${today}T08:00:00Z`,
    );

  // --- Tracker history: keep existing dated rows, fill the gaps ---
  const existingDates = new Set(client.entries.map((entry) => entry.date));
  const entries = [
    ...client.entries,
    ...demoEntries(today).filter((row) => !existingDates.has(row.date)),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const habits = client.habits.length ? client.habits : demoHabits();

  const nextClient: CoachClient = {
    ...client,
    assignment: { ...client.assignment, snapshot },
    plans,
    entries,
    habits,
  };
  const clients = [...state.clients];
  clients[index] = nextClient;

  // --- Check-in history: only when none exist for this client ---
  const submissions = state.submissions.some((s) => s.clientId === client.id)
    ? state.submissions
    : [
        ...state.submissions,
        ...demoSubmissions(client.id, variant?.questions ?? [], today),
      ];

  return {
    ...state,
    clients,
    submissions,
    demoSeeds: { ...state.demoSeeds, clientAppDemo: CLIENT_APP_DEMO_REVISION },
  };
}
