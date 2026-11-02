/** Pure domain model for a coach-authored meal plan. Food nutrients are stored
 * per the amount and unit supplied by the source database; portions use the
 * same food-specific unit. */

export type Nutrients = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type Food = Nutrients & {
  id: string;
  name: string;
  amount: number;
  unit: string;
};

export type TargetValue =
  | { kind: "fixed"; value: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "minimum"; value: number };

export type TargetStyle = "calories" | "macros";

export type MealTargets = {
  style: TargetStyle;
  calories?: TargetValue;
  protein?: TargetValue;
  carbs?: TargetValue;
  fat?: TargetValue;
};

export type FoodSwap = {
  foodId: string;
  quantity: number;
  note?: string;
};

export type FoodPortion = {
  foodId: string;
  /** Quantity in the unit represented by the food's database row. */
  quantity: number;
  swaps?: FoodSwap[];
};

export type Meal = {
  id: string;
  label: string;
  time: string;
  frequency?: string;
  portions: FoodPortion[];
  target?: MealTargets;
};

export type MealPlanVariant = {
  id: string;
  label: string;
  meals: Meal[];
  dailyTarget?: MealTargets;
};

export type VariantSchedule =
  | { mode: "flexible" }
  | { mode: "manual"; selectedVariantId: string }
  | {
      mode: "weekly";
      /** ISO weekday keys: 1 = Monday through 7 = Sunday. */
      days: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string>>;
    }
  | {
      mode: "cycle";
      anchorDate: string;
      steps: { variantId: string; days: number }[];
    };

export const MAX_CYCLE_DAYS = 365;

export type ArchivedMealPlan = {
  id: string;
  planId: string;
  name: string;
  startDate: string;
  archivedAt: string;
  variants: MealPlanVariant[];
  activeVariantId: string;
  schedule: VariantSchedule;
};

export type ReusableMeal = {
  id: string;
  name: string;
  meal: Meal;
  savedAt: string;
};

export type MealPlan = {
  id: string;
  clientId: string;
  name: string;
  startDate: string;
  variants: MealPlanVariant[];
  activeVariantId: string;
  schedule: VariantSchedule;
  archivedPlans: ArchivedMealPlan[];
  reusableMeals: ReusableMeal[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTargetValue(value: unknown): value is TargetValue {
  if (!isRecord(value)) return false;
  if (value.kind === "fixed" || value.kind === "minimum") {
    return typeof value.value === "number";
  }
  return (
    value.kind === "range" &&
    typeof value.min === "number" &&
    typeof value.max === "number"
  );
}

function isMealTargets(value: unknown): value is MealTargets {
  if (
    !isRecord(value) ||
    (value.style !== "calories" && value.style !== "macros")
  )
    return false;
  return (["calories", "protein", "carbs", "fat"] as const).every(
    (key) => value[key] === undefined || isTargetValue(value[key]),
  );
}

function isFoodSwap(value: unknown): value is FoodSwap {
  return (
    isRecord(value) &&
    typeof value.foodId === "string" &&
    typeof value.quantity === "number" &&
    (value.note === undefined || typeof value.note === "string")
  );
}

function isFoodPortion(value: unknown): value is FoodPortion {
  return (
    isRecord(value) &&
    typeof value.foodId === "string" &&
    typeof value.quantity === "number" &&
    (value.swaps === undefined ||
      (Array.isArray(value.swaps) && value.swaps.every(isFoodSwap)))
  );
}

function isMeal(value: unknown): value is Meal {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.time === "string" &&
    (value.frequency === undefined || typeof value.frequency === "string") &&
    Array.isArray(value.portions) &&
    value.portions.every(isFoodPortion) &&
    (value.target === undefined || isMealTargets(value.target))
  );
}

function isVariant(value: unknown): value is MealPlanVariant {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    Array.isArray(value.meals) &&
    value.meals.every(isMeal) &&
    (value.dailyTarget === undefined || isMealTargets(value.dailyTarget))
  );
}

function isVariantSchedule(value: unknown): value is VariantSchedule {
  if (!isRecord(value)) return false;
  if (value.mode === "flexible") return true;
  if (value.mode === "manual")
    return typeof value.selectedVariantId === "string";
  if (value.mode === "cycle")
    return (
      typeof value.anchorDate === "string" &&
      Array.isArray(value.steps) &&
      value.steps.every(
        (step) =>
          isRecord(step) &&
          typeof step.variantId === "string" &&
          typeof step.days === "number",
      )
    );
  if (value.mode !== "weekly" || !isRecord(value.days)) return false;
  return Object.entries(value.days).every(
    ([day, variantId]) => /^[1-7]$/.test(day) && typeof variantId === "string",
  );
}

