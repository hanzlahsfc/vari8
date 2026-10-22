"use client";

import { useState } from "react";
import { Button, Card, Status, Toggle } from "@/components/vari8/components";
import { TextArea } from "@/components/vari8/inputs";
import type { DemoThread } from "./demo/fixtures";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice, useDemoStore } from "./demo/store";
import { ClientScreen, DemoGate } from "./shell";

type WireMessage = DemoThread["messages"][number] & {
  state?: "pending" | "failed";
};

function ThreadView({
  thread,
  updateThread,
  onClose,
}: {
  thread: DemoThread;
  updateThread: (fn: (t: DemoThread) => DemoThread) => void;
  onClose: () => void;
}) {
  const { client } = useDemoStore();
  const [text, setText] = useState("");
  const [failNext, setFailNext] = useState(false);
  const messages = thread.messages as WireMessage[];
  const pendingFailed = messages.filter(
    (m) => m.state === "pending" || m.state === "failed",
  );

  const patchMessage = (id: string, state?: "pending" | "failed") =>
    updateThread((t) => ({
      ...t,
      messages: t.messages.map((m) => (m.id === id ? { ...m, state } : m)),
    }));

  const deliver = (id: string) => {
    if (failNext) {
      patchMessage(id, "failed");
      setFailNext(false);
      return;
    }
    setTimeout(() => patchMessage(id, undefined), 500);
  };

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = `local-${Date.now()}`;
    updateThread((t) => ({
      ...t,
      messages: [
        ...t.messages,
        { id, from: "client", text: trimmed, at: "now", state: "pending" },
      ],
    }));
    setText("");
    deliver(id);
  };

  return (
    <Card>
      <div className="client-card-stack">
        <div className="client-kv">
          <span>{thread.subject}</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Back
          </Button>
        </div>
        {thread.messages.length === 0 && (
          <p className="client-hint">No messages yet. Say hello.</p>
        )}
        <div className="client-card-stack">
          {messages.map((m) => (
            <div
              key={m.id}
              className="client-msg"
              data-mine={m.from === "client" || undefined}
            >
              <div className="client-kv">
                <span>
                  {m.from === "client" ? client.name : thread.subject}
                </span>
                <span className="client-set-row">
                  {m.state === "pending" && (
                    <Status tone="info">Sending</Status>
                  )}
                  {m.state === "failed" && (
                    <>
                      <Status tone="danger">Failed to send</Status>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          patchMessage(m.id, "pending");
                          deliver(m.id);
                        }}
                      >
                        Retry
                      </Button>
                    </>
                  )}
                  <span>{m.at}</span>
                </span>
              </div>
              <p>{m.text}</p>
            </div>
          ))}
        </div>
        <div className="client-composer">
          <TextArea
            label="Message"
            placeholder="Write a message"
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setText(e.target.value)
            }
          />
          <div className="client-set-row">
            <Button
              variant="primary"
              onClick={send}
              disabled={!text.trim() || pendingFailed.length > 0}
            >
              Send
            </Button>
            <Toggle
              label="Simulate failed send"
              checked={failNext}
              onCheckedChange={setFailNext}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function MessagesScreen({ demo }: { demo: ParsedDemo }) {
  const [messages, setMessages] = useDemoSlice("messages");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = messages.threads.find((t) => t.id === openId) ?? null;

  const updateThread = (id: string, fn: (t: DemoThread) => DemoThread) =>
    setMessages((c) => ({
      threads: c.threads.map((t) => (t.id === id ? fn(t) : t)),
    }));

  const openThread = (thread: DemoThread) => {
    if (thread.unread) updateThread(thread.id, (t) => ({ ...t, unread: 0 }));
    setOpenId(thread.id);
  };

  return (
    <ClientScreen title="Messages" description="Talk to your coach.">
      <DemoGate demo={demo} empty="No conversations yet.">
        {open ? (
          <ThreadView
            thread={open}
            updateThread={(fn) => updateThread(open.id, fn)}
            onClose={() => setOpenId(null)}
          />
        ) : (
          <div className="client-card-stack">
            {messages.threads.map((thread) => (
              <Card key={thread.id}>
                <div className="client-kv">
                  <span className="client-set-row">
                    {thread.unread > 0 && (
                      <span
                        className="client-unread"
                        role="status"
                        aria-label={`${thread.unread} unread`}
                      />
                    )}
                    <span>{thread.subject}</span>
                  </span>
                  <span className="client-set-row">
                    <span>{thread.messages.length} messages</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openThread(thread)}
                    >
                      Open
                    </Button>
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </DemoGate>
    </ClientScreen>
  );
}
