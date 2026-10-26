"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type Appearance, themeVariables } from "@/lib/ethereal-appearance";
import { coachThemeStyle } from "../coach/coach-theme";
import { CoachProvider, useCoach } from "../coach/store";
import { templateSetup } from "../coach/template-setup";
import { Empty } from "../coach/ui";
import { Status } from "../vari8/components";
import { ClientApp } from "./client-app";
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
  const clientId = params.get("client") ?? "";
  const client = clientId
    ? state.clients.find((candidate) => candidate.id === clientId)
    : undefined;
  const configuration = client?.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const appearance: Appearance = {
    mode: state.preferences.mode,
    accent: state.preferences.accent,
    font: "sans",
    density: "comfortable",
    logoMediaId: null,
  };
  const logoUrl = state.preferences.logo?.dataUrl ?? null;
  return (
    <div
      className={`coach-root v8-theme client-app-route${appearance.density === "compact" ? " eg-density-compact" : ""}`}
      data-mode={appearance.mode}
      style={{
        ...themeVariables(appearance),
        ...coachThemeStyle({
          ...state.preferences,
          mode: appearance.mode,
          accent: appearance.accent,
        }),
      }}
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
          <header className="client-app-topbar">
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
            <Link
              className="client-app-coach-link"
              aria-label="Coach workspace"
              href={`/coach?section=clients&client=${client.id}`}
            >
              {logoUrl ? (
                // biome-ignore lint/performance/noImgElement: workspace logo is a dynamic signed url
                <img className="client-app-logo" src={logoUrl} alt="" />
              ) : null}
              <span className="client-app-coach-link__full">
                Coach workspace
              </span>
              <span className="client-app-coach-link__short" aria-hidden="true">
                Coach
              </span>
            </Link>
          </header>
          <ClientApp
            configuration={configuration}
            client={client}
            context="standalone"
          />
        </>
      )}
    </div>
  );
}