function isArchivedMealPlan(value: unknown): value is ArchivedMealPlan {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.planId === "string" &&
    typeof value.name === "string" &&
    typeof value.startDate === "string" &&
    typeof value.archivedAt === "string" &&
    Array.isArray(value.variants) &&
    value.variants.every(isVariant) &&
    typeof value.activeVariantId === "string" &&
    isVariantSchedule(value.schedule)
  );
}

function isReusableMeal(value: unknown): value is ReusableMeal {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isMeal(value.meal) &&
    typeof value.savedAt === "string"
  );
}

/** Structural guard for values restored from browser storage. Draft numeric/date validity belongs to validateMealPlan. */
export function isMealPlan(value: unknown): value is MealPlan {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.clientId === "string" &&
    typeof value.name === "string" &&
    typeof value.startDate === "string" &&
    Array.isArray(value.variants) &&
    value.variants.every(isVariant) &&
    typeof value.activeVariantId === "string" &&
    isVariantSchedule(value.schedule) &&
    Array.isArray(value.archivedPlans) &&
    value.archivedPlans.every(isArchivedMealPlan) &&
    Array.isArray(value.reusableMeals) &&
    value.reusableMeals.every(isReusableMeal)
  );
}

export const emptyNutrients = (): Nutrients => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});

const makeId = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;

export function calculatePortionNutrients(
  food: Food,
  quantity: number,
): Nutrients {
  const factor = food.amount > 0 ? quantity / food.amount : 0;
  return {
    calories: food.calories * factor,
    protein: food.protein * factor,
    carbs: food.carbs * factor,
    fat: food.fat * factor,
  };
}

export function calculateMealNutrients(
  meal: Meal,
  foods: ReadonlyMap<string, Food>,
): Nutrients {
  return meal.portions.reduce((total, portion) => {
    const food = foods.get(portion.foodId);
    if (!food) return total;
    const nutrients = calculatePortionNutrients(food, portion.quantity);
    return addNutrients(total, nutrients);
  }, emptyNutrients());
}

