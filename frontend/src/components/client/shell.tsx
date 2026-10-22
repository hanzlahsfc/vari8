"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode, useState } from "react";
import {
  Button,
  Card,
  Navigation,
  Status,
} from "@/components/vari8/components";
import { PageHeader } from "@/components/vari8/layouts";
import { vari8Theme } from "@/lib/vari8-theme";
import type { ParsedDemo } from "./demo/state";
import { DemoStoreProvider } from "./demo/store";
import "./client.css";

const clientTheme = vari8Theme({ mode: "dark", accent: "#8C8C8C" });
const clientThemeStyle = clientTheme as CSSProperties;

export const clientNavItems = [
  { id: "home", label: "Home", href: "/client" },
  { id: "tracker", label: "Tracker", href: "/client/tracker" },
  { id: "training", label: "Training", href: "/client/training" },
  { id: "logbook", label: "Logbook", href: "/client/logbook" },
  { id: "nutrition", label: "Nutrition", href: "/client/nutrition" },
  { id: "messages", label: "Messages", href: "/client/messages" },
  { id: "tasks", label: "Tasks", href: "/client/tasks" },
  { id: "photos", label: "Photos", href: "/client/photos" },
  { id: "supplements", label: "Supplements", href: "/client/supplements" },
  { id: "check-in", label: "Check-in", href: "/client/check-in" },
  { id: "settings", label: "Settings", href: "/client/settings" },
];

export function ClientShell({
  screen,
  demo,
  children,
}: {
  screen: string;
  demo: ParsedDemo;
  children: ReactNode;
}) {
  const router = useRouter();
  const hrefFor = (id: string) =>
    clientNavItems.find((item) => item.id === id)?.href ?? "/client";
  return (
    <DemoStoreProvider mode={demo.mode}>
      <div
        className="client-root v8-theme"
        data-mode="dark"
        style={clientThemeStyle}
      >
        <aside className="client-side">
          <Link className="client-brand" href="/client">
            Vari8 <span>client demo</span>
          </Link>
          <Navigation
            label="Client app"
            activeId={screen}
            items={clientNavItems.map(({ id, label }) => ({ id, label }))}
            onNavigate={(id) => router.push(hrefFor(id))}
          />
          <p className="client-state-line">Demo state: {demo.value}</p>
        </aside>
        <main className="client-main">{children}</main>
      </div>
    </DemoStoreProvider>
  );
}

export function ClientScreen({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="client-screen" aria-label={title}>
      <PageHeader title={title} description={description} width="wide" />
      {children}
    </section>
  );
}

export function DemoGate({
  demo,
  empty,
  children,
}: {
  demo: ParsedDemo;
  empty: ReactNode;
  children: ReactNode;
}) {
  const [recovered, setRecovered] = useState(false);
  if (demo.mode === "loading") {
    return (
      <div className="client-loading" role="status">
        <div className="client-loading-bar" />
        <div className="client-loading-bar" />
        <div className="client-loading-bar client-loading-bar--short" />
      </div>
    );
  }
  if (demo.mode === "error" && !recovered) {
    return (
      <Card className="client-gate">
        <Status tone="danger">Error</Status>
        <p>The demo data failed to load. Nothing was read or written.</p>
        <div>
          <Button onClick={() => setRecovered(true)}>Retry</Button>
        </div>
      </Card>
    );
  }
  if (demo.mode === "empty") {
    return (
      <Card className="client-gate">
        <Status>Empty</Status>
        <p>{empty}</p>
      </Card>
    );
  }
  return children;
}
