"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  MessageCircle,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  formatClientDate,
  needsAttention,
  statusLabel,
  type WorkspaceClient,
} from "./model";
import "./client-profile.css";

const PROFILE_TODAY = new Date(Date.UTC(2026, 9, 5));
const CHECK_IN_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type ProfileTab =
  | "overview"
  | "check-ins"
  | "notes-tasks"
  | "messages"
  | "onboarding";

const tabs: { id: ProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "check-ins", label: "Check-ins" },
  { id: "notes-tasks", label: "Notes & tasks" },
  { id: "messages", label: "Messages" },
  { id: "onboarding", label: "Onboarding" },
];

function durationSince(value: string) {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return "";
  const months = Math.max(
    0,
    (PROFILE_TODAY.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      PROFILE_TODAY.getUTCMonth() -
      start.getUTCMonth() -
      (PROFILE_TODAY.getUTCDate() < start.getUTCDate() ? 1 : 0),
  );
  if (months < 1) return "Started recently";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (years) return `${years}y ${remainder}m coaching`;
  return `${months} ${months === 1 ? "month" : "months"} coaching`;
}

function dayFromSchedule(value: string) {
  return CHECK_IN_DAYS.find((day) => value.includes(day)) ?? CHECK_IN_DAYS[0];
}

function setupName(value: string) {
  return value
    .replace(/^Forma\s+/i, "")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function presentationName(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nextCheckIn(day: string, additionalDates: string[]) {
  const targetDay = CHECK_IN_DAYS.indexOf(day);
  const snapshotWeekday = (PROFILE_TODAY.getUTCDay() + 6) % 7;
  const offset = (targetDay - snapshotWeekday + 7) % 7;
  const recurring = new Date(PROFILE_TODAY);
  recurring.setUTCDate(recurring.getUTCDate() + offset);
  const recurringDate = recurring.toISOString().slice(0, 10);
  const snapshotDate = PROFILE_TODAY.toISOString().slice(0, 10);
  const futureExtra = additionalDates
    .filter((date) => date >= snapshotDate)
    .sort()[0];
  return futureExtra && futureExtra < recurringDate
    ? futureExtra
    : recurringDate;
}

function withNextCheckIn(day: string, additionalDates: string[]) {
  return {
    recurringCheckIn: `Every ${day}`,
    additionalCheckInDates: [...additionalDates].sort(),
    nextCheckIn: nextCheckIn(day, additionalDates),
  };
}

export function ClientProfile({
  client,
  onChange,
  onBack,
  onOpenTracker,
}: {
  client: WorkspaceClient;
  onChange: (next: WorkspaceClient) => void;
  onBack: () => void;
  onOpenTracker: () => void;
}) {
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [extraDate, setExtraDate] = useState("");
  const [internalDraft, setInternalDraft] = useState("");
  const [generalDraft, setGeneralDraft] = useState("");
  const [clientTaskDraft, setClientTaskDraft] = useState("");
  const [clientTaskDate, setClientTaskDate] = useState("");
  const [coachTaskDraft, setCoachTaskDraft] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>(
    {},
  );
  const [openCheckIn, setOpenCheckIn] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const reduceMotion = useReducedMotion();

  const completedTasks = client.clientTasks.filter(
    (task) => task.status === "complete",
  ).length;
  const overdueTasks = client.clientTasks.filter(
    (task) => task.status === "overdue",
  ).length;
  const openTasks = client.clientTasks.filter(
    (task) => task.status === "open",
  ).length;
  const openCoachTaskCount = client.coachTasks.filter(
    (task) => !task.complete,
  ).length;
  const awaitingCount = client.checkIns.filter(
    (item) => item.status === "awaiting feedback",
  ).length;
  const duration = durationSince(client.coachingSince);
  const recurringDay = dayFromSchedule(client.recurringCheckIn);

  const orderedCheckIns = useMemo(
    () => [...client.checkIns].sort((a, b) => b.date.localeCompare(a.date)),
    [client.checkIns],
  );
  const currentSubmission =
    orderedCheckIns.find((item) => item.status === "awaiting feedback") ??
    orderedCheckIns[0];

  const patchClient = (patch: Partial<WorkspaceClient>) =>
    onChange({ ...client, ...patch });

  const addDate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!extraDate || client.additionalCheckInDates.includes(extraDate)) return;
    patchClient(
      withNextCheckIn(recurringDay, [
        ...client.additionalCheckInDates,
        extraDate,
      ]),
    );
    setExtraDate("");
    setNotice("Additional check-in date added.");
  };

  const updateRecurringDay = (day: string) => {
    patchClient(withNextCheckIn(day, client.additionalCheckInDates));
  };

  const removeAdditionalDate = (date: string) => {
    patchClient(
      withNextCheckIn(
        recurringDay,
        client.additionalCheckInDates.filter((item) => item !== date),
      ),
    );
  };

  const addNote = (
    kind: "internal" | "general",
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const text =
      kind === "internal" ? internalDraft.trim() : generalDraft.trim();
    if (!text) return;
    const note = { id: `${kind}-${Date.now()}`, text };
    patchClient(
      kind === "internal"
        ? { internalNotes: [note, ...client.internalNotes] }
        : { generalNotes: [note, ...client.generalNotes] },
    );
    kind === "internal" ? setInternalDraft("") : setGeneralDraft("");
    setNotice(
      kind === "internal" ? "Internal note added." : "General note added.",
    );
  };

  const addClientTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = clientTaskDraft.trim();
    if (!title || !clientTaskDate) return;
    patchClient({
      clientTasks: [
        ...client.clientTasks,
        {
          id: `client-task-${Date.now()}`,
          title,
          dueDate: clientTaskDate,
          status:
            clientTaskDate < PROFILE_TODAY.toISOString().slice(0, 10)
              ? "overdue"
              : "open",
        },
      ],
    });
    setClientTaskDraft("");
    setClientTaskDate("");
    setNotice("Client task assigned.");
  };

  const addCoachTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = coachTaskDraft.trim();
    if (!title) return;
    patchClient({
      coachTasks: [
        { id: `coach-task-${Date.now()}`, title, complete: false },
        ...client.coachTasks,
      ],
    });
    setCoachTaskDraft("");
    setNotice("Coach to-do added.");
  };

  const addMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = messageDraft.trim();
    if (!text) return;
    patchClient({
      messages: [
        ...client.messages,
        {
          id: `message-${Date.now()}`,
          text,
          from: "coach",
          date: new Date().toISOString(),
        },
      ],
    });
    setMessageDraft("");
    setNotice("Message added to the local preview.");
  };

  const submitFeedback = (checkInId: string) => {
    const feedback = (feedbackDrafts[checkInId] ?? "").trim();
    if (!feedback) return;
    const checkIns = client.checkIns.map((item) =>
      item.id === checkInId
        ? { ...item, feedback, status: "feedback sent" as const }
        : item,
    );
    const hasAwaitingFeedback = checkIns.some(
      (item) => item.status === "awaiting feedback",
    );
    patchClient({
      checkIns,
      checkInStatus: hasAwaitingFeedback
        ? "awaiting feedback"
        : client.checkInStatus === "overdue"
          ? "overdue"
          : "on track",
    });
    setFeedbackDrafts((current) => ({ ...current, [checkInId]: "" }));
    setNotice("Check-in feedback submitted.");
  };

  const openHistoryItem = (checkInId: string) => {
    setOpenCheckIn(checkInId);
    setTab("check-ins");
  };

  return (
    <motion.div
      className="cp-profile"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
    >
      <span className="cp-sr-only" role="status" aria-live="polite">
        {notice}
      </span>
      <div className="cp-topline">
        <button type="button" className="cp-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Clients
        </button>
        <span className="cp-demo">
          Local demo · changes are saved in this workspace
        </span>
      </div>

      <section className="cp-profile-shell" aria-label="Client profile summary">
        <div className="cp-profile-core">
          <header className="cp-header">
            <div className="cp-identity">
              <div className="cp-avatar" aria-hidden="true">
                {client.initials}
              </div>
              <div className="cp-name-block">
                <div className="cp-name-line">
                  <h1>{client.name}</h1>
                  <span className="cp-label">{client.label}</span>
                  {needsAttention(client) && (
                    <span className="cp-attention">Needs attention</span>
                  )}
                </div>
                <p>
                  {client.email} <span aria-hidden="true">·</span>{" "}
                  {client.phase} phase <span aria-hidden="true">·</span> Week{" "}
                  {client.week}
                </p>
              </div>
            </div>
            <div className="cp-header-actions">
              <motion.button
                className="cp-button cp-button-primary"
                type="button"
                onClick={onOpenTracker}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                transition={{ type: "spring", bounce: 0, duration: 0.24 }}
              >
                <ClipboardList size={15} aria-hidden="true" /> Open tracker{" "}
                <span className="cp-button-icon">
                  <ArrowUpRight size={14} aria-hidden="true" />
                </span>
              </motion.button>
              <button
                className="cp-button"
                type="button"
                onClick={() => setTab("messages")}
              >
                <MessageCircle size={15} aria-hidden="true" /> Chat
              </button>
            </div>
          </header>

          <fieldset className="cp-summary">
            <legend className="cp-sr-only">Client summary</legend>
            <div>
              <span>Check-in</span>
              <strong>{statusLabel(client)}</strong>
            </div>
            <div>
              <span>Last check-in</span>
              <strong>{formatClientDate(client.lastCheckIn)}</strong>
            </div>
            <div>
              <span>Next check-in</span>
              <strong>{formatClientDate(client.nextCheckIn)}</strong>
            </div>
            <div>
              <span>Unread messages</span>
              <strong>
                {client.unreadCount ? `${client.unreadCount} unread` : "None"}
              </strong>
            </div>
          </fieldset>
        </div>
      </section>

      <nav className="cp-tabs" aria-label="Client profile sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === "check-ins" && awaitingCount > 0 && (
              <span className="cp-tab-count">{awaitingCount}</span>
            )}
            {tab === item.id && (
              <motion.span
                className="cp-tab-indicator"
                layoutId={reduceMotion ? undefined : "cp-profile-tab-indicator"}
                aria-hidden="true"
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              />
            )}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="cp-overview">
          <section className="cp-section cp-core">
            <div className="cp-panel-core">
              <div className="cp-section-heading">
                <h2>Client details</h2>
                <span>{duration}</span>
              </div>
              <dl className="cp-detail-grid">
                <div>
                  <dt>Coaching since</dt>
                  <dd>{formatClientDate(client.coachingSince)}</dd>
                </div>
                <div>
                  <dt>Height</dt>
                  <dd>
                    {client.heightCm ? `${client.heightCm} cm` : "Not set"}
                  </dd>
                </div>
                <div>
                  <dt>Latest bodyweight</dt>
                  <dd>
                    {client.bodyweightKg
                      ? `${client.bodyweightKg} kg`
                      : "Not set"}
                  </dd>
                </div>
                <div>
                  <dt>Recorded</dt>
                  <dd>{formatClientDate(client.bodyweightDate)}</dd>
                </div>
              </dl>
              <div className="cp-plan-line">
                <span>Assigned setup</span>
                <strong>{setupName(client.template)} template</strong>
                <span className="cp-divider">/</span>
                <span>{presentationName(client.presentation)}</span>
                <button type="button" onClick={onOpenTracker}>
                  View tracker <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          </section>

          <section className="cp-section cp-schedule">
            <div className="cp-panel-core">
              <div className="cp-section-heading">
                <h2>Check-in schedule</h2>
                <CalendarDays size={16} aria-hidden="true" />
              </div>
              <div className="cp-current-submission">
                <div>
                  <span>Current submission</span>
                  {currentSubmission ? (
                    <strong className="cp-submission-date">
                      {formatClientDate(currentSubmission.date)}
                    </strong>
                  ) : (
                    <strong className="cp-submission-date">
                      No submission
                    </strong>
                  )}
                </div>
                {currentSubmission ? (
                  <span
                    className={`cp-state ${currentSubmission.status === "awaiting feedback" ? "cp-state-pending" : "cp-state-done"}`}
                  >
                    {currentSubmission.status}
                  </span>
                ) : (
                  <span className="cp-state">No history</span>
                )}
                <button
                  className="cp-button cp-button-small"
                  type="button"
                  onClick={() =>
                    currentSubmission
                      ? openHistoryItem(currentSubmission.id)
                      : setTab("check-ins")
                  }
                >
                  Review check-in <ArrowUpRight size={13} />
                </button>
              </div>
              <div className="cp-recurring">
                <label htmlFor="cp-recurring-day">Recurring</label>
                <span className="cp-select-wrap">
                  <select
                    id="cp-recurring-day"
                    value={recurringDay}
                    onChange={(event) => updateRecurringDay(event.target.value)}
                  >
                    {CHECK_IN_DAYS.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </span>
              </div>
              <div className="cp-extra-heading">
                <span>Additional dates</span>
                <span>{client.additionalCheckInDates.length}</span>
              </div>
              {client.additionalCheckInDates.length ? (
                <ul className="cp-date-list">
                  {client.additionalCheckInDates.map((date) => (
                    <li key={date}>
                      <span>{formatClientDate(date)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${formatClientDate(date)}`}
                        onClick={() => removeAdditionalDate(date)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cp-empty-inline">No extra dates scheduled.</p>
              )}
              <form className="cp-inline-form cp-date-form" onSubmit={addDate}>
                <label className="cp-sr-only" htmlFor="cp-extra-date">
                  Add an additional check-in date
                </label>
                <input
                  id="cp-extra-date"
                  type="date"
                  value={extraDate}
                  onChange={(event) => setExtraDate(event.target.value)}
                  required
                />
                <button type="submit" className="cp-button cp-button-small">
                  <Plus size={14} /> Add date
                </button>
              </form>
              <div className="cp-overview-priority">
                <span>Allow priority messages</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={client.priorityMessages}
                  aria-label="Allow priority messages"
                  className="cp-switch"
                  data-checked={client.priorityMessages}
                  onClick={() =>
                    patchClient({
                      priorityMessages: !client.priorityMessages,
                    })
                  }
                >
                  <span />
                </button>
              </div>
            </div>
          </section>

          <section className="cp-section cp-tasks-overview">
            <div className="cp-panel-core">
              <div className="cp-section-heading">
                <h2>Client tasks</h2>
                <button
                  className="cp-text-button"
                  type="button"
                  onClick={() => setTab("notes-tasks")}
                >
                  Manage tasks <ArrowUpRight size={13} />
                </button>
              </div>
              <div className="cp-task-totals">
                <div>
                  <strong>{completedTasks}</strong>
                  <span>Completed</span>
                </div>
                <div>
                  <strong>{openTasks}</strong>
                  <span>Open</span>
                </div>
                <div>
                  <strong>{overdueTasks}</strong>
                  <span>Overdue</span>
                </div>
              </div>
              {client.clientTasks.length ? (
                <ul className="cp-overview-task-list">
                  {client.clientTasks.slice(0, 3).map((task) => (
                    <li key={task.id}>
                      <span>{task.title}</span>
                      <span
                        className={`cp-state ${task.status === "overdue" ? "cp-state-pending" : task.status === "complete" ? "cp-state-done" : ""}`}
                      >
                        {task.status === "overdue"
                          ? "Overdue"
                          : task.status === "complete"
                            ? "Complete"
                            : `Due ${formatClientDate(task.dueDate)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cp-small-note">No client tasks assigned.</p>
              )}
            </div>
          </section>

          <section className="cp-section cp-overview-notes">
            <div className="cp-panel-core">
              <div className="cp-section-heading">
                <h2>Notes</h2>
                <button
                  className="cp-text-button"
                  type="button"
                  onClick={() => setTab("notes-tasks")}
                >
                  All notes <ArrowUpRight size={13} />
                </button>
              </div>
              <div className="cp-note-preview-group">
                <h3>
                  Internal note <span>Coach-only</span>
                </h3>
                <p>
                  {client.internalNotes[0]?.text ?? "No internal notes yet."}
                </p>
              </div>
              <div className="cp-note-preview-group">
                <h3>
                  General note <span>Coach and client</span>
                </h3>
                <p>{client.generalNotes[0]?.text ?? "No general notes yet."}</p>
              </div>
              <div className="cp-coach-work-link">
                <span className="cp-coach-count">
                  {openCoachTaskCount} coach{" "}
                  {openCoachTaskCount === 1 ? "to-do" : "to-dos"}
                </span>
                <button
                  className="cp-text-button"
                  type="button"
                  onClick={() => setTab("notes-tasks")}
                >
                  Manage <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          </section>
          <section className="cp-section cp-history-preview">
            <div className="cp-panel-core">
              <div className="cp-section-heading">
                <h2>Check-in history</h2>
                <button
                  className="cp-text-button"
                  type="button"
                  onClick={() => setTab("check-ins")}
                >
                  View all <ArrowUpRight size={13} />
                </button>
              </div>
              {orderedCheckIns.length ? (
                <div className="cp-history-list">
                  {orderedCheckIns.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      className="cp-history-row"
                      type="button"
                      onClick={() => openHistoryItem(item.id)}
                    >
                      <span className="cp-history-date">
                        {formatClientDate(item.date)}
                      </span>
                      <span
                        className={`cp-state ${item.status === "awaiting feedback" ? "cp-state-pending" : "cp-state-done"}`}
                      >
                        {item.status}
                      </span>
                      <span className="cp-history-summary">{item.summary}</span>
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="cp-small-note">No submitted check-ins yet.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === "check-ins" && (
        <section className="cp-section cp-full-section">
          <div className="cp-panel-core">
            <div className="cp-section-heading">
              <div>
                <h2>Check-in history</h2>
                <p>
                  Opening a submission leaves its response status unchanged.
                </p>
              </div>
              <span>{client.checkIns.length} submissions</span>
            </div>
            {client.trainingFlags > 0 && (
              <div className="cp-training-flags" role="note">
                <strong>
                  {client.trainingFlags} training{" "}
                  {client.trainingFlags === 1 ? "flag" : "flags"}
                </strong>
                <span>
                  Set notes flagged for coach review. Separate from priority
                  chat messages.
                </span>
              </div>
            )}
            {orderedCheckIns.length ? (
              <div className="cp-checkin-list">
                {orderedCheckIns.map((item) => (
                  <article className="cp-checkin" key={item.id}>
                    <button
                      className="cp-checkin-summary"
                      type="button"
                      aria-expanded={openCheckIn === item.id}
                      onClick={() =>
                        setOpenCheckIn(openCheckIn === item.id ? null : item.id)
                      }
                    >
                      <span className="cp-checkin-date">
                        {formatClientDate(item.date)}
                      </span>
                      <span
                        className={`cp-state ${item.status === "awaiting feedback" ? "cp-state-pending" : "cp-state-done"}`}
                      >
                        {item.status}
                      </span>
                      <span className="cp-checkin-preview">{item.summary}</span>
                      <span className="cp-open-label">
                        {openCheckIn === item.id ? "Close" : "Review"}
                      </span>
                    </button>
                    {openCheckIn === item.id && (
                      <div className="cp-checkin-detail">
                        <p>
                          {item.summary || "No written submission summary."}
                        </p>
                        {item.status === "feedback sent" ? (
                          <div className="cp-sent-feedback">
                            <span>Feedback sent</span>
                            <p>{item.feedback}</p>
                          </div>
                        ) : (
                          <form
                            className="cp-feedback-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              submitFeedback(item.id);
                            }}
                          >
                            <label htmlFor={`cp-feedback-${item.id}`}>
                              Feedback
                            </label>
                            <textarea
                              id={`cp-feedback-${item.id}`}
                              value={feedbackDrafts[item.id] ?? ""}
                              onChange={(event) =>
                                setFeedbackDrafts((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                              placeholder="Write your response to this check-in"
                              rows={3}
                            />
                            <div>
                              <motion.button
                                className="cp-button cp-button-primary cp-button-small"
                                type="submit"
                                disabled={
                                  !(feedbackDrafts[item.id] ?? "").trim()
                                }
                                whileTap={
                                  reduceMotion ? undefined : { scale: 0.98 }
                                }
                                transition={{
                                  type: "spring",
                                  bounce: 0,
                                  duration: 0.24,
                                }}
                              >
                                <Send size={13} /> Submit feedback
                              </motion.button>
                              <span className="cp-feedback-help">
                                Only submission changes the status to feedback
                                sent.
                              </span>
                            </div>
                          </form>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="cp-empty">No submitted check-ins yet.</p>
            )}
          </div>
        </section>
      )}

      {tab === "notes-tasks" && (
        <div className="cp-work-columns">
          <section className="cp-section cp-work-section">
            <div className="cp-panel-core">
              <div className="cp-section-heading">
                <div>
                  <h2>Notes</h2>
                  <p>
                    Internal notes are coach-only; general notes are visible to
                    coach and client.
                  </p>
                </div>
              </div>
              <div className="cp-note-group">
                <h3>
                  Internal notes <span>Coach-only</span>
                </h3>
                {client.internalNotes.length ? (
                  <ul className="cp-note-list">
                    {client.internalNotes.map((note) => (
                      <li key={note.id}>
                        <p>{note.text}</p>
                        <button
                          type="button"
                          aria-label="Delete internal note"
                          onClick={() =>
                            patchClient({
                              internalNotes: client.internalNotes.filter(
                                (item) => item.id !== note.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cp-empty-inline">No internal notes yet.</p>
                )}
                <form
                  className="cp-add-form"
                  onSubmit={(event) => addNote("internal", event)}
                >
                  <label className="cp-sr-only" htmlFor="cp-internal-note">
                    Add an internal note
                  </label>
                  <textarea
                    id="cp-internal-note"
                    rows={2}
                    placeholder="Add a coach-only note"
                    value={internalDraft}
                    onChange={(event) => setInternalDraft(event.target.value)}
                  />
                  <button
                    className="cp-button cp-button-small"
                    type="submit"
                    disabled={!internalDraft.trim()}
                  >
                    <Plus size={14} /> Add note
                  </button>
                </form>
              </div>
              <div className="cp-note-group">
                <h3>
                  General notes{" "}
                  <span className="cp-note-meta">Coach and client</span>
                </h3>
                {client.generalNotes.length ? (
                  <ul className="cp-note-list">
                    {client.generalNotes.map((note) => (
                      <li key={note.id}>
                        <p>{note.text}</p>
                        <button
                          type="button"
                          aria-label="Delete general note"
                          onClick={() =>
                            patchClient({
                              generalNotes: client.generalNotes.filter(
                                (item) => item.id !== note.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cp-empty-inline">No general notes yet.</p>
                )}
                <form
                  className="cp-add-form"
                  onSubmit={(event) => addNote("general", event)}
                >
                  <label className="cp-sr-only" htmlFor="cp-general-note">
                    Add a general note
                  </label>
                  <textarea
                    id="cp-general-note"
                    rows={2}
                    placeholder="Add a general note"
                    value={generalDraft}
                    onChange={(event) => setGeneralDraft(event.target.value)}
                  />
                  <button
                    className="cp-button cp-button-small"
                    type="submit"
                    disabled={!generalDraft.trim()}
                  >
                    <Plus size={14} /> Add note
                  </button>
                </form>
              </div>
            </div>
          </section>

          <section className="cp-section cp-work-section">
            <div className="cp-panel-core">
              <div className="cp-section-heading">
                <div>
                  <h2>Client-assigned tasks</h2>
                  <p>
                    {completedTasks} completed · {openTasks} open ·{" "}
                    {overdueTasks} overdue
                  </p>
                </div>
              </div>
              {client.clientTasks.length ? (
                <ul className="cp-task-list">
                  {client.clientTasks.map((task) => (
                    <li
                      key={task.id}
                      data-complete={task.status === "complete"}
                    >
                      <button
                        type="button"
                        className="cp-task-check"
                        aria-pressed={task.status === "complete"}
                        aria-label={
                          task.status === "complete"
                            ? `Reopen ${task.title}`
                            : `Complete ${task.title}`
                        }
                        onClick={() =>
                          patchClient({
                            clientTasks: client.clientTasks.map((item) =>
                              item.id === task.id
                                ? item.status === "complete"
                                  ? {
                                      ...item,
                                      status:
                                        item.dueDate <
                                        PROFILE_TODAY.toISOString().slice(0, 10)
                                          ? "overdue"
                                          : "open",
                                    }
                                  : { ...item, status: "complete" }
                                : item,
                            ),
                          })
                        }
                      >
                        <span
                          className={`cp-task-check-box${task.status === "complete" ? " is-done" : ""}`}
                          aria-hidden="true"
                        >
                          {task.status === "complete" ? (
                            <Check size={12} />
                          ) : null}
                        </span>
                      </button>
                      <span className="cp-task-title">{task.title}</span>
                      <span
                        className={`cp-state ${task.status === "overdue" ? "cp-state-pending" : task.status === "complete" ? "cp-state-done" : ""}`}
                      >
                        {task.status === "overdue"
                          ? "Overdue"
                          : task.status === "complete"
                            ? "Complete"
                            : `Due ${formatClientDate(task.dueDate)}`}
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete ${task.title}`}
                        onClick={() =>
                          patchClient({
                            clientTasks: client.clientTasks.filter(
                              (item) => item.id !== task.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cp-empty-inline">No tasks assigned.</p>
              )}
              <form className="cp-add-task-form" onSubmit={addClientTask}>
                <label htmlFor="cp-client-task">Assign a task</label>
                <input
                  id="cp-client-task"
                  type="text"
                  value={clientTaskDraft}
                  onChange={(event) => setClientTaskDraft(event.target.value)}
                  placeholder="Task for the client"
                />
                <div>
                  <label className="cp-sr-only" htmlFor="cp-client-task-date">
                    Due date
                  </label>
                  <input
                    id="cp-client-task-date"
                    type="date"
                    value={clientTaskDate}
                    onChange={(event) => setClientTaskDate(event.target.value)}
                    required
                  />
                  <button
                    className="cp-button cp-button-small"
                    type="submit"
                    disabled={!clientTaskDraft.trim() || !clientTaskDate}
                  >
                    <Plus size={14} /> Assign
                  </button>
                </div>
              </form>
              <div className="cp-coach-tasks">
                <h3>
                  Coach to-dos <span>Private</span>
                </h3>
                {client.coachTasks.length ? (
                  <ul className="cp-task-list cp-coach-task-list">
                    {client.coachTasks.map((task) => (
                      <li key={task.id} data-complete={task.complete}>
                        <button
                          type="button"
                          className="cp-task-check"
                          aria-pressed={task.complete}
                          aria-label={
                            task.complete
                              ? `Reopen ${task.title}`
                              : `Complete ${task.title}`
                          }
                          onClick={() =>
                            patchClient({
                              coachTasks: client.coachTasks.map((item) =>
                                item.id === task.id
                                  ? { ...item, complete: !item.complete }
                                  : item,
                              ),
                            })
                          }
                        >
                          <span
                            className={`cp-task-check-box${task.complete ? " is-done" : ""}`}
                            aria-hidden="true"
                          >
                            {task.complete ? <Check size={12} /> : null}
                          </span>
                        </button>
                        <span className="cp-task-title">{task.title}</span>
                        <span className="cp-state">
                          {task.complete ? "Done" : "To-do"}
                        </span>
                        <button
                          type="button"
                          aria-label={`Delete ${task.title}`}
                          onClick={() =>
                            patchClient({
                              coachTasks: client.coachTasks.filter(
                                (item) => item.id !== task.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cp-empty-inline">No coach to-dos linked.</p>
                )}
                <form className="cp-inline-form" onSubmit={addCoachTask}>
                  <label className="cp-sr-only" htmlFor="cp-coach-task">
                    Add a coach to-do
                  </label>
                  <input
                    id="cp-coach-task"
                    type="text"
                    value={coachTaskDraft}
                    onChange={(event) => setCoachTaskDraft(event.target.value)}
                    placeholder="Add coach to-do"
                  />
                  <button
                    className="cp-button cp-button-small"
                    type="submit"
                    disabled={!coachTaskDraft.trim()}
                  >
                    <Plus size={14} /> Add
                  </button>
                </form>
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "messages" && (
        <section className="cp-section cp-full-section cp-messages-section">
          <div className="cp-panel-core">
            <div className="cp-section-heading">
              <div>
                <h2>Chat</h2>
                <p>Local preview only · messages are not sent to a client</p>
              </div>
              <span>
                {client.unreadCount
                  ? `${client.unreadCount} unread`
                  : "Up to date"}
              </span>
              {client.unreadCount > 0 && (
                <button
                  className="cp-text-button"
                  type="button"
                  onClick={() => patchClient({ unreadCount: 0 })}
                >
                  Mark read <Check size={13} />
                </button>
              )}
            </div>
            <div className="cp-priority-row">
              <div>
                <strong>Priority messages</strong>
                <p>Allow this client to flag a message for coach attention.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={client.priorityMessages}
                aria-label="Allow priority messages"
                className="cp-switch"
                data-checked={client.priorityMessages}
                onClick={() =>
                  patchClient({ priorityMessages: !client.priorityMessages })
                }
              >
                <span />
              </button>
            </div>
            <div className="cp-conversation">
              {client.messages.length ? (
                client.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`cp-message ${message.from === "coach" ? "cp-message-coach" : "cp-message-client"}`}
                  >
                    <div>
                      <span>
                        {message.from === "coach" ? "You" : client.name}
                      </span>
                      <time>{formatClientDate(message.date)}</time>
                    </div>
                    <p>{message.text}</p>
                  </article>
                ))
              ) : (
                <div className="cp-empty cp-message-empty">
                  No messages in this conversation.
                </div>
              )}
            </div>
            <form className="cp-message-form" onSubmit={addMessage}>
              <label className="cp-sr-only" htmlFor="cp-message">
                Write a message
              </label>
              <textarea
                id="cp-message"
                rows={2}
                placeholder="Write a message for this local preview"
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
              />
              <button
                className="cp-button cp-button-primary"
                type="submit"
                disabled={!messageDraft.trim()}
              >
                <Send size={14} /> Add to preview
              </button>
            </form>
          </div>
        </section>
      )}

      {tab === "onboarding" && (
        <section className="cp-section cp-full-section">
          <div className="cp-panel-core">
            <div className="cp-section-heading">
              <div>
                <h2>Submitted onboarding</h2>
                <p>Full form responses retained with this profile.</p>
              </div>
              <span>{client.onboarding.length} answers</span>
            </div>
            {client.onboarding.length ? (
              <dl className="cp-onboarding-list">
                {client.onboarding.map((item) => (
                  <div key={item.question}>
                    <dt>{item.question}</dt>
                    <dd>{item.answer || "No answer provided."}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="cp-onboarding-empty">
                <p>No submitted onboarding form is attached to this client.</p>
                <span className="cp-onboarding-empty-note">
                  A submitted form will appear here with its original questions
                  and answers.
                </span>
              </div>
            )}
          </div>
        </section>
      )}
    </motion.div>
  );
}
