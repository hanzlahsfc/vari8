"use client";

import { useEffect, useMemo, useState } from "react";
import { nutritionForDate } from "../../coach/athlete/timeline";
import { type CoachClient, formatDate } from "../../coach/model";
import { trainingPlanAt } from "../../coach/plans/domain";
import type { IifymPlan } from "../../coach/plans/types";
import { useCoach } from "../../coach/store";
import { useLocalToday } from "../../coach/targets/use-local-today";
import type { MealPlan } from "../../ethereal/mealplan/model";
import {
  displayWeek,
  type ScheduledSession,
  scheduledSessions,
  sessionStatus,
} from "../training-log/model";
import { MobileActivity } from "./activity";
import {
  cardioWeek,
  stepsLabel,
  stepsTarget,
  supplementsToday,
  todayTargets,
  upcomingTemporary,
} from "./data";
import { MobileLogbook } from "./logbook";
import { MobileMealPlan, OlderPlanScreen, OlderPlansScreen } from "./meal-plan";
import { MobileSupplements } from "./supplements";
import { MobileSessionOverview, MobileTraining } from "./training";

type Screen =
  | { kind: "home" }
  | { kind: "training" }
  | { kind: "session"; item: ScheduledSession }
  | { kind: "logbook"; item: ScheduledSession }
  | { kind: "mealplan"; variant?: string }
  | { kind: "olderplans" }
  | {
      kind: "olderplan";
      version: {
        content: MealPlan | IifymPlan;
        activatedAt: string;
        archivedOn?: string;
      };
    }
  | { kind: "supplements" }
  | { kind: "activity" };

const TITLES: Record<Screen["kind"], string> = {
  home: "Plans",
  training: "Training",
  session: "Session",
  logbook: "Session",
  mealplan: "Meal plan",
  olderplans: "Older plans",
  olderplan: "Plan",
  supplements: "Supplements",
  activity: "Activity",
};

export function PlansStack({
  client,
  initialVariant,
}: {
  client: CoachClient;
  initialVariant?: string;
}) {
  const [stack, setStack] = useState<Screen[]>([{ kind: "home" }]);
  const top = stack[stack.length - 1];
  useEffect(() => {
    if (!initialVariant) return;
    setStack(() => [
      { kind: "home" },
      { kind: "mealplan", variant: initialVariant },
    ]);
  }, [initialVariant]);
  const back = () => setStack((s) => s.slice(0, -1));
  const push = (s: Screen) => setStack((c) => [...c, s]);
  const prevTitle =
    stack.length > 1 ? TITLES[stack[stack.length - 2].kind] : "";
  return (
    <>
      {stack.length > 1 && (
        <button type="button" className="cm-back" onClick={back}>
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {prevTitle}
        </button>
      )}
      {top.kind === "home" && <PlansHome client={client} push={push} />}
      {top.kind === "training" && (
        <MobileTraining
          client={client}
          onOpenSession={(item) => push({ kind: "session", item })}
        />
      )}
      {top.kind === "session" && (
        <MobileSessionOverview
          client={client}
          item={top.item}
          onStart={() => push({ kind: "logbook", item: top.item })}
        />
      )}
      {top.kind === "logbook" && (
        <MobileLogbook client={client} item={top.item} onDone={back} />
      )}
      {top.kind === "mealplan" && (
        <MobileMealPlan
          client={client}
          selectedVariant={top.kind === "mealplan" ? top.variant : undefined}
          onOpenOlder={() => push({ kind: "olderplans" })}
        />
      )}
      {top.kind === "olderplans" && (
        <OlderPlansScreen
          client={client}
          onOpen={(version) => push({ kind: "olderplan", version })}
        />
      )}
      {top.kind === "olderplan" && <OlderPlanScreen version={top.version} />}
      {top.kind === "supplements" && <MobileSupplements client={client} />}
      {top.kind === "activity" && <MobileActivity client={client} />}
    </>
  );
}

