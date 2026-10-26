"use client";

import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Flag,
  MessageCircle,
  Search,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Input, SegmentedControl, Select } from "@/components/canvas/vari8/components";
import { useReducedMotion } from "@/lib/canvas/reduced-motion";
import {
  attentionCount,
  formatClientDate,
  needsAttention,
  type WorkspaceClient,
} from "./model";
import { matchingSearch } from "./roster-search";
import "./client-roster.css";

type RosterFilter = "all" | "attention" | "unread";
type RosterSort = "next-check-in" | "name" | "attention";
type RosterView = "cards" | "list";

type ClientRosterProps = {
  clients: WorkspaceClient[];
  onOpenClient: (id: string) => void;
};

function initials(client: WorkspaceClient) {
  return (
    client.initials ||
    client.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
  );
}

function isClientDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function CheckInSignals({ client }: { client: WorkspaceClient }) {
  const received = client.checkIns.filter(
    (checkIn) => checkIn.status === "awaiting feedback",
  ).length;

  return (
    <div className="cr-signals">
      {received > 0 && (
        <span className="cr-signal cr-signal-received">
          <MessageCircle size={14} aria-hidden="true" />
          {received} received · awaiting feedback
        </span>
      )}
      {client.overdueTaskCount > 0 && (
        <span className="cr-signal cr-signal-overdue">
          <AlertCircle size={14} aria-hidden="true" />
          {client.overdueTaskCount} overdue task
          {client.overdueTaskCount === 1 ? "" : "s"}
        </span>
      )}
      {client.checkInStatus === "overdue" && (
        <span className="cr-signal cr-signal-overdue">
          <CalendarDays size={14} aria-hidden="true" />
          Check-in due
          {isClientDate(client.nextCheckIn)
            ? ` ${formatClientDate(client.nextCheckIn)}`
            : ""}
        </span>
      )}
      {client.checkInStatus !== "overdue" &&
        isClientDate(client.nextCheckIn) && (
          <span className="cr-signal cr-signal-upcoming">
            <CalendarDays size={14} aria-hidden="true" />
            Next check-in {formatClientDate(client.nextCheckIn)}
          </span>
        )}
      {client.checkInStatus !== "overdue" &&
        received === 0 &&
        client.overdueTaskCount === 0 &&
        !isClientDate(client.nextCheckIn) && (
          <span className="cr-signal cr-signal-quiet">Not scheduled</span>
        )}
    </div>
  );
}

