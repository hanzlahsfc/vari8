"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  WIDGET_CATALOGUE,
  WIDGET_KINDS,
  canonicalizeDashboardConfig,
  compactRects,
  defaultWidgetSettings,
  projectClientDashboardConfig,
  readingOrder,
  widgetOptionOptions,
  widgetPeriodOptions,
  widgetSourceOptions,
  widgetStaticFieldOptions,
  widgetSummaryOptions,
  widgetTargetAvailable,
  HISTORY_PERIODS,
  SIZE_OPTIONS,
  type BreakpointName,
  type DashboardConfig,
  type Rect,
  type WidgetKind,
  type WidgetSettings,
} from "@/lib/dashboard/config-schema";
import type { DashboardSafeResult } from "@/lib/dashboard/boundary";

import {
  reloadClientDashboardLayout,
  saveClientDashboardLayout,
} from "./actions";

type SaveState =
  "idle" | "saving" | "saved" | "failed" | "conflict" | "denied" | "readonly";

type SaveResult = DashboardSafeResult<{
  revision: number;
  config: DashboardConfig;
}>;

const COLUMNS: Record<BreakpointName, number> = {
  desktop: 12,
  tablet: 6,
  mobile: 2,
};
const BREAKPOINTS: BreakpointName[] = ["desktop", "tablet", "mobile"];
const ROW_PX = 72;
const MAX_SAVE_ATTEMPTS = 3;

/**
 * Lily-aligned autosaving builder (I1-R2): breakpoint canvas with
 * drag/resize commits (pointer end only — never per-move), per-widget
 * settings within the same allowlists the server enforces, client
 * preview via the same projection the server applies, undo/redo,
 * beforeunload guard while edits are pending, bounded retry/backoff,
 * reconcile-on-conflict via the staff boundary + canonical compare.
 */