function PlansHome({
  client,
  push,
}: {
  client: CoachClient;
  push: (s: Screen) => void;
}) {
  const { state } = useCoach();
  const today = useLocalToday();
  const plan = client.plans
    ? trainingPlanAt(client.plans.training, today)
    : undefined;
  const week = plan ? displayWeek(plan, today) : 0;
  const items = plan ? scheduledSessions(plan, week) : [];
  const logs = state.trainingLogs ?? [];
  const doneCount = items.filter(
    (i) => sessionStatus(i, logs, today) === "done",
  ).length;
  const targets = useMemo(() => todayTargets(client, today), [client, today]);
  const temp = useMemo(() => upcomingTemporary(client, today), [client, today]);
  const sups = useMemo(() => supplementsToday(client), [client]);
  const supTimings = new Set(sups.map((s) => s.timing || "Any time"));
  const steps = useMemo(() => stepsTarget(client, today), [client, today]);
  const cardio = useMemo(() => cardioWeek(client, today), [client, today]);
  const resolvedNutrition = useMemo(
    () => nutritionForDate(client, today),
    [client, today],
  );
  const meals = useMemo(() => {
    const plan = resolvedNutrition.plan;
    if (!plan || !("variants" in plan)) return 0;
    const variant =
      plan.variants.find((v) => v.id === resolvedNutrition.optionId) ??
      plan.variants[0];
    return variant?.meals.length ?? 0;
  }, [resolvedNutrition]);
  const cards: {
    icon: React.ReactNode;
    key: string;
    title: string;
    line: string;
    line2?: string;
    extra?: React.ReactNode;
    onOpen: () => void;
  }[] = [];
  if (plan)
    cards.push({
      key: "training",
      icon: <Dumbbell />,
      title: "Training",
      line: `${plan.name}`,
      line2: `Week ${week} of ${plan.weeks} · ${doneCount} of ${items.length} sessions done`,
      extra: (
        <div className="cm-bar" style={{ marginTop: 8, width: "70%" }}>
          <i
            style={{
              width: `${items.length ? (doneCount / items.length) * 100 : 0}%`,
            }}
          />
        </div>
      ),
      onOpen: () => push({ kind: "training" }),
    });
  if (targets) {
    cards.push({
      key: "mealplan",
      icon: <Fork />,
      title: "Nutrition",
      line: `Meal plan · ${targets.label ?? ""} ${new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(targets.kcal)} kcal${meals ? ` · ${meals} meals` : ""}`,
      extra: temp ? (
        <span
          className="cm-mut"
          style={{ display: "block", marginTop: 4, fontSize: 12 }}
        >
          {temp.label ?? "Temporary plan"} ·{" "}
          {formatDate(temp.startDate, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        </span>
      ) : undefined,
      onOpen: () => push({ kind: "mealplan" }),
    });
  }
  if (sups.length)
    cards.push({
      key: "supplements",
      icon: <Pill />,
      title: "Supplements",
      line: `${sups.length} supplements · ${supTimings.size} times a day`,
      onOpen: () => push({ kind: "supplements" }),
    });
  if (steps || cardio)
    cards.push({
      key: "activity",
      icon: <Pulse />,
      title: "Activity",
      line: `${steps ? `Steps ${stepsLabel(steps)}` : ""}${steps && cardio ? " · " : ""}${cardio ? `Cardio ${cardio.sessionsTarget} × ${cardio.minutes} min` : ""}`,
      onOpen: () => push({ kind: "activity" }),
    });
  return (
    <>
      <div className="cm-h1" style={{ marginBottom: 14 }}>
        Plans
      </div>
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          className="cm-card cm-navcard"
          onClick={c.onOpen}
        >
          <div className="cm-row" style={{ gap: 12 }}>
            <span style={{ color: "var(--cd-accent)" }}>{c.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.title}</div>
              <div className="cm-mut" style={{ fontSize: 12.5 }}>
                {c.line}
              </div>
              {c.line2 && (
                <div className="cm-mut" style={{ fontSize: 12.5 }}>
                  {c.line2}
                </div>
              )}
              {c.extra}
            </div>
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--cd-muted)"
              strokeWidth="1.75"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </button>
      ))}
    </>
  );
}

const svgProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const Dumbbell = () => (
  <svg aria-hidden="true" {...svgProps}>
    <path d="M4 9v6M7 6v12M17 6v12M20 9v6M7 12h10" />
  </svg>
);
const Fork = () => (
  <svg aria-hidden="true" {...svgProps}>
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" />
    <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
  </svg>
);
const Pill = () => (
  <svg aria-hidden="true" {...svgProps}>
    <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 0 0 7 7Z" />
    <path d="m8.5 8.5 7 7" />
  </svg>
);
const Pulse = () => (
  <svg aria-hidden="true" {...svgProps}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
