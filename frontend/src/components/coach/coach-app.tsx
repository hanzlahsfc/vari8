"use client";
import {
  CalendarDays,
  Check,
  Layers3,
  ListChecks,
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
import { useEffect, useState } from "react";
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
import { localToday } from "./targets/model";
import { TasksWorkspace } from "./tasks";
import {
  dueReminders,
  markRemindersShown,
  snoozeReminder,
  todayCount,
} from "./tasks-model";
import { TemplateEditor, TemplateLibrary } from "./templates";
import { Button, Dialog, IconButton, Toggle, Transition } from "./ui";
import "./coach.css";

const NAV = [
  { id: "clients", label: "Clients", Icon: Users },
  { id: "templates", label: "Templates", Icon: Layers3 },
  { id: "check-ins", label: "Check-ins", Icon: CalendarDays },
  { id: "messages", label: "Messages", Icon: MessageCircle },
  { id: "tasks", label: "Tasks", Icon: ListChecks },
  { id: "notes", label: "Notes", Icon: NotebookPen },
] as const;
export function CoachApp() {
  return (
    <CoachProvider>
      <Workspace />
    </CoachProvider>
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
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const checkReminders = () => {
      const due = dueReminders(state, Date.now());
      if (!due.length) return;
      setState((s) => markRemindersShown(s, due));
      const first = due[0];
      toast(
        due.length === 1
          ? `Reminder: ${first.task.title}`
          : `${due.length} reminders`,
        undefined,
        [
          {
            label: due.length === 1 ? "Open" : "View",
            run: () =>
              navigate(
                due.length === 1
                  ? {
                      section: "tasks",
                      client: first.clientId,
                      task: first.task.id,
                    }
                  : { section: "tasks" },
              ),
          },
          {
            label: "Snooze 1 h",
            run: () =>
              setState((s) =>
                due.reduce(
                  (next, entry) =>
                    snoozeReminder(
                      next,
                      entry,
                      new Date(Date.now() + 60 * 60 * 1000),
                    ),
                  s,
                ),
              ),
          },
        ],
      );
    };
    checkReminders();
    const interval = window.setInterval(checkReminders, 30_000);
    return () => window.clearInterval(interval);
  }, [hydrated, state, setState, toast, navigate]);
  const selectedClient = state.clients.find((c) => c.id === route.client);
  const pending = state.submissions.filter((s) => !s.response).length;
  const unread = state.preferences.notifications ? unreadCount(state) : 0;
  const dueTasks = todayCount(state, localToday());
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
              {(id === "check-ins"
                ? pending
                : id === "messages"
                  ? unread
                  : id === "tasks"
                    ? dueTasks
                    : 0) > 0 && (
                <b>
                  {id === "check-ins"
                    ? pending
                    : id === "messages"
                      ? unread
                      : dueTasks}
                </b>
              )}
            </button>
          ))}
        </nav>
        <div className="cd-sidebar-bottom">
          <button
            type="button"
            className="cd-account"
            aria-label="Workspace preferences for Liliana Mansfeld"
            title="Workspace preferences for Liliana Mansfeld"
            onClick={() => setSettings(true)}
          >
            <span className="cd-account-avatar">LM</span>
            <span className="cd-account-copy">
              <strong>Liliana Mansfeld</strong>
              <small>Coach</small>
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
              ) : route.section === "tasks" ? (
                <TasksWorkspace />
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
          {notice.actions?.map((action) => (
            <Button
              key={action.label}
              size="sm"
              onClick={() => {
                action.run();
                dismiss();
              }}
            >
              {action.label}
            </Button>
          ))}
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
          </div>
        </Dialog>
      )}
    </div>
  );
}
