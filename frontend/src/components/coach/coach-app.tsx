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
import { useEffect, useRef } from "react";
import { CheckInsWorkspace } from "./check-ins";
import { ClientsWorkspace } from "./clients";
import {
  coachMode,
  coachThemeStyle,
  logoForMode,
  useSystemMode,
} from "./coach-theme";
import { MessagesWorkspace } from "./messages";
import { type Section, unreadCount } from "./model";
import { NotesWorkspace } from "./notes";
import { IndividualPlanWorkspace } from "./plans/workspace";
import { DEFAULT_COACH_NAME, DEFAULT_COACH_TITLE } from "./settings/profile";
import { SettingsWorkspace } from "./settings/settings";
import {
  resolveSettingsTab,
  settingsTabLabel,
  useNarrowSettings,
} from "./settings/shell";
import { CoachProvider, useCoach } from "./store";
import { TemplateEditor, TemplateLibrary } from "./templates";
import { Button, IconButton, Transition } from "./ui";
import "./coach.css";

const NAV = [
  { id: "clients", label: "Clients", Icon: Users },
  { id: "templates", label: "Templates", Icon: Layers3 },
  { id: "check-ins", label: "Check-ins", Icon: CalendarDays },
  { id: "messages", label: "Messages", Icon: MessageCircle },
  { id: "notes", label: "Notes & to-dos", Icon: NotebookPen },
] as const;
export function CoachApp() {
  return (
    <CoachProvider>
      <Workspace />
    </CoachProvider>
  );
}
function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}
function Workspace() {
  const {
    state,
    setState,
    hydrated,
    storageOk,
    route,
    navigate,
    notice,
    dismiss,
    toast,
  } = useCoach();
  const systemMode = useSystemMode();
  const resolvedMode = coachMode(state.preferences, systemMode);
  const profileName = state.preferences.profile?.name ?? DEFAULT_COACH_NAME;
  const profileTitle = state.preferences.profile?.title ?? DEFAULT_COACH_TITLE;
  const profilePhoto = state.preferences.profile?.photo;
  const brandLogo = logoForMode(state.preferences, resolvedMode);
  const brandName = state.preferences.brand?.name || "infinity.";
  const notifiedReminders = useRef(new Set<string>());
  useEffect(() => {
    if (!hydrated || state.preferences.notify?.taskReminders === false) return;
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
  }, [
    hydrated,
    state.coachTodos,
    state.clients,
    state.preferences.notify?.taskReminders,
    toast,
  ]);
  const selectedClient = state.clients.find((c) => route.client === c.id);
  const pending =
    state.preferences.notify?.checkIns === false
      ? 0
      : state.submissions.filter((s) => !s.response).length;
  const unread = state.preferences.notifications ? unreadCount(state) : 0;
  const narrow = useNarrowSettings();
  // The breadcrumb names the category that is actually rendered: the
  // requested tab, Profile on other layouts, or nothing on the phone's
  // category index.
  const settingsTab =
    route.section === "settings" ? resolveSettingsTab(route.tab, narrow) : null;
  return (
    <div
      className="coach-root v8-theme"
      data-mode={resolvedMode}
      data-sidebar-collapsed={Boolean(state.preferences.sidebarCollapsed)}
      style={coachThemeStyle({
        ...state.preferences,
        mode: resolvedMode,
      })}
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
          {brandLogo ? (
            <span className="cd-brand-logo">
              <Image
                src={brandLogo.dataUrl}
                alt={`${brandName} logo`}
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
              <span className="cd-brand-wordmark">{brandName}</span>
            </>
          )}
        </div>
        <div className="cd-workspace-label">COACH WORKSPACE</div>
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
            aria-label={`Settings for ${profileName}`}
            title={`Settings for ${profileName}`}
            aria-current={route.section === "settings" ? "page" : undefined}
            onClick={() => navigate({ section: "settings" })}
          >
            <span className="cd-account-avatar">
              {profilePhoto ? (
                // biome-ignore lint/performance/noImgElement: demo image previews are dynamic data srcs
                <img src={profilePhoto.dataUrl} alt="" />
              ) : (
                initialsOf(profileName)
              )}
            </span>
            <span className="cd-account-copy">
              <strong>{profileName}</strong>
              <small>{profileTitle}</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <div className="cd-workspace">
        <header className="cd-utility-header">
          <div className="cd-breadcrumb">
            {brandLogo && (
              <span className="cd-mobile-logo">
                <Image
                  src={brandLogo.dataUrl}
                  alt={`${brandName} logo`}
                  fill
                  unoptimized
                  sizes="72px"
                  style={{ objectFit: "contain" }}
                />
              </span>
            )}
            <span className="cd-breadcrumb-workspace">Workspace</span>
            <span className="cd-breadcrumb-workspace">/</span>
            <strong>
              {route.section === "settings"
                ? "Settings"
                : NAV.find((n) => n.id === route.section)?.label}
            </strong>
            {route.section === "settings" && settingsTab && (
              <>
                <span className="cd-breadcrumb-editor">/</span>
                <span className="cd-breadcrumb-editor">
                  {settingsTabLabel(settingsTab)}
                </span>
              </>
            )}
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
                resolvedMode === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              onClick={() =>
                setState((s) => ({
                  ...s,
                  preferences: {
                    ...s.preferences,
                    followSystemMode: false,
                    mode: resolvedMode === "dark" ? "light" : "dark",
                  },
                }))
              }
            >
              {resolvedMode === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </IconButton>
            <IconButton
              label="Workspace settings"
              aria-current={route.section === "settings" ? "page" : undefined}
              onClick={() => navigate({ section: "settings" })}
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
              ) : route.section === "settings" ? (
                <SettingsWorkspace />
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
    </div>
  );
}
