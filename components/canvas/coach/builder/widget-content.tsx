"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AdditionalDetailContent } from "./additional-widget-content";
import {
  fetchOwnMessages,
  markOwnThreadRead,
  type OwnMessageWire,
  sendOwnMessage,
} from "../../data/messages";
import { CoachingWidgetContent } from "./coaching-content";
import {
  MAX_MEDIA_BYTES,
  MEDIA_CONTENT_TYPES,
  mediaKindForContentType,
} from "@/lib/media-policy";
import { MediaCard, uploadWorkspaceMedia } from "../media-card";
import type { Media } from "../model";
import {
  type ClientTask,
  dateLabel,
  type HabitRecord,
  type SourceRecords,
  type WidgetInstance,
} from "./model";
import { NutritionWidgetContent } from "./nutrition-content";
import { ProgressWidgetContent } from "./progress-content";
import { SmoothTrend } from "./smooth-trend";
import "./widgets.css";
import { initialBodyBudget } from "./widget-geometry";
import "./adaptive-frame.css";

type ContentProps = {
  widget: WidgetInstance;
  records: SourceRecords;
  width: number;
  height: number;
  columnSpan?: number;
  clientPreview: boolean;
  onRecordsChange: (records: SourceRecords) => void;
  onDetail: (key: string) => void;
  onPeriodChange?: (period: string) => void;
};

type DetailProps = {
  detail: string;
  records: SourceRecords;
  clientPreview: boolean;
  onRecordsChange: (records: SourceRecords) => void;
  workspaceId?: string;
  clientProfileId?: string;
  /** Card 05a: the own-scope host's thread refresh — the chat detail's
   *  composer and read marker resync through the same session-scoped
   *  ordering the mount load uses. */
  onMessagesRefresh?: (identityKey: string) => Promise<void> | void;
};

type Layout = "Compact" | "Regular" | "Wide" | "Tall" | "Expanded";

function actualLayout(width: number, height: number): Layout {
  if (width >= 480 && height >= 384) return "Expanded";
  if (width >= 480 && height >= 224) return "Wide";
  if (width >= 240 && height >= 384) return "Tall";
  if (width >= 320 && height >= 224) return "Regular";
  return "Compact";
}

function numericSeries(records: SourceRecords, source: string) {
  return source === "bodyweight"
    ? records.bodyweight
    : source === "steps"
      ? records.steps
      : records.waist;
}

function number(value: number | null | undefined, digits = 1) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(
        value,
      );
}

