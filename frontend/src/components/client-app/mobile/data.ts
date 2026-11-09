import { nutritionForDate } from "../../coach/athlete/timeline";
import {
  type CoachClient,
  type CoachState,
  type Event,
  eventsBetween,
} from "../../coach/model";
import {
  planFoodMap,
  planTargets,
  targetNumber,
  trainingPlanAt,
} from "../../coach/plans/domain";
import {
  addLocalDays,
  mondayOf,
  resolveActivityTarget,
} from "../../coach/targets/model";
import { clientTracking } from "../../coach/tracking/data";
import { calculateVariantNutrients } from "../../ethereal/mealplan/model";
import {
  displayWeek,
  type nextSession,
  scheduledSessions,
  sessionStatus,
} from "../training-log/model";

export type TodayTargets =
  | {
      label: string | undefined;
      temporary:
        | { label: string; startDate: string; endDate: string }
        | undefined;
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
      options?: { label: string; kcal: number }[] | undefined;
    }
  | undefined;

export function todayTargets(client: CoachClient, date: string) {
  const resolved = nutritionForDate(client, date);
  const nutrients = planTargets(client, date);
  if (!resolved.plan) return undefined;
  const temporary = resolved.temporary;
  if (nutrients) {
    return {
      label: resolved.label,
      temporary,
      kcal: nutrients.calories,
      protein: nutrients.protein,
      carbs: nutrients.carbs,
      fat: nutrients.fat,
    } satisfies TodayTargets;
  }
  // No prescribed day type (client chooses): if the client already logged a
  // day type, show that option's targets; otherwise list the options.
  const plan = resolved.plan;
  const items = "variants" in plan ? plan.variants : plan.options;
  const optionNutrients = (label: string | undefined) => {
    const item = items.find((o) => o.label === label);
    if (!item) return undefined;
    if ("meals" in item) {
      const n = calculateVariantNutrients(item, planFoodMap);
      return n
        ? {
            kcal: Math.round(n.calories),
            protein: Math.round(n.protein),
            carbs: Math.round(n.carbs),
            fat: Math.round(n.fat),
          }
        : undefined;
    }
    return {
      kcal: Math.round(targetNumber(item.targets.calories)),
      protein: Math.round(targetNumber(item.targets.protein)),
      carbs: Math.round(targetNumber(item.targets.carbs)),
      fat: Math.round(targetNumber(item.targets.fat)),
    };
  };
  const logged = client.tracking?.text?.[`${date}:day-type`];
  const loggedNutrients = optionNutrients(logged);
  if (logged && loggedNutrients) {
    return {
      label: logged,
      temporary,
      ...loggedNutrients,
    } satisfies TodayTargets;
  }
  const options = items.map((o) => ({
    label: o.label,
    kcal: optionNutrients(o.label)?.kcal ?? 0,
  }));
  if (!options.length) return undefined;
  return {
    label: undefined,
    temporary,
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    options,
  } satisfies TodayTargets;
}

import type { StepsTarget } from "../../coach/targets/model";

const NUM = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export function stepsLabel(t: StepsTarget) {
  if (t.kind === "minimum") return `≥ ${NUM.format(t.value)}`;
  if (t.kind === "maximum") return `≤ ${NUM.format(t.value)}`;
  if (t.kind === "range") return `${NUM.format(t.min)}–${NUM.format(t.max)}`;
  return NUM.format(t.value);
}

export function stepsTarget(client: CoachClient, date: string) {
  const versions = client.plans?.activityTargets ?? [];
  const v = resolveActivityTarget({ versions, metric: "steps", date });
  const target = v?.target;
  if (!target || !("kind" in target)) return undefined;
  return target;
}

export function cardioWeek(client: CoachClient, date: string) {
  const versions = client.plans?.activityTargets ?? [];
  const v = resolveActivityTarget({ versions, metric: "cardio", date });
  const target = v?.target;
  if (!target || !("sessionsPerWeek" in target)) return undefined;
  const tracking = clientTracking(client);
  let done = 0;
  for (let d = mondayOf(date); d <= date; d = addLocalDays(d, 1)) {
    const entry = tracking.find((e) => e.date === d);
    if ((entry?.values?.["cardio-duration"] ?? 0) > 0) done += 1;
  }
  return {
    minutes: target.minutesPerSession,
    sessionsTarget: target.sessionsPerWeek,
    done,
  };
}

export type NextCheckIn = {
  date: string;
  daysUntil: number;
  overdue: boolean;
  awaitingFeedback: boolean;
  submittedDate: string | undefined;
};

export function nextCheckIn(
  state: CoachState,
  client: CoachClient,
  today: string,
): NextCheckIn | undefined {
  const waiting = state.submissions
    .filter((s) => s.clientId === client.id && !s.response)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const scheduled = eventsBetween(
    state,
    addLocalDays(today, -21),
    addLocalDays(today, 35),
  ).filter((e: Event) => e.clientId === client.id && !e.submission);
  const overdue = scheduled.filter((e) => e.date < today).at(-1);
  const next = scheduled.find((e) => e.date >= today);
  const date = next?.date ?? overdue?.date;
  if (!date && !waiting) return undefined;
  const days = date
    ? Math.round((Date.parse(date) - Date.parse(today)) / 86400000)
    : 0;
  return {
    date: date ?? today,
    daysUntil: days,
    overdue: !!overdue && !next,
    awaitingFeedback: !!waiting,
    submittedDate: waiting?.date,
  };
}

export type TodaySession = {
  item?: ReturnType<typeof nextSession>;
  status?: ReturnType<typeof sessionStatus>;
  next?: ReturnType<typeof nextSession>;
  planId: string;
  week: number;
};

export function todaySession(
  state: CoachState,
  client: CoachClient,
  today: string,
): TodaySession | undefined {
  const plan = client.plans
    ? trainingPlanAt(client.plans.training, today)
    : undefined;
  if (!plan) return undefined;
  const week = displayWeek(plan, today);
  const items = scheduledSessions(plan, week);
  // Only a session actually scheduled for today counts — never pull the next
  // upcoming one forward into today's card.
  const item = items.find((i) => i.date === today);
  const next =
    items.find((i) => i.date > today) ??
    scheduledSessions(plan, week + 1).find((i) => i.date > today);
  return {
    item,
    status: item
      ? sessionStatus(item, state.trainingLogs ?? [], today)
      : undefined,
    next,
    planId: plan.id,
    week,
  };
}

export function upcomingTemporary(client: CoachClient, today: string) {
  const temp = client.plans?.nutrition?.temporary ?? [];
  const upcoming = temp
    .filter(
      (t: { startDate: string }) =>
        t.startDate >= today && t.startDate <= addLocalDays(today, 7),
    )
    .sort((a: { startDate: string }, b: { startDate: string }) =>
      a.startDate.localeCompare(b.startDate),
    )[0];
  const active = temp.find(
    (t: { startDate: string; endDate: string }) =>
      t.startDate <= today && t.endDate >= today,
  );
  const candidate = active ?? upcoming;
  if (!candidate) return undefined;
  const days = Math.round(
    (Date.parse(candidate.startDate) - Date.parse(today)) / 86400000,
  );
  if (days > 7) return undefined;
  return candidate;
}

export function supplementsToday(client: CoachClient) {
  const items = client.plans?.supplements?.items ?? [];
  return items;
}

export function habitsToday(client: CoachClient, date: string) {
  const habits = client.habits ?? [];
  const logged = new Set(client.habitLog?.[date] ?? []);
  return { habits, logged };
}
