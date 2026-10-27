"use client";

import {
  Activity,
  CalendarCheck,
  Circle,
  ClipboardList,
  Dumbbell,
  House,
  ListChecks,
  MessageCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { HabitsTab } from "../coach/habits-tab";
import type { CoachClient, Variant } from "../coach/model";
import { SupplementPlanView } from "../coach/supplements/plan-view";
import { TargetSummary } from "../coach/targets/target-summary";
import { useLocalToday } from "../coach/targets/use-local-today";
import { Empty } from "../coach/ui";
import { SegmentedControl } from "../vari8/components";
import { type ClientMessageRow, ClientMessages } from "./messages";
import {
  type ClientAppSectionId,
  type ClientPlanPart,
  clientAppSections,
  PLAN_PART_LABELS,
  sectionForLegacyTab,
} from "./sections";
import { type ClientTaskRow, ClientTasks } from "./tasks";
import { TrainingLogbook } from "./training-log/training-logbook";
import {
  CheckInTab,
  DashboardTab,
  NutritionTab,
  RoadmapTab,
  TrackerTab,
  TrainingTab,
} from "./views";
import "./client-app.css";
import "./training-log/training-log.css";

// Icons are optional per section: the registry in sections.ts can add an id
// the shell has never seen, and the nav must still render it.
const SECTION_ICONS: Partial<Record<ClientAppSectionId, typeof House>> = {
  home: House,
  plans: ClipboardList,
  tracker: Activity,
  training: Dumbbell,
  "check-ins": CalendarCheck,
  messages: MessageCircle,
  tasks: ListChecks,
};

function ActivityTargetsPart({ client }: { client: CoachClient }) {
  const liveToday = useLocalToday();
  return (
    <section className="cd-preview-section" aria-label="Activity targets">
      <TargetSummary
        versions={client.plans?.activityTargets ?? []}
        date={liveToday}
        mode="week"
      />
    </section>
  );
}

export function ClientApp({
  configuration,
  client,
  context,
  illustrative = false,
  initialTab,
  brand,
}: {
  configuration: Variant;
  client: CoachClient;
  context: "standalone" | "preview";
  illustrative?: boolean;
  initialTab?: string;
  /** Workspace name shown beside the nav mark in the desktop sidebar. */
  brand?: string;
}) {
  const sections = useMemo(
    () =>
      clientAppSections(configuration, client.plans, {
        remote: context === "standalone",
      }),
    [configuration, client.plans, context],
  );
  const plans = sections.find((section) => section.id === "plans");
  const [section, setSection] = useState<ClientAppSectionId | undefined>(
    () => sectionForLegacyTab(initialTab)?.section,
  );
  const [planPart, setPlanPart] = useState<ClientPlanPart | undefined>(
    () => sectionForLegacyTab(initialTab)?.planPart,
  );
  const [trainingView, setTrainingView] = useState<"sessions" | "program">(
    "sessions",
  );
  const [habitDone, setHabitDone] = useState<Record<string, boolean>>({});
  // Demo overlays for the messages and tasks sections: the standalone app
  // has no server, so replies and toggles live in local state on top of
  // the client fixtures.
  const [demoReplies, setDemoReplies] = useState<ClientMessageRow[]>([]);
  const [demoTaskDone, setDemoTaskDone] = useState<Record<string, boolean>>({});
  const [demoClientId, setDemoClientId] = useState(client.id);
  if (demoClientId !== client.id) {
    setDemoClientId(client.id);
    setDemoReplies([]);
    setDemoTaskDone({});
  }
  const messageRows = useMemo<ClientMessageRow[]>(
    () => [
      ...(client.messages ?? []).map((message) => ({
        id: message.id,
        fromClient: message.from === "client",
        sender: message.from === "coach" ? "Coach" : client.name,
        date: message.date.slice(0, 10),
        body: message.text,
        unread: false,
      })),
      ...demoReplies,
    ],
    [client.messages, client.name, demoReplies],
  );
  const taskRows = useMemo<ClientTaskRow[]>(
    () =>
      (client.clientTasks ?? []).map((task) => ({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate,
        complete: demoTaskDone[task.id] ?? task.status === "complete",
        dueState: task.status === "overdue" ? "overdue" : undefined,
      })),
    [client.clientTasks, demoTaskDone],
  );
  const active: ClientAppSectionId | undefined = sections.some(
    (candidate) => candidate.id === section,
  )
    ? section
    : sections[0]?.id;
  const activePlanPart: ClientPlanPart | undefined = plans?.planParts.includes(
    planPart as ClientPlanPart,
  )
    ? planPart
    : plans?.planParts[0];
  const showTracker = sections.some((candidate) => candidate.id === "tracker");
  const navItem = (candidate: { id: ClientAppSectionId; label: string }) => {
    const Icon = SECTION_ICONS[candidate.id] ?? Circle;
    return (
      <button
        key={candidate.id}
        type="button"
        className={`cd-client-app-link${active === candidate.id ? " is-active" : ""}`}
        aria-current={active === candidate.id ? "page" : undefined}
        onClick={() => setSection(candidate.id)}
      >
        <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
        <span>{candidate.label}</span>
      </button>
    );
  };
  return (
    <div className="cd-client-app-shell" data-context={context}>
      <div className="cd-client-app">
        <aside className="cd-client-app-side">
          <div className="cd-client-app-brand">
            <span className="cd-client-app-brand-mark" aria-hidden="true">
              infinity<span className="cd-client-app-brand-period">.</span>
            </span>
            {brand && (
              <span className="cd-client-app-brand-name" title={brand}>
                {brand}
              </span>
            )}
          </div>
          <nav className="cd-client-app-nav" aria-label="Client sections">
            {sections.map(navItem)}
          </nav>
        </aside>
        <div className="cd-client-app-main">
          {active === "plans" && plans && plans.planParts.length >= 2 && (
            <div className="cd-client-app-plans-nav">
              <SegmentedControl
                label="Plans"
                value={activePlanPart ?? ""}
                onValueChange={(value) => setPlanPart(value as ClientPlanPart)}
                options={plans.planParts.map((part) => ({
                  value: part,
                  label: PLAN_PART_LABELS[part],
                }))}
              />
            </div>
          )}
          <div className="cd-client-app-content">
            {!active && (
              <Empty title="No sections enabled">
                Enable at least one tab in the template’s Tabs section.
              </Empty>
            )}
            {active === "home" && (
              <DashboardTab configuration={configuration} client={client} />
            )}
            <div hidden={active !== "tracker"}>
              {showTracker && (
                <>
                  {configuration.views.includes("Tracker") && (
                    <TrackerTab
                      key={`${client.id}:${configuration.id}`}
                      configuration={configuration}
                      client={client}
                      example={illustrative}
                    />
                  )}
                  {configuration.habits && (
                    <HabitsTab
                      client={client}
                      done={habitDone}
                      onToggle={(id) =>
                        setHabitDone((current) => ({
                          ...current,
                          [id]: !current[id],
                        }))
                      }
                    />
                  )}
                </>
              )}
            </div>
            {active === "plans" && (
              <>
                {activePlanPart === "nutrition" && (
                  <NutritionTab
                    configuration={configuration}
                    client={client}
                    illustrative={illustrative}
                  />
                )}
                {activePlanPart === "supplements" && (
                  <section
                    className="cd-preview-section"
                    aria-label="Supplement plan"
                  >
                    <h2>Supplements</h2>
                    <SupplementPlanView
                      plan={client.plans?.supplements}
                      clientName={client.name}
                    />
                  </section>
                )}
                {activePlanPart === "activity-targets" && (
                  <ActivityTargetsPart client={client} />
                )}
                {activePlanPart === "roadmap" && (
                  <RoadmapTab configuration={configuration} client={client} />
                )}
              </>
            )}
            {active === "training" && illustrative && (
              <>
                <TrainingTab
                  configuration={configuration}
                  client={client}
                  illustrative={illustrative}
                />
                <p className="cd-caption">
                  Session logging is available for assigned clients.
                </p>
              </>
            )}
            {active === "training" && !illustrative && (
              <>
                <div className="cd-client-app-plans-nav">
                  <SegmentedControl
                    label="Training view"
                    value={trainingView}
                    onValueChange={(value) =>
                      setTrainingView(value as "sessions" | "program")
                    }
                    options={[
                      { value: "sessions", label: "Sessions" },
                      { value: "program", label: "Program" },
                    ]}
                  />
                </div>
                {trainingView === "sessions" ? (
                  <TrainingLogbook
                    client={client}
                    configuration={configuration}
                  />
                ) : (
                  <TrainingTab
                    configuration={configuration}
                    client={client}
                    illustrative={false}
                  />
                )}
              </>
            )}
            {active === "check-ins" && (
              <CheckInTab configuration={configuration} client={client} />
            )}
            {active === "messages" && (
              <ClientMessages
                onSend={(body) =>
                  setDemoReplies((current) => [
                    ...current,
                    {
                      id: `demo-reply-${current.length}-${Date.now()}`,
                      fromClient: true,
                      sender: client.name,
                      date: new Date().toISOString().slice(0, 10),
                      body,
                    },
                  ])
                }
                rows={messageRows}
              />
            )}
            {active === "tasks" && (
              <ClientTasks
                onToggle={(id, complete) =>
                  setDemoTaskDone((current) => ({
                    ...current,
                    [id]: complete,
                  }))
                }
                rows={taskRows}
              />
            )}
          </div>
        </div>
        <nav className="cd-client-app-bottom" aria-label="Client sections">
          {sections.map(navItem)}
        </nav>
      </div>
    </div>
  );
}