function action(label: string, onClick: () => void, quiet = false) {
  return (
    <button
      className={`cb-dw-action${quiet ? " is-quiet" : ""}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Empty({
  children,
  actionLabel,
  onAction,
}: {
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="cb-dw-empty">
      <span>{children}</span>
      {actionLabel && onAction ? action(actionLabel, onAction, true) : null}
    </div>
  );
}

function usePlotWidth() {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [plotWidth, setPlotWidth] = useState(300);
  const plotRef = useCallback((plot: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!plot) return;
    const updateWidth = () => {
      const nextWidth = Math.max(
        1,
        Math.round(plot.getBoundingClientRect().width),
      );
      setPlotWidth((current) => (current === nextWidth ? current : nextWidth));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(plot);
    observerRef.current = observer;
  }, []);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { plotRef, plotWidth };
}

function LinePlot({
  values,
  unit,
  height = 64,
}: {
  values: { date: string; value: number | null }[];
  unit: string;
  height?: number;
}) {
  const { plotRef, plotWidth } = usePlotWidth();
  return (
    <div ref={plotRef}>
      <SmoothTrend
        rows={values}
        unit={unit}
        width={plotWidth}
        height={height}
        label="Source history"
      />
    </div>
  );
}

function completionFor(habit: HabitRecord, date: string) {
  return habit.completions.find((entry) => entry.date === date)?.status;
}

function setHabit(
  records: SourceRecords,
  id: string,
  date: string,
  status: "done" | "skipped" | null,
): SourceRecords {
  return {
    ...records,
    habits: records.habits.map((habit) =>
      habit.id !== id
        ? habit
        : {
            ...habit,
            completions: [
              ...habit.completions.filter((entry) => entry.date !== date),
              ...(status ? [{ date, status }] : []),
            ],
          },
    ),
  };
}

function setTask(
  records: SourceRecords,
  id: string,
  completed: boolean,
): SourceRecords {
  return {
    ...records,
    tasks: records.tasks.map((task) =>
      task.id === id ? { ...task, completed } : task,
    ),
  };
}

function TaskRow({
  task,
  onToggle,
  interactive = true,
}: {
  task: ClientTask;
  onToggle: () => void;
  interactive?: boolean;
}) {
  return (
    <div className="cb-dw-check-row">
      {interactive ? (
        <button
          type="button"
          className={`cb-dw-check-toggle${task.completed ? " is-done" : ""}`}
          aria-label={`${task.completed ? "Undo" : "Complete"} ${task.title}`}
          onClick={onToggle}
        >
          {task.completed ? "Done" : "Mark done"}
        </button>
      ) : (
        <span className="cb-dw-task-state">
          {task.completed ? "Done" : "Open"}
        </span>
      )}
      <span>
        {task.title}
        <small>
          {dateLabel(task.dueDate)} · {task.completed ? "Completed" : "Open"}
        </small>
      </span>
    </div>
  );
}

export function WidgetContent(props: ContentProps) {
  const layout = actualLayout(props.width, props.height);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState(() =>
    initialBodyBudget(props.width, props.height),
  );
  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      const width = Math.max(
        1,
        box.width -
          Number.parseFloat(styles.paddingLeft) -
          Number.parseFloat(styles.paddingRight),
      );
      const height = Math.max(
        1,
        box.height -
          Number.parseFloat(styles.paddingTop) -
          Number.parseFloat(styles.paddingBottom),
      );
      setBody((current) =>
        Math.abs(current.width - width) < 0.5 &&
        Math.abs(current.height - height) < 0.5
          ? current
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const adaptiveProps = {
    ...props,
    bodyWidth: body.width,
    bodyHeight: body.height,
  };
  return (
    <div
      ref={bodyRef}
      className={`cb-dw-content cb-dw-adaptive dw-${layout.toLowerCase()}${props.clientPreview ? " is-client-preview" : ""}`}
      data-layout={layout}
      data-kind={props.widget.kind}
      data-body-width={Math.round(body.width)}
      data-body-height={Math.round(body.height)}
    >
      {["BN15", "BN19"].includes(props.widget.kind) ? (
        <NutritionWidgetContent {...adaptiveProps} />
      ) : [
          "TL21",
          "TL22",
          "CU01",
          "CU02",
          "CU04",
          "CU10",
          "CU17",
          "CU18",
        ].includes(props.widget.kind) ? (
        <CoachingWidgetContent {...adaptiveProps} />
      ) : (
        <ProgressWidgetContent {...adaptiveProps} />
      )}
    </div>
  );
}

function DetailRows({
  rows,
  unit,
}: {
  rows: { date: string; value: number | null }[];
  unit: string;
}) {
  return (
    <div className="cb-dw-dated-rows">
      {[...rows].reverse().map((row) => (
        <div className="cb-dw-data-row" key={row.date}>
          <span>
            {dateLabel(row.date, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <strong>
            {row.value == null ? "Not logged" : `${number(row.value)} ${unit}`}
          </strong>
        </div>
      ))}
    </div>
  );
}

/** Session-scoped lifecycle identity. Every identity transition — a
 *  workspace switch, a same-workspace profile change, or a switch away
 *  and back — produces a NEW session object. Async continuations compare
 *  the captured session by object identity, so work issued under an old
 *  session can never be re-admitted just because the identity string
 *  matches again (A → B → A). */
export function useIdentitySession(key: string | undefined) {
  const session = useRef<{ key: string; id: number } | null>(null);
  if (session.current?.key !== key)
    session.current = key
      ? { key, id: (session.current?.id ?? 0) + 1 }
      : null;
  return session;
}

/** Card 05a/P625: the one own-thread message path — every update is a
 *  sequenced reload scoped to the full client identity (workspace plus
 *  client profile): the mount load, the composer's post-send refresh and
 *  the read marker's resync all issue through `refresh`. A response can
 *  only land while its own session and ticket are still current, so a
 *  slower earlier read or a previous session's pending request — even one
 *  revisiting the same account — can never overwrite newer state. */
export function useOwnMessages(
  identity: { workspaceId: string; clientProfileId: string } | undefined,
) {
  const key = identity
    ? `${identity.workspaceId}:${identity.clientProfileId}`
    : undefined;
  const [messages, setMessages] = useState<OwnMessageWire[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const seq = useRef(0);
  const session = useRef<{ key: string; ws: string; id: number } | null>(
    null,
  );
  if (session.current?.key !== key)
    session.current = key
      ? {
          key,
          ws: identity!.workspaceId,
          id: (session.current?.id ?? 0) + 1,
        }
      : null;
  const refresh = useCallback(async (forKey: string | undefined) => {
    const s = session.current;
    if (!s || !forKey || forKey !== s.key) return;
    const ticket = ++seq.current;
    try {
      const { messages } = await fetchOwnMessages(s.ws);
      if (ticket === seq.current && session.current === s) {
        setMessages(messages);
        setLoadFailed(false);
      }
    } catch {
      // A failed refresh keeps the last known thread — sends stay
      // persisted and the next view retries. The flag lets the initial
      // load failure surface as an accessible error + retry.
      if (ticket === seq.current && session.current === s)
        setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    seq.current += 1;
    setMessages(null);
    setLoadFailed(false);
    void refresh(key);
  }, [key, refresh]);
  return { messages, refresh, loadFailed };
}

/** The client-side coach conversation composer on the served dashboard chat
 *  detail — send through the authorized own-messages API, not local state.
 *  The whole send lifecycle is account-scoped: after an account switch the
 *  pending send can still report its refresh (the host discards it), but it
 *  never writes the new account's draft, error or pending flag. */
export function ChatComposer({
  workspaceId,
  clientProfileId,
  onSent,
}: {
  workspaceId: string;
  clientProfileId: string;
  /** The post-send thread reload — routed through the host's
   *  session-scoped refresh, the same ordering authority the read marker
   *  uses. */
  onSent: (identityKey: string) => void;
}) {
  const key = `${workspaceId}:${clientProfileId}`;
  const session = useIdentitySession(key);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ kind: string; text: string } | null>(
    null,
  );
  // The request id belongs to the logical payload (trimmed text +
  // uploaded media ids) — an unchanged retry reuses it; any edit mints a
  // new payload key, so a response-lost success can never clear newer
  // content as if the old request had been acknowledged.
  const requestId = useRef<{ fp: string; id: string } | null>(null);
  const uploads = useRef(new Map<string, AbortController>());
  // Slot reservation: synchronous occupancy counter so two overlapping
  // selections can never both observe the pre-selection count.
  const slots = useRef(0);
  // W2-T8: staged uploads — only successfully uploaded media_object ids
  // are linked onto the message; pending blocks send, failed is removed
  // or reattached. Entries are session-scoped like the draft.
  type Staged = Media & { state: "pending" | "uploaded" | "failed" };
  const [staged, setStaged] = useState<Staged[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // A switched identity starts a clean session — the previous
    // session's pending send/upload can never rewrite this draft, error,
    // staged media or pending flag, even after a switch away and back.
    setDraft("");
    setError(null);
    setSending(false);
    setStaged([]);
    setError(null);
    requestId.current = null;
    for (const controller of uploads.current.values())
      controller.abort();
    uploads.current.clear();
    slots.current = 0;
  }, [key]);
  const MAX_ATTACHMENTS = 10;
  // Keep the reservation counter in step with settled state.
  useEffect(() => {
    slots.current = staged.length;
  }, [staged]);
  const removeChip = (item: { id: string }) => {
    uploads.current.get(item.id)?.abort();
    uploads.current.delete(item.id);
    slots.current = Math.max(0, slots.current - 1);
    setStaged((current) => {
      const remaining = current.filter((other) => other.id !== item.id);
      // Error lifecycle is keyed, not string-coupled: the failed-attach
      // alert clears with the last failed chip; the over-limit alert
      // clears once the count is back under the cap.
      setError((err) => {
        if (!err) return err;
        if (err.kind === "attach_failed" && !remaining.some((o) => o.state === "failed"))
          return null;
        if (err.kind === "attach_limit" && remaining.length < MAX_ATTACHMENTS)
          return null;
        return err;
      });
      return remaining;
    });
  };
  const attach = async (files: FileList | null) => {
    const s = session.current;
    if (!files || !s) return;
    const picked = Array.from(files);
    // Reserve slots synchronously — a second selection in the same tick
    // sees the reservations the first one already made.
    const room = Math.max(0, MAX_ATTACHMENTS - slots.current);
    // Controllers are created up front, not when the sequential loop
    // reaches each file — a queued chip's removal must abort its future
    // upload before it ever starts.
    const accepted = picked.slice(0, room).map((file) => {
      const id = crypto.randomUUID();
      const controller = new AbortController();
      uploads.current.set(id, controller);
      return { id, file, controller };
    });
    slots.current += accepted.length;
    if (picked.length > room)
      setError({
        kind: "attach_limit",
        text: `A message can carry up to ${MAX_ATTACHMENTS} attachments — remove some files and try again.`,
      });
    if (accepted.length > 0)
      setStaged((current) => [
        ...current,
        ...accepted.map(({ id, file }) => ({
          id,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          state: "pending" as const,
        })),
      ]);
    for (const { id, file, controller } of accepted) {
      const kind = mediaKindForContentType(
        file.type || "application/octet-stream",
      );
      if (!kind || file.size <= 0 || file.size > MAX_MEDIA_BYTES) {
        uploads.current.delete(id);
        setStaged((current) =>
          current.map((item) =>
            item.id === id ? { ...item, state: "failed" as const } : item,
          ),
        );
        continue;
      }
      try {
        // A chip removed while queued reaches here pre-aborted — never
        // start its upload.
        if (controller.signal.aborted) continue;
        const media = await uploadWorkspaceMedia({
          workspaceId,
          clientProfileId: clientProfileId || undefined,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          blob: file,
          signal: controller.signal,
        });
        uploads.current.delete(id);
        if (session.current !== s) return;
        setStaged((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...media,
                  id: item.id,
                  state: "uploaded" as const,
                }
              : item,
          ),
        );
      } catch {
        uploads.current.delete(id);
        // A cancelled upload was already removed — its late rejection
        // must not restore the chip or mark it failed — and the rest of
        // this batch continues instead of stranding pending.
        if (controller.signal.aborted) continue;
        if (session.current !== s) return;
        setStaged((current) =>
          current.map((item) =>
            item.id === id ? { ...item, state: "failed" as const } : item,
          ),
        );
      }
    }
  };
  const send = async () => {
    const text = draft.trim();
    const s = session.current;
    const ready = staged.filter((item) => item.state === "uploaded");
    if ((!text && ready.length === 0) || sending || !s) return;
    if (staged.some((item) => item.state === "pending")) return;
    if (staged.some((item) => item.state === "failed")) {
      setError({
        kind: "attach_failed",
        text: "An attachment failed to upload — remove it and reattach to send it.",
      });
      return;
    }
    const fp = `${text}￨${ready
      .map((item) => item.mediaObjectId ?? item.id)
      .sort()
      .join(",")}`;
    if (!requestId.current || requestId.current.fp !== fp)
      requestId.current = { fp, id: crypto.randomUUID() };
    setSending(true);
    setError(null);
    try {
      await sendOwnMessage(
        workspaceId,
        text,
        ready.map((item) => item.mediaObjectId ?? item.id),
        requestId.current.id,
      );
      onSent(s.key);
      if (session.current !== s) return;
      requestId.current = null;
      setDraft("");
      setStaged([]);
    } catch {
      if (session.current !== s) return;
      setError({
        kind: "send",
        text: "The message could not be sent — check your connection and try again",
      });
    } finally {
      if (session.current === s) setSending(false);
    }
  };
  return (
    <div className="cb-dw-chat-composer" style={{ marginTop: 12 }}>
      {staged.length > 0 && (
        <div className="cb-dw-detail-group" style={{ marginBottom: 8 }} aria-label="Attachments">
          {staged.map((item) => (
            <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ flex: 1 }}>
                {item.name}
                {item.state === "pending"
                  ? " — uploading…"
                  : item.state === "failed"
                    ? " — upload failed"
                    : ""}
              </span>
              <button
                type="button"
                className="cb-dw-action"
                aria-label={`Remove ${item.name}`}
                onClick={() => removeChip(item)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={Object.keys(MEDIA_CONTENT_TYPES).join(",")}
        aria-label="Attach files"
        style={{ display: "none" }}
        onChange={(event) => {
          void attach(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className="cb-dw-action"
        aria-label="Attach a file"
        disabled={sending}
        onClick={() => fileInput.current?.click()}
      >
        Attach
      </button>
      <textarea
        rows={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Message…"
        aria-label="Message"
        disabled={sending}
      />
      <button
        type="button"
        className="cm-cbtn send"
        onClick={() => void send()}
        aria-label="Send"
        disabled={
          sending ||
          staged.some((i) => i.state === "pending") ||
          (!draft.trim() && !staged.some((i) => i.state === "uploaded"))
        }
        aria-busy={sending}
      >
        Send
      </button>
      {error ? (
        <p role="alert" style={{ color: "var(--cd-err, #b45309)", fontSize: 12, margin: "4px 0 0" }}>
          {error.text}
        </p>
      ) : null}
    </div>
  );
}

/** Card 05a/P625: the served coach conversation on the client's own scope.
 *  On the home surface the thread stays collapsed until the client
 *  explicitly opens it; mark-read fires only on that explicit view while
 *  the server still reports unread inbound (staff-sent) rows — mount or
 *  offscreen rendering never marks, and the client's own unread-to-coach
 *  sends never count as inbound unread. */
export function RemoteConversation({
  workspaceId,
  clientProfileId = "",
  clientName,
  messages: externalMessages,
  onMessagesRefresh,
  loadFailed: externalLoadFailed,
  collapsible = false,
}: {
  workspaceId: string;
  /** The conversation's client identity — workspace and profile together
   *  scope the thread's lifecycle, including pending reads and the open
   *  state itself. */
  clientProfileId?: string;
  clientName: string;
  /** A host-loaded thread renders instead of a second fetch; every sync
   *  still reaches the host through `onMessagesRefresh`. */
  messages?: OwnMessageWire[] | null;
  onMessagesRefresh?: (identityKey: string) => Promise<void> | void;
  /** The host-owned load failure for the external-messages path (Home);
   *  the internal path reports its own hook's flag instead. */
  loadFailed?: boolean;
  /** Collapsed until the client asks to view the loaded thread — that
   *  explicit view is what licenses mark-read. Open surfaces (the
   *  user-navigated Messages section, chat detail) are explicit views by
   *  activation. */
  collapsible?: boolean;
}) {
  const key = `${workspaceId}:${clientProfileId}`;
  const session = useIdentitySession(key);
  const {
    messages: ownedMessages,
    refresh: refreshOwned,
    loadFailed: ownedLoadFailed,
  } = useOwnMessages(
    externalMessages === undefined
      ? { workspaceId, clientProfileId }
      : undefined,
  );
  const wire =
    externalMessages !== undefined ? externalMessages : ownedMessages;
  // Home (external) vs Messages-section (internal) path: the parent's
  // hook owns Home's fetch state, so its failure flag arrives as a prop;
  // the internal path uses this hook's own flag. Retry routes the same
  // way — no second competing fetch.
  const loadFailed =
    externalMessages !== undefined ? (externalLoadFailed ?? false) : ownedLoadFailed;
  const retry = (k: string) =>
    externalMessages !== undefined
      ? onMessagesRefresh?.(k)
      : void refreshOwned(k);
  // One ordering authority for every post-mount thread update: the
  // composer's post-send reload and the read marker's resync both issue
  // through the same session-scoped, ticketed refresh — a late pre-read
  // snapshot can never land on top of a newer one.
  const sync = useCallback(
    (forKey: string) =>
      Promise.all([
        refreshOwned(forKey),
        onMessagesRefresh?.(forKey),
      ]).then(() => undefined),
    [refreshOwned, onMessagesRefresh],
  );
  // Activation belongs to the session object itself, not the identity
  // string: an A → B → A switch produces a new session, so a stored
  // activation can never be re-admitted. Only the FIRST session opens
  // automatically on an explicitly-presented surface (a deliberate
  // Messages nav selection or the chat detail); every later session —
  // even one staying on Messages — requires a fresh activation.
  const [activated, setActivated] = useState<{
    key: string;
    id: number;
  } | null>(null);
  const open =
    activated === session.current ||
    (session.current?.id === 1 && !collapsible);
  // Single-flight read marker scoped to this session: a pending read for
  // a previous identity neither blocks nor clears the new session's mark.
  const marking = useRef<{ key: string; id: number } | null>(null);
  const unreadInbound = (wire ?? []).filter(
    (message) => message.senderKind === "STAFF" && !message.read,
  ).length;
  useEffect(() => {
    const s = session.current;
    if (!s || !open || !wire || unreadInbound === 0 || marking.current === s)
      return;
    marking.current = s;
    markOwnThreadRead(workspaceId)
      .then(() => sync(key))
      .catch(() => {
        /* stays unread; the next view or wire change retries */
      })
      .finally(() => {
        if (marking.current === s) marking.current = null;
      });
  }, [open, unreadInbound, key, workspaceId, wire, sync, session]);
  // One timezone contract (the messaging surface uses Europe/Vienna)
  // for day grouping, separator labels and bubble times — no mixing of
  // UTC slicing and browser-local rendering.
  const dayKey = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Vienna",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Vienna",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  const timeLabel = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Vienna",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  const fullLabel = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Vienna",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  return (
    <section className="cb-dw-detail" style={{ marginTop: 16 }}>
      <h3>Coach conversation</h3>
      {!open ? (
        <div className="cb-dw-detail-group">
          <button
            type="button"
            className="cb-dw-action"
            aria-expanded="false"
            onClick={() => setActivated(session.current)}
          >
            View conversation
            {unreadInbound > 0 ? ` · ${unreadInbound} unread` : ""}
          </button>
        </div>
      ) : (
        <>
          {wire === null ? (
            loadFailed ? (
              <Empty>
                The conversation could not be loaded — check your
                connection and try again.
                <button
                  type="button"
                  className="cb-dw-action"
                  onClick={() => retry(key)}
                >
                  Retry
                </button>
              </Empty>
            ) : (
              <Empty>Loading the conversation…</Empty>
            )
          ) : (
            <div className="cb-chat" role="log" aria-live="polite">
              {wire.map((message, index, all) => {
                const outbound = message.senderKind === "CLIENT";
                const newDay =
                  index === 0 ||
                  dayKey(all[index - 1].sentAt) !== dayKey(message.sentAt);
                return (
                  <div key={message.id}>
                    {newDay && (
                      <div className="cb-date-divider" aria-hidden="true">
                        <span>
                          {dayLabel(message.sentAt)}
                        </span>
                      </div>
                    )}
                    <div
                      className={`cb-msg ${outbound ? "cb-msg-out" : "cb-msg-in"}`}
                      data-sender={outbound ? "client" : "staff"}
                    >
                      <div className="cb-bubble">
                        <div className="cb-bubble-sender">
                          {outbound ? clientName : "Coach"}
                        </div>
                        {message.body ? <p>{message.body}</p> : null}
                        {(Array.isArray(message.attachments)
                          ? message.attachments
                          : []
                        ).map((attachment) =>
                          attachment &&
                          typeof attachment.mediaObjectId === "string" &&
                          attachment.mediaObjectId.length > 0 &&
                          typeof attachment.fileName === "string" ? (
                            <MediaCard
                              key={attachment.mediaObjectId}
                              workspaceId={workspaceId}
                              item={{
                                id: attachment.mediaObjectId,
                                name: attachment.fileName,
                                type:
                                  typeof attachment.contentType === "string"
                                    ? attachment.contentType
                                    : "application/octet-stream",
                                size:
                                  typeof attachment.byteSize === "number"
                                    ? attachment.byteSize
                                    : 0,
                                mediaObjectId: attachment.mediaObjectId,
                              }}
                            />
                          ) : (
                            <p
                              key="invalid"
                              className="cb-bubble-unavailable"
                            >
                              An attachment is unavailable.
                            </p>
                          ),
                        )}
                        <div className="cb-bubble-meta">
                          {!outbound && !message.read && (
                            <span className="cb-unread">Unread</span>
                          )}
                          <time
                            dateTime={message.sentAt}
                            title={fullLabel(message.sentAt)}
                            aria-label={fullLabel(message.sentAt)}
                          >
                            {timeLabel(message.sentAt)}
                          </time>
                          {outbound && (
                            <>
                              <span
                                className="cb-tick"
                                data-state={message.read ? "read" : "sent"}
                                aria-hidden="true"
                              >
                                {message.read ? "✓✓" : "✓"}
                              </span>
                              <span className="sr-only">
                                {message.read ? "Read by coach" : "Sent"}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <ChatComposer
            workspaceId={workspaceId}
            clientProfileId={clientProfileId}
            onSent={sync}
          />
        </>
      )}
    </section>
  );
}

export function DetailContent({
  detail,
  records,
  clientPreview,
  onRecordsChange,
  workspaceId,
  clientProfileId,
  onMessagesRefresh,
}: DetailProps) {
  const data = useMemo(() => {
    if (detail === "bodyweight")
      return {
        title: "Bodyweight history",
        rows: records.bodyweight,
        unit: "kg",
      };
    if (detail.startsWith("metric:")) {
      const source = detail.split(":")[1];
      const rows = numericSeries(records, source);
      return {
        title: `${source === "waist" ? "Waist" : source === "steps" ? "Steps" : "Bodyweight"} history`,
        rows,
        unit: rows.at(-1)?.unit ?? "",
      };
    }
    if (detail === "steps")
      return { title: "Step history", rows: records.steps, unit: "steps" };
    if (detail.startsWith("exercise:")) {
      const exerciseId = detail.split(":")[1];
      const sessions = records.exerciseSessions.filter(
        (session) => session.exerciseId === exerciseId,
      );
      return {
        title: `${sessions[0]?.exercise ?? exerciseId.replaceAll("-", " ")} sessions`,
        rows: sessions.map((session) => ({
          date: session.date,
          value: session.load,
        })),
        unit: sessions[0]?.unit ?? "",
      };
    }
    return null;
  }, [detail, records]);

  if (detail.startsWith("additional:"))
    return (
      <AdditionalDetailContent
        detail={detail}
        records={records}
        clientPreview={clientPreview}
        onRecordsChange={onRecordsChange}
      />
    );

  if (data)
    return (
      <section className="cb-dw-detail">
        <h3>{data.title}</h3>
        <DetailRows rows={data.rows} unit={data.unit} />
        {detail.startsWith("exercise:") &&
          records.exerciseSessions
            .filter((session) => session.exerciseId === detail.split(":")[1])
            .map((session) => (
              <div className="cb-dw-data-row" key={`session-${session.date}`}>
                <span>
                  {dateLabel(session.date)} · {session.exercise}
                </span>
                <strong>
                  {session.sets} sets × {session.reps} reps · {session.load}{" "}
                  {session.unit}
                </strong>
              </div>
            ))}
        {detail === "bodyweight" || detail === "metric:bodyweight" ? (
          <LinePlot values={data.rows} unit={data.unit} height={118} />
        ) : null}
      </section>
    );

  if (detail.startsWith("nutrition:")) {
    const active = detail.split(":")[1] === "active";
    const option =
      detail.split(":")[1] === "TD" || detail.split(":")[1] === "NTD"
        ? (detail.split(":")[1] as "TD" | "NTD")
        : records.activeNutritionOption;
    const days = records.macroIntake.filter((day) => day.option === option);
    const optionLabel = option === "TD" ? "Training day" : "Non-training day";
    return (
      <section className="cb-dw-detail">
        <h3>{optionLabel} nutrition</h3>
        {active && (
          <div className="cb-dw-switch-line">
            <span>Shared active option</span>
            <button
              type="button"
              onClick={() =>
                onRecordsChange({
                  ...records,
                  activeNutritionOption: option === "TD" ? "NTD" : "TD",
                })
              }
            >
              Switch to {option === "TD" ? "NTD" : "TD"}
            </button>
          </div>
        )}
        {days.length ? (
          days.map((day) => (
            <div className="cb-dw-detail-group" key={day.date}>
              <h4>
                {dateLabel(day.date, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </h4>
              {(["protein", "carbs", "fat"] as const).map((macro) => {
                const target = records.macroTargets.find(
                  (entry) =>
                    entry.macro === macro &&
                    entry.option === option &&
                    entry.effectiveFrom <= day.date &&
                    (!entry.effectiveTo || entry.effectiveTo >= day.date),
                );
                const amount = day[macro];
                const goal = !target
                  ? "No target"
                  : target.kind === "range"
                    ? `Range ${target.low}–${target.high} ${target.unit}`
                    : target.kind === "minimum"
                      ? `Minimum ≥${target.low} ${target.unit}`
                      : `Fixed ${target.low} ${target.unit}`;
                return (
                  <div className="cb-dw-data-row" key={macro}>
                    <span>
                      {macro} · target {goal}
                    </span>
                    <strong>
                      {amount == null ? "Not logged" : `${amount} g`}
                    </strong>
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <Empty>
            Nothing logged for this option. Targets remain available from the
            active plan.
          </Empty>
        )}
      </section>
    );
  }

  if (detail === "workouts")
    return (
      <section className="cb-dw-detail">
        <h3>Assigned training</h3>
        {records.workoutSchedule
          .filter((session) => session.date >= records.client.asOf)
          .map((session) => {
            const plan = [...records.prescriptions]
              .filter((entry) => entry.effectiveFrom <= session.date)
              .sort((a, b) =>
                b.effectiveFrom.localeCompare(a.effectiveFrom),
              )[0];
            return (
              <div className="cb-dw-detail-group" key={session.date}>
                <h4>
                  {session.name} · {plan?.label ?? `Week ${session.week}`} ·{" "}
                  {dateLabel(session.date)}
                </h4>
                {session.exercises.map((exercise) => (
                  <div className="cb-dw-data-row" key={exercise.id}>
                    <span>
                      {exercise.name}
                      {plan?.exercises.find((entry) => entry.id === exercise.id)
                        ?.note
                        ? ` · ${plan.exercises.find((entry) => entry.id === exercise.id)?.note}`
                        : ""}
                    </span>
                    <strong>
                      {exercise.sets} × {exercise.reps}
                    </strong>
                  </div>
                ))}
              </div>
            );
          })}
        {records.prescriptions
          .filter((plan) => plan.effectiveFrom <= records.client.asOf)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
          .slice(0, 1)
          .map((plan) => (
            <div className="cb-dw-detail-group" key={plan.week}>
              <h4>
                {plan.label} prescriptions · effective{" "}
                {dateLabel(plan.effectiveFrom)}
              </h4>
              {plan.exercises.map((exercise) => (
                <div className="cb-dw-data-row" key={exercise.id}>
                  <span>
                    {exercise.name}
                    {exercise.note ? ` · ${exercise.note}` : ""}
                  </span>
                  <strong>
                    {exercise.sets} × {exercise.reps}
                  </strong>
                </div>
              ))}
            </div>
          ))}
      </section>
    );

  if (detail === "recovery")
    return (
      <section className="cb-dw-detail">
        <h3>Recovery answers</h3>
        {records.recovery.map((field) => (
          <div className="cb-dw-detail-group" key={field.field}>
            <h4>
              {field.label} · {field.scale.join(" / ")}
            </h4>
            {field.entries.map((entry) => (
              <div className="cb-dw-data-row" key={entry.date}>
                <span>
                  {dateLabel(entry.date, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <strong>{entry.value}</strong>
              </div>
            ))}
          </div>
        ))}
      </section>
    );

  if (detail === "habits")
    return (
      <section className="cb-dw-detail">
        <h3>Today’s habits</h3>
        {records.habits
          .filter((habit) => habit.scheduledDates.includes(records.client.asOf))
          .map((habit) => {
            const status = completionFor(habit, records.client.asOf);
            return (
              <div className="cb-dw-check-row" key={habit.id}>
                <button
                  type="button"
                  className={`cb-dw-check-toggle${status === "done" ? " is-done" : ""}`}
                  aria-label={`${status === "done" ? "Undo" : "Complete"} ${habit.name}`}
                  aria-pressed={status === "done"}
                  onClick={() =>
                    onRecordsChange(
                      setHabit(
                        records,
                        habit.id,
                        records.client.asOf,
                        status === "done" ? null : "done",
                      ),
                    )
                  }
                >
                  {status === "done" ? "Done" : "Mark done"}
                </button>
                <span>
                  {habit.name}
                  <small>
                    {habit.target} · {status ?? "Not logged"}
                  </small>
                </span>
              </div>
            );
          })}
      </section>
    );

  if (detail === "tasks")
    return (
      <section className="cb-dw-detail">
        <h3>Client tasks</h3>
        {records.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={() =>
              onRecordsChange(setTask(records, task.id, !task.completed))
            }
          />
        ))}
      </section>
    );

  if (detail === "checkins")
    return (
      <section className="cb-dw-detail">
        <h3>Check-in history</h3>
        {records.checkInSchedule.map((entry) => (
          <div className="cb-dw-data-row" key={`${entry.date}-${entry.kind}`}>
            <span>
              {dateLabel(entry.date, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              · {entry.kind === "additional" ? "Added" : "Scheduled"}
            </span>
            <strong>Scheduled</strong>
          </div>
        ))}
        {records.checkIns.map((entry) => (
          <div className="cb-dw-detail-group" key={entry.id}>
            <h4>
              {dateLabel(entry.date)} ·{" "}
              {entry.status === "feedback received"
                ? "Feedback received"
                : entry.status === "draft"
                  ? "Draft · not submitted"
                  : "Submitted"}
            </h4>
            <p>{entry.summary}</p>
            {entry.status !== "draft" && (
              <span>{entry.visualCount} submitted visuals</span>
            )}
          </div>
        ))}
      </section>
    );

  if (detail === "feedback")
    return (
      <section className="cb-dw-detail">
        <h3>Published coach feedback</h3>
        {records.feedback.map((feedback) => (
          <article className="cb-dw-detail-group" key={feedback.id}>
            <h4>
              {dateLabel(feedback.sentAt)} · {feedback.read ? "Read" : "Unread"}
            </h4>
            <p>{feedback.excerpt}</p>
            {feedback.video && <span>Video response available</span>}
            {feedback.links.map((link) => (
              <div className="cb-dw-data-row" key={link.label}>
                <span>{link.label}</span>
                <strong>{link.destination}</strong>
              </div>
            ))}
          </article>
        ))}
      </section>
    );

  if (detail.startsWith("destination:")) {
    const destination = detail.split(":")[1];
    const panels: Record<string, string> = {
      Tracker: "bodyweight",
      Mealplan: "nutrition:active",
      Training: "workouts",
      "Check-in": "checkins",
      "Habit Tracker": "habits",
      Chat: "chat",
    };
    return (
      <DetailContent
        detail={panels[destination] ?? "bodyweight"}
        records={records}
        clientPreview={clientPreview}
        onRecordsChange={onRecordsChange}
        workspaceId={workspaceId}
        onMessagesRefresh={onMessagesRefresh}
      />
    );
  }

  if (detail === "chat")
    return workspaceId ? (
      <RemoteConversation
        workspaceId={workspaceId}
        clientProfileId={clientProfileId}
        clientName={records.client.name}
        onMessagesRefresh={onMessagesRefresh}
      />
    ) : (
      <section className="cb-dw-detail">
        <h3>Coach conversation</h3>
        {records.messages.map((message) => (
          <div className="cb-dw-detail-group" key={message.id}>
            <h4>
              {message.sender} ·{" "}
              {dateLabel(message.date, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              {message.unread ? " · Unread" : ""}
            </h4>
            <p>{message.excerpt}</p>
          </div>
        ))}
      </section>
    );

  return (
    <section className="cb-dw-detail">
      <h3>Source history</h3>
      <p>
        {clientPreview
          ? "No additional client-visible records."
          : "No records are available for this source."}
      </p>
    </section>
  );
}
