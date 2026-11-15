"use client";

import { useEffect, useRef, useState } from "react";
import {
  athleteAvailabilityNote,
  type CoachClient,
  type Message,
  resolvedTimeZone,
  resolvedWorkingHours,
  timeZoneCity,
  uid,
  workingHoursSummary,
  zonedToday,
} from "../../coach/model";
import { useCoach, useDisplay } from "../../coach/store";
import { vacationAutoReply } from "../../coach/vacations";
import { VacationBanner } from "../vacation-banner";

export function MobileMessages({ client }: { client: CoachClient }) {
  const { formatDate } = useDisplay();
  const { state, setState } = useCoach();
  const profile = state.preferences.profile;
  const coachName = profile?.name ?? "Liliana Mansfeld";
  const coachInitials = coachName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  // Coach identity plus the configured availability: working hours summary
  // and the optional note. The legacy coach-side availability line stays in
  // the coach workspace.
  const coachLine = profile?.title || "Coach";
  const hoursText = workingHoursSummary(
    resolvedWorkingHours(state.preferences),
    state.preferences.region?.hourCycle ?? "24",
  );
  const hoursCity = timeZoneCity(resolvedTimeZone(state.preferences));
  const availabilityNote = athleteAvailabilityNote(state.preferences);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = state.messages
    .filter((m: Message) => m.clientId === client.id)
    .sort((a: Message, b: Message) => a.date.localeCompare(b.date));
  // mark coach messages read on open
  useEffect(() => {
    setState((s) => {
      if (
        !s.messages.some(
          (m) => m.clientId === client.id && m.from === "coach" && !m.read,
        )
      )
        return s;
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.clientId === client.id && m.from === "coach"
            ? { ...m, read: true }
            : m,
        ),
      };
    });
  }, [client.id, setState]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  });
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setState((s) => {
      // The away reply and its day stamp follow the coach's day — the same
      // zone the banner and coach chip use — not the athlete's browser day.
      const coachDay = zonedToday(resolvedTimeZone(s.preferences), new Date());
      const next = {
        ...s,
        messages: [
          ...s.messages,
          {
            id: uid("msg"),
            clientId: client.id,
            text,
            from: "client" as const,
            date: coachDay,
            read: false,
            priority: false,
            attachments: [],
            local: true,
          },
        ],
      };
      const reply = vacationAutoReply(next, client.id, coachDay, formatDate);
      return reply ? { ...next, messages: [...next.messages, reply] } : next;
    });
    setDraft("");
  };
  let lastDay = "";
  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}
    >
      <div
        className="cm-row"
        style={{
          gap: 10,
          paddingBottom: 12,
          borderBottom: "1px solid var(--cd-line)",
          marginBottom: 12,
        }}
      >
        <span
          className="cm-avt"
          style={{ width: 32, height: 32, fontSize: 12 }}
        >
          {state.preferences.profile?.photo ? (
            // biome-ignore lint/performance/noImgElement: demo image previews are dynamic data srcs
            <img
              src={state.preferences.profile.photo.dataUrl}
              alt=""
              className="cm-avt-img"
            />
          ) : (
            coachInitials
          )}
        </span>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{coachName}</div>
          <div className="cm-mut" style={{ fontSize: 11.5 }}>
            {coachLine}
          </div>
          {hoursText && (
            <div className="cm-mut" style={{ fontSize: 11.5 }}>
              Usually replies {hoursText}, {hoursCity} time
            </div>
          )}
          {availabilityNote && (
            <div className="cm-mut" style={{ fontSize: 11.5 }}>
              {availabilityNote}
            </div>
          )}
        </div>
      </div>
      <VacationBanner />
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}
      >
        {msgs.map((m: Message) => {
          const sep = m.date !== lastDay ? m.date : null;
          if (sep) lastDay = m.date;
          return (
            <div key={m.id} style={{ display: "contents" }}>
              {sep && (
                <div className="cm-msg-day">
                  {formatDate(m.date, {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                  })}
                </div>
              )}
              <div className={`cm-msg ${m.from}`}>
                <div className="cm-bub">
                  {m.attachments.length > 0 && (
                    <div
                      style={{
                        width: 180,
                        height: 110,
                        borderRadius: 10,
                        background: "var(--cd-wash)",
                        border: "1px dashed var(--cd-line)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 6,
                      }}
                    >
                      <svg
                        aria-hidden="true"
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--cd-muted)"
                        strokeWidth="1.75"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                    </div>
                  )}
                  {m.auto && (
                    <span className="cm-auto-label">Automatic reply</span>
                  )}
                  {m.text}
                </div>
                <div className="cm-msg-t">
                  {formatDate(m.date, { day: "numeric", month: "short" })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="cm-comp">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message…"
          aria-label="Message"
        />
        <button
          type="button"
          className="cm-cbtn send"
          onClick={send}
          aria-label="Send"
          disabled={!draft.trim()}
        >
          <svg
            aria-hidden="true"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          >
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </div>
    </div>
  );
}
