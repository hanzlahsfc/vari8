import type { MealPlan } from "../ethereal/mealplan/model";
import { detachPlan, emptyPlanLibrary, neutralisePlanNames } from "./library";
import type {
  CoachState,
  LibraryEntry,
  LibraryKind,
  PlanLibrary,
} from "./model";
import type { TrainingPlan } from "./plans/types";
import { productById } from "./supplements/catalogue";
import type { SupplementItem, SupplementPlan } from "./supplements/model";

type AnyPlan = TrainingPlan | MealPlan | SupplementPlan;

export const LIBRARY_DEMO_REVISION = 3 as const;
export const LIBRARY_DEMO_CLIENT_ID = "client-007";

/** Seeded template ids. Revision 2 renames only these; every other id is the
 * coach's own template and is left untouched. */
const SEED_IDS: Record<LibraryKind, string> = {
  training: "library-demo-training",
  nutrition: "library-demo-nutrition",
  supplements: "library-demo-supplements",
};

/** Neutral, client-free copy for the seeded templates. */
const SEED_COPY: Record<LibraryKind, { name: string; description: string }> = {
  training: {
    name: "Lower body block",
    description: "Hypertrophy · 4 sessions",
  },
  nutrition: {
    name: "Carb cycle · High/Medium/Low",
    description:
      "Day-plan rotation across high, medium and low carbohydrate days.",
  },
  supplements: {
    name: "Contest prep stack",
    description: "Catalogue products with quantities, timing and priority.",
  },
};

const seedDate = () => new Date().toISOString().slice(0, 10);

function entry<T>(
  id: string,
  kind: LibraryKind,
  content: T,
  sourceClientId?: string,
): LibraryEntry<T> {
  return {
    id,
    name: SEED_COPY[kind].name,
    description: SEED_COPY[kind].description,
    updatedAt: seedDate(),
    ...(sourceClientId ? { sourceClientId } : {}),
    content,
  };
}

/** Small, catalogue-backed stack used when the demo client has no supplements. */
function fallbackSupplements(): SupplementPlan | undefined {
  const rows: {
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
  ];
  const items: SupplementItem[] = [];
  for (const row of rows) {
    const product = productById(row.productId);
    if (!product) continue;
    items.push({
      id: `library-demo-supp-${row.productId}`,
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
    id: "library-demo-supplement-plan",
    clientId: "",
    name: "",
    items,
    savedAt: "",
  };
}

const trainingSource = (state: CoachState, clientId: string) => {
  const client = state.clients.find((candidate) => candidate.id === clientId);
  return (
    client?.plans?.training.active?.content ?? client?.plans?.training.draft
  );
};

const nutritionSource = (state: CoachState, clientId: string) => {
  const client = state.clients.find((candidate) => candidate.id === clientId);
  return (
    client?.plans?.nutrition.mealPlan.active?.content ??
    client?.plans?.nutrition.mealPlan.draft
  );
};

const supplementSource = (state: CoachState, clientId: string) => {
  const client = state.clients.find((candidate) => candidate.id === clientId);
  return client?.plans?.supplements;
};

/** Merge a freshly detached seed entry into a kind list: a seed-owned entry
 * left from an earlier revision is replaced wholesale (name, description and
 * content), an empty kind list is filled, and a kind the coach owns entirely
 * is left alone. Coach-made entries are never touched. */
function seedOrReplace<T extends AnyPlan>(
  list: LibraryEntry<T>[],
  kind: LibraryKind,
  source: T | undefined,
  clientId: string,
  clientName?: string,
): LibraryEntry<T>[] {
  if (!source) return list;
  const fresh = entry<T>(
    SEED_IDS[kind],
    kind,
    neutralisePlanNames(kind, detachPlan(kind, source), clientName) as T,
    clientId,
  );
  if (list.some((item) => item.id === SEED_IDS[kind]))
    return list.map((item) => (item.id === SEED_IDS[kind] ? fresh : item));
  return list.length === 0 ? [fresh] : list;
}

/**
 * Seed one global template per kind from the demo client's active plans, and
 * refresh any seed-owned entry left from an earlier revision. Fills only empty
 * kind lists, so a coach's own templates (or a deliberate deletion) always win.
 * Detached content only; no client id, history or adjustments, and no client
 * name anywhere in the stored copy.
 */
export function adoptLibraryDemo(state: CoachState): CoachState {
  if (state.demoSeeds?.libraryDemo === LIBRARY_DEMO_REVISION) return state;
  const clientId = LIBRARY_DEMO_CLIENT_ID;
  const client = state.clients.find((candidate) => candidate.id === clientId);
  if (!client) return state;
  const clientName = client.name;

  const current = state.library ?? emptyPlanLibrary();
  const library: PlanLibrary = {
    training: seedOrReplace(
      current.training,
      "training",
      trainingSource(state, clientId),
      clientId,
      clientName,
    ),
    nutrition: seedOrReplace(
      current.nutrition,
      "nutrition",
      nutritionSource(state, clientId),
      clientId,
      clientName,
    ),
    supplements: seedOrReplace(
      current.supplements,
      "supplements",
      supplementSource(state, clientId) ?? fallbackSupplements(),
      clientId,
      clientName,
    ),
  };

  return {
    ...state,
    library,
    demoSeeds: { ...state.demoSeeds, libraryDemo: LIBRARY_DEMO_REVISION },
  };
}