export function calculateVariantNutrients(
  variant: MealPlanVariant,
  foods: ReadonlyMap<string, Food>,
): Nutrients {
  return variant.meals.reduce(
    (total, meal) => addNutrients(total, calculateMealNutrients(meal, foods)),
    emptyNutrients(),
  );
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

export function scalePortion(
  portion: FoodPortion,
  factor: number,
): FoodPortion {
  const scale = Number.isFinite(factor) ? Math.max(0, factor) : 0;
  return {
    ...portion,
    quantity: portion.quantity * scale,
    swaps: portion.swaps?.map((swap) => ({
      ...swap,
      quantity: swap.quantity * scale,
    })),
  };
}

export function cloneMeal(meal: Meal): Meal {
  return {
    ...meal,
    id: makeId("meal"),
    portions: meal.portions.map((p) => ({
      ...p,
      swaps: p.swaps?.map((s) => ({ ...s })),
    })),
    target: meal.target ? structuredClone(meal.target) : undefined,
  };
}

export function cloneVariant(
  variant: MealPlanVariant,
  label = `${variant.label} copy`,
): MealPlanVariant {
  return {
    ...variant,
    id: makeId("variant"),
    label,
    meals: variant.meals.map(cloneMeal),
    dailyTarget: variant.dailyTarget
      ? structuredClone(variant.dailyTarget)
      : undefined,
  };
}

export function addMealToVariant(
  variant: MealPlanVariant,
  label = `Meal ${variant.meals.length + 1}`,
): MealPlanVariant {
  const meal: Meal = {
    id: makeId("meal"),
    label,
    time: "",
    portions: [],
  };
  return { ...variant, meals: [...variant.meals, meal] };
}

const DEFAULT_MEALS = [
  {
    label: "Breakfast",
    time: "08:00",
    preferred: ["Oats", "Gluten Free Oats"],
    terms: ["oat"],
    avoid: ["milk", "bar", "granola"],
    portion: 50,
  },
  {
    label: "Lunch",
    time: "12:30",
    preferred: ["Chicken Breast (Cooked)", "Chicken Breast (Raw)"],
    terms: ["chicken"],
    avoid: ["sausage", "vegan"],
    portion: 150,
  },
  {
    label: "Afternoon",
    time: "16:00",
    preferred: ["Arla 0% Fat Vanilla Skyr", "Egelykke Skyr"],
    terms: ["skyr"],
    avoid: [],
    portion: 200,
  },
  {
    label: "Dinner",
    time: "19:30",
    preferred: ["Salmon (Cooked)", "Salmon (Raw)"],
    terms: ["salmon"],
    avoid: ["sushi"],
    portion: 150,
  },
];

function findFood(
  foods: readonly Food[],
  preferred: readonly string[],
  terms: readonly string[],
  avoid: readonly string[],
  used: Set<string>,
): Food | undefined {
  for (const name of preferred) {
    const exact = foods.find(
      (food) =>
        !used.has(food.id) && food.name.toLowerCase() === name.toLowerCase(),
    );
    if (exact) return exact;
  }
  const lowerTerms = terms.map((term) => term.toLowerCase());
  const lowerAvoid = avoid.map((term) => term.toLowerCase());
  return foods.find(
    (food) =>
      !used.has(food.id) &&
      lowerTerms.some((term) => food.name.toLowerCase().includes(term)) &&
      !lowerAvoid.some((term) => food.name.toLowerCase().includes(term)),
  );
}

function recommendedQuantity(food: Food, amount: number): number {
  const unit = food.unit.toLowerCase().trim();
  if (
    /^(g|gram|grams|ml|milliliter|milliliters|millilitre|millilitres)$/.test(
      unit,
    )
  )
    return amount;
  return food.amount;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Creates a useful coach setup using only entries in the supplied catalog. */
export function createInitialMealPlan(
  clientId: string,
  foods: readonly Food[],
  now = new Date(),
): MealPlan {
  const variantId = makeId("variant");
  const used = new Set<string>();
  const meals = DEFAULT_MEALS.map((defaults) => {
    const food = findFood(
      foods,
      defaults.preferred,
      defaults.terms,
      defaults.avoid,
      used,
    );
    if (food) used.add(food.id);
    return {
      id: makeId("meal"),
      label: defaults.label,
      time: defaults.time,
      frequency: "Daily",
      portions: food
        ? [
            {
              foodId: food.id,
              quantity: recommendedQuantity(food, defaults.portion),
            },
          ]
        : [],
    } satisfies Meal;
  });
  const date = localDateString(now);
  return {
    id: makeId("plan"),
    clientId,
    name: "Nutrition plan",
    startDate: date,
    variants: [{ id: variantId, label: "TD", meals }],
    activeVariantId: variantId,
    schedule: { mode: "flexible" },
    archivedPlans: [],
    reusableMeals: [],
  };
}

export function getActiveVariant(
  plan: MealPlan,
  date = new Date(),
): MealPlanVariant | undefined {
  if (
    !Number.isFinite(date.getTime()) ||
    !isCalendarDate(plan.startDate) ||
    localDateString(date) < plan.startDate
  )
    return undefined;
  const schedule = plan.schedule;
  if (schedule.mode === "manual") {
    return (
      plan.variants.find(
        (variant) => variant.id === schedule.selectedVariantId,
      ) ?? plan.variants.find((variant) => variant.id === plan.activeVariantId)
    );
  }
  if (schedule.mode === "cycle") {
    if (
      !isCalendarDate(schedule.anchorDate) ||
      localDateString(date) < schedule.anchorDate ||
      schedule.steps.length === 0
    )
      return undefined;
    const elapsedDays =
      calendarDayNumber(localDateString(date)) -
      calendarDayNumber(schedule.anchorDate);
    const cycleDays = schedule.steps.reduce(
      (total, step) => total + step.days,
      0,
    );
    if (cycleDays <= 0 || cycleDays > MAX_CYCLE_DAYS) return undefined;
    let cycleDay = elapsedDays % cycleDays;
    for (const step of schedule.steps) {
      if (cycleDay < step.days) {
        return (
          plan.variants.find((variant) => variant.id === step.variantId) ??
          plan.variants.find((variant) => variant.id === plan.activeVariantId)
        );
      }
      cycleDay -= step.days;
    }
    return undefined;
  }
  if (schedule.mode !== "weekly")
    return plan.variants.find((v) => v.id === plan.activeVariantId);
  const weekday = ((date.getDay() + 6) % 7) + 1;
  const scheduledId = schedule.days[weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7];
  return (
    plan.variants.find((variant) => variant.id === scheduledId) ??
    plan.variants.find((variant) => variant.id === plan.activeVariantId)
  );
}

export function archiveCurrentPlan(
  plan: MealPlan,
  archivedAt = new Date(),
): MealPlan {
  const archived: ArchivedMealPlan = {
    id: makeId("archive"),
    planId: plan.id,
    name: plan.name,
    startDate: plan.startDate,
    archivedAt: archivedAt.toISOString(),
    variants: structuredClone(plan.variants),
    activeVariantId: plan.activeVariantId,
    schedule: structuredClone(plan.schedule),
  };
  return { ...plan, archivedPlans: [...plan.archivedPlans, archived] };
}

export function createReusableMeal(
  meal: Meal,
  name = meal.label,
  savedAt = new Date(),
): ReusableMeal {
  return {
    id: makeId("saved-meal"),
    name,
    meal: cloneMeal(meal),
    savedAt: savedAt.toISOString(),
  };
}

export function validateMealPlan(
  plan: MealPlan,
  foods: ReadonlyMap<string, Food>,
): string[] {
  const errors: string[] = [];
  if (!plan.clientId.trim()) errors.push("A client is required.");
  if (!isCalendarDate(plan.startDate))
    errors.push("Enter a valid plan start date.");
  if (plan.variants.length === 0) errors.push("Add at least one plan variant.");
  const variantIds = new Set(plan.variants.map((variant) => variant.id));
  if (!variantIds.has(plan.activeVariantId))
    errors.push("The active variant must belong to this plan.");
  for (const variant of plan.variants) {
    if (!variant.label.trim()) errors.push("Every variant needs a label.");
    for (const meal of variant.meals) {
      if (!meal.label.trim())
        errors.push(`A meal in ${variant.label} needs a label.`);
      if (meal.time && !isValidTime(meal.time))
        errors.push(`Enter a valid time for ${meal.label}.`);
      for (const portion of meal.portions) {
        if (!foods.has(portion.foodId))
          errors.push(
            `A meal in ${variant.label} references a food that is no longer available.`,
          );
        if (!Number.isFinite(portion.quantity) || portion.quantity < 0)
          errors.push(`A portion in ${meal.label} needs a valid quantity.`);
        for (const swap of portion.swaps ?? []) {
          if (!foods.has(swap.foodId))
            errors.push(
              `A swap in ${meal.label} references a food that is no longer available.`,
            );
          if (!Number.isFinite(swap.quantity) || swap.quantity < 0)
            errors.push(`A swap in ${meal.label} needs a valid quantity.`);
        }
      }
    }
  }
  const schedule = plan.schedule;
  if (schedule.mode === "manual" && !variantIds.has(schedule.selectedVariantId))
    errors.push("Choose an existing variant for manual selection.");
  if (schedule.mode === "weekly") {
    const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;
    if (weekdays.some((day) => !schedule.days[day]))
      errors.push("Choose a variant for every day of the week.");
    if (
      weekdays.some((day) => {
        const variantId = schedule.days[day];
        return variantId !== undefined && !variantIds.has(variantId);
      })
    )
      errors.push("Weekly schedule entries must use existing variants.");
  }
  if (schedule.mode === "cycle") {
    if (!isCalendarDate(schedule.anchorDate))
      errors.push("Enter a valid repeating rhythm start date.");
    if (schedule.steps.length === 0)
      errors.push("Add at least one repeating rhythm step.");
    if (
      schedule.steps.some(
        (step) =>
          !Number.isInteger(step.days) || step.days < 1 || step.days > 28,
      )
    )
      errors.push("Each repeating rhythm step must last 1 to 28 days.");
    if (
      schedule.steps.reduce((total, step) => total + step.days, 0) >
      MAX_CYCLE_DAYS
    )
      errors.push("A repeating rhythm can span up to 365 days.");
    if (schedule.steps.some((step) => !variantIds.has(step.variantId)))
      errors.push("Repeating rhythm entries must use existing variants.");
  }
  return errors;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Converts a local calendar date to a UTC day index without DST-sized day drift. */
function calendarDayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function isValidTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return !!match && Number(match[1]) < 24 && Number(match[2]) < 60;
}

export function validateTargets(
  targets: MealTargets,
  label = "Target",
): string[] {
  const errors: string[] = [];
  const fields: Array<
    [keyof Omit<MealTargets, "style">, TargetValue | undefined]
  > = [
    ["calories", targets.calories],
    ["protein", targets.protein],
    ["carbs", targets.carbs],
    ["fat", targets.fat],
  ];
  const activeFields =
    targets.style === "calories" ? fields.slice(0, 1) : fields.slice(1);
  if (!activeFields.some(([, value]) => value !== undefined))
    errors.push(
      `${label} needs at least one ${targets.style === "calories" ? "calorie" : "macro"} goal.`,
    );
  for (const [field, value] of fields) {
    if (!value) continue;
    const name =
      field === "calories"
        ? "Calories"
        : field.slice(0, 1).toUpperCase() + field.slice(1);
    if (targets.style === "calories" && field !== "calories")
      errors.push(
        `${label} cannot include ${name.toLowerCase()} when using calories-only goals.`,
      );
    if (targets.style === "macros" && field === "calories")
      errors.push(`${label} cannot include calories when using macro goals.`);
    if (value.kind === "range") {
      if (
        !Number.isFinite(value.min) ||
        !Number.isFinite(value.max) ||
        value.min < 0 ||
        value.max < 0
      )
        errors.push(`${name} range must use non-negative numbers.`);
      else if (value.min > value.max)
        errors.push(`${name} minimum cannot exceed its maximum.`);
    } else if (!Number.isFinite(value.value) || value.value < 0) {
      errors.push(`${name} goal must be a non-negative number.`);
    }
  }
  return errors;
}
