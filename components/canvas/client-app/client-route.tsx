"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { coachThemeStyle } from "../coach/coach-theme";
import type { CoachClient, Variant } from "../coach/model";
import { CoachProvider, useCoach } from "../coach/store";
import { templateSetup } from "../coach/template-setup";
import { Empty } from "../coach/ui";
import { Status } from "../vari8/components";
import { ClientApp } from "./client-app";
import "../coach/coach.css";
import "./client-app.css";

/**
 * A signed-in client, resolved server-side: identity, workspace brand and
 * the coach's variant come from the session and the client's active
 * assignment, never from the local demo store.
 */
export type ClientSession = {
  clientName: string;
  clientInitials: string;
  workspaceName: string;
  configuration: Variant;
  client: CoachClient;
  appearance?: { mode?: "light" | "dark"; accent?: string };
};

export function ClientRoute({
  own,
  session,
}: {
  own?: { workspaceId: string; clientProfileId: string };
  session?: ClientSession;
}) {
  return (
    <CoachProvider>
      <ClientRouteInner own={own} session={session} />
    </CoachProvider>
  );
}

function ClientRouteInner({
  own,
  session,
}: {
  own?: { workspaceId: string; clientProfileId: string };
  session?: ClientSession;
}) {
  const { state, hydrated } = useCoach();
  const params = useSearchParams();
  const clientId = params.get("client") ?? "";
  const demoClient = clientId
    ? state.clients.find((candidate) => candidate.id === clientId)
    : undefined;
  const client = session?.client ?? demoClient;
  const configuration =
    session?.configuration ??
    (demoClient?.assignment
      ? templateSetup(
          demoClient.assignment.snapshot,
          demoClient.assignment.variantId,
        )
      : undefined);
  const preferences = { ...state.preferences, ...session?.appearance };
  return (
    <div
      className="coach-root v8-theme client-app-route"
      data-mode={preferences.mode}
      style={coachThemeStyle(preferences)}
    >
      {session && client && configuration ? (
        <>
          <header className="client-app-topbar">
            <span className="client-app-avatar" aria-hidden="true">
              {session.clientInitials}
            </span>
            <strong>{session.clientName}</strong>
            <span className="client-app-brand" title={session.workspaceName}>
              {session.workspaceName}
            </span>
          </header>
          <ClientApp
            configuration={configuration}
            client={client}
            context="standalone"
            brand={session.workspaceName}
            own={own}
          />
        </>
      ) : !hydrated ? (
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
                href={own ? "/me" : "/coach?section=clients"}
              >
                {own ? "Your client app" : "Coach workspace"}
              </Link>
            }
          >
            {own
              ? "Your app lives at /me."
              : "Choose a client with an assigned template in the coach workspace."}
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
            own={own}
          />
        </>
      )}
    </div>
  );
}
