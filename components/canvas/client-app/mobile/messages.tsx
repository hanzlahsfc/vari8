"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CoachClient,
  formatDate,
  type Message,
  uid,
} from "../../coach/model";
import { useCoach } from "../../coach/store";
import {
  fetchOwnMessages,
  markOwnThreadRead,
  sendOwnMessage,
} from "../../data/messages";
import { useLocalToday } from "../../coach/targets/use-local-today";

export function MobileMessages({
  client,
  workspaceId,
}: {
  client: CoachClient;
  workspaceId?: string;
}) {
  const { state, setState } = useCoach();
  const today = useLocalToday();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const requestId = useRef<string>("");
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = state.messages
    .filter((m: Message) => m.clientId === client.id)
    .sort((a: Message, b: Message) => a.date.localeCompare(b.date));
  // mark coach messages read on open
  const hasUnreadCoach = state.messages.some(
    (m) => m.clientId === client.id && m.from === "coach" && !m.read,
  );
  useEffect(() => {
    // The thread is rendered open: local paint + server mark-read only fire
    // when unread coach rows are actually visible — mount alone never marks.
    if (!hasUnreadCoach) return;
    if (workspaceId)
      markOwnThreadRead(workspaceId).catch(() => {
        /* paint stays authoritative locally; the next open retries */
      });
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) =>
        m.clientId === client.id && m.from === "coach"
          ? { ...m, read: true }
          : m,
      ),
    }));
  }, [client.id, hasUnreadCoach, workspaceId, setState]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  });
  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (workspaceId) {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      setSending(true);
      setSendError("");
      try {
        await sendOwnMessage(
          workspaceId,
          text,
          undefined,
          requestId.current,
        );
        try {
          const { messages } = await fetchOwnMessages(workspaceId);
          setState((s) => ({
            ...s,
            messages: [
              ...s.messages.filter((m) => m.clientId !== client.id),
              ...messages.map((wire) => ({
                id: wire.id,
                clientId: client.id,
                text: wire.body,
                from: (wire.senderKind === "CLIENT" ? "client" : "coach") as
                  "client" | "coach",
                date: wire.sentAt,
                read: wire.read,
                priority: false,
                attachments: [],
              })),
            ],
          }));
        } catch {
          /* send persisted; the next open refresh shows it — don't resend */
        }
        requestId.current = "";
        setDraft("");
      } catch {
        setSendError("The message could not be sent — check your connection and try again");
      } finally {
        setSending(false);
      }
      return;
    }
    setState((s) => ({
      ...s,
      messages: [
        ...s.messages,
        {
          id: uid("msg"),
          clientId: client.id,
          text,
          from: "client",
          date: today,
          read: false,
          priority: false,
          attachments: [],
          local: true,
        },
      ],
    }));
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
          LM
        </span>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Liliana</div>
          <div className="cm-mut" style={{ fontSize: 11.5 }}>
            Coach · replies usually within a day
          </div>
        </div>
      </div>
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
          disabled={sending}
        />
        <button
          type="button"
          className="cm-cbtn send"
          onClick={send}
          aria-label="Send"
          disabled={sending || !draft.trim()}
          aria-busy={sending}
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
        {sendError ? (
          <p role="alert" style={{ color: "var(--cd-err, #b45309)", fontSize: 12, margin: "4px 0 0" }}>
            {sendError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
