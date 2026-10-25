import foodSource from "@/lib/canvas/data/food-database.json";
import {
  calculateVariantNutrients,
  type Food,
  isMealPlan,
  type MealPlan,
  type MealTargets,
  type Nutrients,
  type VariantSchedule,
  validateMealPlan,
  validateTargets,
} from "../../ethereal/mealplan/model";
import type { CoachClient, CoachState } from "../model";
import { isSupplementPlan } from "../supplements/model";
import { isActivityTargetVersion } from "../targets/model";
import {
  isClientPhasePlan,
  isClientPhases,
  legacyPhasePlanToPhases,
  normalizePhases,
} from "./phase-planning";
import { defaultExerciseLibrary } from "./training/library-model";
import {
  type ClientPlans,
  emptyClientPlans,
  type IifymPlan,
  type ModuleKind,
  type PlanLifecycle,
  resolveTrainingWeek,
  type TrainingPlan,
} from "./types";
export const foodCatalog: Food[] = Array.isArray(foodSource)
  ? foodSource
  : foodSource.foods;
export const planFoodMap = new Map(foodCatalog.map((food) => [food.id, food]));
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function lifecycleStatus<T>(life: PlanLifecycle<T>): string {
  if (life.active)
    return life.draft &&
      JSON.stringify(life.draft) !== JSON.stringify(life.active.content)
      ? "Active with draft changes"
      : "Active";
  return life.draft
    ? "Draft"
    : life.history.length
      ? "Archived / no active plan"
      : "Not started";
}
export function applicablePlan<T extends { startDate: string }>(
  life: PlanLifecycle<T>,
  date: string,
): T | undefined {
  if (!validDate(date)) return undefined;
  return [...life.history, ...(life.active ? [life.active] : [])]
    .reverse()
    .filter(
      (v) =>
        v.content.startDate <= date && (!v.archivedOn || date < v.archivedOn),
    )
    .sort(
      (a, b) =>
        b.content.startDate.localeCompare(a.content.startDate) ||
        b.activatedAt.localeCompare(a.activatedAt),
    )[0]?.content;
}
export function activateLifecycle<T>(
  life: PlanLifecycle<T>,
  content: T,
  now = new Date().toISOString(),
): PlanLifecycle<T> {
  if (
    life.active &&
    JSON.stringify(content) === JSON.stringify(life.active.content)
  )
    return life;
  return {
    draft: structuredClone(content),
    active: {
      id: id("version"),
      content: structuredClone(content),
      activatedAt: now,
    },
    history: [
      ...life.history,
      ...(life.active ? [structuredClone(life.active)] : []),
    ],
  };
}
export function archiveLifecycle<T>(
  life: PlanLifecycle<T>,
  date: string,
): PlanLifecycle<T> {
  return {
    ...life,
    active: undefined,
    history: [
      ...life.history.map((v) => ({ ...v, archivedOn: v.archivedOn ?? date })),
      ...(life.active
        ? [{ ...structuredClone(life.active), archivedOn: date }]
        : []),
    ],
  };
}
export function emptyMealPlan(clientId: string, date: string): MealPlan {
  const option = id("option");
  return {
    id: id("nutrition"),
    clientId,
    name: "Individual meal plan",
    startDate: date,
    variants: [{ id: option, label: "Daily plan", meals: [] }],
    activeVariantId: option,
    schedule: { mode: "manual", selectedVariantId: option },
    archivedPlans: [],
    reusableMeals: [],
  };
}
export function emptyIifymPlan(clientId: string, date: string): IifymPlan {
  const option = id("option");
  return {
    id: id("targets"),
    clientId,
    name: "Individual nutrition targets",
    startDate: date,
    options: [
      {
        id: option,
        label: "Daily plan",
        targets: { style: "calories", calories: { kind: "fixed", value: 0 } },
      },
    ],
    schedule: { mode: "manual", selectedVariantId: option },
  };
}
export function emptyTrainingPlan(
  clientId: string,
  date: string,
): TrainingPlan {
  return {
    id: id("program"),
    clientId,
    name: "Individual training program",
    startDate: date,
    program: "Evergreen",
    weeks: 8,
    overrides: { "1": [] },
    rotation: {
      mode: "weekly",
      weekdays: {
        Monday: [],
        Tuesday: [],
        Wednesday: [],
        Thursday: [],
        Friday: [],
        Saturday: [],
        Sunday: [],
      },
    },
  };
}
export function scheduledOption(
  schedule: VariantSchedule,
  ids: string[],
  date: string,
): string | undefined {
  if (!validDate(date)) return undefined;
  if (schedule.mode === "manual")
    return ids.includes(schedule.selectedVariantId)
      ? schedule.selectedVariantId
      : undefined;
  if (schedule.mode === "weekly")
    return schedule.days[
      (((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1) as 1
    ];
  if (!validDate(schedule.anchorDate)) return undefined;
  const total = schedule.steps.reduce((a, s) => a + s.days, 0);
  if (total <= 0) return undefined;
  let day =
    ((Math.round(
      (Date.parse(`${date}T12:00:00Z`) -
        Date.parse(`${schedule.anchorDate}T12:00:00Z`)) /
        86400000,
    ) %
      total) +
      total) %
    total;
  for (const step of schedule.steps) {
    if (day < step.days) return step.variantId;
    day -= step.days;
  }
}
export function targetNumber(target: MealTargets["calories"]): number {
  return !target
    ? 0
    : target.kind === "range"
      ? (target.min + target.max) / 2
      : target.value;
}
export function planTargets(
  client: CoachClient,
  date: string,
): Nutrients | undefined {
  const plans = client.plans;
  if (!plans || !client.assignment) return undefined;
  const setup =
    client.assignment.snapshot.variants.find(
      (v) => v.id === client.assignment?.variantId,
    ) ?? client.assignment.snapshot.variants[0];
  if (!setup?.views.includes("Nutrition")) return undefined;
  if (setup.nutrition === "Meal plan") {
    const plan = applicablePlan(plans.nutrition.mealPlan, date);
    if (!plan) return undefined;
    const option = plan.variants.find(
      (o) =>
        o.id ===
        scheduledOption(
          plan.schedule,
          plan.variants.map((v) => v.id),
          date,
        ),
    );
    return option ? calculateVariantNutrients(option, planFoodMap) : undefined;
  }
  const plan = applicablePlan(plans.nutrition.iifym, date);
  if (!plan) return undefined;
  const option = plan.options.find(
    (o) =>
      o.id ===
      scheduledOption(
        plan.schedule,
        plan.options.map((o) => o.id),
        date,
      ),
  );
  if (!option) return undefined;
  const t = option.targets;
  return {
    calories:
      t.style === "calories"
        ? targetNumber(t.calories)
        : targetNumber(t.protein) * 4 +
          targetNumber(t.carbs) * 4 +
          targetNumber(t.fat) * 9,
    protein: targetNumber(t.protein),
    carbs: targetNumber(t.carbs),
    fat: targetNumber(t.fat),
  };
}
export function trainingWeek(plan: TrainingPlan, date: string): number {
  return plan.program === "Evergreen"
    ? 1
    : Math.max(
        1,
        Math.min(
          plan.weeks,
          Math.floor(
            (Date.parse(`${date}T12:00:00Z`) -
              Date.parse(`${plan.startDate}T12:00:00Z`)) /
              604800000,
          ) + 1,
        ),
      );
}
export function validateIndividualPlan(
  kind: ModuleKind,
  value: MealPlan | IifymPlan | TrainingPlan,
): string[] {
  const errors: string[] = [];
  if (!value.name.trim()) errors.push("Name the plan.");
  if (!validDate(value.startDate)) errors.push("Choose a valid start date.");
  if (kind === "mealPlan") {
    const p = value as MealPlan;
    errors.push(...validateMealPlan(p, planFoodMap));
    if (
      p.variants.some(
        (o) =>
          !o.meals.length ||
          o.meals.some(
            (m) =>
              !m.portions.length || m.portions.some((f) => f.quantity <= 0),
          ),
      )
    )
      errors.push("Every option needs a meal with positive food portions.");
  }
  if (kind === "iifym") {
    const p = value as IifymPlan;
    if (!p.options.length) errors.push("Add an option.");
    for (const o of p.options) {
      if (!o.label.trim()) errors.push("Name every option.");
      errors.push(...validateTargets(o.targets));
      const fields =
        o.targets.style === "calories"
          ? (["calories"] as const)
          : (["protein", "carbs", "fat"] as const);
      if (fields.some((k) => !o.targets[k] || targetNumber(o.targets[k]) <= 0))
        errors.push("Set positive targets for every option.");
    }
    const fake = {
      ...emptyMealPlan(p.clientId, p.startDate),
      variants: p.options.map((o) => ({ id: o.id, label: o.label, meals: [] })),
      activeVariantId: p.options[0]?.id ?? "",
      schedule: p.schedule,
    };
    errors.push(...validateMealPlan(fake, planFoodMap));
  }
  if (kind === "training") {
    const p = value as TrainingPlan;
    if (
      p.program === "Week-based" &&
      (!Number.isInteger(p.weeks) || p.weeks < 1 || p.weeks > 52)
    )
      errors.push("Choose 1–52 weeks.");
    const weeks =
      p.program === "Evergreen"
        ? [1]
        : Array.from(
            { length: Math.max(0, Math.min(p.weeks, 52)) },
            (_, i) => i + 1,
          );
    for (const week of weeks) {
      const sessions = resolveTrainingWeek(p, week);
      if (!sessions.length) errors.push(`Add a session for week ${week}.`);
      for (const s of sessions) {
        if (!s.name.trim() || !s.exercises.length)
          errors.push("Every session needs a name and exercise.");
        for (const e of s.exercises) {
          if (!e.name.trim() || !e.sets.length)
            errors.push("Every exercise needs a name and set.");
          if (
            e.sets.some(
              (set) =>
                !Number.isInteger(set.reps) ||
                set.reps < 1 ||
                (set.repsMax !== undefined &&
                  (!Number.isInteger(set.repsMax) || set.repsMax < set.reps)),
            )
          )
            errors.push("Set positive reps and valid rep ranges.");
        }
      }
    }
  }
  return [...new Set(errors)];
}
// Default new fields before structural validation. Never seed authored prescriptions from legacy scalar summaries.
export function migrateCoachState(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const state = structuredClone(value) as CoachState;
  if (state.exerciseLibrary === undefined)
    state.exerciseLibrary = defaultExerciseLibrary();
  if (!Array.isArray(state.clients)) return state;
  state.clients = state.clients.map((client) => {
    const base = emptyClientPlans();
    const old = client.plans as Partial<ClientPlans> | undefined;
    // Legacy single phase plan {startDate, phases[]} → back-to-back phases.
    const { phasePlan: legacyPhasePlan, ...clientRest } =
      client as CoachClient & {
        phasePlan?: unknown;
      };
    const phases = isClientPhases(client.phases)
      ? normalizePhases(client.phases)
      : isClientPhasePlan(legacyPhasePlan)
        ? legacyPhasePlanToPhases(legacyPhasePlan)
        : undefined;
    return {
      ...clientRest,
      phases,
      // Drop legacy event-level nutrition overrides; temporary plans replaced
      // them and the event type no longer carries the field.
      timelineEvents: (
        client.timelineEvents as { nutritionOverride?: unknown }[] | undefined
      )?.map(
        ({ nutritionOverride: _dropped, ...event }) => event,
      ) as CoachClient["timelineEvents"],
      plans: old
        ? {
            ...base,
            ...old,
            nutrition: {
              mealPlan: {
                ...base.nutrition.mealPlan,
                ...old.nutrition?.mealPlan,
                history: old.nutrition?.mealPlan?.history ?? [],
              },
              iifym: {
                ...base.nutrition.iifym,
                ...old.nutrition?.iifym,
                history: old.nutrition?.iifym?.history ?? [],
              },
              temporary: old.nutrition?.temporary,
            },
            training: old.training
              ? { ...old.training, history: old.training.history ?? [] }
              : base.training,
            goals: old.goals ?? [],
          }
        : base,
    };
  });
  return state;
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown) => typeof v === "string";
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const array = (v: unknown, guard: (x: unknown) => boolean): boolean =>
  Array.isArray(v) && v.every(guard);
const schedule = (v: unknown) =>
  record(v) &&
  (v.mode === "manual"
    ? string(v.selectedVariantId)
    : v.mode === "weekly"
      ? record(v.days) &&
        Object.entries(v.days).every(([k, x]) => /^[1-7]$/.test(k) && string(x))
      : v.mode === "cycle" &&
        string(v.anchorDate) &&
        array(
          v.steps,
          (x) => record(x) && string(x.variantId) && number(x.days),
        ));
const target = (v: unknown) =>
  record(v) &&
  (v.kind === "fixed" || v.kind === "minimum"
    ? number(v.value)
    : v.kind === "range" && number(v.min) && number(v.max));
const iifym = (v: unknown) =>
  record(v) &&
  string(v.id) &&
  string(v.clientId) &&
  string(v.name) &&
  string(v.startDate) &&
  schedule(v.schedule) &&
  array(
    v.options,
    (o) =>
      record(o) &&
      string(o.id) &&
      string(o.label) &&
      record(o.targets) &&
      ["calories", "macros"].includes(String(o.targets.style)) &&
      ["calories", "protein", "carbs", "fat"].every(
        (k) =>
          (o.targets as Record<string, unknown>)[k] === undefined ||
          target((o.targets as Record<string, unknown>)[k]),
      ),
  );
const trainingRotation = (v: unknown) =>
  record(v) &&
  (v.mode === "weekly"
    ? record(v.weekdays) &&
      Object.entries(v.weekdays).every(
        ([day, ids]) =>
          [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ].includes(day) && array(ids, string),
      )
    : v.mode === "cycle" &&
      array(v.sessionIds, (id) => id === null || string(id)));
const training = (v: unknown) =>
  record(v) &&
  string(v.id) &&
  string(v.clientId) &&
  string(v.name) &&
  string(v.startDate) &&
  ["Evergreen", "Week-based"].includes(String(v.program)) &&
  number(v.weeks) &&
  (v.focus === undefined || string(v.focus)) &&
  (v.rotation === undefined || trainingRotation(v.rotation)) &&
  record(v.overrides) &&
  Object.entries(v.overrides).every(
    ([k, sessions]) =>
      /^[1-9]\d*$/.test(k) &&
      array(
        sessions,
        (s) =>
          record(s) &&
          string(s.id) &&
          string(s.name) &&
          array(
            s.exercises,
            (e) =>
              record(e) &&
              string(e.id) &&
              string(e.name) &&
              (e.muscle === undefined || string(e.muscle)) &&
              (e.secondaryMuscles === undefined ||
                array(e.secondaryMuscles, string)) &&
              (e.libraryId === undefined || string(e.libraryId)) &&
              (e.generalNotes === undefined || string(e.generalNotes)) &&
              string(e.instructions) &&
              string(e.progression) &&
              array(
                e.sets,
                (t) =>
                  record(t) &&
                  string(t.id) &&
                  number(t.reps) &&
                  (t.repsMax === undefined || number(t.repsMax)) &&
                  ["tempo", "type", "rest", "instructions"].every((k) =>
                    string(t[k]),
                  ),
              ),
          ),
      ),
  );
const temporaryNutrition = (v: unknown) =>
  record(v) &&
  string(v.id) &&
  ["refeed", "diet-break", "custom"].includes(String(v.kind)) &&
  string(v.label) &&
  string(v.startDate) &&
  string(v.endDate) &&
  string(v.createdAt) &&
  (v.source === "mealPlan"
    ? isMealPlan(v.plan)
    : v.source === "iifym" && iifym(v.plan));
function lifecycle(v: unknown, guard: (x: unknown) => boolean): boolean {
  const version = (x: unknown) =>
    record(x) &&
    string(x.id) &&
    string(x.activatedAt) &&
    (x.archivedOn === undefined || string(x.archivedOn)) &&
    guard(x.content);
  return (
    record(v) &&
    (v.draft === undefined || guard(v.draft)) &&
    (v.active === undefined || version(v.active)) &&
    array(v.history, version)
  );
}
export function isClientPlans(v: unknown): v is ClientPlans {
  return (
    record(v) &&
    record(v.nutrition) &&
    lifecycle(v.nutrition.mealPlan, isMealPlan) &&
    lifecycle(v.nutrition.iifym, iifym) &&
    (v.nutrition.temporary === undefined ||
      array(v.nutrition.temporary, temporaryNutrition)) &&
    lifecycle(v.training, training) &&
    (v.activityTargets === undefined ||
      array(v.activityTargets, isActivityTargetVersion)) &&
    (v.supplements === undefined || isSupplementPlan(v.supplements)) &&
    (v.otherTargets === undefined ||
      array(
        v.otherTargets,
        (t) =>
          record(t) &&
          string(t.id) &&
          string(t.fieldId) &&
          ["minimum", "maximum", "range", "exact"].includes(t.kind as string) &&
          (t.value === undefined || number(t.value)) &&
          (t.min === undefined || number(t.min)) &&
          (t.max === undefined || number(t.max)),
      )) &&
    array(
      v.goals,
      (g) =>
        record(g) &&
        string(g.id) &&
        string(g.fieldId) &&
        number(g.value) &&
        string(g.unit) &&
        string(g.date),
    )
  );
}

export function plansOwnedBy(
  plans: ClientPlans | undefined,
  clientId: string,
): boolean {
  if (!plans) return true;
  if (plans.supplements && plans.supplements.clientId !== clientId)
    return false;
  return [
    plans.nutrition.mealPlan,
    plans.nutrition.iifym,
    plans.training,
  ].every((life) =>
    [
      ...(life.draft ? [life.draft] : []),
      ...(life.active ? [life.active.content] : []),
      ...life.history.map((v) => v.content),
    ].every((content) => content.clientId === clientId),
  );
}
