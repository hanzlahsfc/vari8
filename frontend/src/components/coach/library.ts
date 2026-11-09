import {
  isMealPlan,
  type MealPlan,
  type VariantSchedule,
} from "../ethereal/mealplan/model";
import type {
  CoachState,
  LibraryEntry,
  LibraryKind,
  PlanLibrary,
} from "./model";
import {
  emptyClientPlans,
  isTrainingSessionValue,
  type TrainingPlan,
  type TrainingRotation,
  type TrainingSession,
} from "./plans/types";
import type { SupplementPlan } from "./supplements/model";
import { isSupplementItem } from "./supplements/model";

export const LIBRARY_KINDS: LibraryKind[] = [
  "training",
  "nutrition",
  "supplements",
];

export const emptyPlanLibrary = (): PlanLibrary => ({
  training: [],
  nutrition: [],
  supplements: [],
});

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string";
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function makeLibraryId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Full name first so "Amara Lewis" wins over the bare first name. */
function clientNameForms(clientName?: string): string[] {
  const full = clientName?.trim();
  if (!full) return [];
  const first = full.split(/\s+/)[0];
  return [...new Set([full, first].filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
}

/**
 * Remove a client's full or first name (and the separator left behind) from
 * template-facing copy. Library surfaces must never show a client name.
 */
export function stripClientName(value: string, clientName?: string): string {
  let text = value;
  for (const form of clientNameForms(clientName)) {
    text = text.replace(
      new RegExp(
        `(^|[\\s·•|/:–—-])${escapeRegExp(form)}(?=$|[\\s·•|/:–—-])`,
        "gi",
      ),
      "$1",
    );
  }
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s·•|/:–—-]+|[\s·•|/:–—-]+$/g, "")
    .trim();
}

/** Suggested template name for a plan saved from a client. */
export function templateNameFromPlan(
  planName: string,
  clientName: string | undefined,
  fallback: string,
): string {
  return stripClientName(planName, clientName) || fallback;
}

/**
 * Strip client names from the names stored inside detached plan content, so a
 * template's own day-plan or session labels never read as a client's plan.
 */
export function neutralisePlanNames(
  kind: LibraryKind,
  content: TrainingPlan | MealPlan | SupplementPlan,
  clientName?: string,
): TrainingPlan | MealPlan | SupplementPlan {
  if (!clientName) return content;
  if (kind === "training") {
    const plan = content as TrainingPlan;
    return {
      ...plan,
      name: stripClientName(plan.name, clientName),
      focus: plan.focus ? stripClientName(plan.focus, clientName) : plan.focus,
    };
  }
  if (kind === "nutrition") {
    const plan = content as MealPlan;
    return {
      ...plan,
      name: stripClientName(plan.name, clientName),
      variants: plan.variants.map((variant) => ({
        ...variant,
        label: stripClientName(variant.label, clientName) || variant.label,
      })),
      archivedPlans: plan.archivedPlans.map((archived) => ({
        ...archived,
        name: stripClientName(archived.name, clientName),
        variants: archived.variants.map((variant) => ({
          ...variant,
          label: stripClientName(variant.label, clientName) || variant.label,
        })),
      })),
    };
  }
  const plan = content as SupplementPlan;
  return { ...plan, name: stripClientName(plan.name, clientName) };
}

function isTrainingRotation(value: unknown): value is TrainingRotation {
  if (!record(value)) return false;
  if (value.mode === "weekly")
    return (
      record(value.weekdays) &&
      Object.entries(value.weekdays).every(
        ([day, ids]) =>
          [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ].includes(day) &&
          Array.isArray(ids) &&
          ids.every(string),
      )
    );
  return (
    value.mode === "cycle" &&
    Array.isArray(value.sessionIds) &&
    value.sessionIds.every((id) => id === null || string(id))
  );
}

/** Structural check for detached training plan content. */
function isTrainingContent(value: unknown): value is TrainingPlan {
  if (!record(value)) return false;
  return (
    string(value.id) &&
    string(value.clientId) &&
    string(value.name) &&
    string(value.startDate) &&
    (value.program === "Evergreen" || value.program === "Week-based") &&
    finite(value.weeks) &&
    record(value.overrides) &&
    Object.entries(value.overrides).every(
      ([week, sessions]) =>
        /^[1-9]\d*$/.test(week) &&
        Array.isArray(sessions) &&
        sessions.every(isTrainingSessionValue),
    ) &&
    (value.rotation === undefined || isTrainingRotation(value.rotation)) &&
    (value.focus === undefined || string(value.focus))
  );
}

