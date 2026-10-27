"use client";

// Card w2-c5: the client messages surface. Presentational only - callers
// pass normalized rows. The canvas twin feeds the own-scope /api/v1
// thread; the standalone demo feeds fixture records from the client model.

import { useEffect, useRef, useState } from "react";

import { Empty } from "../coach/ui";
import { dateLabel } from "../ethereal/builder/model";

export type ClientMessageRow = {
  id: string;
  /** True when the signed-in client authored the message. */
  fromClient: boolean;
  sender: string;
  /** ISO date part (`YYYY-MM-DD`), formatted with dateLabel. */
  date: string;
  body: string;
  unread?: boolean;
};

export function ClientMessages({
  rows,
  pending = false,
  onSend,
}: {
  rows: ClientMessageRow[];
  /** True while a reply is being written to the server. */
  pending?: boolean;
  onSend?: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const thread = threadRef.current;
    if (thread && rows.length > 0) thread.scrollTop = thread.scrollHeight;
  }, [rows]);
  const submit = () => {
    const body = draft.trim();
    if (body.length === 0 || pending || !onSend) return;
    onSend(body);
    setDraft("");
  };
  return (
    <section className="cd-preview-section" aria-label="Messages">
      <h2>Messages</h2>
      {rows.length === 0 ? (
        <Empty title="No messages yet">
          Your conversation with your coach will appear here.
        </Empty>
      ) : (
        <div className="ca-thread" ref={threadRef}>
          {rows.map((row) => (
            <article
              className="ca-msg"
              data-from={row.fromClient ? "client" : "coach"}
              key={row.id}
            >
              <header className="ca-msg-meta">
                {row.sender}
                {" · "}
                {dateLabel(row.date, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {row.unread ? " · Unread" : ""}
              </header>
              <p className="ca-msg-body">{row.body}</p>
            </article>
          ))}
        </div>
      )}
      {onSend && (
        <form
          className="ca-composer"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            aria-label="Reply to your coach"
            className="ca-composer-input"
            disabled={pending}
            maxLength={4000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a reply"
            rows={2}
            value={draft}
          />
          <button
            className="ca-composer-send"
            disabled={pending || draft.trim().length === 0}
            type="submit"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </section>
  );
}