export function DashboardEditor({
  workspaceId,
  clientProfileId,
  initialConfig,
  initialRevision,
  canEdit,
}: {
  workspaceId: string;
  clientProfileId: string;
  initialConfig: DashboardConfig;
  initialRevision: number;
  canEdit: boolean;
}) {
  const [config, setConfig] = useState<DashboardConfig>(initialConfig);
  const [saveState, setSaveState] = useState<SaveState>(
    canEdit ? "idle" : "readonly",
  );
  const [dirty, setDirty] = useState(false);
  const [bp, setBp] = useState<BreakpointName>("desktop");
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [leavePrompt, setLeavePrompt] = useState(false);
  const router = useRouter();
  const navTarget = useRef<string | null>(null);

  const latestConfig = useRef(config);
  latestConfig.current = config;
  const confirmedRevision = useRef(initialRevision);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const history = useRef<{
    past: DashboardConfig[];
    future: DashboardConfig[];
  }>({ past: [], future: [] });

  const pending = () =>
    dirty || inFlight.current || queued.current || timer.current !== null;

  const flush = useCallback(
    async (attempt = 1) => {
      if (inFlight.current) {
        queued.current = true;
        return;
      }
      inFlight.current = true;
      setSaveState("saving");
      const snapshot = latestConfig.current;
      const expected = confirmedRevision.current;
      let result: SaveResult;
      try {
        result = (await saveClientDashboardLayout({
          workspaceId,
          clientProfileId,
          config: snapshot,
          expectedRevision: expected,
        })) as SaveResult;
      } catch {
        result = {
          ok: false,
          code: "not_available",
          message: "",
        } as SaveResult;
      }
      inFlight.current = false;

      if (result.ok) {
        retries.current = 0;
        confirmedRevision.current = result.value.revision;
        setDirty(queued.current);
        setSaveState("saved");
        // a pending in-app navigation waited for this commit — now it
        // may proceed with confirmed persistence
        if (navTarget.current && !queued.current) {
          const href = navTarget.current;
          navTarget.current = null;
          router.push(href);
        }
      } else if (result.code === "denied") {
        // truthful denial (e.g. revoked mid-save) — never "conflict"
        setSaveState("denied");
      } else if (
        result.code === "conflict" ||
        result.code === "serialization_conflict"
      ) {
        const reload = await reloadClientDashboardLayout({
          workspaceId,
          clientProfileId,
        });
        if (!reload.ok) {
          // denied/failed reconciliation stays truthful
          setSaveState(
            !reload.ok && reload.code === "denied" ? "denied" : "failed",
          );
        } else {
          const serverLayout = reload.value.layout;
          if (
            serverLayout &&
            canonicalizeDashboardConfig(serverLayout.config) ===
              canonicalizeDashboardConfig(snapshot)
          ) {
            retries.current = 0;
            confirmedRevision.current = serverLayout.revision;
            setDirty(queued.current);
            setSaveState("saved");
          } else {
            setSaveState("conflict");
          }
        }
      } else {
        // bounded retry with backoff on ambiguous/failed saves
        if (attempt < MAX_SAVE_ATTEMPTS) {
          retries.current = attempt;
          timer.current = setTimeout(() => {
            timer.current = null;
            void flush(attempt + 1);
          }, 1000 * attempt);
          setSaveState("saving");
        } else {
          setSaveState("failed");
        }
      }
      // a waiting navigation whose save did not cleanly commit requires
      // an explicit discard decision — never a silent leave
      if (
        navTarget.current &&
        !result.ok &&
        ["failed", "denied", "conflict"].includes(result.code)
      )
        setLeavePrompt(true);
      if (queued.current) {
        queued.current = false;
        void flush();
      }
    },
    [workspaceId, clientProfileId, router],
  );

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, 500);
  }, [flush]);

  const commit = useCallback(
    (next: DashboardConfig) => {
      history.current.past.push(latestConfig.current);
      history.current.future = [];
      setConfig(next);
      setDirty(true);
      setSaveState((s) => (s === "readonly" ? s : "saving"));
      schedule();
    },
    [schedule],
  );

  const travel = useCallback(
    (dir: "undo" | "redo") => {
      const stack =
        dir === "undo" ? history.current.past : history.current.future;
      const target =
        dir === "undo" ? history.current.future : history.current.past;
      const prev = stack.pop();
      if (!prev) return;
      target.push(latestConfig.current);
      setConfig(prev);
      setDirty(true);
      schedule();
    },
    [schedule],
  );

  // Navigation guard (P2-3/P2-3-R3):
  // • beforeunload covers document exits (reload/close/Back leaving the
  //   document) while anything is pending.
  // • A capture-phase click listener intercepts internal <a href> clicks
  //   (including keyboard activation — Enter fires click) while pending:
  //   the navigation is held, the debounce is flushed immediately, and
  //   the stored href is pushed once the save commits. A save that fails,
  //   conflicts or is denied surfaces the explicit Leave-anyway prompt —
  //   never a silent loss. Modifier clicks, external/hash links and
  //   non-primary buttons pass through untouched.
  // • popstate cannot be cancelled. On Back/Forward while pending we
  //   attempt history.forward() to restore the editor AND flush the
  //   pending save immediately — same-document SPA navigation keeps the
  //   JS realm alive, so an already-started save still commits even if
  //   the component unmounts. Forward-restore is best-effort; if the
  //   navigation completes anyway the committed server state is intact.
  //   The listener is removed on unmount — unrelated routes keep no
  //   residual guard.
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (pending()) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
    // pending() reads refs — always current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  useEffect(() => {
    if (!canEdit) return;
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as Element).closest?.("a[href]");
      if (!a || a.getAttribute("target")) return;
      const href = a.getAttribute("href")!;
      if (!href.startsWith("/") || href === window.location.pathname) return;
      if (!pending()) return;
      // hold the navigation; flush the pending save immediately, then
      // push the intended destination once it commits
      e.preventDefault();
      e.stopPropagation();
      navTarget.current = href;
      if (inFlight.current) return; // resolves → navigates
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      void flush();
    };
    const onPop = () => {
      if (!pending()) return;
      try {
        window.history.forward();
      } catch {
        /* best-effort restore — navigation may still proceed */
      }
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (!inFlight.current) void flush();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [canEdit, flush]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const reload = useCallback(async () => {
    const r = await reloadClientDashboardLayout({
      workspaceId,
      clientProfileId,
    });
    if (r.ok && r.value.layout) {
      setConfig(r.value.layout.config);
      confirmedRevision.current = r.value.layout.revision;
      setDirty(false);
      setSaveState(canEdit ? "idle" : "readonly");
    }
  }, [workspaceId, clientProfileId, canEdit]);

  // ---------- canvas ----------

  const shown = preview ? projectClientDashboardConfig(config) : config;
  const rects = shown.layouts[bp] ?? {};
  const columns = COLUMNS[bp];

  const setRect = (id: string, next: Rect) =>
    commit({
      ...latestConfig.current,
      layouts: {
        ...latestConfig.current.layouts,
        [bp]: compactRects({
          ...(latestConfig.current.layouts[bp] ?? {}),
          [id]: next,
        }),
      },
    });

  const canvasRef = useRef<HTMLDivElement | null>(null);

  /** Pointer-drag: track deltas, commit the resolved rect on pointerup. */
  const dragStart = (
    e: React.PointerEvent,
    id: string,
    mode: "move" | "resize",
  ) => {
    if (!canEdit) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cellW = canvas.clientWidth / columns;
    const start = { x: e.clientX, y: e.clientY };
    const origin = rects[id];
    const move = (ev: PointerEvent) => {
      const dx = Math.round((ev.clientX - start.x) / cellW);
      const dy = Math.round((ev.clientY - start.y) / ROW_PX);
      const el = canvas.querySelector<HTMLElement>(`[data-widget-id="${id}"]`);
      if (!el) return;
      if (mode === "move") {
        el.dataset.dx = String(dx);
        el.dataset.dy = String(dy);
        el.style.transform = `translate(${dx * cellW}px, ${dy * ROW_PX}px)`;
      } else {
        el.dataset.dw = String(dx);
        el.dataset.dh = String(dy);
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const el = canvas.querySelector<HTMLElement>(`[data-widget-id="${id}"]`);
      if (!el) return;
      const dx = Math.round((ev.clientX - start.x) / cellW);
      const dy = Math.round((ev.clientY - start.y) / ROW_PX);
      el.style.transform = "";
      delete el.dataset.dx;
      delete el.dataset.dy;
      delete el.dataset.dw;
      delete el.dataset.dh;
      if (dx === 0 && dy === 0) return;
      // commit once, on gesture end
      if (mode === "move") {
        setRect(id, {
          ...origin,
          x: Math.max(0, Math.min(columns - origin.w, origin.x + dx)),
          y: Math.max(0, origin.y + dy),
        });
      } else {
        setRect(id, {
          ...origin,
          w: Math.max(1, Math.min(columns - origin.x, origin.w + dx)),
          h: Math.max(bp === "mobile" ? 3 : 2, origin.h + dy),
        });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  };

  // ---------- mutations ----------

  const mutate = (fn: (c: DashboardConfig) => DashboardConfig) =>
    commit(fn(latestConfig.current));

  const addWidget = (kind: WidgetKind) => {
    const id = `w-${kind.toLowerCase()}-${Date.now().toString(36)}`;
    mutate((c) => {
      const nextLayouts = { ...c.layouts };
      // a rect in every *present* breakpoint (coherence rule) + desktop
      // is always present
      const present: BreakpointName[] = [
        "desktop",
        ...BREAKPOINTS.filter((n) => n !== "desktop" && nextLayouts[n]),
      ];
      for (const name of present) {
        const r = { ...(nextLayouts[name] ?? {}) };
        const maxY = Object.values(r).reduce(
          (m, x) => Math.max(m, x.y + x.h),
          0,
        );
        r[id] = {
          x: 0,
          y: maxY,
          w: name === "mobile" ? 2 : Math.min(4, COLUMNS[name]),
          h: 3,
          size: "Regular",
        };
        nextLayouts[name] = r;
      }
      return {
        ...c,
        widgets: [
          ...c.widgets,
          { id, kind, settings: defaultWidgetSettings(kind) },
        ],
        layouts: nextLayouts,
      };
    });
  };

  const removeWidget = (id: string) =>
    mutate((c) => {
      const nextLayouts = { ...c.layouts };
      for (const name of BREAKPOINTS) {
        if (nextLayouts[name]) {
          const r = { ...nextLayouts[name] };
          delete r[id];
          nextLayouts[name] = compactRects(r);
        }
      }
      return {
        ...c,
        widgets: c.widgets.filter((w) => w.id !== id),
        layouts: nextLayouts,
      };
    });

  const moveWidget = (id: string, dir: -1 | 1) =>
    mutate((c) => {
      const r = { ...(c.layouts[bp] ?? {}) };
      const ids = readingOrder(r);
      const idx = ids.indexOf(id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= ids.length) return c;
      const other = ids[swap];
      const tmp = r[id];
      r[id] = r[other];
      r[other] = tmp;
      return { ...c, layouts: { ...c.layouts, [bp]: compactRects(r) } };
    });

  const cycleSize = (id: string, dir: 1 | -1) =>
    mutate((c) => {
      const r = { ...(c.layouts[bp] ?? {}) };
      const cur = r[id];
      if (!cur) return c;
      const idx = SIZE_OPTIONS.indexOf(cur.size);
      const next =
        SIZE_OPTIONS[(idx + dir + SIZE_OPTIONS.length) % SIZE_OPTIONS.length];
      r[id] = { ...cur, size: next };
      return { ...c, layouts: { ...c.layouts, [bp]: r } };
    });

  const setVisibility = (id: string, visibility: "staff" | "client") =>
    setSetting(id, { visibility });

  const setSetting = (id: string, patch: Partial<WidgetSettings>) =>
    mutate((c) => ({
      ...c,
      widgets: c.widgets.map((w) =>
        w.id === id ? { ...w, settings: { ...w.settings, ...patch } } : w,
      ),
    }));

  // ---------- render ----------

  const widgetAt = (id: string) => shown.widgets.find((w) => w.id === id);
  const order = readingOrder(rects).filter((id) => widgetAt(id));

  return (
    <section aria-label="Dashboard editor" data-testid="dashboard-editor">
      <div className="dashboard-toolbar" role="status" aria-live="polite">
        <label>
          Dashboard name{" "}
          <input
            value={config.name}
            maxLength={80}
            disabled={!canEdit}
            onChange={(e) => mutate((c) => ({ ...c, name: e.target.value }))}
            data-testid="dashboard-name"
          />
        </label>
        <span data-testid="save-state">
          {saveState === "saving" || (saveState === "idle" && dirty)
            ? "Saving…"
            : saveState === "saved" && !dirty
              ? "Saved"
              : saveState === "saved" && dirty
                ? "Saved — newer edits pending"
                : saveState === "failed"
                  ? "Failed — edits kept"
                  : saveState === "denied"
                    ? "Save denied — edits kept"
                    : saveState === "conflict"
                      ? "Layout changed by another coach — reload to continue"
                      : saveState === "readonly"
                        ? "Read-only"
                        : "Saved"}
        </span>
        {canEdit && saveState === "conflict" ? (
          <button type="button" onClick={() => void reload()}>
            Reload
          </button>
        ) : null}
        {leavePrompt && navTarget.current ? (
          <span role="alert" data-testid="leave-prompt">
            Save did not complete —{" "}
            <button
              type="button"
              data-testid="leave-anyway"
              onClick={() => {
                // explicit abandonment: stop the pending work — the
                // debounce and queue are cancelled; an already-sent
                // request may still have committed server-side.
                if (timer.current) {
                  clearTimeout(timer.current);
                  timer.current = null;
                }
                queued.current = false;
                const href = navTarget.current;
                navTarget.current = null;
                setLeavePrompt(false);
                router.push(href!);
              }}
            >
              Leave anyway
            </button>{" "}
            <button
              type="button"
              data-testid="stay"
              onClick={() => {
                navTarget.current = null;
                setLeavePrompt(false);
              }}
            >
              Stay
            </button>
          </span>
        ) : null}
        {canEdit ? (
          <>
            <button type="button" onClick={() => travel("undo")}>
              Undo
            </button>
            <button type="button" onClick={() => travel("redo")}>
              Redo
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
          data-testid="client-preview"
        >
          {preview ? "Editing" : "Client preview"}
        </button>
      </div>

      {canEdit && !config.layouts[bp] && config.widgets.length > 0 ? (
        <p>
          No {bp} layout yet.{" "}
          <button
            type="button"
            data-testid={`init-${bp}`}
            onClick={() =>
              mutate((c) => {
                const source = c.layouts.desktop ?? {};
                const r: Record<string, Rect> = {};
                for (const [id, rect] of Object.entries(source))
                  r[id] = {
                    ...rect,
                    x: 0,
                    w: bp === "mobile" ? 2 : Math.min(rect.w, COLUMNS[bp]),
                    h: Math.max(bp === "mobile" ? 3 : 2, rect.h),
                    y: rect.y,
                  };
                return {
                  ...c,
                  layouts: { ...c.layouts, [bp]: compactRects(r) },
                };
              })
            }
          >
            Initialize {bp} from desktop
          </button>
        </p>
      ) : null}
      <div
        className="dashboard-breakpoints"
        role="tablist"
        aria-label="Breakpoint"
      >
        {BREAKPOINTS.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={bp === name}
            onClick={() => setBp(name)}
            data-testid={`bp-${name}`}
          >
            {name}
          </button>
        ))}
      </div>

      {canEdit && !preview ? (
        <label>
          Add widget{" "}
          <select
            data-testid="add-widget"
            onChange={(e) => {
              if (e.target.value) addWidget(e.target.value as WidgetKind);
              e.target.value = "";
            }}
            defaultValue=""
          >
            <option value="">Choose…</option>
            {WIDGET_KINDS.map((k) => (
              <option key={k} value={k}>
                {WIDGET_CATALOGUE[k].name} ({k})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div
        ref={canvasRef}
        className="dashboard-canvas"
        data-testid="dashboard-canvas"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridAutoRows: `${ROW_PX}px`,
          gap: "0.5rem",
          marginTop: "1rem",
        }}
      >
        {order.length === 0 ? (
          <div className="empty-state" role="status" data-testid="empty-grid">
            <p>
              {preview
                ? "No widgets are shared with the client."
                : "No widgets yet."}
            </p>
          </div>
        ) : (
          order.map((id) => {
            const widget = widgetAt(id);
            const r = rects[id];
            if (!widget || !r) return null;
            const cat = WIDGET_CATALOGUE[widget.kind];
            return (
              <article
                key={id}
                className="dashboard-widget"
                data-testid={`widget-${id}`}
                data-widget-id={id}
                style={{
                  gridColumn: `${r.x + 1} / span ${r.w}`,
                  gridRow: `${r.y + 1} / span ${r.h}`,
                  touchAction: "none",
                }}
              >
                <header
                  onPointerDown={(e) => dragStart(e, id, "move")}
                  style={{ cursor: canEdit ? "grab" : "default" }}
                >
                  <strong>{widget.settings.title}</strong>{" "}
                  <span>
                    {cat.name}
                    {!cat.connected ? " · Not connected" : ""} ·{" "}
                    {widget.settings.visibility === "client"
                      ? "Client"
                      : "Staff only"}
                  </span>
                </header>
                {canEdit && !preview ? (
                  <div className="dashboard-widget__controls">
                    <button
                      type="button"
                      onClick={() => moveWidget(id, -1)}
                      aria-label={`Move ${widget.settings.title} earlier`}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => moveWidget(id, 1)}
                      aria-label={`Move ${widget.settings.title} later`}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      onClick={() => cycleSize(id, 1)}
                      aria-label={`Resize ${widget.settings.title}`}
                    >
                      {r.size}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setVisibility(
                          id,
                          widget.settings.visibility === "client"
                            ? "staff"
                            : "client",
                        )
                      }
                      aria-label={`Toggle visibility for ${widget.settings.title}`}
                      data-testid={`visibility-${id}`}
                    >
                      {widget.settings.visibility === "client"
                        ? "Make staff-only"
                        : "Share with client"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing((e) => (e === id ? null : id))}
                      aria-expanded={editing === id}
                      data-testid={`edit-${id}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeWidget(id)}
                      aria-label={`Remove ${widget.settings.title}`}
                    >
                      Remove
                    </button>
                    <span
                      className="dashboard-widget__resize"
                      role="button"
                      tabIndex={0}
                      aria-label={`Drag to resize ${widget.settings.title}`}
                      onPointerDown={(e) => dragStart(e, id, "resize")}
                      style={{
                        cursor: "nwse-resize",
                        userSelect: "none",
                      }}
                    >
                      ↘
                    </span>
                  </div>
                ) : null}
                {canEdit && !preview && editing === id ? (
                  <SettingsPanel
                    widget={widget}
                    onChange={(patch) => setSetting(id, patch)}
                  />
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

/** Per-widget settings — every select bound to the same allowlists the
 * server enforces; bounded text for fields/labels. */
function SettingsPanel({
  widget,
  onChange,
}: {
  widget: { id: string; kind: WidgetKind; settings: WidgetSettings };
  onChange: (patch: Partial<WidgetSettings>) => void;
}) {
  const s = widget.settings;
  const staticFields = widgetStaticFieldOptions(widget.kind);
  const set = (patch: Partial<WidgetSettings>) => onChange(patch);
  return (
    <fieldset
      className="dashboard-widget__settings"
      data-testid="widget-settings"
    >
      <legend>Widget settings</legend>
      <label>
        Title{" "}
        <input
          value={s.title}
          maxLength={80}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <label>
        Source{" "}
        <select
          value={s.source}
          onChange={(e) => set({ source: e.target.value })}
        >
          {widgetSourceOptions(widget.kind).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <label>
        Summary{" "}
        <select
          value={s.summary}
          onChange={(e) => set({ summary: e.target.value })}
        >
          {widgetSummaryOptions(widget.kind, s.source).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      {widgetPeriodOptions(widget.kind).length > 1 ? (
        <label>
          Period{" "}
          <select
            value={s.period}
            onChange={(e) => set({ period: e.target.value })}
          >
            {widgetPeriodOptions(widget.kind).map((o) => (
              <option key={o} value={o}>
                {o || "none"}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        History{" "}
        <select
          value={s.historyPeriod}
          onChange={(e) =>
            set({
              historyPeriod: e.target.value as WidgetSettings["historyPeriod"],
            })
          }
        >
          {HISTORY_PERIODS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      {widgetOptionOptions(widget.kind).length > 1 ? (
        <label>
          Option{" "}
          <select
            value={s.option}
            onChange={(e) => set({ option: e.target.value })}
          >
            {widgetOptionOptions(widget.kind).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Unit{" "}
        <input
          value={s.unit}
          maxLength={16}
          onChange={(e) => set({ unit: e.target.value })}
        />
      </label>
      {widgetTargetAvailable(widget.kind) ? (
        <label>
          <input
            type="checkbox"
            checked={s.target}
            onChange={(e) => set({ target: e.target.checked })}
          />{" "}
          Show target
        </label>
      ) : null}
      {staticFields ? (
        <fieldset>
          <legend>Fields</legend>
          {staticFields.map((f) => (
            <label key={f}>
              <input
                type="checkbox"
                checked={s.fields.includes(f)}
                onChange={(e) =>
                  set({
                    fields: e.target.checked
                      ? [...s.fields, f]
                      : s.fields.filter((x) => x !== f),
                  })
                }
              />{" "}
              {f}
            </label>
          ))}
        </fieldset>
      ) : (
        <label>
          Fields (bounded, ≤8){" "}
          <input
            value={s.fields.join(", ")}
            onChange={(e) =>
              set({
                fields: e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter((x) => x.length > 0)
                  .slice(0, 8),
              })
            }
          />
        </label>
      )}
      {s.fields.length > 0 ? (
        <fieldset>
          <legend>Labels</legend>
          {s.fields.map((f) => (
            <label key={f}>
              {f}{" "}
              <input
                value={s.labels[f] ?? ""}
                maxLength={80}
                onChange={(e) =>
                  set({ labels: { ...s.labels, [f]: e.target.value } })
                }
              />
            </label>
          ))}
        </fieldset>
      ) : null}
    </fieldset>
  );
}