function isSupplementContent(value: unknown): value is SupplementPlan {
  if (!record(value)) return false;
  return (
    string(value.id) &&
    string(value.clientId) &&
    string(value.name) &&
    string(value.savedAt) &&
    Array.isArray(value.items) &&
    value.items.every(isSupplementItem)
  );
}

function contentMatches(kind: LibraryKind, value: unknown): boolean {
  if (kind === "training") return isTrainingContent(value);
  if (kind === "nutrition") return isMealPlan(value);
  return isSupplementContent(value);
}

function isEntry(
  kind: LibraryKind,
  value: unknown,
): value is LibraryEntry<TrainingPlan | MealPlan | SupplementPlan> {
  if (!record(value)) return false;
  return (
    string(value.id) &&
    value.id.length > 0 &&
    string(value.name) &&
    string(value.description) &&
    string(value.updatedAt) &&
    (value.sourceClientId === undefined || string(value.sourceClientId)) &&
    contentMatches(kind, value.content)
  );
}

/**
 * Accept only well-formed library entries. Malformed entries are dropped
 * instead of rejecting the whole workspace. Content is re-normalised to the
 * detached form so a stored entry can never carry a client link, archive,
 * saved meals or adjustment windows.
 */
export function cleanPlanLibrary(value: unknown): PlanLibrary | undefined {
  if (value === undefined) return undefined;
  const source = record(value) ? value : {};
  const clean = <T extends TrainingPlan | MealPlan | SupplementPlan>(
    kind: LibraryKind,
    guard: (entry: unknown) => entry is LibraryEntry<T>,
  ): LibraryEntry<T>[] => {
    const raw = source[kind];
    if (!Array.isArray(raw)) return [];
    return raw.filter(guard).map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      updatedAt: entry.updatedAt,
      ...(entry.sourceClientId ? { sourceClientId: entry.sourceClientId } : {}),
      content: detachPlan(kind, entry.content) as T,
    }));
  };
  return {
    training: clean("training", (entry): entry is LibraryEntry<TrainingPlan> =>
      isEntry("training", entry),
    ),
    nutrition: clean("nutrition", (entry): entry is LibraryEntry<MealPlan> =>
      isEntry("nutrition", entry),
    ),
    supplements: clean(
      "supplements",
      (entry): entry is LibraryEntry<SupplementPlan> =>
        isEntry("supplements", entry),
    ),
  };
}

/** Loose envelope guard. Entry-level cleaning happens in `cleanPlanLibrary`. */
export function isPlanLibraryValue(value: unknown): value is PlanLibrary {
  return (
    record(value) && LIBRARY_KINDS.every((kind) => Array.isArray(value[kind]))
  );
}

/**
 * Detach a client plan from its client: no client id, no start date, no
 * archive/history, no saved meals and no deload/intro windows. The content
 * remains structurally valid so previews and editors can read it.
 */
export function detachPlan(
  kind: LibraryKind,
  plan: TrainingPlan | MealPlan | SupplementPlan,
): TrainingPlan | MealPlan | SupplementPlan {
  if (kind === "training") {
    const source = plan as TrainingPlan;
    const { adjustments: _adjustments, ...rest } = structuredClone(source);
    return {
      ...rest,
      clientId: "",
      name: "",
      startDate: "",
      overrides: rest.overrides ?? {},
      focus: rest.focus ?? undefined,
    } as TrainingPlan;
  }
  if (kind === "nutrition") {
    const source = plan as MealPlan;
    return {
      id: source.id,
      clientId: "",
      name: "",
      startDate: "",
      variants: structuredClone(source.variants),
      activeVariantId: source.activeVariantId,
      schedule: structuredClone(source.schedule),
      archivedPlans: [],
      reusableMeals: [],
    } as MealPlan;
  }
  const source = plan as SupplementPlan;
  return {
    id: source.id,
    clientId: "",
    name: "",
    savedAt: "",
    items: structuredClone(source.items),
  } as SupplementPlan;
}

export type SaveToLibraryOptions = {
  name: string;
  description: string;
  replaceId?: string;
  /** Date-only stamp for deterministic tests. */
  updatedAt?: string;
};

