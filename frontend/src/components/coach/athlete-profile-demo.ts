import {
  cloneVariant,
  type MealPlanVariant,
  scalePortion,
} from "../ethereal/mealplan/model";
import type { TimelineEvent } from "./athlete/timeline";
import { type CoachClient, type CoachState, uid } from "./model";
import { normalizePhases } from "./plans/phase-planning";
import type { ClientPlans } from "./plans/types";
import { addLocalDays } from "./targets/model";

export const ATHLETE_PROFILE_DEMO_REVISION = 1;
export const ATHLETE_PROFILE_DEMO_CLIENT_ID = "client-007";

const overlaps = (a: TimelineEvent, b: TimelineEvent) =>
  a.kind === b.kind && a.startDate <= b.endDate && b.startDate <= a.endDate;

/** Adds a demo event unless an event of the same kind already covers it. */
function addEvent(existing: TimelineEvent[], event: TimelineEvent) {
  if (existing.some((entry) => overlaps(entry, event))) return existing;
  return [...existing, event];
}

/**
 * Populate client-007 with the athlete-profile demo: a phase plan, contest
 * date, a "Refeed day" meal-plan variant and timeline events (deload, diet
 * break).. Fills only missing data; runs once via
 * demoSeeds.athleteProfileDemo.
 */
export function adoptAthleteProfileDemo(
  state: CoachState,
  today: string,
): CoachState {
  if (state.demoSeeds?.athleteProfileDemo === ATHLETE_PROFILE_DEMO_REVISION)
    return state;

  const index = state.clients.findIndex(
    (client) => client.id === ATHLETE_PROFILE_DEMO_CLIENT_ID,
  );
  if (index < 0) return state;
  const client = state.clients[index];
  if (!client.assignment) return state;

  // --- Phases + contest date (only when missing) ---
  const phaseStart = addLocalDays(today, -42);
  const phases =
    client.phases ??
    normalizePhases([
      {
        id: "phase-prep",
        name: "Contest prep",
        startDate: phaseStart,
        durationWeeks: 15,
      },
      {
        id: "phase-post",
        name: "Recovery",
        startDate: phaseStart,
        durationWeeks: 6,
      },
    ]);
  const contestDate =
    client.contestDate ?? addLocalDays(phaseStart, 14 * 7 + 6);

  // --- "Refeed day" variant on the active meal plan (schedule untouched) ---
  const plans: ClientPlans | undefined = client.plans
    ? structuredClone(client.plans)
    : undefined;
  let refeedVariantId: string | undefined;
  const mealLife = plans?.nutrition.mealPlan;
  const mealPlan = mealLife?.active?.content;
  if (plans && mealLife && mealPlan) {
    const existing = mealPlan.variants.find(
      (variant) => variant.label === "Refeed day",
    );
    if (existing) {
      refeedVariantId = existing.id;
    } else if (mealPlan.variants.length) {
      const source =
        mealPlan.variants.find((variant) =>
          /rest|daily|low/i.test(variant.label),
        ) ?? mealPlan.variants[0];
      const refeed: MealPlanVariant = cloneVariant(source, "Refeed day");
      refeed.id = uid("variant");
      // Higher carbs for the demo: scale every portion up a quarter.
      refeed.meals = refeed.meals.map((meal) => ({
        ...meal,
        portions: meal.portions.map((portion) => scalePortion(portion, 1.25)),
      }));
      refeedVariantId = refeed.id;
      const active = mealLife.active;
      if (active)
        mealLife.active = {
          ...active,
          content: {
            ...mealPlan,
            variants: [...mealPlan.variants, refeed],
          },
        };
    }
  }

  const dietBreakStart = addLocalDays(today, 35);

  // --- Timeline events (append only; never overwrite) ---
  // Refeed ids are stable so the athlete-data demo can swap the upcoming one
  // for a temporary nutrition plan; events are plain week tags now.
  let events = [...(client.timelineEvents ?? [])];
  if (refeedVariantId) {
    events = addEvent(events, {
      id: "demo-refeed-upcoming",
      kind: "refeed",
      startDate: addLocalDays(today, 2),
      endDate: addLocalDays(today, 2),
      note: "Keep sodium consistent.",
    });
  }
  const deloadStart = addLocalDays(today, 21);
  events = addEvent(events, {
    id: uid("timeline"),
    kind: "deload",
    startDate: deloadStart,
    endDate: addLocalDays(deloadStart, 6),
    note: "Recovery week — reduce volume.",
  });
  events = addEvent(events, {
    id: uid("timeline"),
    kind: "diet-break",
    startDate: dietBreakStart,
    endDate: addLocalDays(dietBreakStart, 6),
    note: "Eat at maintenance for the week.",
  });

  const nextClient: CoachClient = {
    ...client,
    phases,
    contestDate,
    timelineEvents: events.length ? events : client.timelineEvents,
    plans,
  };
  const clients = [...state.clients];
  clients[index] = nextClient;
  return {
    ...state,
    clients,
    demoSeeds: {
      ...state.demoSeeds,
      athleteProfileDemo: ATHLETE_PROFILE_DEMO_REVISION,
    },
  };
}
