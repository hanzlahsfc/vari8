"use client";

import {
  Activity,
  CalendarCheck,
  Circle,
  ClipboardList,
  Dumbbell,
  House,
  MessageCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HabitsTab } from "../coach/habits-tab";
import type { CoachClient, Variant } from "../coach/model";
import type { SupplementPlan } from "../coach/supplements/model";
import { SupplementPlanView } from "../coach/supplements/plan-view";
import { fetchSupplementPlan, planFromView } from "../data/supplements";
import {
  fetchActivityTargets,
  versionsFromWire,
} from "../data/activity-targets";
import type { ActivityTargetVersion } from "../coach/targets/model";
import { TargetSummary } from "../coach/targets/target-summary";
import { useLocalToday } from "../coach/targets/use-local-today";
import { Empty } from "../coach/ui";
import { SegmentedControl } from "../vari8/components";
import {
  type ClientAppSectionId,
  type ClientPlanPart,
  clientAppSections,
  PLAN_PART_LABELS,
  sectionForLegacyTab,
} from "./sections";
import { TrainingLogbook } from "./training-log/training-logbook";
import { RemoteTrainingLogbook } from "./training-log/remote-training-logbook";
import {
  RemoteConversationTab,
  RemoteDashboardTab,
  RemoteTrackerTab,
} from "./remote-views";
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

// Card 05b: the client Supplements section reads the saved plan through the
// card 02 route (own scope resolves the caller's profile server-side) and is
// strictly read-only - there is no plan-write surface on the client.
function RemoteSupplementsPart({
  workspaceId,
  clientProfileId,
  clientName,
}: {
  workspaceId: string;
  clientProfileId: string;
  clientName: string;
}) {
  const [plan, setPlan] = useState<SupplementPlan | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    fetchSupplementPlan(workspaceId, clientProfileId)
      .then((response) => {
        if (cancelled) return;
        setPlan(
          response.plan ? planFromView(response.plan, clientProfileId) : null,
        );
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, clientProfileId]);
  return (
    <section className="cd-preview-section" aria-label="Supplement plan">
      <h2>Supplements</h2>
      {phase === "loading" ? (
        <div className="client-app-loading" role="status">
          Loading your plan…
        </div>
      ) : phase === "error" ? (
        <Empty title="Your supplement plan could not be loaded">
          Check your connection and reload the page.
        </Empty>
      ) : (
        <SupplementPlanView plan={plan ?? undefined} clientName={clientName} />
      )}
    </section>
  );
}

// Issue #169: the client Activity targets part reads the dated versions
// through the card 07 route (own scope resolves the caller's profile
// server-side) and is strictly read-only - writes are coach-side only.
function RemoteActivityTargetsPart({
  workspaceId,
  clientProfileId,
}: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const liveToday = useLocalToday();
  const [versions, setVersions] = useState<ActivityTargetVersion[] | null>(
    null,
  );
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    fetchActivityTargets(workspaceId, clientProfileId)
      .then((response) => {
        if (cancelled) return;
        setVersions(versionsFromWire(response.versions));
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, clientProfileId]);
  return (
    <section className="cd-preview-section" aria-label="Activity targets">
      {phase === "loading" ? (
        <div className="client-app-loading" role="status">
          Loading your targets…
        </div>
      ) : phase === "error" ? (
        <Empty title="Your activity targets could not be loaded">
          Check your connection and reload the page.
        </Empty>
      ) : (
        <TargetSummary
          versions={versions ?? []}
          date={liveToday}
          mode="week"
        />
      )}
    </section>
  );
}

export function ClientApp({
  configuration,
  client,
  context,
  illustrative = false,
  initialTab,
  own,
  brand,
}: {
  configuration: Variant;
  client: CoachClient;
  context: "standalone" | "preview";
  illustrative?: boolean;
  initialTab?: string;
  // The caller's own workspace + profile, resolved from the session on
  // the host page. When set, dashboard tasks and messages, the tracker,
  // supplements and check-ins bind to the own /api/v1 routes instead of
  // canvas fixtures.
  own?: { workspaceId: string; clientProfileId: string };
  /** Workspace name shown beside the nav mark in the desktop sidebar. */
  brand?: string;
}) {
  // Product mode is an explicit route context, never inferred from a
  // workspaceId alone: only the served standalone surface binds the caller's
  // own scope — a preview mount keeps local behaviour even if an own pair
  // is threaded in by mistake.
  const ownScope = context === "standalone" ? own : undefined;
  const sections = useMemo(
    () =>
      clientAppSections(configuration, client.plans, {
        conversation: ownScope !== undefined,
      }),
    [configuration, client.plans, ownScope],
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
            {active === "home" &&
              (ownScope ? (
                <RemoteDashboardTab
                  configuration={configuration}
                  client={client}
                  own={ownScope}
                />
              ) : (
                <DashboardTab configuration={configuration} client={client} />
              ))}
            <div hidden={active !== "tracker"}>
              {showTracker && (
                <>
                  {configuration.views.includes("Tracker") &&
                    (ownScope ? (
                      <RemoteTrackerTab
                        key={`${client.id}:${configuration.id}`}
                        own={ownScope}
                        clientName={client.name}
                      />
                    ) : (
                      <TrackerTab
                        key={`${client.id}:${configuration.id}`}
                        configuration={configuration}
                        client={client}
                        example={illustrative}
                      />
                    ))}
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
                    own={ownScope}
                  />
                )}
                {activePlanPart === "supplements" &&
                  (ownScope ? (
                    <RemoteSupplementsPart
                      workspaceId={ownScope.workspaceId}
                      clientProfileId={ownScope.clientProfileId}
                      clientName={client.name}
                    />
                  ) : (
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
                  ))}
                {activePlanPart === "activity-targets" &&
                  (ownScope ? (
                    <RemoteActivityTargetsPart
                      workspaceId={ownScope.workspaceId}
                      clientProfileId={ownScope.clientProfileId}
                    />
                  ) : (
                    <ActivityTargetsPart client={client} />
                  ))}
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
                  // Card 11/#176: a signed-in client logs against the
                  // server's pinned prescription; the local path stays
                  // for the unsigned demo.
                  ownScope ? (
                    <RemoteTrainingLogbook
                      client={client}
                      configuration={configuration}
                      own={ownScope}
                    />
                  ) : (
                    <TrainingLogbook
                      client={client}
                      configuration={configuration}
                    />
                  )
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
              <CheckInTab
                configuration={configuration}
                client={client}
                workspaceId={ownScope?.workspaceId}
                clientProfileId={ownScope?.clientProfileId}
              />
            )}
            {active === "messages" && ownScope && (
              // An auto-selected section (e.g. the only section of a
              // no-view template) is not an explicit view — the thread
              // stays collapsed until the client activates it. A direct
              // nav selection is the explicit activation.
              <RemoteConversationTab
                own={ownScope}
                clientName={client.name}
                collapsible={section !== "messages"}
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
