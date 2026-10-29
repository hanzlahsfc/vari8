"use client";

import { PanelsTopLeft } from "lucide-react";
import { useReducedMotion } from "@/lib/canvas/reduced-motion";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppearanceScreen } from "@/components/canvas/ethereal/appearance-views";
import { DashboardBuilder } from "@/components/canvas/ethereal/builder/dashboard-builder";
import { ClientTracker } from "@/components/canvas/ethereal/client-tracker/client-tracker";
import { ClientsWorkspace } from "@/components/canvas/ethereal/clients/clients-workspace";
import { MealplanWorkspace } from "@/components/canvas/ethereal/mealplan/mealplan-workspace";
import { AppearanceProvider } from "@/lib/canvas/ethereal-appearance";

type StudioPage =
  | "appearance"
  | "dashboard"
  | "tracker"
  | "clients"
  | "mealplan";
const pageNames: Record<StudioPage, string> = {
  dashboard: "Dashboard",
  appearance: "Appearance",
  tracker: "Tracker",
  clients: "Clients",
  mealplan: "Meal plans",
};

function pageFromHash(): StudioPage {
  if (window.location.hash === "#mealplan") return "mealplan";
  if (window.location.hash.startsWith("#clients")) return "clients";
  return window.location.hash === "#tracker"
    ? "tracker"
    : ["#appearance", "#components"].includes(window.location.hash)
      ? "appearance"
      : "dashboard";
}

function ComponentStudio() {
  const [page, setPage] = useState<StudioPage>("dashboard");
  const [clientId, setClientId] = useState<string | null>(null);
  const content = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const readLocation = () => {
      const next = pageFromHash();
      setPage(next);
      setClientId(
        next === "clients" ? window.location.hash.split("/")[1] || null : null,
      );
      if (next !== "clients" && window.location.hash !== `#${next}`) {
        window.history.replaceState(null, "", `#${next}`);
      }
    };
    readLocation();
    window.addEventListener("hashchange", readLocation);
    window.addEventListener("popstate", readLocation);
    return () => {
      window.removeEventListener("hashchange", readLocation);
      window.removeEventListener("popstate", readLocation);
    };
  }, []);

  const navigate = useCallback((next: StudioPage) => {
    setPage(next);
    setClientId(null);
    if (window.location.hash !== `#${next}`) {
      window.history.pushState(null, "", `#${next}`);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      content.current?.focus({ preventScroll: true }),
    );
  }, []);

  const selectClient = useCallback((id: string | null) => {
    setClientId(id);
    const hash = id ? `#clients/${id}` : "#clients";
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      content.current?.focus({ preventScroll: true }),
    );
  }, []);

  return (
    <div className="eg-shell">
      <button
        className="eg-skip-link"
        type="button"
        onClick={() => content.current?.focus()}
      >
        Skip to content
      </button>

      <header className="eg-island">
        <button
          className="eg-wordmark"
          type="button"
          onClick={() => navigate("appearance")}
        >
          <span className="eg-mark" aria-hidden="true">
            <PanelsTopLeft size={18} strokeWidth={1.25} />
          </span>
          <span>Coaching UI</span>
        </button>

        <nav className="eg-segments" aria-label="Studio pages">
          {(
            [
              "appearance",
              "dashboard",
              "tracker",
              "clients",
              "mealplan",
            ] as const
          ).map((item) => (
            <motion.button
              key={item}
              type="button"
              className="eg-segment"
              aria-pressed={page === item}
              data-active={page === item}
              data-tracker-tab={item === "tracker" ? "" : undefined}
              onClick={() => navigate(item)}
              whileTap={reduceMotion ? undefined : { scale: 0.975 }}
              transition={{ type: "spring", bounce: 0, duration: 0.25 }}
            >
              {pageNames[item]}
            </motion.button>
          ))}
        </nav>
      </header>

      <main
        ref={content}
        tabIndex={-1}
        id="eg-main"
        className="eg-content"
        data-page={page}
        aria-label={pageNames[page]}
      >
        {page === "dashboard" && <DashboardBuilder />}
        {page === "tracker" && <ClientTracker />}
        {page === "mealplan" && <MealplanWorkspace />}
        {page === "clients" && (
          <ClientsWorkspace clientId={clientId} onSelectClient={selectClient} />
        )}
        <motion.div
          hidden={page !== "appearance"}
          initial={reduceMotion ? false : { opacity: 0.72, y: 7 }}
          animate={
            page === "appearance"
              ? { opacity: 1, y: 0 }
              : { opacity: 0.72, y: 7 }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", bounce: 0, duration: 0.34 }
          }
        >
          <AppearanceScreen />
        </motion.div>

        <footer className="eg-footer">
          <span>Ethereal edition</span>
          <span>All names and figures are illustrative.</span>
        </footer>
      </main>
    </div>
  );
}

export function EtherealApp() {
  return (
    <AppearanceProvider>
      <ComponentStudio />
    </AppearanceProvider>
  );
}

export const CoachingApp = EtherealApp;
