"use client";
import {
  CalendarDays,
  Check,
  Layers3,
  MessageCircle,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Sun,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { type CSSProperties, useState } from "react";
import type { CanvasRole } from "@/lib/auth/viewer";
import { themeVariables } from "@/lib/canvas/ethereal-appearance";
import { accentControlColors } from "./accent-contrast";
import { AppearanceControls } from "./appearance-controls";
import { CheckInsWorkspace } from "./check-ins";
import { ClientsWorkspace } from "./clients";
import { MessagesWorkspace } from "./messages";
import { type Section, seedState, unreadCount } from "./model";
import { NotesWorkspace } from "./notes";
import { IndividualPlanWorkspace } from "./plans/workspace";
import { CoachProvider, useCoach } from "./store";
import { TemplateEditor, TemplateLibrary } from "./templates";
import { Button, Dialog, IconButton, Toggle, Transition } from "./ui";
import "./coach.css";

const NAV = [
  { id: "clients", label: "Clients", Icon: Users },
  { id: "templates", label: "Templates", Icon: Layers3 },
  { id: "check-ins", label: "Check-ins", Icon: CalendarDays },
  { id: "messages", label: "Messages", Icon: MessageCircle },
  { id: "notes", label: "Notes & to-dos", Icon: NotebookPen },
] as const;
export type CoachAccount = {
  name: string;
  initials: string;
  role: CanvasRole;
  workspaceName: string;
};
export function CoachApp({ viewer }: { viewer: CoachAccount }) {
  return (
    <CoachProvider>
      <Workspace viewer={viewer} />
    </CoachProvider>
  );
}
function Workspace({ viewer }: { viewer: CoachAccount }) {
  const {
    state,
    setState,
    hydrated,
    storageOk,
    route,
    navigate,
    notice,
    dismiss,
  } = useCoach();
  const [settings, setSettings] = useState(false);
  const selectedClient = state.clients.find((c) => c.id === route.client);
  const pending = state.submissions.filter((s) => !s.response).length;
  const unread = state.preferences.notifications ? unreadCount(state) : 0;
  const theme = themeVariables({
    mode: state.preferences.mode,
    accent: state.preferences.accent,
    font: "sans",
  }) as Record<string, string>;
  const actions = accentControlColors(theme["--accent"]);
  return (
    <div
      className="coach-root"
      data-mode={state.preferences.mode}
      data-sidebar-collapsed={Boolean(state.preferences.sidebarCollapsed)}
      style={
        {
          "--cd-accent": theme["--accent"],
          "--cd-accent-text": theme["--accent-ink"],
          "--cd-accent-contrast": theme["--accent-contrast"],
          "--cd-accent-ring": theme["--accent-ring"],
          "--cd-chart-line": theme["--chart-line"],
          "--cd-action-bg": actions.background,
          "--cd-action-hover": actions.hoverBackground,
          "--cd-action-text": actions.foreground,
        } as CSSProperties
      }
    >
      <a className="cd-skip" href="#coach-main">
        Skip to workspace
      </a>
      <aside className="cd-sidebar">
        <div className="cd-brand">
          {state.preferences.logo ? (
            <span className="cd-brand-logo">
              <Image
                src={state.preferences.logo.dataUrl}
                alt="Workspace logo"
                fill
                unoptimized
                sizes="172px"
                style={{ objectFit: "contain" }}
              />
            </span>
          ) : (
            <>
              <span className="cd-brand-symbol" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="cd-brand-wordmark">
                infinity<span className="cd-brand-period">.</span>
              </span>
            </>
          )}
        </div>
        <div className="cd-workspace-label">{viewer.workspaceName}</div>
        <nav id="coach-navigation" aria-label="Coach workspace">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              aria-current={route.section === id ? "page" : undefined}
              onClick={() => navigate({ section: id as Section })}
            >
              <Icon size={19} />
              <span className="cd-nav-label">{label}</span>
              {(id === "check-ins" ? pending : id === "messages" ? unread : 0) >
                0 && <b>{id === "check-ins" ? pending : unread}</b>}
            </button>
          ))}
        </nav>
        <div className="cd-sidebar-bottom">
          <button
            type="button"
            className="cd-account"
            aria-label={`Workspace preferences for ${viewer.name}`}
            title={`Workspace preferences for ${viewer.name}`}
            onClick={() => setSettings(true)}
          >
            <span className="cd-account-avatar">{viewer.initials}</span>
            <span className="cd-account-copy">
              <strong>{viewer.name}</strong>
              <small>{viewer.role}</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <div className="cd-workspace">
        <header className="cd-utility-header">
          <div className="cd-breadcrumb">
            <IconButton
              label={
                state.preferences.sidebarCollapsed
                  ? "Expand sidebar"
                  : "Collapse sidebar"
              }
              className="cd-icon-button cd-sidebar-toggle"
              aria-expanded={!state.preferences.sidebarCollapsed}
              aria-controls="coach-navigation"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  preferences: {
                    ...s.preferences,
                    sidebarCollapsed: !s.preferences.sidebarCollapsed,
                  },
                }))
              }
            >
              {state.preferences.sidebarCollapsed ? (
                <PanelLeftOpen size={17} />
              ) : (
                <PanelLeftClose size={17} />
              )}
            </IconButton>
            {state.preferences.logo && (
              <span className="cd-mobile-logo">
                <Image
                  src={state.preferences.logo.dataUrl}
                  alt="Workspace logo"
                  fill
                  unoptimized
                  sizes="72px"
                  style={{ objectFit: "contain" }}
                />
              </span>
            )}
            <span className="cd-breadcrumb-workspace">Workspace</span>
            <span className="cd-breadcrumb-workspace">/</span>
            <strong>{NAV.find((n) => n.id === route.section)?.label}</strong>
            {route.editor && (
              <>
                <span className="cd-breadcrumb-editor">/</span>
                <span className="cd-breadcrumb-editor">Editor</span>
              </>
            )}
          </div>
          <div className="cd-utility-actions">
            <span className="cd-local-indicator">
              {storageOk ? "Local demo" : "Session only · storage unavailable"}
            </span>
            <IconButton
              label={
                state.preferences.mode === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              onClick={() =>
                setState((s) => ({
                  ...s,
                  preferences: {
                    ...s.preferences,
                    mode: s.preferences.mode === "dark" ? "light" : "dark",
                  },
                }))
              }
            >
              {state.preferences.mode === "dark" ? (
                <Sun size={17} />
              ) : (
                <Moon size={17} />
              )}
            </IconButton>
            <IconButton
              label="Workspace preferences"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={17} />
            </IconButton>
          </div>
        </header>
        <main
          id="coach-main"
          tabIndex={-1}
          className={`cd-main cd-main-${route.section}`}
          aria-label={NAV.find((n) => n.id === route.section)?.label}
        >
          {!hydrated ? (
            <div className="cd-loading" role="status">
              Opening your workspace…
            </div>
          ) : (
            <Transition
              key={`${route.section}-${route.editor ?? ""}-${route.review ?? ""}-${route.section === "clients" || route.section === "check-ins" ? (route.client ?? "") : ""}`}
            >
              {route.section === "templates" ? (
                route.editor ? (
                  <TemplateEditor id={route.editor} />
                ) : (
                  <TemplateLibrary />
                )
              ) : route.section === "clients" ? (
                route.plan && route.client && selectedClient ? (
                  <IndividualPlanWorkspace client={selectedClient} />
                ) : (
                  <ClientsWorkspace />
                )
              ) : route.section === "check-ins" ? (
                <CheckInsWorkspace />
              ) : route.section === "notes" ? (
                <NotesWorkspace />
              ) : (
                <MessagesWorkspace />
              )}
            </Transition>
          )}
        </main>
      </div>
      {notice && (
        <div className="cd-toast" role="status">
          <Check size={16} />
          <span>{notice.text}</span>
          {notice.undo && (
            <Button
              onClick={() => {
                notice.undo?.();
                dismiss();
              }}
            >
              Undo
            </Button>
          )}
          <IconButton label="Dismiss notification" onClick={dismiss}>
            <X size={15} />
          </IconButton>
        </div>
      )}
      {settings && (
        <Dialog
          title="Workspace preferences"
          onClose={() => setSettings(false)}
        >
          <AppearanceControls
            preferences={state.preferences}
            onChange={(patch) =>
              setState((s) => ({
                ...s,
                preferences: { ...s.preferences, ...patch },
              }))
            }
          />
          <h3>Availability</h3>
          <label className="cd-field">
            Shown in your workspace
            <input
              value={state.preferences.availability}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  preferences: {
                    ...s.preferences,
                    availability: e.target.value,
                  },
                }))
              }
            />
          </label>
          <h3>In-app notification preferences</h3>
          <Toggle
            label="Unread message attention"
            checked={state.preferences.notifications}
            onChange={(notifications) =>
              setState((s) => ({
                ...s,
                preferences: { ...s.preferences, notifications },
              }))
            }
          />
          <Toggle
            label="Permitted priority message attention"
            checked={state.preferences.priorityNotifications}
            onChange={(priorityNotifications) =>
              setState((s) => ({
                ...s,
                preferences: { ...s.preferences, priorityNotifications },
              }))
            }
          />
          <p className="cd-caption">
            Preferences are saved locally. System notifications are not used.
          </p>
          <details className="cd-reset">
            <summary>Reset this mockup</summary>
            <p>Resets this coach workspace only.</p>
            <Button
              onClick={() => {
                if (
                  window.confirm(
                    "Reset this coach workspace? Local templates, messages and feedback will return to their starting examples.",
                  )
                ) {
                  setState(seedState());
                  setSettings(false);
                  navigate({ section: "templates" });
                }
              }}
            >
              Reset coach workspace
            </Button>
          </details>
          <div className="cd-dialog-actions">
            <Button primary onClick={() => setSettings(false)}>
              Done
            </Button>
            <form action="/logout" method="post" style={{ order: -1 }}>
              <Button type="submit">Sign out</Button>
            </form>
          </div>
        </Dialog>
      )}
    </div>
  );
}
