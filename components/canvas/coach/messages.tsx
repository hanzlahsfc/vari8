"use client";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Flag,
  Info,
  MessageCircle,
  Mic,
  Paperclip,
  Search,
  Send,
  Smile,
  Sparkles,
  X,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { nextEvent } from "./clients";
import { DemoRecorder, MediaCard } from "./media";
import { uploadCanvasMedia } from "./media-card";
import {
  type CoachClient,
  formatDate,
  type Media,
  type Message,
  readConversation,
  uid,
  unreadCount,
} from "./model";
import { useCoach } from "./store";
import { templateSetup } from "./template-setup";
import { Avatar, Button, Dialog, Empty, IconButton, SearchBox } from "./ui";
import "./workspace-polish.css";

const SNIPPETS = [
  "Thanks for the update! I’ll review this alongside your check-in.",
  "Keep the same load this week and focus on controlled reps.",
  "Let’s keep things simple: consistency first, then we’ll build from here.",
];
export function MessagesWorkspace() {
  const {
    state,
    setState,
    route,
    navigate,
    attach,
    toast,
    workspaceId,
    clientProfileIdFor,
  } = useCoach();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [threadSearch, setThreadSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [context, setContext] = useState(false);
  const [menu, setMenu] = useState<"attachment" | "emoji" | "snippets" | null>(
    null,
  );
  const [voice, setVoice] = useState(false);
  const [newMessages, setNewMessages] = useState(false);

  const thread = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const positions = useRef<Record<string, number>>({});
  const priorClient = useRef<string | null>(null);
  const priorCount = useRef(0);
  const lastMessage = (id: string) =>
    state.messages.filter((m) => m.clientId === id).at(-1);
  const sortedClients = [...state.clients]
    .filter((c) => !c.archived)
    .sort((a, b) =>
      (lastMessage(b.id)?.date ?? "").localeCompare(
        lastMessage(a.id)?.date ?? "",
      ),
    );
  const selectedId = route.client;
  const client = state.clients.find((c) => c.id === selectedId);
  const draft: { text: string; attachments: Media[]; link?: Message["link"] } =
    state.drafts[selectedId ?? ""] ?? { text: "", attachments: [] };
  const link = draft.link;
  const setLink = (link: Message["link"]) => {
    if (selectedId)
      setState((s) => ({
        ...s,
        drafts: {
          ...s.drafts,
          [selectedId]: {
            ...(s.drafts[selectedId] ?? { text: "", attachments: [] }),
            link,
          },
        },
      }));
  };
  const messages = state.messages.filter((m) => m.clientId === selectedId);
  const shownClients = sortedClients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "All" ||
        (filter === "Unread"
          ? unreadCount(state, c.id) > 0
          : state.messages.some((m) => m.clientId === c.id && m.priority))),
  );
  useEffect(() => {
    if (!selectedId) return;
    setState((s) =>
      unreadCount(s, selectedId) ? readConversation(s, selectedId) : s,
    );
    setThreadSearch("");
    setMenu(null);
    setNewMessages(false);
  }, [selectedId, setState]);
  useEffect(() => {
    if (!selectedId || !thread.current) return;
    if (
      priorClient.current === selectedId &&
      priorCount.current === messages.length
    )
      return;
    priorCount.current = messages.length;
    if (priorClient.current !== selectedId) {
      thread.current.scrollTop =
        positions.current[selectedId] ?? thread.current.scrollHeight;
      priorClient.current = selectedId;
      nearBottom.current = true;
    } else if (nearBottom.current) {
      thread.current.scrollTop = thread.current.scrollHeight;
      setNewMessages(false);
    } else setNewMessages(true);
  }, [selectedId, messages.length]);
  const setDraft = (patch: Partial<{ text: string; attachments: Media[] }>) => {
    if (!selectedId) return;
    setState((s) => ({
      ...s,
      drafts: {
        ...s.drafts,
        [selectedId]: {
          ...(s.drafts[selectedId] ?? { text: "", attachments: [] }),
          ...patch,
        },
      },
    }));
  };
  const send = () => {
    if (!client || (!draft.text.trim() && !draft.attachments.length && !link))
      return;
    const m: Message = {
      id: uid("message"),
      clientId: client.id,
      text: draft.text.trim(),
      from: "coach",
      date: new Date().toISOString(),
      read: true,
      priority: false,
      attachments: draft.attachments,
      link,
      local: true,
    };
    setState((s) => ({
      ...s,
      messages: [...s.messages, m],
      drafts: { ...s.drafts, [client.id]: { text: "", attachments: [] } },
    }));
    setLink(undefined);
    nearBottom.current = true;
    setMenu(null);
    composer.current?.focus();
  };
  const flag = (m: Message) => {
    if (!client || (!client.priorityMessages && !m.priority)) return;
    setState((s) => ({
      ...s,
      messages: s.messages.map((x) =>
        x.id === m.id ? { ...x, priority: !x.priority } : x,
      ),
    }));
  };
  return (
    <div className="cd-messages-page">
      <div className="cd-messages-title">
        <h1>Messages</h1>
        <span className="cd-caption">{state.preferences.availability}</span>
      </div>
      <div
        className={`cd-messenger ${client ? "has-conversation" : ""} ${context ? "has-context" : ""}`}
      >
        <div className="cd-conversations">
          <header>
            <h2>Conversations</h2>
            <span className="cd-muted">{unreadCount(state)} unread</span>
          </header>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search conversations"
          />
          <div className="cd-tabs">
            {["All", "Unread", "Flagged"].map((f) => (
              <Button
                key={f}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
          <div className="cd-conversation-list">
            {shownClients.map((c) => {
              const m = lastMessage(c.id);
              const unread = unreadCount(state, c.id);
              const priority = state.messages.some(
                (m) => m.clientId === c.id && m.priority,
              );
              return (
                <button
                  type="button"
                  className={`cd-conversation ${client?.id === c.id ? "active" : ""}`}
                  key={c.id}
                  onClick={() =>
                    navigate({ section: "messages", client: c.id })
                  }
                >
                  <Avatar client={c} />
                  <span className="cd-conversation-copy">
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        {m
                          ? formatDate(m.date, {
                              hour: "2-digit",
                              minute: "2-digit",
                              day: undefined,
                              month: undefined,
                            })
                          : ""}
                      </small>
                    </span>
                    <span>
                      <span className="cd-excerpt">
                        {state.drafts[c.id]?.text ? (
                          <>
                            <em>Draft: </em>
                            {state.drafts[c.id].text}
                          </>
                        ) : (
                          m?.text ||
                          (m?.attachments.length
                            ? "Attachment"
                            : "Start a conversation")
                        )}
                      </span>
                      {unread > 0 && (
                        <b className="cd-unread-badge">{unread}</b>
                      )}
                      {priority && (
                        <Flag
                          className="cd-priority-icon"
                          size={13}
                          aria-label="Priority message"
                        />
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
            {shownClients.length === 0 && (
              <Empty
                title="No conversations match"
                action={
                  <Button
                    onClick={() => {
                      setSearch("");
                      setFilter("All");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )}
          </div>
        </div>
        {client ? (
          <>
            <div className="cd-chat">
              <header className="cd-chat-header">
                <IconButton
                  label="Back to conversations"
                  onClick={() => navigate({ section: "messages" })}
                >
                  <ArrowLeft size={18} />
                </IconButton>
                <Avatar client={client} />
                <button
                  className="cd-chat-person"
                  type="button"
                  onClick={() =>
                    navigate({ section: "clients", client: client.id })
                  }
                >
                  <strong>{client.name}</strong>
                  <small>
                    {client.label} · {client.phase}
                  </small>
                </button>
                <IconButton
                  label="Search in thread"
                  onClick={() => setShowSearch((s) => !s)}
                  aria-pressed={showSearch}
                >
                  <Search size={18} />
                </IconButton>
                <IconButton
                  label="Athlete context"
                  onClick={() => setContext((v) => !v)}
                  aria-expanded={context}
                >
                  <Info size={18} />
                </IconButton>
              </header>
              {showSearch && (
                <div className="cd-thread-search">
                  <SearchBox
                    value={threadSearch}
                    onChange={setThreadSearch}
                    placeholder="Search in this thread"
                  />
                  <span>
                    {
                      messages.filter((m) =>
                        m.text
                          .toLowerCase()
                          .includes(threadSearch.toLowerCase()),
                      ).length
                    }{" "}
                    matches
                  </span>
                  <IconButton
                    label="Close thread search"
                    onClick={() => {
                      setShowSearch(false);
                      setThreadSearch("");
                    }}
                  >
                    <X size={16} />
                  </IconButton>
                </div>
              )}
              <div
                className="cd-chat-scroll"
                ref={thread}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  nearBottom.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                  positions.current[client.id] = el.scrollTop;
                  if (nearBottom.current) setNewMessages(false);
                }}
              >
                <div className="cd-thread-top">
                  <span>
                    <MessageCircle size={14} />
                    Your coaching conversation
                  </span>
                </div>
                {messages
                  .filter(
                    (m) =>
                      !threadSearch ||
                      m.text.toLowerCase().includes(threadSearch.toLowerCase()),
                  )
                  .map((m, i, all) => (
                    <Fragment key={m.id}>
                      {(i === 0 ||
                        all[i - 1].date.slice(0, 10) !==
                          m.date.slice(0, 10)) && (
                        <div className="cd-date-divider">
                          <span>
                            {formatDate(m.date, {
                              weekday: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      )}
                      <div className={`cd-message-line cd-message-${m.from}`}>
                        <div
                          className={`cd-bubble ${m.priority ? "cd-bubble-priority" : ""}`}
                        >
                          {m.priority && (
                            <span className="cd-priority-label">
                              <Flag size={12} />
                              Priority message
                            </span>
                          )}
                          {m.text && <p>{m.text}</p>}
                          {m.attachments.map((a) => (
                            <MediaCard key={a.id} item={a} />
                          ))}
                          {(m.links?.length
                            ? m.links
                            : m.link
                              ? [m.link]
                              : []
                          ).map((link) => (
                            <button
                              key={link.label}
                              type="button"
                              className="cd-context-link"
                              onClick={() => navigate(link.route)}
                            >
                              {link.label}
                              <ArrowUpRight size={14} />
                            </button>
                          ))}
                          <div className="cd-bubble-meta">
                            <span>
                              {formatDate(m.date, {
                                hour: "2-digit",
                                minute: "2-digit",
                                day: undefined,
                                month: undefined,
                              })}
                            </span>
                            {m.from === "coach" && (
                              <span>
                                {m.local ? "Local message" : "Example · read"}
                                <Check size={11} />
                              </span>
                            )}
                            {m.from === "client" && (
                              <button
                                type="button"
                                className="cd-icon-button cd-message-flag"
                                aria-label={
                                  m.priority
                                    ? "Remove priority flag"
                                    : client.priorityMessages
                                      ? "Flag message as priority"
                                      : "Priority flags disabled for this athlete"
                                }
                                title={
                                  m.priority
                                    ? "Remove priority flag"
                                    : client.priorityMessages
                                      ? "Flag message as priority"
                                      : "Priority flags disabled for this athlete"
                                }
                                aria-pressed={m.priority}
                                disabled={
                                  !client.priorityMessages && !m.priority
                                }
                                onClick={() => flag(m)}
                              >
                                <Flag size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </Fragment>
                  ))}
                {messages.length === 0 && (
                  <Empty title={`Say hello to ${client.name.split(" ")[0]}`}>
                    Their coaching conversation starts here.
                  </Empty>
                )}
              </div>
              {newMessages && (
                <Button
                  className="cd-new-message"
                  onClick={() => {
                    if (thread.current)
                      thread.current.scrollTop = thread.current.scrollHeight;
                    nearBottom.current = true;
                    setNewMessages(false);
                  }}
                >
                  <ChevronDown size={14} />
                  New message
                </Button>
              )}
              <div className="cd-composer-area">
                {draft.attachments.length > 0 && (
                  <div className="cd-attachment-previews">
                    {draft.attachments.map((a) => (
                      <MediaCard
                        key={a.id}
                        item={a}
                        onRemove={() =>
                          setDraft({
                            attachments: draft.attachments.filter(
                              (x) => x.id !== a.id,
                            ),
                          })
                        }
                      />
                    ))}
                  </div>
                )}
                {link && (
                  <div className="cd-composer-link">
                    {link.label}
                    <IconButton
                      label="Remove context link"
                      onClick={() => setLink(undefined)}
                    >
                      <X size={14} />
                    </IconButton>
                  </div>
                )}
                {menu && (
                  <div className="cd-composer-menu">
                    {menu === "emoji" ? (
                      <div className="cd-emoji-picker">
                        {["😊", "💪", "🙌", "✨", "👍", "❤️", "👏", "🎯"].map(
                          (emoji) => (
                            <button
                              type="button"
                              key={emoji}
                              aria-label={`Insert ${emoji}`}
                              onClick={() => {
                                setDraft({ text: draft.text + emoji });
                                setMenu(null);
                                composer.current?.focus();
                              }}
                            >
                              {emoji}
                            </button>
                          ),
                        )}
                      </div>
                    ) : menu === "snippets" ? (
                      <>
                        <h3>Reusable replies</h3>
                        {SNIPPETS.map((s) => (
                          <Button
                            key={s}
                            onClick={() => {
                              setDraft({
                                text: draft.text ? `${draft.text}\n${s}` : s,
                              });
                              setMenu(null);
                              composer.current?.focus();
                            }}
                          >
                            {s}
                          </Button>
                        ))}
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() => {
                            file.current?.click();
                            setMenu(null);
                          }}
                        >
                          <Paperclip size={15} />
                          Choose photo, video or file
                        </Button>
                        <Button
                          onClick={() => {
                            setLink({
                              label: "View nutrition plan",
                              route: {
                                section: "clients",
                                client: client.id,
                                plan: "nutrition",
                              },
                            });
                            setMenu(null);
                          }}
                        >
                          Link nutrition plan
                          <ArrowUpRight size={14} />
                        </Button>
                        <Button
                          onClick={() => {
                            setLink({
                              label: "View training program",
                              route: {
                                section: "clients",
                                client: client.id,
                                plan: "training",
                              },
                            });
                            setMenu(null);
                          }}
                        >
                          Link training program
                          <ArrowUpRight size={14} />
                        </Button>
                        {state.submissions.find(
                          (s) => s.clientId === client.id,
                        ) && (
                          <Button
                            onClick={() => {
                              setLink({
                                label: "View latest check-in",
                                route: {
                                  section: "check-ins",
                                  client: client.id,
                                  review: state.submissions.find(
                                    (s) => s.clientId === client.id,
                                  )?.id,
                                },
                              });
                              setMenu(null);
                            }}
                          >
                            Link latest check-in
                            <ArrowUpRight size={14} />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div className="cd-composer">
                  <div className="cd-composer-tools">
                    <IconButton
                      label="Add attachment or context link"
                      aria-expanded={menu === "attachment"}
                      onClick={() =>
                        setMenu(menu === "attachment" ? null : "attachment")
                      }
                    >
                      <Paperclip size={19} />
                    </IconButton>
                    <IconButton
                      label="Emoji picker"
                      aria-expanded={menu === "emoji"}
                      onClick={() => setMenu(menu === "emoji" ? null : "emoji")}
                    >
                      <Smile size={19} />
                    </IconButton>
                    <IconButton
                      label="Reusable replies"
                      aria-expanded={menu === "snippets"}
                      onClick={() =>
                        setMenu(menu === "snippets" ? null : "snippets")
                      }
                    >
                      <Sparkles size={18} />
                    </IconButton>
                  </div>
                  <textarea
                    ref={composer}
                    rows={2}
                    aria-label={`Message ${client.name}`}
                    placeholder="Write a message…"
                    value={draft.text}
                    onChange={(e) => setDraft({ text: e.target.value })}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <IconButton label="Voice note" onClick={() => setVoice(true)}>
                    <Mic size={19} />
                  </IconButton>
                  <Button
                    primary
                    aria-label="Send message"
                    disabled={
                      !draft.text.trim() && !draft.attachments.length && !link
                    }
                    onClick={send}
                  >
                    <Send size={18} />
                  </Button>
                </div>
                <div className="cd-composer-hint">
                  Enter to send · Shift + Enter for a new line
                </div>
                <input
                  type="file"
                  multiple
                  hidden
                  ref={file}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    const items: Media[] = [];
                    for (const f of files) {
                      if (f.size > 20 * 1024 * 1024) {
                        toast(
                          "Choose files smaller than 20 MB for this local workspace.",
                        );
                        continue;
                      }
                      const item: Media = {
                        id: uid("attachment"),
                        name: f.name,
                        type: f.type || "application/octet-stream",
                        size: f.size,
                      };
                      attach(item, f);
                      items.push(item);
                      // PR-MEDIA: real upload in the background; the item
                      // stays local-previewable meanwhile (S02-08).
                      void (async () => {
                        const profileId = client
                          ? await clientProfileIdFor(client.name)
                          : null;
                        await uploadCanvasMedia(item, f, {
                          workspaceId,
                          clientProfileId: profileId ?? undefined,
                        });
                      })();
                    }
                    setDraft({ attachments: [...draft.attachments, ...items] });
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            {context && (
              <AthleteContext client={client} close={() => setContext(false)} />
            )}
          </>
        ) : (
          <div className="cd-chat-welcome">
            <span className="cd-welcome-mark">
              <MessageCircle size={35} strokeWidth={1} />
            </span>
            <h2>
              A conversation,
              <br />
              with the whole picture.
            </h2>
            <p>Select an athlete to pick up where you left off.</p>
            <Button
              onClick={() => {
                const c = sortedClients[0];
                if (c) navigate({ section: "messages", client: c.id });
              }}
            >
              Open latest conversation
              <ArrowUpRight size={15} />
            </Button>
          </div>
        )}
      </div>
      {voice && client && (
        <Dialog
          title={`Voice note · ${client.name.split(" ")[0]}`}
          onClose={() => setVoice(false)}
        >
          <p className="cd-muted">
            Use your microphone to record a voice note.
          </p>
          <DemoRecorder
            kind="voice"
            clientName={client.name}
            onAttach={(item) => {
              setDraft({ attachments: [...draft.attachments, item] });
              setVoice(false);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}
function AthleteContext({
  client,
  close,
}: {
  client: CoachClient;
  close: () => void;
}) {
  const { state, navigate } = useCoach();
  const next = nextEvent(state, client.id);
  const sub =
    state.submissions.find((s) => s.clientId === client.id && !s.response) ??
    state.submissions.find((s) => s.clientId === client.id);
  return (
    <aside className="cd-chat-context">
      <div className="cd-subheading">
        <h3>Athlete context</h3>
        <IconButton label="Close athlete context" onClick={close}>
          <X size={16} />
        </IconButton>
      </div>
      <Avatar client={client} />
      <h2>{client.name}</h2>
      <p className="cd-muted">
        {client.phase} · Week {client.week}
      </p>
      <div className="cd-context-section">
        <span>Next check-in</span>
        <strong>
          {next ? formatDate(next.date, { weekday: "short" }) : "Not scheduled"}
        </strong>
        <Button
          onClick={() => navigate({ section: "check-ins", client: client.id })}
        >
          Open calendar
          <ArrowUpRight size={14} />
        </Button>
      </div>
      <div className="cd-context-section">
        <span>Assigned template</span>
        <strong>{client.assignment?.snapshot.name ?? "Not assigned"}</strong>
        {client.assignment && (
          <small>
            {
              templateSetup(
                client.assignment.snapshot,
                client.assignment.variantId,
              ).views.length
            }{" "}
            tabs
          </small>
        )}
      </div>
      <div className="cd-context-section">
        <span>Priority permission</span>
        <strong>
          <Flag size={13} />
          {client.priorityMessages
            ? "Priority flags allowed"
            : "Priority flags disabled"}
        </strong>
        <small>Manage this athlete’s permission in their profile.</small>
      </div>
      {sub && (
        <Button
          onClick={() =>
            navigate({
              section: "check-ins",
              review: sub.id,
              client: client.id,
            })
          }
        >
          {sub.response ? "View feedback" : "Review awaiting check-in"}
          <ArrowUpRight size={14} />
        </Button>
      )}
      <Button
        onClick={() => navigate({ section: "clients", client: client.id })}
      >
        View profile
        <ArrowUpRight size={14} />
      </Button>
      <Button
        onClick={() =>
          navigate({ section: "clients", client: client.id, plan: "nutrition" })
        }
      >
        Nutrition plan
        <ArrowUpRight size={14} />
      </Button>
      <Button
        onClick={() =>
          navigate({ section: "clients", client: client.id, plan: "training" })
        }
      >
        Training program
        <ArrowUpRight size={14} />
      </Button>
    </aside>
  );
}
