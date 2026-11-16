"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  athleteMode,
  coachThemeStyle,
  useSystemMode,
} from "../coach/coach-theme";
import { CoachProvider, useCoach } from "../coach/store";
import { templateSetup } from "../coach/template-setup";
import { Button, Empty } from "../coach/ui";
import { Status } from "../vari8/components";
import { ClientDesktop } from "./desktop/desktop";
import { MobileApp } from "./mobile/mobile-app";
import "../coach/coach.css";
import "./client-app.css";

export function ClientRoute() {
  return (
    <CoachProvider>
      <ClientRouteInner />
    </CoachProvider>
  );
}

function ClientRouteInner() {
  const { state, hydrated } = useCoach();
  const params = useSearchParams();
  const router = useRouter();
  const clientId = params.get("client") ?? "";
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const viewPhone = params.get("view") === "phone";
  const togglePhone = () => {
    const q = new URLSearchParams(params.toString());
    if (viewPhone) q.delete("view");
    else q.set("view", "phone");
    router.replace(`/client?${q.toString()}`);
  };
  const client = clientId
    ? state.clients.find((candidate) => candidate.id === clientId)
    : undefined;
  const systemMode = useSystemMode();
  // The athlete app follows the athlete's own light/dark choice, then the
  // phone — never the coach's workspace mode. Brand color still comes from
  // the coach's settings.
  const appMode = athleteMode(client ?? {}, systemMode);
  const themePrefs = { ...state.preferences, mode: appMode };
  const configuration = client?.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  return (
    <div
      className="coach-root v8-theme client-app-route"
      data-mode={appMode}
      style={coachThemeStyle(themePrefs)}
    >
      {!hydrated ? (
        <div className="client-app-loading" role="status">
          Loading demo…
        </div>
      ) : !client || !configuration ? (
        <main className="client-app-empty">
          <Empty
            title="No client app to show"
            action={
              <Link
                className="client-app-coach-link"
                href="/coach?section=clients"
              >
                Coach workspace
              </Link>
            }
          >
            Choose a client with an assigned template in the coach workspace.
          </Empty>
        </main>
      ) : (
        <>
          <header
            className="client-app-topbar"
            style={{ display: wide ? "flex" : "none" }}
          >
            <span className="client-app-avatar" aria-hidden="true">
              {client.name
                .split(/\s+/)
                .map((part) => part[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <strong>{client.name}</strong>
            <Status>Local demo</Status>
            <Button variant="secondary" onClick={togglePhone}>
              {viewPhone ? "Desktop view" : "Phone view"}
            </Button>
            <Link
              className="client-app-coach-link"
              aria-label="Coach workspace"
              href={`/coach?section=clients&client=${client.id}`}
            >
              <span className="client-app-coach-link__full">
                Coach workspace
              </span>
              <span className="client-app-coach-link__short" aria-hidden="true">
                Coach
              </span>
            </Link>
          </header>
          {!wide || viewPhone ? (
            wide ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  minHeight: "calc(100vh - 60px)",
                }}
              >
                <div className="cm-frame">
                  <MobileApp client={client} />
                </div>
              </div>
            ) : (
              <MobileApp client={client} />
            )
          ) : (
            <ClientDesktop client={client} />
          )}
        </>
      )}
    </div>
  );
}
