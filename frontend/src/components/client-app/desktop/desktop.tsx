"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AthleteOverview } from "../../coach/athlete/overview";
import { currentPhase } from "../../coach/athlete/timeline";
import { AthleteTimelineTab } from "../../coach/athlete/timeline-tab";
import { AthleteTrackerTab } from "../../coach/athlete/tracker-tab";
import { type CoachClient, formatClock, formatDate } from "../../coach/model";
import { useCoach } from "../../coach/store";
import { useLocalToday } from "../../coach/targets/use-local-today";
import { templateSetup } from "../../coach/template-setup";
import { Avatar, Button } from "../../coach/ui";
import { Tabs } from "../../vari8/components";
import { CheckInForm } from "../check-in";
import { nextCheckIn } from "../mobile/data";
import { MobileMessages } from "../mobile/messages";
import { DesktopPlans } from "./plans";
import "./desktop.css";

const TABS = [
  "Overview",
  "Tracker",
  "Timeline",
  "Plans",
  "Messages",
  "Check-ins",
] as const;
type Tab = (typeof TABS)[number];
const SLUGS: Record<Tab, string> = {
  Overview: "overview",
  Tracker: "tracker",
  Timeline: "timeline",
  Plans: "plans",
  Messages: "messages",
  "Check-ins": "check-ins",
};

export function ClientDesktop({ client }: { client: CoachClient }) {
  const { state } = useCoach();
  const today = useLocalToday();
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get("tab") ?? "overview";
  const tab =
    (Object.entries(SLUGS).find(([, v]) => v === slug)?.[0] as Tab) ??
    "Overview";
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [planDetail, setPlanDetail] = useState<string | undefined>();
  const setTab = (t: Tab) => {
    const q = new URLSearchParams(params.toString());
    if (t === "Overview") q.delete("tab");
    else q.set("tab", SLUGS[t]);
    router.replace(`/client?${q.toString()}`);
  };
  const openFromCard = (t: string, plan?: string) => {
    const found = (Object.entries(SLUGS).find(([k]) => k === t)?.[0] ??
      t) as Tab;
    setTab(TABS.includes(found) ? found : "Overview");
    if (t === "Plans" && plan) setPlanDetail(plan);
  };
  const phase = currentPhase(client.phases, today);
  const subline = phase
    ? `${phase.name} · Week ${String(phase.week)} of ${String(phase.weeks)}`
    : [client.label, client.phase].filter(Boolean).join(" · ");
  const configuration = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const next = nextCheckIn(state, client, today);
  const submissions = state.submissions
    .filter((s) => s.clientId === client.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="cd-client-desktop">
      <header className="ap-header">
        <div className="ap-header-id">
          <Avatar client={client} />
          <div className="ap-header-text">
            <h1>{client.name}</h1>
            {subline && <p className="ap-sub">{subline}</p>}
            {client.email && <p className="ap-meta">{client.email}</p>}
          </div>
        </div>
      </header>
      <Tabs
        label="Client view"
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="cd-profile-tabs"
        items={TABS.map((value) => ({ value, label: value, content: null }))}
      />
      <div
        className={
          tab === "Tracker" ? "cd-client-main has-trk" : "cd-client-main"
        }
      >
        {tab === "Overview" && (
          <AthleteOverview
            client={client}
            viewer="client"
            onOpen={openFromCard}
          />
        )}
        {tab === "Tracker" && (
          <AthleteTrackerTab
            client={client}
            viewer="client"
            onOpen={openFromCard}
          />
        )}
        {tab === "Timeline" && (
          <AthleteTimelineTab
            client={client}
            viewer="client"
            onOpen={openFromCard}
          />
        )}
        {tab === "Plans" && (
          <div className="cm-app">
            <DesktopPlans
              client={client}
              detail={planDetail}
              onDetail={setPlanDetail}
            />
          </div>
        )}
        {tab === "Messages" && (
          <div className="cd-messages-wrap cm-app">
            <MobileMessages client={client} />
          </div>
        )}
        {tab === "Check-ins" && (
          <div className="cd-checkins cm-app">
            <div className="cd-checkins-main">
              {next && !checkinOpen && (
                <div className="cm-card" style={{ marginBottom: 12 }}>
                  <div
                    className="cm-row"
                    style={{ justifyContent: "space-between" }}
                  >
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>
                        Next check-in
                      </div>
                      <div className="cm-mut" style={{ fontSize: 12.5 }}>
                        {next.overdue
                          ? "Overdue"
                          : next.dueToday
                            ? `Due today by ${formatClock(next.deadline)}`
                            : `Due ${formatDate(next.date, { weekday: "short", day: "numeric", month: "short" })} · in ${next.daysUntil} days`}
                      </div>
                    </div>
                    <Button primary onClick={() => setCheckinOpen(true)}>
                      Start check-in
                    </Button>
                  </div>
                </div>
              )}
              {checkinOpen && configuration && (
                <CheckInForm configuration={configuration} client={client} />
              )}
            </div>
            <aside className="cd-checkins-side">
              <div
                className="cm-mut"
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: ".4px",
                  marginBottom: 8,
                }}
              >
                History
              </div>
              {submissions.map((s) => (
                <div
                  key={s.id}
                  className="cm-card"
                  style={{ padding: "10px 14px", marginBottom: 6 }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {formatDate(s.date, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                  <div className="cm-mut" style={{ fontSize: 12 }}>
                    {s.response ? "Reviewed" : "Awaiting feedback"}
                  </div>
                  {s.response && (
                    <div style={{ fontSize: 12.5, marginTop: 4 }}>
                      {s.response.text}
                    </div>
                  )}
                </div>
              ))}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
