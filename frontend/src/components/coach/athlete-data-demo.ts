// Athlete data demo (phase A1): persists ~10 weeks of tracker history, a
// two-day temporary refeed plan, photo check-ins, pinned notes and a training
// focus on the demo client. Fills only missing data and runs once via
// demoSeeds.athleteDataDemo. Deterministic — no Math.random, no clock reads.

import type { TrackerEntry } from "../ethereal/client-tracker/model";
import {
  calculatePortionNutrients,
  calculateVariantNutrients,
  type Meal,
  type MealPlan,
  type MealPlanVariant,
  type Nutrients,
  scalePortion,
  type TargetValue,
} from "../ethereal/mealplan/model";
import { nutritionForDate } from "./athlete/timeline";
import {
  type CoachClient,
  type CoachState,
  getParameter,
  type Question,
  type Submission,
} from "./model";
import { applicablePlan, planFoodMap, scheduledOption } from "./plans/domain";
import {
  type ClientPhasePlan,
  isClientPhasePlan,
  legacyPhasePlanToPhases,
  normalizePhases,
} from "./plans/phase-planning";
import {
  createTemporaryNutrition,
  upsertTemporaryNutrition,
} from "./plans/temporary-nutrition";
import type { IifymPlan } from "./plans/types";
import {
  type ActivityTargetVersion,
  addLocalDays,
  mondayOf,
  resolveActivityTarget,
  type StepsTarget,
} from "./targets/model";

export const ATHLETE_DATA_DEMO_REVISION = 11;
export const ATHLETE_DATA_DEMO_CLIENT_ID = "client-007";

const TRACKING_DAYS = 70;
const MISSING_INDEXES = new Set([8, 23, 37, 55, 63]);
const NO_FAT_INDEX = 61;
// Mon/Wed/Sat — matches her 3×20 min cardio target.
const CARDIO_WEEKDAYS = new Set([1, 3, 6]);
const DEMO_FIELDS = [
  "weight",
  "calories",
  "protein",
  "carbs",
  "fat",
  "steps",
  "cardio-duration",
  "sleep",
  "water",
  "rhr",
  "fbg",
  "bp",
  "bleeding-level",
  "cramps",
  "pms-symptoms",
  "salt-intake",
  "caffeine-intake",
  "hunger",
  "bloating",
  "sleep-quality",
  "muscle-soreness",
  "stress",
  "energy-in-gym",
  "mood-in-gym",
  "daily-note",
];
const DEMO_POSES = [
  "Front relaxed",
  "Side relaxed",
  "Back relaxed",
  "Front double biceps",
];
const DEMO_TEMP_ID = "demo-temp-refeed";
const DEMO_MEAL_PLAN_NAME = "Amara · prep nutrition";
/** Prep-realistic day targets the seeded plan is scaled to. */
// Identifiers of the demo refeed event being converted to a temporary plan.
const DEMO_PLAN_HISTORY_ID = "demo-plan-hist";
type DemoMacroTargets = { protein: number; carbs: number; fat: number };
/**
 * Carb-cycled prep targets per plan version: High on lower-body days
 * (Mon/Thu), Medium on upper days (Tue/Sat), Low on rest days (Wed/Fri/Sun).
 * Earlier versions sit higher; the active plan is the leanest.
 */
