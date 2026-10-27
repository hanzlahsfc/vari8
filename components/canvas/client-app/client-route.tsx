"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { coachThemeStyle } from "../coach/coach-theme";
import type { CoachClient, Variant } from "../coach/model";
import { CoachProvider, useCoach } from "../coach/store";
import { templateSetup } from "../coach/template-setup";
import { Button, Empty } from "../coach/ui";
import { Status } from "../vari8/components";
import {
  type Appearance,
  themeVariables,
  type WorkspaceAppearance,
} from "@/lib/canvas/ethereal-appearance";
import { fetchWorkspaceAppearance } from "../data/appearance";
import { ClientApp } from "./client-app";
import { ClientDesktop } from "./desktop/desktop";
import { MobileApp } from "./mobile/mobile-app";
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
  appearance?: WorkspaceAppearance;
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
  const [remoteAppearance, setRemoteAppearance] =
    useState<WorkspaceAppearance | null>(null);
  const [remoteLogoUrl, setRemoteLogoUrl] = useState<string | null>(null);

  // Card w2-c2: the signed-in client's own workspace appearance through the
  // one client-scoped GET. `logoUrl` arrives already minted server-side: a
  // client can never mint a workspace logo through the media GET itself
  // (own profile prefix only). A failed read leaves both null and every
  // field falls back to the local store below.
  useEffect(() => {
    if (!own?.workspaceId) return;
    let live = true;
    fetchWorkspaceAppearance(own.workspaceId)
      .then((wire) => {
        if (!live) return;
        setRemoteAppearance(wire.appearance);
        setRemoteLogoUrl(wire.logoUrl);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [own?.workspaceId]);

  const appearance: Appearance = {
    mode:
      remoteAppearance?.mode ??
      session?.appearance?.mode ??
      state.preferences.mode,
    accent:
      remoteAppearance?.accent ??
      session?.appearance?.accent ??
      state.preferences.accent,
    font: remoteAppearance?.font ?? session?.appearance?.font ?? "sans",
    density:
      remoteAppearance?.density ??
      session?.appearance?.density ??
      "comfortable",
    logoMediaId:
      remoteAppearance?.logoMediaId ?? session?.appearance?.logoMediaId ?? null,
  };
  const logoUrl = remoteAppearance?.logoMediaId
    ? remoteLogoUrl
    : (state.preferences.logo?.dataUrl ?? null);
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
