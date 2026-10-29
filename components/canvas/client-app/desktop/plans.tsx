"use client";

import { useMemo, useState } from "react";
import type { CoachClient } from "../../coach/model";
import { applicablePlan } from "../../coach/plans/domain";
import type { IifymPlan } from "../../coach/plans/types";
import { useLocalToday } from "../../coach/targets/use-local-today";
import type { MealPlan } from "../../ethereal/mealplan/model";
import { MobileActivity } from "../mobile/activity";
import {
  cardioWeek,
  stepsLabel,
  stepsTarget,
  supplementsToday,
  todayTargets,
  upcomingTemporary,
} from "../mobile/data";
import { MobileLogbook } from "../mobile/logbook";
import {
  MobileMealPlan,
  OlderPlanScreen,
  OlderPlansScreen,
} from "../mobile/meal-plan";
import { MobileSupplements } from "../mobile/supplements";
import { MobileSessionOverview, MobileTraining } from "../mobile/training";
import type { ScheduledSession } from "../training-log/model";

type Detail =
  | { kind: "training" }
  | { kind: "session"; item: ScheduledSession }
  | { kind: "logbook"; item: ScheduledSession }
  | { kind: "mealplan" }
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

const LABEL: Record<Detail["kind"], string> = {
  training: "Training",
  session: "Session",
  logbook: "Session",
  mealplan: "Meal plan",
  olderplans: "Older plans",
  olderplan: "Plan",
  supplements: "Supplements",
  activity: "Activity",
};

export function DesktopPlans({
  client,
  detail,
  onDetail,
}: {
  client: CoachClient;
  detail?: string;
  onDetail: (k?: string) => void;
}) {
  const today = useLocalToday();
  const plan = client.plans
    ? applicablePlan(client.plans.training, today)
    : undefined;
  const targets = useMemo(() => todayTargets(client, today), [client, today]);
  const temp = useMemo(() => upcomingTemporary(client, today), [client, today]);
  const sups = useMemo(() => supplementsToday(client), [client]);
  const steps = useMemo(() => stepsTarget(client, today), [client, today]);
  const cardio = useMemo(() => cardioWeek(client, today), [client, today]);
  const [sub, setSub] = useState<Detail | null>(null);
  const sel = (detail as Detail["kind"]) ?? "training";
  const list = [
    plan && { key: "training", title: "Training", line: plan.name },
    targets && {
      key: "mealplan",
      title: "Nutrition",
      line: `${targets.label ?? ""} ${Math.round(targets.kcal)} kcal${temp ? " · Temporary active" : ""}`,
    },
    sups.length > 0 && {
      key: "supplements",
      title: "Supplements",
      line: `${sups.length} supplements`,
    },
    (steps || cardio) && {
      key: "activity",
      title: "Activity",
      line: `${steps ? `Steps ${stepsLabel(steps)}` : ""}${steps && cardio ? " · " : ""}${cardio ? `Cardio ${cardio.sessionsTarget} × ${cardio.minutes} min` : ""}`,
    },
  ].filter(Boolean) as { key: string; title: string; line: string }[];
  const top = sub ?? ({ kind: sel } as Detail);
  const backLabel = sub ? LABEL[sel] : null;
  return (
    <div className="cd-plans-grid">
      <aside className="cd-plans-side">
        {list.map((l) => (
          <button
            key={l.key}
            type="button"
            className={`cm-card cm-navcard${sel === l.key ? " cm-sel" : ""}`}
            onClick={() => {
              onDetail(l.key);
              setSub(null);
            }}
          >
            <div className="cm-row" style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{l.title}</div>
                <div className="cm-mut" style={{ fontSize: 12 }}>
                  {l.line}
                </div>
              </div>
              <svg
                aria-hidden="true"
                width="15"
                height="15"
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
      </aside>
      <div className="cd-plans-detail cm-app">
        {backLabel && (
          <button
            type="button"
            className="cm-back"
            onClick={() => setSub(null)}
          >
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
            {backLabel}
          </button>
        )}
        {top.kind === "training" && (
          <MobileTraining
            client={client}
            embedded
            onOpenSession={(item) => setSub({ kind: "session", item })}
          />
        )}
        {top.kind === "session" && (
          <MobileSessionOverview
            client={client}
            item={top.item}
            onStart={() => setSub({ kind: "logbook", item: top.item })}
          />
        )}
        {top.kind === "logbook" && (
          <MobileLogbook
            client={client}
            item={top.item}
            onDone={() => setSub({ kind: "training" })}
          />
        )}
        {top.kind === "mealplan" && (
          <MobileMealPlan
            client={client}
            embedded
            onOpenOlder={() => setSub({ kind: "olderplans" })}
          />
        )}
        {top.kind === "olderplans" && (
          <OlderPlansScreen
            client={client}
            onOpen={(version) => setSub({ kind: "olderplan", version })}
          />
        )}
        {top.kind === "olderplan" && <OlderPlanScreen version={top.version} />}
        {top.kind === "supplements" && (
          <MobileSupplements client={client} embedded />
        )}
        {top.kind === "activity" && <MobileActivity client={client} embedded />}
      </div>
    </div>
  );
}