const DEMO_VERSION_TARGETS = {
  a: {
    high: { protein: 190, carbs: 290, fat: 62 },
    medium: { protein: 190, carbs: 240, fat: 65 },
    low: { protein: 195, carbs: 170, fat: 70 },
  },
  b: {
    high: { protein: 185, carbs: 265, fat: 58 },
    medium: { protein: 185, carbs: 215, fat: 62 },
    low: { protein: 190, carbs: 150, fat: 68 },
  },
  active: {
    high: { protein: 180, carbs: 245, fat: 55 },
    medium: { protein: 180, carbs: 195, fat: 60 },
    low: { protein: 185, carbs: 130, fat: 65 },
  },
} as const;
const DEMO_REFEED_TARGETS: DemoMacroTargets = {
  protein: 160,
  carbs: 330,
  fat: 75,
};
const DEMO_REFEED_EVENT_IDS = new Set([
  "demo-refeed-upcoming",
  // Temporary plans own refeeds now — the old past-refeed tag is stale.
  "demo-refeed-past",
]);
const DEMO_REFEED_EVENT_NOTES = new Set(["Keep sodium consistent."]);
const DEMO_PINNED_NOTES = [
  "Left quad lags — keep unilateral work early in lower sessions.",
  "Digestion issues with dairy — keep it out pre-show.",
];
const DEMO_TRAINING_FOCUS = "Hypertrophy · lower-body priority";
const DEMO_OTHER_TARGETS = [
  {
    id: "demo-target-sleep",
    fieldId: "sleep",
    kind: "minimum" as const,
    value: 7.5,
  },
  {
    id: "demo-target-water",
    fieldId: "water",
    kind: "range" as const,
    min: 4,
    max: 5,
  },
];
// Deterministic completion dates for the demo habit (4× per week): 3/4 this
// week, 13/16 over four weeks ≈ 75 % / 81 %.
const DEMO_HABIT_PATTERN = [
  [1, 3, 5],
  [1, 3, 6],
  [1, 4, 6],
  [1, 3, 5, 7],
];
function demoHabitLog(today: string): string[] {
  const weekStart = mondayOf(today);
  const dates: string[] = [];
  for (let w = 0; w < DEMO_HABIT_PATTERN.length; w += 1)
    for (const d of DEMO_HABIT_PATTERN[w]) {
      const date = addLocalDays(addLocalDays(weekStart, -7 * w), d - 1);
      if (date <= today) dates.push(date);
    }
  return dates;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

const slug = (pose: string) => pose.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const photoSrc = (pose: string, set: number) =>
  `/demo/physique/${slug(pose)}-${set}.svg`;
const photoSet = (set: number) =>
  DEMO_POSES.map((pose) => ({ pose, src: photoSrc(pose, set) }));

function targetNumber(target: TargetValue | undefined): number | undefined {
  if (!target) return undefined;
  return target.kind === "range" ? (target.min + target.max) / 2 : target.value;
}

/**
 * Planned macro totals for the option scheduled on `date`. Dates before the
 * plan's start fall back to the current plan's own schedule — the demo log
 * pretends she ran the same approach throughout the block.
 */
export function demoMacroTotals(
  client: CoachClient,
  date: string,
): Nutrients | undefined {
  const resolved = nutritionForDate(client, date);
  const source = resolved.source;
  let plan = resolved.plan;
  let optionId = resolved.optionId;
  if (!plan) {
    plan =
      source === "mealPlan"
        ? client.plans?.nutrition.mealPlan.active?.content
        : client.plans?.nutrition.iifym.active?.content;
    if (!plan) return undefined;
    const ids =
      source === "iifym"
        ? (plan as IifymPlan).options.map((option) => option.id)
        : (plan as MealPlan).variants.map((variant) => variant.id);
    optionId = scheduledOption(plan.schedule, ids, date);
  }
  if (!optionId) return undefined;
  if (source === "iifym") {
    const option = (plan as IifymPlan).options.find(
      (entry) => entry.id === optionId,
    );
    if (!option) return undefined;
    const protein = targetNumber(option.targets.protein) ?? 0;
    const carbs = targetNumber(option.targets.carbs) ?? 0;
    const fat = targetNumber(option.targets.fat) ?? 0;
    return {
      calories:
        targetNumber(option.targets.calories) ??
        protein * 4 + carbs * 4 + fat * 9,
      protein,
      carbs,
      fat,
    };
  }
  const variant = (plan as MealPlan).variants.find(
    (entry) => entry.id === optionId,
  );
  return variant ? calculateVariantNutrients(variant, planFoodMap) : undefined;
}

function stepsCenter(
  versions: ActivityTargetVersion[] | undefined,
  date: string,
): number {
  const target = resolveActivityTarget({
    versions: versions ?? [],
    metric: "steps",
    date,
  })?.target as StepsTarget | null | undefined;
  if (!target) return 9000;
  if (target.kind === "range") return (target.min + target.max) / 2;
  return target.kind === "maximum" ? target.value * 0.9 : target.value * 1.05;
}

/**
 * ~10 weeks of tracker history ending yesterday: bodyweight trending down
 * ~0.5 %/week, macros tracking the scheduled option at ~90–105 % adherence,
 * steps around the activity target, cardio on Mon/Wed/Sat, sleep 6.5–8.2 h,
 * water 3.5–5 L. Five days missing, one day missing fat.
 */
export function demoTrackingEntries(
  client: CoachClient,
  today: string,
): TrackerEntry[] {
  const rand = mulberry32(0xa1e7a);
  const entries: TrackerEntry[] = [];
  for (let i = 0; i < TRACKING_DAYS; i += 1) {
    if (MISSING_INDEXES.has(i)) continue;
    const date = addLocalDays(today, i - TRACKING_DAYS);
    const weight = +(75 * 0.995 ** (i / 7) + (rand() - 0.5) * 0.5).toFixed(1);
    const totals = demoMacroTotals(client, date);
    const adherence = i % 9 === 0 ? 0.84 + rand() * 0.28 : 0.9 + rand() * 0.15;
    const center = stepsCenter(client.plans?.activityTargets, date);
    const dow = weekday(date); // 0=Sun
    const cyclePos = (((i - CYCLE_ANCHOR) % 28) + 28) % 28;
    const values: Record<string, number | null> = {
      weight,
      sleep: +(6.5 + rand() * 1.7).toFixed(1),
      water: +(3.5 + rand() * 1.5).toFixed(1),
      steps: Math.round((center * (0.9 + rand() * 0.25)) / 100) * 100,
      rhr: 51 + Math.round(rand() * 7),
      "salt-intake": +(3.8 + rand() * 1.1).toFixed(1),
      "caffeine-intake": 150 + Math.round(rand() * 70),
      hunger: 3 + Math.round(rand() * 4),
      bloating: 1 + Math.round(rand() * 3),
      "sleep-quality": 6 + Math.round(rand() * 3),
      stress: 2 + Math.round(rand() * 3),
      energy: 6 + Math.round(rand() * 3),
      "muscle-soreness": 2 + Math.round(rand() * 4),
      cramps: cyclePos < 5 ? Math.round(rand() * 6) : 0,
    };
    if (dow === 1 || dow === 4) values.fbg = +(4.4 + rand() * 0.8).toFixed(1);
    if (TRAINING_WEEKDAYS.has(dow)) {
      values["energy-in-gym"] = 6 + Math.round(rand() * 3);
      values["mood-in-gym"] = 6 + Math.round(rand() * 3);
    }
    if (CARDIO_WEEKDAYS.has(weekday(date)))
      values["cardio-duration"] = Math.round(18 + rand() * 14);
    if (totals) {
      values.calories = Math.round((totals.calories * adherence) / 10) * 10;
      values.protein = Math.round(totals.protein * adherence);
      values.carbs = Math.round(totals.carbs * adherence);
      if (i !== NO_FAT_INDEX) values.fat = Math.round(totals.fat * adherence);
    }
    entries.push({ date, values });
  }
  return entries;
}

/** The dates demoTrackingEntries() generates — used to tell demo-owned
 *  entries apart from a coach's own logs when re-deriving on a revision
 *  bump. */
const CYCLE_ANCHOR = 6;
const TRAINING_WEEKDAYS = new Set([1, 2, 4, 6]);
const HEALTH_WEEKDAYS = new Set([1, 4]); // Mon + Thu
const PMS_OPTIONS = [
  "Tender breasts",
  "Headache",
  "Bloating",
  "Acne",
  "Mood changes",
  "Fatigue",
];
const DAILY_NOTES = [
  "Solid day — hit protein, felt full after meals.",
  "Legs heavy this morning, still got the session done.",
  "Stomach a bit off, kept sodium the same.",
  "Energy dipped mid-afternoon, short nap helped.",
  "Best posing practice so far — lines looked sharp.",
];
const COACH_NOTES = [
  "Check in on digestion before adjusting macros.",
  "Sleep quality holding — keep the evening routine.",
  "Stress up this week, watch recovery closely.",
];
const BLEEDING = ["Light", "Medium", "Heavy", "Medium", "Light"];

/** Deterministic tracker text/choice values for the demo window. */
export function demoTrackingText(today: string): Record<string, string> {
  const text: Record<string, string> = {};
  for (let i = 0; i < TRACKING_DAYS; i += 1) {
    if (MISSING_INDEXES.has(i)) continue;
    const date = addLocalDays(today, i - TRACKING_DAYS);
    const cyclePos = (((i - CYCLE_ANCHOR) % 28) + 28) % 28;
    if (HEALTH_WEEKDAYS.has(weekday(date)))
      text[`${date}:bp`] = `${116 + ((i * 3) % 6)} / ${74 + ((i * 2) % 5)}`;
    if (cyclePos < 5) text[`${date}:bleeding-level`] = BLEEDING[cyclePos];
    if (cyclePos === 26 || cyclePos === 27)
      text[`${date}:pms-symptoms`] = [
        PMS_OPTIONS[i % PMS_OPTIONS.length],
        PMS_OPTIONS[(i + 2) % PMS_OPTIONS.length],
      ].join(", ");
    if (i % 5 === 2)
      text[`${date}:daily-note`] = DAILY_NOTES[i % DAILY_NOTES.length];
    if (i % 24 === 7)
      text[`${date}:coach-note`] = COACH_NOTES[i % COACH_NOTES.length];
  }
  for (let back = 2; back < 9; back += 1) {
    const date = addLocalDays(today, -back);
    if (weekday(date) === 4) {
      text[`${date}:note:calories`] = "Sodium spike? watch weekend.";
      break;
    }
  }
  return text;
}

function demoTrackingDates(today: string): Set<string> {
  const dates = new Set<string>();
  for (let i = 0; i < TRACKING_DAYS; i += 1) {
    if (MISSING_INDEXES.has(i)) continue;
    dates.add(addLocalDays(today, i - TRACKING_DAYS));
  }
  return dates;
}

/**
 * Re-quantify the seeded meal plan to prep-realistic totals (≈2,050 kcal,
 * P 170 / C 210 / F 55). Each portion is classed by dominant macro and its
 * class nudged toward the target over a few passes — cross-macro
 * contributions (e.g. protein in carb foods) make a single pass overshoot.
 */
/**
 * Base meal structure per day type. Portions are scaled to the version's
 * targets and rounded to realistic amounts — High leans on oats/rice/
 * potatoes, Low swaps most carbs for vegetables and fats.
 */
const DEMO_MEAL_TIMES = [
  ["07:30", "Breakfast"],
  ["12:30", "Lunch"],
  ["16:00", "Pre-workout"],
  ["19:30", "Dinner"],
  ["21:30", "Evening"],
] as const;
const meal = (id: string, i: number, portions: Meal["portions"]): Meal => ({
  id,
  label: DEMO_MEAL_TIMES[i][1],
  time: DEMO_MEAL_TIMES[i][0],
  portions,
});
const portion = (foodId: string, quantity: number) => ({ foodId, quantity });
const DEMO_VARIANT_BASES: MealPlanVariant[] = [
  {
    id: "high",
    label: "High",
    meals: [
      meal("demo-high-m1", 0, [
        portion("food-057", 60),
        portion("food-021", 30),
        portion("food-108", 80),
        portion("food-072", 15),
      ]),
      meal("demo-high-m2", 1, [
        portion("food-001", 150),
        portion("food-051", 70),
        portion("food-111", 100),
        portion("food-083", 8),
      ]),
      meal("demo-high-m3", 2, [
        portion("food-062", 60),
        portion("food-021", 30),
        portion("food-100", 100),
      ]),
      meal("demo-high-m4", 3, [
        portion("food-003", 150),
        portion("food-055", 300),
        portion("food-114", 100),
        portion("food-083", 8),
      ]),
      meal("demo-high-m5", 4, [
        portion("food-018", 200),
        portion("food-067", 3),
        portion("food-096", 80),
        portion("food-081", 15),
      ]),
    ],
  },
  {
    id: "medium",
    label: "Medium",
    meals: [
      meal("demo-med-m1", 0, [
        portion("food-018", 250),
        portion("food-057", 50),
        portion("food-108", 100),
        portion("food-072", 10),
      ]),
      meal("demo-med-m2", 1, [
        portion("food-033", 140),
        portion("food-055", 250),
        portion("food-133", 100),
        portion("food-083", 8),
      ]),
      meal("demo-med-m3", 2, [
        portion("food-067", 4),
        portion("food-021", 25),
        portion("food-100", 80),
      ]),
      meal("demo-med-m4", 3, [
        portion("food-009", 150),
        portion("food-051", 50),
        portion("food-111", 100),
        portion("food-095", 60),
      ]),
      meal("demo-med-m5", 4, [
        portion("food-016", 2),
        portion("food-017", 150),
        portion("food-074", 40),
        portion("food-096", 80),
      ]),
    ],
  },
  {
    id: "low",
    label: "Low",
    meals: [
      meal("demo-low-m1", 0, [
        portion("food-016", 2),
        portion("food-017", 150),
        portion("food-095", 60),
        portion("food-074", 30),
      ]),
      meal("demo-low-m2", 1, [
        portion("food-001", 150),
        portion("food-111", 150),
        portion("food-083", 10),
        portion("food-055", 150),
      ]),
      meal("demo-low-m3", 2, [
        portion("food-018", 200),
        portion("food-096", 100),
        portion("food-081", 10),
      ]),
      meal("demo-low-m4", 3, [
        portion("food-005", 140),
        portion("food-114", 150),
        portion("food-095", 40),
      ]),
      meal("demo-low-m5", 4, [
        portion("food-015", 80),
        portion("food-017", 100),
        portion("food-082", 10),
      ]),
    ],
  },
];
/** Two refeed days: higher carbs and fats, slightly less protein. */
const DEMO_REFEED_BASE: MealPlanVariant = {
  id: "refeed",
  label: "Refeed",
  meals: [
    meal("demo-ref-m1", 0, [
      portion("food-057", 50),
      portion("food-072", 15),
      portion("food-100", 60),
      portion("food-021", 20),
    ]),
    meal("demo-ref-m2", 1, [
      portion("food-001", 120),
      portion("food-051", 60),
      portion("food-111", 100),
      portion("food-083", 8),
    ]),
    meal("demo-ref-m3", 2, [portion("food-058", 1), portion("food-082", 15)]),
    meal("demo-ref-m4", 3, [
      portion("food-033", 120),
      portion("food-055", 300),
      portion("food-114", 100),
    ]),
    meal("demo-ref-m5", 4, [
      portion("food-018", 200),
      portion("food-067", 3),
      portion("food-072", 10),
      portion("food-096", 80),
    ]),
  ],
};

function scaleVariantToTargets(
  variant: MealPlanVariant,
  targets: DemoMacroTargets,
): MealPlanVariant {
  const scaled = structuredClone(variant);
  const classOf = (foodId: string): keyof DemoMacroTargets | null => {
    const food = planFoodMap.get(foodId);
    if (!food || food.calories <= 0) return null;
    const p = food.protein * 4;
    const c = food.carbs * 4;
    const f = food.fat * 9;
    return p >= c && p >= f ? "protein" : c >= f ? "carbs" : "fat";
  };
  for (let pass = 0; pass < 5; pass += 1) {
    const totals = { protein: 0, carbs: 0, fat: 0 };
    for (const m of scaled.meals)
      for (const po of m.portions) {
        const food = planFoodMap.get(po.foodId);
        if (!food) continue;
        const n = calculatePortionNutrients(food, po.quantity);
        totals.protein += n.protein;
        totals.carbs += n.carbs;
        totals.fat += n.fat;
      }
    for (const m of scaled.meals)
      m.portions = m.portions.map((po) => {
        const cls = classOf(po.foodId);
        if (!cls || totals[cls] <= 0) return po;
        const factor = Math.min(1.6, Math.max(0.6, targets[cls] / totals[cls]));
        return scalePortion(po, factor);
      });
  }
  return scaled;
}

/** Round portions to realistic amounts: 5 g for weighed foods, whole units
 * for piece-based foods (eggs, bagels, rice cakes, wraps). */
function roundVariantPortions(variant: MealPlanVariant): MealPlanVariant {
  const rounded = structuredClone(variant);
  for (const m of rounded.meals)
    m.portions = m.portions.map((po) => {
      const food = planFoodMap.get(po.foodId);
      const step = food && /^(g|ml)$/i.test(food.unit) ? 5 : 1;
      return {
        ...po,
        quantity: Math.max(step, Math.round(po.quantity / step) * step),
      };
    });
  return rounded;
}

/** Scale, round to real-world portions, then re-scale and re-round once so
 * the final totals still land on the version's targets. */
function demoScaledVariant(
  base: MealPlanVariant,
  targets: DemoMacroTargets,
): MealPlanVariant {
  return roundVariantPortions(
    scaleVariantToTargets(
      roundVariantPortions(scaleVariantToTargets(base, targets)),
      targets,
    ),
  );
}

/** Carb-cycled schedule: High on lower-body days (Mon/Thu), Medium on upper
 * days (Tue/Sat), Low on rest days (Wed/Fri/Sun). */
const DEMO_PLAN_SCHEDULE = {
  mode: "weekly",
  days: {
    1: "high",
    2: "medium",
    3: "low",
    4: "high",
    5: "low",
    6: "medium",
    7: "low",
  },
} as const;

/** Replace the demo plan's content with the carb-cycled variants for one
 * version's targets, keeping the plan's own id/name/startDate. */
function buildDemoMealPlanContent(
  plan: MealPlan,
  targets: Record<"high" | "medium" | "low", DemoMacroTargets>,
): MealPlan {
  const variants = DEMO_VARIANT_BASES.map((base) =>
    demoScaledVariant(base, targets[base.id as "high" | "medium" | "low"]),
  );
  return {
    ...plan,
    variants,
    activeVariantId: variants[0]?.id ?? plan.activeVariantId,
    schedule: { mode: "weekly", days: { ...DEMO_PLAN_SCHEDULE.days } },
  };
}

function answerFor(question: Question, date: string): string {
  switch (question.type) {
    case "Rating":
      return "8 / 10 — energy held up even on the busy days";
    case "Numeric":
      return /weight/i.test(question.label) ? "71.9 kg" : "7";
    case "Long text":
      return /win/i.test(question.label)
        ? "Hit all four sessions and kept steps above target every weekday."
        : "Solid week overall — training felt strong and the evening routine stuck.";
    case "Visual upload":
      return `Uploaded front and side photos for ${date}`;
    case "Choice": {
      const [first] = question.options.split(/[,;]/).map((s) => s.trim());
      return first || "Yes";
    }
    default:
      return "On track";
  }
}

function demoSubmission(
  clientId: string,
  id: string,
  date: string,
  questions: Question[],
  set: number,
  responded: boolean,
): Submission {
  return {
    id,
    clientId,
    date,
    eventId: `recurring:${clientId}:${date}`,
    type: "Full",
    answers: questions.map((q) => ({
      question: q.label,
      answer: answerFor(q, date),
    })),
    metrics: ["weight", "calories", "sleep", "habits"],
    visuals: [`Front · ${date}`, `Side · ${date}`],
    photos: photoSet(set),
    note: "Submitted from the client app.",
    flags: [],
    response: responded
      ? {
          text: "Solid week — the step consistency is showing in the trend. Keep the same approach.",
          changes: [],
          date: `${date}T18:30:00Z`,
        }
      : undefined,
  };
}

/**
 * One-time adoption (demoSeeds.athleteDataDemo): persisted tracking history,
 * a temporary refeed plan replacing the demo refeed event, photo check-ins,
 * pinned notes and a training focus. Never overwrites coach-made data.
 */
export function adoptAthleteDataDemo(
  state: CoachState,
  today: string,
): CoachState {
  if (state.demoSeeds?.athleteDataDemo === ATHLETE_DATA_DEMO_REVISION)
    return state;

  const index = state.clients.findIndex(
    (client) => client.id === ATHLETE_DATA_DEMO_CLIENT_ID,
  );
  if (index < 0) return state;
  const client = state.clients[index];
  if (!client.assignment) return state;

  // --- Snapshot variant: tracker fields + a "Progress photos" question ---
  const snapshot = structuredClone(client.assignment.snapshot);
  const variant =
    snapshot.variants.find((v) => v.id === client.assignment?.variantId) ??
    snapshot.variants.find((v) => v.id === snapshot.defaultVariant) ??
    snapshot.variants[0];
  if (variant) {
    const fieldIds = new Set(variant.fields.map((field) => field.id));
    for (const id of DEMO_FIELDS)
      if (!fieldIds.has(id))
        variant.fields.push({ id, unit: getParameter(id)?.units[0] ?? "" });
    const photoQuestion = variant.questions.find(
      (q) => q.type === "Visual upload" && /photo/i.test(q.label),
    );
    if (!photoQuestion)
      variant.questions.push({
        id: "demo-q-photos",
        label: "Progress photos",
        type: "Visual upload",
        required: false,
        options: DEMO_POSES.join(", "),
      });
    else if (!photoQuestion.options.trim())
      photoQuestion.options = DEMO_POSES.join(", ");
  }

  // --- Plans: temporary refeed + training focus ---
  let plans = client.plans ? structuredClone(client.plans) : undefined;
  if (plans) {
    const source = variant?.nutrition === "IIFYM" ? "iifym" : "mealPlan";
    // Re-quantify the seeded demo meal plan to realistic prep targets. Only
    // the demo-named plan with implausibly low totals is touched.
    if (source === "mealPlan") {
      const lifecycle = plans.nutrition.mealPlan;
      const content = lifecycle.active?.content;
      if (lifecycle.active && content?.name === DEMO_MEAL_PLAN_NAME) {
        // Rebuild the demo plan as a High/Medium/Low carb-cycled prep plan.
        lifecycle.active = {
          ...lifecycle.active,
          content: {
            ...buildDemoMealPlanContent(content, DEMO_VERSION_TARGETS.active),
            name: "Contest prep · Block 2",
          },
        };
        // Demo plan history: earlier versions step the targets down over
        // the prep so past weeks show what the plan said then. Same
        // variant labels, so the timeline slots keep matching. Demo-owned
        // versions are replaced; coach-made versions are left alone.
        const activePlan = lifecycle.active;
        if (activePlan) {
          const coachStart = mondayOf(
            client.coachingSince ?? addLocalDays(today, -56),
          );
          const mid = addLocalDays(today, -40);
          const activeStart = activePlan.content.startDate;
          const seedVersion = (
            id: string,
            name: string,
            startDate: string,
            targets: Record<"high" | "medium" | "low", DemoMacroTargets>,
            archivedOn: string,
          ) => ({
            id,
            activatedAt: `${startDate}T08:00:00Z`,
            archivedOn,
            content: {
              ...buildDemoMealPlanContent(activePlan.content, targets),
              id: `${activePlan.content.id}-${id}`,
              name,
              startDate,
            },
          });
          lifecycle.history = [
            ...lifecycle.history.filter(
              (v) => !v.id.startsWith(DEMO_PLAN_HISTORY_ID),
            ),
            seedVersion(
              `${DEMO_PLAN_HISTORY_ID}-a`,
              "Pre-prep · Maintenance",
              coachStart,
              DEMO_VERSION_TARGETS.a,
              mid,
            ),
            seedVersion(
              `${DEMO_PLAN_HISTORY_ID}-b`,
              "Contest prep · Block 1",
              mid,
              DEMO_VERSION_TARGETS.b,
              activeStart,
            ),
          ].sort((a, b) => a.activatedAt.localeCompare(b.activatedAt));
        }
      }
    }
    // Earlier activity targets so past weeks carry the prior prescription.
    const targets = plans.activityTargets ?? [];
    const seedTarget = (version: ActivityTargetVersion) => {
      if (!targets.some((v) => v.id === version.id)) targets.push(version);
    };
    const coachStart = mondayOf(
      client.coachingSince ?? addLocalDays(today, -56),
    );
    seedTarget({
      id: "demo-targets-steps-0",
      effectiveFrom: coachStart,
      metric: "steps",
      target: { kind: "minimum", value: 7000 },
    });
    seedTarget({
      id: "demo-targets-cardio-0",
      effectiveFrom: coachStart,
      metric: "cardio",
      target: { sessionsPerWeek: 2, minutesPerSession: 20 },
    });
    plans = { ...plans, activityTargets: targets };
    const active =
      source === "mealPlan"
        ? (applicablePlan(plans.nutrition.mealPlan, addLocalDays(today, 2)) ??
          plans.nutrition.mealPlan.active?.content)
        : (applicablePlan(plans.nutrition.iifym, addLocalDays(today, 2)) ??
          plans.nutrition.iifym.active?.content);
    if (
      active &&
      !(plans.nutrition.temporary ?? []).some((t) => t.id === DEMO_TEMP_ID)
    ) {
      const temporary = createTemporaryNutrition(
        active,
        source,
        {
          kind: "refeed",
          label: "Refeed",
          startDate: addLocalDays(today, 2),
          endDate: addLocalDays(today, 3),
        },
        `${today}T08:00:00Z`,
      );
      temporary.id = DEMO_TEMP_ID;
      if (source === "mealPlan") {
        const temporaryPlan = temporary.plan as MealPlan;
        // The demo refeed is a single-variant plan: the same day applies
        // across the whole range.
        temporary.plan = {
          ...temporaryPlan,
          variants: [demoScaledVariant(DEMO_REFEED_BASE, DEMO_REFEED_TARGETS)],
          activeVariantId: "refeed",
          schedule: { mode: "manual", selectedVariantId: "refeed" },
        };
      }
      plans = upsertTemporaryNutrition(plans, temporary);
    }
    const training = plans.training.active;
    if (training && !training.content.focus) {
      training.content = {
        ...training.content,
        focus: DEMO_TRAINING_FOCUS,
      };
    }
    if (!plans.otherTargets?.length)
      plans = {
        ...plans,
        otherTargets: DEMO_OTHER_TARGETS.map((t) => ({ ...t })),
      };
  }

  // The demo refeed event converts into the temporary plan; other events
  // (deload, diet break, past refeed) stay as plain week tags.
  const timelineEvents = (client.timelineEvents ?? []).filter(
    (event) =>
      event.kind !== "refeed" ||
      (!DEMO_REFEED_EVENT_IDS.has(event.id) &&
        !DEMO_REFEED_EVENT_NOTES.has(event.note)),
  );

  // --- Phases: a legacy single phase plan converts to the phases list
  //  (migration handles stored states; the profile demo seeds phases
  //  directly). The seeded "Peak week" add-on merges back into prep and
  //  the demo-owned "Post-show" phase is renamed to "Recovery". ---
  const phases = (() => {
    const source =
      client.phases ??
      (() => {
        const legacy = (client as { phasePlan?: ClientPhasePlan }).phasePlan;
        return isClientPhasePlan(legacy)
          ? legacyPhasePlanToPhases(legacy)
          : undefined;
      })();
    if (!source?.length) return source;
    const index = source.findIndex((p) => p.id === "phase-peak");
    const merged =
      index < 0
        ? source
        : source
            .filter((p) => p.id !== "phase-peak")
            .map((p, i) =>
              i === index - 1
                ? {
                    ...p,
                    durationWeeks:
                      p.durationWeeks + source[index].durationWeeks,
                  }
                : p,
            );
    return normalizePhases(
      merged.map((p) =>
        p.id === "phase-post" && p.name === "Post-show"
          ? { ...p, name: "Recovery" }
          : p,
      ),
    );
  })();

  // --- Habit: structured frequency + completion log ---
  const habits = client.habits.map((habit) =>
    typeof habit.frequency === "string"
      ? {
          ...habit,
          frequency:
            habit.name === "Evening walk"
              ? ({ kind: "per-week", count: 4 } as const)
              : ({ kind: "daily" } as const),
        }
      : habit,
  );
  const habitLog =
    client.habitLog ??
    Object.fromEntries(
      client.habits.map((habit) => [habit.id, demoHabitLog(today)]),
    );

  const staged: CoachClient = {
    ...client,
    assignment: { ...client.assignment, snapshot },
    plans,
    phases,
    timelineEvents,
    habits,
    habitLog,
  };

  // --- Persisted tracking history (never overwrite a real log). On a
  //  revision bump only entries on demo-owned dates are re-derived;
  //  anything the coach logged on other dates stays. ---
  const demoDates = demoTrackingDates(today);
  const tracking = !client.tracking?.entries.length
    ? {
        entries: demoTrackingEntries(staged, today),
        text: { ...demoTrackingText(today), ...(client.tracking?.text ?? {}) },
      }
    : client.tracking.entries.some((entry) => demoDates.has(entry.date))
      ? {
          ...client.tracking,
          entries: [
            ...client.tracking.entries.filter(
              (entry) => !demoDates.has(entry.date),
            ),
            ...demoTrackingEntries(staged, today),
          ].sort((a, b) => a.date.localeCompare(b.date)),
        }
      : client.tracking;

  // --- Pinned private notes ---
  const existingNotes = new Set(
    client.internalNotes.map((note) => note.text.trim()),
  );
  const internalNotes = [
    ...client.internalNotes,
    ...DEMO_PINNED_NOTES.filter((text) => !existingNotes.has(text)).map(
      (text, i) => ({
        id: `demo-pinned-note-${i + 1}`,
        text,
        pinned: true,
      }),
    ),
  ];

  const nextClient: CoachClient = {
    ...staged,
    tracking,
    internalNotes,
  };
  const clients = [...state.clients];
  clients[index] = nextClient;

  // --- Check-ins: photos on the two existing demo submissions + two more ---
  const questions = variant?.questions ?? [];
  const submissions = state.submissions.map((submission) =>
    submission.clientId === client.id &&
    (submission.id === "demo-submission-week" ||
      submission.id === "demo-submission-latest") &&
    !submission.photos?.length
      ? { ...submission, photos: photoSet(2) }
      : submission,
  );
  const submissionIds = new Set(submissions.map((s) => s.id));
  if (!submissionIds.has("demo-submission-first"))
    submissions.push(
      demoSubmission(
        client.id,
        "demo-submission-first",
        addLocalDays(today, -63),
        questions,
        1,
        true,
      ),
    );
  if (!submissionIds.has("demo-submission-mid"))
    submissions.push(
      demoSubmission(
        client.id,
        "demo-submission-mid",
        addLocalDays(today, -35),
        questions,
        1,
        true,
      ),
    );

  return {
    ...state,
    clients,
    submissions,
    demoSeeds: {
      ...state.demoSeeds,
      athleteDataDemo: ATHLETE_DATA_DEMO_REVISION,
    },
  };
}