export function saveToLibrary(
  state: CoachState,
  kind: LibraryKind,
  plan: TrainingPlan | MealPlan | SupplementPlan,
  options: SaveToLibraryOptions,
): CoachState {
  const library = state.library ?? emptyPlanLibrary();
  const entries = [
    ...(library[kind] as LibraryEntry<
      TrainingPlan | MealPlan | SupplementPlan
    >[]),
  ];
  const content = detachPlan(kind, plan);
  const replaceIndex = options.replaceId
    ? entries.findIndex((entry) => entry.id === options.replaceId)
    : -1;
  const sourceClientId = plan.clientId || undefined;
  const entry: LibraryEntry<TrainingPlan | MealPlan | SupplementPlan> = {
    id:
      replaceIndex >= 0
        ? entries[replaceIndex].id
        : makeLibraryId(`library-${kind}`),
    name: options.name,
    description: options.description,
    updatedAt: options.updatedAt ?? new Date().toISOString().slice(0, 10),
    ...(sourceClientId ? { sourceClientId } : {}),
    content,
  };
  if (replaceIndex >= 0) entries[replaceIndex] = entry;
  else entries.push(entry);
  return {
    ...state,
    library: { ...library, [kind]: entries },
  } as CoachState;
}

export function removeFromLibrary(
  state: CoachState,
  kind: LibraryKind,
  id: string,
): CoachState {
  const library = state.library ?? emptyPlanLibrary();
  return {
    ...state,
    library: {
      ...library,
      [kind]: library[kind].filter((entry) => entry.id !== id),
    },
  } as CoachState;
}

function planKind(
  entry: LibraryEntry<TrainingPlan | MealPlan | SupplementPlan>,
): LibraryKind {
  const content = entry.content as Partial<
    TrainingPlan & MealPlan & SupplementPlan
  >;
  if (Array.isArray(content.variants) && string(content.activeVariantId))
    return "nutrition";
  if (Array.isArray(content.items)) return "supplements";
  return "training";
}

function freshId(
  map: Map<string, string>,
  oldId: string,
  prefix: string,
): string {
  const existing = map.get(oldId);
  if (existing) return existing;
  const next = makeLibraryId(prefix);
  map.set(oldId, next);
  return next;
}

function instantiateTraining(entry: LibraryEntry<TrainingPlan>): TrainingPlan {
  const source = structuredClone(entry.content);
  const sessionIds = new Map<string, string>();
  const exerciseIds = new Map<string, string>();
  const setIds = new Map<string, string>();
  const remapSession = (session: TrainingSession): TrainingSession => ({
    ...session,
    id: freshId(sessionIds, session.id, "session"),
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      id: freshId(exerciseIds, exercise.id, "exercise"),
      sets: exercise.sets.map((set) => ({
        ...set,
        id: freshId(setIds, set.id, "set"),
      })),
    })),
  });
  const overrides = Object.fromEntries(
    Object.entries(source.overrides ?? {}).map(([week, sessions]) => [
      week,
      sessions.map(remapSession),
    ]),
  );
  let rotation: TrainingRotation | undefined = source.rotation
    ? structuredClone(source.rotation)
    : undefined;
  const remapRotationId = (id: string) =>
    sessionIds.get(id) ?? freshId(sessionIds, id, "session");
  if (rotation?.mode === "weekly") {
    rotation = {
      mode: "weekly",
      weekdays: Object.fromEntries(
        Object.entries(rotation.weekdays).map(([day, ids]) => [
          day,
          ids.map(remapRotationId),
        ]),
      ),
    };
  } else if (rotation?.mode === "cycle") {
    rotation = {
      mode: "cycle",
      sessionIds: rotation.sessionIds.map((id) =>
        id === null ? null : remapRotationId(id),
      ),
    };
  }
  return {
    ...source,
    id: makeLibraryId("program"),
    clientId: "",
    startDate: "",
    name: entry.name,
    overrides,
    rotation,
    adjustments: undefined,
  };
}

