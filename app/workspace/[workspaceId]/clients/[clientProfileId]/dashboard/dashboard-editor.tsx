"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  WIDGET_CATALOGUE,
  WIDGET_KINDS,
  canonicalizeDashboardConfig,
  defaultWidgetSettings,
  readingOrder,
  type DashboardConfig,
  type WidgetKind,
} from "@/lib/dashboard/config-schema";
import type { DashboardSafeResult } from "@/lib/dashboard/boundary";

import {
  reloadClientDashboardLayout,
  saveClientDashboardLayout,
} from "./actions";

type SaveState =
  "idle" | "saving" | "saved" | "failed" | "conflict" | "readonly";

type SaveResult = DashboardSafeResult<{
  revision: number;
  config: DashboardConfig;
}>;

const SIZES = ["Compact", "Regular", "Wide", "Tall", "Expanded"] as const;

/**
 * Lily-aligned autosave: every discrete commit (add/remove/move/
 * resize/visibility/rename) debounces one save carrying the last
 * confirmed revision. One request in flight, latest-only queue; a
 * stale response never replaces newer state. A 409/timeout triggers
 * the reconcile protocol — re-read through the staff boundary and
 * confirm Saved only when the canonical committed config equals the
 * submitted snapshot; equality proves converged content, not authorship.
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

  const latestConfig = useRef(config);
  latestConfig.current = config;
  const confirmedRevision = useRef(initialRevision);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const history = useRef<{
    past: DashboardConfig[];
    future: DashboardConfig[];
  }>({ past: [], future: [] });

  const flush = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    setSaveState("saving");
    // immutable snapshot of what this request commits
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
      result = { ok: false, code: "not_available", message: "" } as SaveResult;
    }
    inFlight.current = false;

    if (result.ok) {
      confirmedRevision.current = result.value.revision;
      setDirty(queued.current);
      setSaveState("saved");
    } else if (
      result.code === "conflict" ||
      result.code === "serialization_conflict" ||
      result.code === "not_available"
    ) {
      // Reconcile: re-read through the authorized staff boundary and
      // confirm only on canonical-config equality — a bare revision
      // increment proves nothing about who committed.
      const reload = await reloadClientDashboardLayout({
        workspaceId,
        clientProfileId,
      });
      const serverLayout =
        reload.ok && "value" in reload ? reload.value.layout : null;
      const serverConfig = serverLayout?.config;
      if (
        serverConfig &&
        canonicalizeDashboardConfig(serverConfig) ===
          canonicalizeDashboardConfig(snapshot)
      ) {
        confirmedRevision.current = serverLayout!.revision;
        setDirty(queued.current);
        setSaveState("saved");
      } else if (result.code === "not_available") {
        setSaveState("failed");
      } else {
        // real conflict — edits are preserved locally, never merged
        setSaveState("conflict");
      }
    } else {
      setSaveState("failed");
    }
    if (queued.current) {
      queued.current = false;
      void flush();
    }
  }, [workspaceId, clientProfileId]);

  const commit = useCallback(
    (next: DashboardConfig) => {
      history.current.past.push(latestConfig.current);
      history.current.future = [];
      setConfig(next);
      setDirty(true);
      setSaveState((s) => (s === "readonly" ? s : "saving"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 500);
    },
    [flush],
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
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 500);
    },
    [flush],
  );

  // keep server config if a conflict is resolved by reload
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

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const layout = config.layouts.desktop ?? {};
  const order = readingOrder(layout).filter((id) =>
    config.widgets.some((w) => w.id === id),
  );

  const mutate = (fn: (c: DashboardConfig) => DashboardConfig) =>
    commit(fn(latestConfig.current));

  const addWidget = (kind: WidgetKind) => {
    const id = `w-${kind.toLowerCase()}-${Date.now().toString(36)}`;
    mutate((c) => {
      const rects = { ...(c.layouts.desktop ?? {}) };
      // append at the next free row
      const maxY = Object.values(rects).reduce(
        (m, r) => Math.max(m, r.y + r.h),
        0,
      );
      rects[id] = { x: 0, y: maxY, w: 4, h: 3, size: "Regular" };
      return {
        ...c,
        widgets: [
          ...c.widgets,
          { id, kind, settings: defaultWidgetSettings(kind) },
        ],
        layouts: { ...c.layouts, desktop: rects },
      };
    });
  };

  const removeWidget = (id: string) =>
    mutate((c) => {
      const rects = { ...(c.layouts.desktop ?? {}) };
      delete rects[id];
      return {
        ...c,
        widgets: c.widgets.filter((w) => w.id !== id),
        layouts: { ...c.layouts, desktop: rects },
      };
    });

  const moveWidget = (id: string, dir: -1 | 1) =>
    mutate((c) => {
      const ids = readingOrder(c.layouts.desktop ?? {});
      const idx = ids.indexOf(id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= ids.length) return c;
      const rects = { ...(c.layouts.desktop ?? {}) };
      const other = ids[swap];
      const tmp = rects[id];
      rects[id] = rects[other];
      rects[other] = tmp;
      return { ...c, layouts: { ...c.layouts, desktop: rects } };
    });

  const cycleSize = (id: string, dir: 1 | -1) =>
    mutate((c) => {
      const rects = { ...(c.layouts.desktop ?? {}) };
      const r = rects[id];
      if (!r) return c;
      const idx = SIZES.indexOf(r.size);
      const next = SIZES[(idx + dir + SIZES.length) % SIZES.length];
      rects[id] = { ...r, size: next };
      return { ...c, layouts: { ...c.layouts, desktop: rects } };
    });

  const setVisibility = (id: string, visibility: "staff" | "client") =>
    mutate((c) => ({
      ...c,
      widgets: c.widgets.map((w) =>
        w.id === id ? { ...w, settings: { ...w.settings, visibility } } : w,
      ),
    }));

  const rename = (name: string) => mutate((c) => ({ ...c, name }));

  return (
    <section aria-label="Dashboard editor" data-testid="dashboard-editor">
      <div className="dashboard-toolbar" role="status" aria-live="polite">
        <label>
          Dashboard name{" "}
          <input
            value={config.name}
            maxLength={80}
            disabled={!canEdit}
            onChange={(e) => rename(e.target.value)}
            data-testid="dashboard-name"
          />
        </label>
        <span data-testid="save-state">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved" && !dirty
              ? "Saved"
              : saveState === "saved" && dirty
                ? "Saved — newer edits pending"
                : saveState === "failed"
                  ? "Failed — edits kept"
                  : saveState === "conflict"
                    ? "Layout changed by another coach — reload to continue"
                    : saveState === "readonly"
                      ? "Read-only"
                      : dirty
                        ? "Saving…"
                        : "Saved"}
        </span>
        {canEdit && saveState === "conflict" ? (
          <button type="button" onClick={() => void reload()}>
            Reload
          </button>
        ) : null}
        {canEdit ? (
          <>
            <button
              type="button"
              onClick={() => travel("undo")}
              disabled={history.current.past.length === 0}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => travel("redo")}
              disabled={history.current.future.length === 0}
            >
              Redo
            </button>
          </>
        ) : null}
      </div>

      {canEdit ? (
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

      <ul className="dashboard-grid" data-testid="widget-grid">
        {order.length === 0 ? (
          <li className="empty-state" role="status" data-testid="empty-grid">
            <p>No widgets yet.</p>
          </li>
        ) : (
          order.map((id) => {
            const widget = config.widgets.find((w) => w.id === id);
            if (!widget) return null;
            const cat = WIDGET_CATALOGUE[widget.kind];
            return (
              <li
                key={id}
                className="dashboard-widget"
                data-testid={`widget-${id}`}
              >
                <strong>{widget.settings.title}</strong>
                <span>
                  {cat.name}
                  {!cat.connected ? " · Not connected" : ""} ·{" "}
                  {widget.settings.visibility === "client"
                    ? "Client"
                    : "Staff only"}
                </span>
                {canEdit ? (
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
                      {layout[id]?.size}
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
                      onClick={() => removeWidget(id)}
                      aria-label={`Remove ${widget.settings.title}`}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
