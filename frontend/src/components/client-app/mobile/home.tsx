"use client";

import { useMemo, useState } from "react";
import {
  athleteMode,
  logoForMode,
  useSystemMode,
} from "../../coach/coach-theme";
import type { CoachClient, Message } from "../../coach/model";
import { useCoach, useCoachNow, useDisplay } from "../../coach/store";
import { dosageForQuantity } from "../../coach/supplements/model";
import { useLocalToday } from "../../coach/targets/use-local-today";
import { IconButton } from "../../coach/ui";
import { findLog } from "../training-log/model";
import {
  cardioWeek,
  habitsToday,
  nextCheckIn,
  stepsLabel,
  stepsTarget,
  supplementsToday,
  todaySession,
  todayTargets,
  upcomingTemporary,
} from "./data";

const NUM = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export function MobileHome({
  client,
  onOpenCheckIn,
  onOpenTracker,
  onOpenMealPlan,
  onOpenMessages,
  onOpenSession,
}: {
  client: CoachClient;
  onOpenCheckIn: () => void;
  onOpenTracker: () => void;
  onOpenMealPlan?: (variant: string) => void;
  onOpenMessages: () => void;
  onOpenSession: () => void;
}) {
  const { formatDate, formatClock } = useDisplay();
  const now = useCoachNow();
  const { state, setState } = useCoach();
  const today = useLocalToday();
  const targets = useMemo(() => todayTargets(client, today), [client, today]);
  const steps = useMemo(() => stepsTarget(client, today), [client, today]);
  const cardio = useMemo(() => cardioWeek(client, today), [client, today]);
  const checkIn = useMemo(
    () => nextCheckIn(state, client, today, now),
    [state, client, today, now],
  );
  const session = useMemo(
    () => todaySession(state, client, today),
    [state, client, today],
  );
  const temp = useMemo(() => upcomingTemporary(client, today), [client, today]);
  const doneLog = session?.item
    ? findLog(
        state.trainingLogs ?? [],
        session.planId,
        session.item.date,
        session.item.occurrenceKey,
      )
    : undefined;
  const sups = useMemo(() => supplementsToday(client), [client]);
  const { habits, logged } = useMemo(
    () => habitsToday(client, today),
    [client, today],
  );
  const latestMsg = useMemo(
    () =>
      state.messages
        .filter((m: Message) => m.clientId === client.id && m.from === "coach")
        .sort((a: Message, b: Message) => b.date.localeCompare(a.date))[0],
    [state.messages, client.id],
  );
  const [supTicks, setSupTicks] = useState<Record<string, boolean>>({});
  const toggleSup = (id: string) =>
    setSupTicks((c) => ({ ...c, [id]: !c[id] }));
  const toggleHabit = (id: string) => {
    const current = new Set(client.habitLog?.[today] ?? []);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    setState((s) => ({
      ...s,
      clients: s.clients.map((c) =>
        c.id === client.id
          ? { ...c, habitLog: { ...c.habitLog, [today]: [...current] } }
          : c,
      ),
    }));
  };
  const firstName = client.name.split(" ")[0];
  const initials = client.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const systemMode = useSystemMode();
  const appMode = athleteMode(client, systemMode);
  const brandLogo = logoForMode(state.preferences, appMode);
  const brandName = state.preferences.brand?.name || "infinity.";
  const coachName = state.preferences.profile?.name ?? "Liliana Mansfeld";
  const toggleMode = () =>
    setState((s) => ({
      ...s,
      clients: s.clients.map((c) =>
        c.id === client.id
          ? { ...c, appMode: appMode === "dark" ? "light" : "dark" }
          : c,
      ),
    }));
  const cardioPips = cardio
    ? Array.from({ length: cardio.sessionsTarget }, (_, i) => i)
    : [];
  const groups = new Map<string, typeof sups>();
  for (const s of sups) {
    const key = s.timing || "Any time";
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return (
    <div className="cm-stack">
      <div className="cm-row" style={{ justifyContent: "space-between" }}>
        <span className="cm-mut" style={{ fontSize: 13 }}>
          {formatDate(today, { weekday: "long" })}
        </span>
        <span className="cm-home-brand">
          {brandLogo ? (
            // biome-ignore lint/performance/noImgElement: demo image previews are dynamic data srcs
            <img src={brandLogo.dataUrl} alt={`${brandName} logo`} />
          ) : (
            <span className="cm-home-brand-name">{brandName}</span>
          )}
        </span>
        <span className="cm-row" style={{ gap: 6 }}>
          <IconButton
            label={
              appMode === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            onClick={toggleMode}
          >
            {appMode === "dark" ? (
              <svg
                aria-hidden="true"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </IconButton>
          <span className="cm-avt">{initials}</span>
        </span>
      </div>
      <div className="cm-h1">Hi {firstName}</div>
      {checkIn && (
        <div className="cm-card">
          <div className="cm-row" style={{ gap: 12 }}>
            <span style={{ color: "var(--cd-accent)" }}>
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
                <path d="m9 16 2 2 4-4" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cm-h2" style={{ fontSize: 14 }}>
                Weekly check-in
              </div>
              <div
                className="cm-mut"
                style={{ fontSize: 12, whiteSpace: "nowrap" }}
              >
                {checkIn.awaitingFeedback
                  ? `Submitted ${checkIn.submittedDate ? formatDate(checkIn.submittedDate, { weekday: "short", day: "numeric", month: "short" }) : "recently"} · awaiting feedback`
                  : checkIn.overdue
                    ? "Overdue"
                    : checkIn.dueToday
                      ? `Due today by ${formatClock(checkIn.deadline)}`
                      : `Due ${formatDate(checkIn.date, { weekday: "short", day: "numeric", month: "short" })} · in ${checkIn.daysUntil} day${checkIn.daysUntil === 1 ? "" : "s"}`}
              </div>
            </div>
            {!checkIn.awaitingFeedback && (
              <button
                type="button"
                className="cm-btn cm-btnA"
                style={{ padding: "7px 13px", fontSize: 13 }}
                onClick={onOpenCheckIn}
              >
                Start
              </button>
            )}
          </div>
        </div>
      )}
      {targets && (
        <div className="cm-card">
          <div
            className="cm-row"
            style={{ justifyContent: "space-between", marginBottom: 6 }}
          >
            <span className="cm-sh">Today's targets</span>
            {targets.label && (
              <span className="cm-chip cm-chipA">{targets.label}</span>
            )}
          </div>
          {targets.options ? (
            <div
              className="cm-mut"
              style={{ fontSize: 12.5, marginBottom: 8, lineHeight: 1.5 }}
            >
              Choose your day:{" "}
              {targets.options
                .map((o) => `${o.label} ${NUM.format(o.kcal)}`)
                .join(" · ")}
            </div>
          ) : (
            <>
              <div
                className="cm-row"
                style={{ alignItems: "baseline", gap: 8, marginBottom: 8 }}
              >
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    letterSpacing: "-.02em",
                  }}
                >
                  {NUM.format(targets.kcal)}
                </span>
                <span className="cm-mut" style={{ fontSize: 12 }}>
                  kcal
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8,
                  fontSize: 12.5,
                }}
              >
                <div
                  className="cm-row"
                  style={{ justifyContent: "space-between" }}
                >
                  <span className="cm-mut">Protein</span>
                  <b>{NUM.format(targets.protein)} g</b>
                </div>
                <div
                  className="cm-row"
                  style={{ justifyContent: "space-between" }}
                >
                  <span className="cm-mut">Carbs</span>
                  <b>{NUM.format(targets.carbs)} g</b>
                </div>
                <div
                  className="cm-row"
                  style={{ justifyContent: "space-between" }}
                >
                  <span className="cm-mut">Fat</span>
                  <b>{NUM.format(targets.fat)} g</b>
                </div>
              </div>
            </>
          )}
          {steps !== undefined && (
            <div
              className="cm-row"
              style={{
                justifyContent: "space-between",
                fontSize: 12.5,
                marginTop: 9,
              }}
            >
              <span className="cm-mut">Steps</span>
              <b>{stepsLabel(steps)}</b>
            </div>
          )}
          {cardio && (
            <div
              className="cm-row"
              style={{
                justifyContent: "space-between",
                fontSize: 12.5,
                marginTop: 8,
              }}
            >
              <span className="cm-mut">
                Cardio · {cardio.minutes} min · {cardio.done} of{" "}
                {cardio.sessionsTarget} this week
              </span>
              <span className="cm-row" style={{ gap: 4 }}>
                {cardioPips.map((pip) => (
                  <i
                    key={`pip-${pip}`}
                    style={{
                      width: 14,
                      height: 5,
                      borderRadius: 99,
                      background:
                        pip < cardio.done
                          ? "var(--cd-accent)"
                          : "color-mix(in srgb, var(--cd-text) 18%, transparent)",
                      display: "block",
                    }}
                  />
                ))}
              </span>
            </div>
          )}
          {temp && (
            <button
              type="button"
              className="cm-mut"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "none",
                border: 0,
                padding: 0,
                marginTop: 9,
                fontSize: 12.5,
                cursor: "pointer",
              }}
              onClick={() => onOpenMealPlan?.(temp.label ?? "Temporary plan")}
            >
              {temp.label ?? "Temporary plan"} ·{" "}
              {formatDate(temp.startDate, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}{" "}
              ›
            </button>
          )}
        </div>
      )}
      {session?.item && session.status !== "done" ? (
        <div className="cm-card">
          <div className="cm-row" style={{ gap: 12 }}>
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="M4 9v6M7 6v12M17 6v12M20 9v6M7 12h10" />
            </svg>
            <div style={{ flex: 1 }}>
              <div className="cm-h2" style={{ fontSize: 14 }}>
                {session.item.session.name}
              </div>
              <div className="cm-mut" style={{ fontSize: 12 }}>
                {session.item.session.exercises.length} exercises
              </div>
            </div>
            <button
              type="button"
              className="cm-btn cm-btnA"
              style={{ padding: "8px 16px", fontSize: 13 }}
              onClick={onOpenSession}
            >
              {session.status === "in-progress" ? "Continue" : "Start"}
            </button>
          </div>
        </div>
      ) : session?.item ? (
        <div className="cm-card">
          <div className="cm-row" style={{ gap: 12 }}>
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--cd-accent)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <div style={{ flex: 1 }}>
              <div className="cm-h2" style={{ fontSize: 14 }}>
                {session.item.session.name}
              </div>
              <div className="cm-mut" style={{ fontSize: 12 }}>
                Completed
                {doneLog?.finishedAt && doneLog.startedAt
                  ? ` · ${Math.max(1, Math.round((Date.parse(doneLog.finishedAt) - Date.parse(doneLog.startedAt)) / 60000))} min`
                  : ""}
                {doneLog
                  ? ` · ${doneLog.exercises.reduce((a, e) => a + e.sets.length, 0)} sets`
                  : ""}
              </div>
            </div>
            <button
              type="button"
              className="cm-btn"
              style={{ padding: "8px 16px", fontSize: 13 }}
              onClick={onOpenSession}
            >
              View
            </button>
          </div>
        </div>
      ) : session ? (
        <div className="cm-card">
          <div className="cm-row" style={{ gap: 12 }}>
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--cd-muted)"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
            <div style={{ flex: 1 }}>
              <div className="cm-h2" style={{ fontSize: 14 }}>
                Rest day
              </div>
              <div className="cm-mut" style={{ fontSize: 12 }}>
                No training scheduled today
              </div>
              {session.next && (
                <div className="cm-mut" style={{ fontSize: 12, marginTop: 4 }}>
                  Next: {session.next.session.name} ·{" "}
                  {formatDate(session.next.date, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {sups.length > 0 && (
        <div className="cm-card" style={{ padding: "7px 16px" }}>
          {[...groups.entries()].map(([timing, items], gi) =>
            items.map((s, i) => {
              const dose = dosageForQuantity(s.product, s.quantity);
              const key = `${timing}-${s.id}`;
              return (
                <div
                  key={key}
                  className="cm-row"
                  style={{
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderTop: gi + i > 0 ? "1px solid var(--cd-line)" : "none",
                  }}
                >
                  <span className="cm-mut" style={{ fontSize: 12.5 }}>
                    {i === 0 ? `${timing} · ` : ""}
                    {s.product.name}
                    {dose ? ` ${dose.amount} ${dose.unit}` : ""}
                  </span>
                  <button
                    type="button"
                    className={`cm-tick${supTicks[key] ? " on" : ""}`}
                    onClick={() => toggleSup(key)}
                    aria-label={`${s.product.name} taken`}
                  >
                    <svg
                      aria-hidden="true"
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </button>
                </div>
              );
            }),
          )}
          {habits.map((h) => (
            <div
              key={h.id}
              className="cm-row"
              style={{
                justifyContent: "space-between",
                padding: "6px 0",
                borderTop: "1px solid var(--cd-line)",
              }}
            >
              <span className="cm-mut" style={{ fontSize: 12.5 }}>
                {h.name}
                {h.goal ? ` · ${h.goal}` : ""}
              </span>
              <button
                type="button"
                className={`cm-tick${logged.has(h.id) ? " on" : ""}`}
                onClick={() => toggleHabit(h.id)}
                aria-label={`${h.name} done`}
              >
                <svg
                  aria-hidden="true"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      {latestMsg && (
        <button
          type="button"
          className="cm-card"
          style={{
            padding: "10px 16px",
            width: "100%",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onClick={onOpenMessages}
        >
          <div className="cm-row" style={{ gap: 10 }}>
            <span
              className="cm-avt"
              style={{ width: 26, height: 26, fontSize: 11 }}
            >
              {state.preferences.profile?.photo ? (
                // biome-ignore lint/performance/noImgElement: demo image previews are dynamic data srcs
                <img
                  src={state.preferences.profile.photo.dataUrl}
                  alt=""
                  className="cm-avt-img"
                />
              ) : (
                coachName
                  .split(/\s+/)
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()
              )}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                {coachName.split(" ")[0]}{" "}
                <span className="cm-mut" style={{ fontWeight: 400 }}>
                  · coach
                </span>
              </div>
              <div
                className="cm-mut"
                style={{
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {latestMsg.text}
              </div>
            </div>
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--cd-muted)"
              strokeWidth="1.75"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </button>
      )}
      <button
        type="button"
        className="cm-btn cm-btnG"
        style={{ width: "100%", fontSize: 13.5, padding: 10 }}
        onClick={onOpenTracker}
      >
        Log today
      </button>
    </div>
  );
}
