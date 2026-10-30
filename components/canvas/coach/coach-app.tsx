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
import { useEffect, useRef, useState } from "react";
import pkg from "../../../package.json";
import type { CanvasRole } from "@/lib/auth/viewer";
import { Input as Vari8Input } from "../vari8/components";
import { AppearanceControls } from "./appearance-controls";
import { CheckInsWorkspace } from "./check-ins";
import { ClientsWorkspace } from "./clients";
import { coachThemeStyle } from "./coach-theme";
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
  /** PR-MEDIA: workspace the media API anchors uploads to. */
  workspaceId?: string;
  workspaceName: string;
};
export function CoachApp({ viewer }: { viewer: CoachAccount }) {
  return (
    <CoachProvider workspaceId={viewer.workspaceId}>
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
    demo,
    route,
    navigate,
    notice,
    dismiss,
    toast,
  } = useCoach();
  const [settings, setSettings] = useState(false);
  const notifiedReminders = useRef(new Set<string>());
  useEffect(() => {
    if (!hydrated) return;
    const checkReminders = () => {
      const reminders = [
        ...(state.coachTodos ?? []).map((todo) => ({
          ...todo,
          clientId: todo.clientId ?? "workspace",
        })),
        ...state.clients.flatMap((client) =>
          client.coachTasks.map((todo) => ({
            ...todo,
            reminderAt:
              "reminderAt" in todo && typeof todo.reminderAt === "string"
                ? todo.reminderAt
                : undefined,
            clientId: client.id,
          })),
        ),
      ];
      const now = Date.now();
      const due = reminders.find((todo) => {
        const key = `${todo.clientId}:${todo.id}`;
        return (
          !todo.complete &&
          todo.reminderAt &&
          Date.parse(todo.reminderAt) <= now &&
          !notifiedReminders.current.has(key)
        );
      });
      if (!due) return;
      notifiedReminders.current.add(`${due.clientId}:${due.id}`);
      toast(`Reminder: ${due.title}`);
    };
    checkReminders();
    const interval = window.setInterval(checkReminders, 30_000);
    return () => window.clearInterval(interval);
  }, [hydrated, state.coachTodos, state.clients, toast]);
  const selectedClient = state.clients.find((c) => c.id === route.client);
  const pending = state.submissions.filter((s) => !s.response).length;
  const unread = state.preferences.notifications ? unreadCount(state) : 0;
  return (
    <div
      className="coach-root v8-theme"
      data-mode={state.preferences.mode}
      data-sidebar-collapsed={Boolean(state.preferences.sidebarCollapsed)}
      style={coachThemeStyle(state.preferences)}
    >
      <a className="cd-skip" href="#coach-main">
        Skip to workspace
      </a>
      <aside className="cd-sidebar">
        <IconButton
          label={
            state.preferences.sidebarCollapsed
              ? "Expand sidebar"
              : "Collapse sidebar"
          }
          className="cd-sidebar-toggle"
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
        <div
          className="cd-workspace-label"
          title={viewer.workspaceName}
          aria-label={viewer.workspaceName}
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {viewer.workspaceName}
        </div>
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
              size="sm"
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
          <Vari8Input
            label="Shown in your workspace"
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
          <p className="cd-caption">App version {pkg.version}</p>
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
                  setState(seedState({ demo }));
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