function ClientCounts({ client }: { client: WorkspaceClient }) {
  const pendingTasks = client.clientTasks.filter(
    (task) => task.status === "open",
  ).length;

  return (
    <div className="cr-counts">
      {client.unreadCount > 0 ? (
        <span
          title={`${client.unreadCount} unread message${client.unreadCount === 1 ? "" : "s"}`}
        >
          <MessageCircle size={14} aria-hidden="true" />
          {client.unreadCount} unread
        </span>
      ) : (
        <span>
          <MessageCircle size={14} aria-hidden="true" />
          No unread messages
        </span>
      )}
      {pendingTasks > 0 && (
        <span
          title={`${pendingTasks} pending task${pendingTasks === 1 ? "" : "s"}`}
        >
          <ClipboardCheck size={14} aria-hidden="true" />
          {pendingTasks} pending
        </span>
      )}
      {client.trainingFlags > 0 && (
        <span
          title={`${client.trainingFlags} training flag${client.trainingFlags === 1 ? "" : "s"}`}
        >
          <Flag size={14} aria-hidden="true" />
          {client.trainingFlags} flag{client.trainingFlags === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function attentionReasons(client: WorkspaceClient) {
  const reasons: string[] = [];
  const pendingTasks = client.clientTasks.filter(
    (task) => task.status === "open",
  ).length;

  const hasCheckInAwaitingFeedback = client.checkIns.some(
    (checkIn) => checkIn.status === "awaiting feedback",
  );
  if (hasCheckInAwaitingFeedback) {
    reasons.push("check-in awaiting feedback");
  } else if (client.checkInStatus === "overdue") {
    reasons.push("check-in overdue");
  }
  if (client.unreadCount > 0) {
    reasons.push(
      `${client.unreadCount} unread message${client.unreadCount === 1 ? "" : "s"}`,
    );
  }
  const overdueTasks = client.clientTasks.filter(
    (task) => task.status === "overdue",
  ).length;
  if (overdueTasks > 0) {
    reasons.push(
      `${overdueTasks} overdue task${overdueTasks === 1 ? "" : "s"}`,
    );
  }
  if (pendingTasks > 0) {
    reasons.push(
      `${pendingTasks} pending task${pendingTasks === 1 ? "" : "s"}`,
    );
  }
  if (client.trainingFlags > 0) {
    reasons.push(
      `${client.trainingFlags} training flag${client.trainingFlags === 1 ? "" : "s"}`,
    );
  }
  return reasons;
}

function attentionPriority(client: WorkspaceClient) {
  if (client.checkIns.some((checkIn) => checkIn.status === "awaiting feedback"))
    return 5;
  if (client.checkInStatus === "overdue") return 4;
  if (client.clientTasks.some((task) => task.status === "overdue")) return 3;
  if (client.unreadCount > 0) return 2;
  if (client.trainingFlags > 0) return 1;
  return 0;
}

export function ClientRoster({ clients, onOpenClient }: ClientRosterProps) {
  const reduceMotion = useReducedMotion();
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [sort, setSort] = useState<RosterSort>("next-check-in");
  const [view, setView] = useState<RosterView>("cards");
  const [label, setLabel] = useState("all");
  const [query, setQuery] = useState("");

  const activeClients = useMemo(
    () => clients.filter((client) => !client.archived),
    [clients],
  );
  const attentionTotal = activeClients.filter(needsAttention).length;
  const unreadTotal = activeClients.filter(
    (client) => client.unreadCount > 0,
  ).length;
  const labels = useMemo(
    () =>
      [
        ...new Set(activeClients.map((client) => client.label).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b)),
    [activeClients],
  );

  const visibleClients = useMemo(() => {
    const filtered = activeClients.filter((client) => {
      if (!matchingSearch(client, query)) return false;
      if (label !== "all" && client.label !== label) return false;
      if (filter === "attention" && !needsAttention(client)) return false;
      if (filter === "unread" && client.unreadCount === 0) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "attention") {
        return (
          attentionPriority(b) - attentionPriority(a) ||
          Number(needsAttention(b)) - Number(needsAttention(a)) ||
          attentionCount(b) - attentionCount(a) ||
          a.name.localeCompare(b.name)
        );
      }
      return (
        (isClientDate(a.nextCheckIn)
          ? a.nextCheckIn
          : "9999-12-31"
        ).localeCompare(
          isClientDate(b.nextCheckIn) ? b.nextCheckIn : "9999-12-31",
        ) || a.name.localeCompare(b.name)
      );
    });
  }, [activeClients, filter, label, query, sort]);

  const updateFilter = (next: RosterFilter) => {
    setFilter(next);
  };
  const updateLabel = (next: string) => {
    setLabel(next);
  };

  const updateQuery = (next: string) => {
    setQuery(next);
  };

  const updateSort = (next: RosterSort) => {
    setSort(next);
  };

  return (
    <section className="cr-root" aria-labelledby="cr-title">
      <header className="cr-heading">
        <div>
          <h1 id="cr-title">Clients</h1>
          <p>
            <strong>{activeClients.length}</strong> active clients{" "}
            <span className="cr-heading-separator" aria-hidden="true">
              ·
            </span>{" "}
            Demo workspace · 5 Oct 2026
          </p>
        </div>
        <div className="cr-heading-note" aria-live="polite">
          <span className="cr-heading-note-label">Showing</span>
          <span className="cr-heading-note-value">
            {visibleClients.length} athletes
          </span>
        </div>
      </header>

      <div className="cr-controls-panel">
        <div className="cr-filter-bar">
          <SegmentedControl
            label="Filter clients"
            value={filter}
            onValueChange={(value) => updateFilter(value as RosterFilter)}
            className="cr-filter-tabs"
            options={[
              { value: "all", label: `All (${activeClients.length})` },
              {
                value: "attention",
                label: `Needs attention (${attentionTotal})`,
              },
              { value: "unread", label: `Unread (${unreadTotal})` },
            ]}
          />

          <div className="cr-controls">
            <div className="cr-search">
              <Search size={16} aria-hidden="true" />
              <Input
                label="Search clients"
                type="search"
                value={query}
                onChange={(event) => updateQuery(event.currentTarget.value)}
                placeholder="Search clients"
              />
            </div>
            <div className="cr-select-label">
              <Select
                label="Client label"
                value={label}
                onValueChange={updateLabel}
                options={[
                  { value: "all", label: "All labels" },
                  ...labels.map((item) => ({ value: item, label: item })),
                ]}
              />
            </div>
            <div className="cr-select-label cr-sort-label">
              <Select
                label="Sort clients"
                value={sort}
                onValueChange={(value) => updateSort(value as RosterSort)}
                options={[
                  { value: "next-check-in", label: "Next check-in" },
                  { value: "attention", label: "Attention first" },
                  { value: "name", label: "Name" },
                ]}
              />
            </div>
            <SegmentedControl
              label="Client display"
              value={view}
              onValueChange={(value) => setView(value as RosterView)}
              className="cr-view-toggle"
              options={[
                { value: "cards", label: "Cards" },
                { value: "list", label: "List" },
              ]}
            />
          </div>
        </div>
      </div>

      {visibleClients.length === 0 ? (
        <div className="cr-empty" role="status">
          <div className="cr-empty-mark">
            <Search size={19} aria-hidden="true" />
          </div>
          <h2>No clients found</h2>
          <p>Try a different search or clear the selected filters.</p>
          <button
            className="cr-button cr-button-quiet"
            type="button"
            onClick={() => {
              setQuery("");
              setLabel("all");
              setFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <motion.div
          className={`cr-client-grid${view === "list" ? " is-list" : ""}`}
          data-view={view}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", bounce: 0, duration: 0.32 }
          }
        >
          {visibleClients.map((client) => {
            const reasons = needsAttention(client)
              ? attentionReasons(client)
              : [];
            const attentionId = `cr-attention-${client.id}`;

            return (
              <motion.a
                key={client.id}
                className="cr-client"
                href={`#clients/${encodeURIComponent(client.id)}`}
                aria-label={`Open ${client.name} profile`}
                aria-describedby={reasons.length > 0 ? attentionId : undefined}
                whileTap={reduceMotion ? undefined : { scale: 0.992 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 520, damping: 34 }
                }
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onOpenClient(client.id);
                }}
              >
                <div className="cr-client-core">
                  <div className="cr-client-main">
                    <div className="cr-client-identity">
                      <div className="cr-identity">
                        <div className="cr-avatar" aria-hidden="true">
                          {initials(client)}
                        </div>
                        <div className="cr-name-block">
                          <span className="cr-client-name">{client.name}</span>
                          <div className="cr-client-meta">
                            <span>{client.label}</span>
                          </div>
                        </div>
                      </div>
                      <div
                        className="cr-attention-slot"
                        aria-hidden={reasons.length === 0}
                      >
                        {reasons.length > 0 && (
                          <span className="cr-attention-label">
                            Needs attention
                          </span>
                        )}
                      </div>
                      {reasons.length > 0 && (
                        <span className="cr-visually-hidden" id={attentionId}>
                          Needs attention: {reasons.join(", ")}.
                        </span>
                      )}
                    </div>
                    <div className="cr-phase-row">
                      <span>{client.phase}</span>
                      {client.week && <span>Week {client.week}</span>}
                    </div>
                    <CheckInSignals client={client} />
                    <ClientCounts client={client} />
                  </div>
                  <div className="cr-client-footer">
                    <span>
                      {client.lastCheckIn
                        ? `Last check-in ${formatClientDate(client.lastCheckIn)}`
                        : "No check-in yet"}
                    </span>
                    <span className="cr-open-link" aria-hidden="true">
                      Open profile <ChevronRight size={15} aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </motion.a>
            );
          })}
        </motion.div>
      )}
    </section>
  );
}
