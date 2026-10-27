"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import type { CoachClient } from "../../coach/model";
import { useCoach } from "../../coach/store";
import { ClientCheckInSheet } from "./check-in";
import { MobileHome } from "./home";
import { MobileMessages } from "./messages";
import { PlansStack } from "./plans";
import { MobileTracker } from "./tracker";
import "./mobile.css";

const TABS = ["home", "tracker", "plans", "messages"] as const;
type Tab = (typeof TABS)[number];

const ICONS: Record<Tab, React.ReactNode> = {
  home: (
    <svg
      aria-hidden="true"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  ),
  tracker: (
    <svg
      aria-hidden="true"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  plans: (
    <svg
      aria-hidden="true"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  messages: (
    <svg
      aria-hidden="true"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  ),
};
const LABELS: Record<Tab, string> = {
  home: "Home",
  tracker: "Tracker",
  plans: "Plans",
  messages: "Messages",
};

export function MobileApp({ client }: { client: CoachClient }) {
  const { state, hydrated } = useCoach();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "home";
  const [sheet, setSheet] = useState<"check-in" | null>(null);
  const [plansVariant, setPlansVariant] = useState<string | undefined>();
  const setTab = useCallback(
    (t: Tab) => {
      const q = new URLSearchParams(params.toString());
      if (t === "home") q.delete("tab");
      else q.set("tab", t);
      router.replace(`/client?${q.toString()}`);
    },
    [params, router],
  );
  const unread = state.messages.filter(
    (m) => m.clientId === client.id && m.from === "coach" && !m.read,
  ).length;
  if (!hydrated) return null;
  return (
    <div className="cm-app">
      <div className="cm-body">
        {tab === "home" && (
          <MobileHome
            client={client}
            onOpenCheckIn={() => setSheet("check-in")}
            onOpenTracker={() => setTab("tracker")}
            onOpenMessages={() => setTab("messages")}
            onOpenSession={() => setTab("plans")}
            onOpenMealPlan={(variant) => {
              setPlansVariant(variant);
              setTab("plans");
            }}
          />
        )}
        {tab === "tracker" && <MobileTracker client={client} />}
        {tab === "plans" && (
          <PlansStack client={client} initialVariant={plansVariant} />
        )}
        {tab === "messages" && <MobileMessages client={client} />}
      </div>
      <nav className="cm-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`cm-tab${tab === t ? " on" : ""}`}
            onClick={() => setTab(t)}
          >
            {ICONS[t]}
            {LABELS[t]}
            {t === "messages" && unread > 0 && (
              <span className="cm-badge">{unread}</span>
            )}
          </button>
        ))}
      </nav>
      {sheet === "check-in" && (
        <ClientCheckInSheet client={client} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