function instantiateNutrition(entry: LibraryEntry<MealPlan>): MealPlan {
  const source = structuredClone(entry.content);
  const variantIds = new Map<string, string>();
  const mealIds = new Map<string, string>();
  const variants = source.variants.map((variant) => {
    const id = freshId(variantIds, variant.id, "variant");
    return {
      ...variant,
      id,
      meals: variant.meals.map((meal) => ({
        ...meal,
        id: freshId(mealIds, meal.id, "meal"),
        portions: meal.portions.map((portion) => ({
          ...portion,
          swaps: portion.swaps?.map((swap) => ({ ...swap })),
        })),
      })),
    };
  });
  const remapVariantId = (id: string) => variantIds.get(id) ?? id;
  let schedule: VariantSchedule = structuredClone(source.schedule);
  if (schedule.mode === "manual") {
    schedule = {
      mode: "manual",
      selectedVariantId: remapVariantId(schedule.selectedVariantId),
    };
  } else if (schedule.mode === "weekly") {
    schedule = {
      mode: "weekly",
      days: Object.fromEntries(
        Object.entries(schedule.days).map(([day, id]) => [
          day,
          remapVariantId(id as string),
        ]),
      ) as typeof schedule.days,
    };
  } else if (schedule.mode === "cycle") {
    schedule = {
      mode: "cycle",
      anchorDate: schedule.anchorDate,
      steps: schedule.steps.map((step) => ({
        ...step,
        variantId: remapVariantId(step.variantId),
      })),
    };
  }
  return {
    ...source,
    id: makeLibraryId("nutrition"),
    clientId: "",
    startDate: "",
    name: entry.name,
    variants,
    activeVariantId: remapVariantId(source.activeVariantId),
    schedule,
    archivedPlans: [],
    reusableMeals: [],
  };
}

function instantiateSupplements(
  entry: LibraryEntry<SupplementPlan>,
): SupplementPlan {
  const source = structuredClone(entry.content);
  const itemIds = new Map<string, string>();
  return {
    ...source,
    id: makeLibraryId("supplement-plan"),
    clientId: "",
    name: entry.name,
    savedAt: new Date().toISOString(),
    items: source.items.map((item) => ({
      ...item,
      id: freshId(itemIds, item.id, "supp"),
    })),
  };
}

/**
 * Deep-clone a library entry into a draft-ready plan for `clientId`. Every
 * internal id is regenerated and references (rotation session ids, meal-plan
 * schedule variant ids) are remapped. The entry itself is never mutated.
 */
export function instantiateFromLibrary(
  entry: LibraryEntry<TrainingPlan | MealPlan | SupplementPlan>,
  clientId: string,
  startDate: string,
): TrainingPlan | MealPlan | SupplementPlan {
  const kind = planKind(entry);
  const content =
    kind === "training"
      ? instantiateTraining(entry as LibraryEntry<TrainingPlan>)
      : kind === "nutrition"
        ? instantiateNutrition(entry as LibraryEntry<MealPlan>)
        : instantiateSupplements(entry as LibraryEntry<SupplementPlan>);
  return {
    ...content,
    clientId,
    ...(kind === "supplements" ? {} : { startDate }),
    name: entry.name,
  } as TrainingPlan | MealPlan | SupplementPlan;
}

export function planRouteForKind(kind: LibraryKind) {
  return kind === "training"
    ? "training"
    : kind === "nutrition"
      ? "nutrition"
      : "supplements";
}

export function draftNeedsReplace(
  state: CoachState,
  clientId: string,
  kind: LibraryKind,
): boolean {
  const client = state.clients.find((candidate) => candidate.id === clientId);
  const plans = client?.plans ?? emptyClientPlans();
  if (kind === "supplements") return Boolean(plans.supplements);
  const life = kind === "training" ? plans.training : plans.nutrition.mealPlan;
  return (
    life.draft !== undefined &&
    JSON.stringify(life.draft) !== JSON.stringify(life.active?.content)
  );
}

/**
 * Put an instantiated plan into its normal home: a draft for training and
 * nutrition, the saved plan for supplements (the supplement model has no
 * draft/active lifecycle).
 */
export function applyPlanToClient(
  state: CoachState,
  clientId: string,
  kind: LibraryKind,
  content: TrainingPlan | MealPlan | SupplementPlan,
): CoachState {
  return {
    ...state,
    clients: state.clients.map((client) => {
      if (client.id !== clientId) return client;
      const plans = structuredClone(client.plans ?? emptyClientPlans());
      if (kind === "training") plans.training.draft = content as TrainingPlan;
      else if (kind === "nutrition")
        plans.nutrition.mealPlan.draft = content as MealPlan;
      else plans.supplements = content as SupplementPlan;
      return { ...client, plans };
    }),
  };
}
