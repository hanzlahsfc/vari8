import foodSource from "@/data/food-database.json";
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
import { cleanPlanLibrary } from "../library";
import type { CoachClient, CoachState } from "../model";
import { isSupplementPlan } from "../supplements/model";
import { isActivityTargetVersion } from "../targets/model";
import {
  isClientPhasePlan,
  isClientPhases,
  legacyPhasePlanToPhases,
  normalizePhases,
} from "./phase-planning";
import { normalizeTemporaryNutrition } from "./temporary-nutrition";
import {
  defaultExerciseLibrary,
  EXERCISE_LIBRARY_REVISION,
  isCustomExerciseId,
} from "./training/library-model";
import {
  type ClientPlans,
  cleanTrainingAdjustments,
  emptyClientPlans,
  type IifymPlan,
  isTrainingAdjustment,
  isTrainingSessionValue,
  type ModuleKind,
  type PlanLifecycle,
  type PlanVersion,
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
/**
 * The training-plan version in effect on `date`. Unlike `applicablePlan` (which
 * picks by `content.startDate` alone), training versions can be activated
 * mid-plan while sharing the plan's startDate, so the selection is driven by
 * `activatedAt`: among the candidates whose `content.startDate <= date` and
 * that aren't yet archived, the latest activation on or before `date` wins; if
 * none was activated yet (a date before any activation), the earliest-activated
 * candidate applies. `content.startDate <= date` still gates a version whose
 * plan only begins later.
 */
export function trainingVersionAt<T extends { startDate: string }>(
  life: PlanLifecycle<T>,
  date: string,
): PlanVersion<T> | undefined {
  if (!validDate(date)) return undefined;
  const candidates = [...life.history, ...(life.active ? [life.active] : [])]
    .filter(
      (v) =>
        v.content.startDate <= date && (!v.archivedOn || date < v.archivedOn),
    )
    .sort((a, b) => a.activatedAt.localeCompare(b.activatedAt));
  const activated = candidates.filter(
    (v) => v.activatedAt.slice(0, 10) <= date,
  );
  return activated[activated.length - 1] ?? candidates[0];
}

/** The training plan content in effect on `date` (see `trainingVersionAt`). */
export function trainingPlanAt<T extends { startDate: string }>(
  life: PlanLifecycle<T>,
  date: string,
): T | undefined {
  return trainingVersionAt(life, date)?.content;
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

/** A distinct earlier plan (one or more activated revisions of it). */
export type PreviousTrainingPlan = {
  plan: TrainingPlan;
  versions: number;
  startedOn: string;
  endedOn?: string;
};

/**
 * Earlier training plans, newest first. History also holds mid-plan revisions
 * of the active plan (same `content.id`), so versions are grouped by plan id
 * and the group matching the active plan is excluded.
 */
export function previousTrainingPlans(
  life: PlanLifecycle<TrainingPlan>,
): PreviousTrainingPlan[] {
  const activeId = life.active?.content.id;
  const groups = new Map<string, PlanVersion<TrainingPlan>[]>();
  for (const version of life.history) {
    const id = version.content.id;
    if (id === activeId) continue;
    const group = groups.get(id);
    if (group) group.push(version);
    else groups.set(id, [version]);
  }
  const rows = [...groups.values()].map((versions) => {
    const sorted = [...versions].sort((a, b) =>
      a.activatedAt.localeCompare(b.activatedAt),
    );
    const latest = sorted[sorted.length - 1];
    return {
      plan: latest.content,
      versions: sorted.length,
      startedOn: sorted.reduce(
        (min, v) => (v.content.startDate < min ? v.content.startDate : min),
        latest.content.startDate,
      ),
      endedOn: latest.archivedOn?.slice(0, 10),
      replacedAt: latest.activatedAt,
    };
  });
  const successors = [
    ...life.history.map((v) => ({
      id: v.content.id,
      activatedAt: v.activatedAt,
    })),
    ...(life.active
      ? [{ id: life.active.content.id, activatedAt: life.active.activatedAt }]
      : []),
  ].sort((a, b) => a.activatedAt.localeCompare(b.activatedAt));
  for (const row of rows) {
    if (row.endedOn) continue;
    const next = successors.find(
      (s) => s.id !== row.plan.id && s.activatedAt > row.replacedAt,
    );
    row.endedOn = next?.activatedAt.slice(0, 10);
  }
  return rows
    .sort((a, b) => b.replacedAt.localeCompare(a.replacedAt))
    .map(({ plan, versions, startedOn, endedOn }) => ({
      plan,
      versions,
      startedOn,
      endedOn,
    }));
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
    schedule: { mode: "flexible" },
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
    schedule: { mode: "flexible" },
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
  if (schedule.mode === "flexible") return undefined;
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
/** The plan's headline calories: first variant/option total. Used by the
 * plans list and timeline to summarise a temporary plan. */
export function temporaryKcal(t: {
  source: "mealPlan" | "iifym";
  plan: MealPlan | IifymPlan;
}): number | undefined {
  if (t.source === "iifym") {
    const option = (t.plan as IifymPlan).options[0];
    if (!option) return undefined;
    const direct = targetNumber(option.targets.calories);
    return (
      direct ||
      (targetNumber(option.targets.protein) ?? 0) * 4 +
        (targetNumber(option.targets.carbs) ?? 0) * 4 +
        (targetNumber(option.targets.fat) ?? 0) * 9 ||
      undefined
    );
  }
  const variant = (t.plan as MealPlan).variants[0];
  return variant
    ? calculateVariantNutrients(variant, planFoodMap).calories
    : undefined;
}
export { trainingWeek } from "./types";
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
/** "Same every day" (manual) only made sense when it pinned a specific
 *  option. With several options it's ambiguous — migrate those to the
 *  client-chooses (flexible) schedule. Single-option plans and temporary
 *  plans keep manual (temporary plans rely on it internally). */
function flexibleScheduleIfNeeded(
  plan:
    | {
        schedule?: unknown;
        variants?: { id: string }[];
        options?: { id: string }[];
      }
    | undefined,
): void {
  if (!plan?.schedule || typeof plan.schedule !== "object") return;
  const schedule = plan.schedule as { mode?: string };
  if (schedule.mode !== "manual") return;
  const count = plan.variants?.length ?? plan.options?.length ?? 0;
  if (count > 1) plan.schedule = { mode: "flexible" };
}

export function migrateCoachState(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const state = structuredClone(value) as CoachState;
  // A malformed library entry must never reject the workspace: drop it and
  // keep every other entry. Detached content is normalised on the way in.
  if (state.library !== undefined)
    state.library = cleanPlanLibrary(state.library);
  // Re-seed the exercise library once per database revision: the database
  // replaces every non-custom entry, custom (library-exercise-*) entries kept.
  if (state.demoSeeds?.exerciseLibrary !== EXERCISE_LIBRARY_REVISION) {
    const custom = (state.exerciseLibrary ?? []).filter((e) =>
      isCustomExerciseId(e.id),
    );
    state.exerciseLibrary = [...defaultExerciseLibrary(), ...custom];
    state.demoSeeds = {
      ...state.demoSeeds,
      exerciseLibrary: EXERCISE_LIBRARY_REVISION,
    };
  }
  // Backfill library snapshot fields on training exercises that lack them.
  const libById = new Map((state.exerciseLibrary ?? []).map((e) => [e.id, e]));
  const fill = (
    exercises?: {
      libraryId?: string;
      equipment?: string;
      movementPattern?: string;
      position?: string;
      primaryTarget?: string;
      additionalTargets?: string[];
      [k: string]: unknown;
    }[],
  ) => {
    for (const ex of exercises ?? []) {
      const def = ex.libraryId ? libById.get(ex.libraryId) : undefined;
      if (!def) continue;
      if (ex.equipment === undefined) ex.equipment = def.equipment;
      if (ex.movementPattern === undefined)
        ex.movementPattern = def.movementPattern;
      if (ex.position === undefined) ex.position = def.position;
      if (ex.primaryTarget === undefined) ex.primaryTarget = def.primaryTarget;
      if (ex.additionalTargets === undefined)
        ex.additionalTargets = def.additionalTargets;
    }
  };
  for (const client of state.clients ?? []) {
    const life = client.plans?.training;
    if (!life) continue;
    for (const content of [
      life.draft,
      life.active?.content,
      ...(life.history ?? []).map((h) => h.content),
    ]) {
      if (!content) continue;
      for (const sessions of Object.values(content.overrides ?? {}))
        for (const session of sessions ?? []) fill(session.exercises);
      // Stored adjustments may carry manual copies; backfill those too and
      // drop any malformed entry so one bad value cannot reject the workspace.
      content.adjustments = cleanTrainingAdjustments(content.adjustments);
      for (const adjustment of content.adjustments ?? [])
        for (const sessions of Object.values(adjustment.manual ?? {}))
          for (const session of sessions ?? []) fill(session.exercises);
    }
  }
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
        client.timelineEvents as
          | { nutritionOverride?: unknown; adjustmentId?: unknown }[]
          | undefined
      )?.map(({ nutritionOverride: _dropped, adjustmentId, ...event }) => ({
        ...event,
        ...(typeof adjustmentId === "string" ? { adjustmentId } : {}),
      })) as CoachClient["timelineEvents"],
      plans: old
        ? {
            ...base,
            ...old,
            nutrition: {
              mealPlan: (() => {
                const plan = {
                  ...base.nutrition.mealPlan,
                  ...old.nutrition?.mealPlan,
                  history: old.nutrition?.mealPlan?.history ?? [],
                };
                flexibleScheduleIfNeeded(plan.draft as never);
                flexibleScheduleIfNeeded(plan.active?.content as never);
                for (const entry of plan.history as {
                  content?: { schedule?: unknown; variants?: { id: string }[] };
                }[])
                  if (entry?.content) flexibleScheduleIfNeeded(entry.content);
                return plan;
              })(),
              iifym: (() => {
                const plan = {
                  ...base.nutrition.iifym,
                  ...old.nutrition?.iifym,
                  history: old.nutrition?.iifym?.history ?? [],
                };
                flexibleScheduleIfNeeded(plan.draft as never);
                flexibleScheduleIfNeeded(plan.active?.content as never);
                for (const entry of plan.history as {
                  content?: { schedule?: unknown; options?: { id: string }[] };
                }[])
                  if (entry?.content) flexibleScheduleIfNeeded(entry.content);
                return plan;
              })(),
              temporary: (old.nutrition?.temporary ?? []).map(
                normalizeTemporaryNutrition,
              ),
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
  (v.mode === "flexible"
    ? true
    : v.mode === "manual"
      ? string(v.selectedVariantId)
      : v.mode === "weekly"
        ? record(v.days) &&
          Object.entries(v.days).every(
            ([k, x]) => /^[1-7]$/.test(k) && string(x),
          )
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
  (v.adjustments === undefined || array(v.adjustments, isTrainingAdjustment)) &&
  record(v.overrides) &&
  Object.entries(v.overrides).every(
    ([k, sessions]) =>
      /^[1-9]\d*$/.test(k) && array(sessions, isTrainingSessionValue),
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
