"use client";

import {
  Check,
  Eye,
  Grip,
  LayoutGrid,
  Maximize2,
  MoreHorizontal,
  Plus,
  Redo2,
  Undo2,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BuilderGallery } from "./gallery";
import {
  addToLayout,
  arrange,
  arrangeInReadingOrder,
  type Breakpoint,
  classifyFootprint,
  columnsFor,
  footprint,
  getBreakpoint,
  type Layout,
  maximumFootprint,
  minimumHeight,
  minimumWidthSpan,
  type Rect,
  readingOrder,
  reconcileLayout,
  resolvePlacement,
  supportedSizes,
} from "./grid";
import {
  catalogue,
  defaultSettings,
  type SizeName,
  type SourceRecords,
  type WidgetInstance,
} from "./model";
import {
  breakpoints,
  type DashboardDraft as Draft,
  emptyDashboardDraft as emptyDraft,
} from "./schema";
import { DetailContent, WidgetContent } from "./widget-content";
import { widgetDetailKey } from "./widget-geometry";
import "./builder.css";

type Gesture = {
  id: string;
  type: "move" | "resize";
  original: Layout;
  proposed: Layout;
  rect: Rect;
  valid: boolean;
  startX: number;
  startY: number;
  scrollY: number;
  pointerY: number;
  pointerId: number | null;
  startWidth: number;
  keyboard: boolean;
  base: Rect;
};

function LocalDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="cb-db-detail-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label="Close detail" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function DashboardBuilder({
  value,
  onChange,
  sourceRecords,
  previewOnly = false,
}: {
  value: Draft;
  onChange: (value: Draft) => void;
  sourceRecords: SourceRecords;
  previewOnly?: boolean;
}) {
  const draft = value;
  const setDraft = onChange;
  const [records, setRecords] = useState<SourceRecords>(() =>
    structuredClone(sourceRecords),
  );
  const ready = true;
  const [saveState, setSaveState] = useState("Template draft");
  const [name, setName] = useState(draft.name);
  const [clientPreview, setClientPreview] = useState(previewOnly);
  const [width, setWidth] = useState(1040);
  const [gallery, setGallery] = useState<{
    mode: "add" | "configure" | "replace";
    existing?: WidgetInstance;
  } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const history = useRef<{ past: Draft[]; future: Draft[] }>({
    past: [],
    future: [],
  });
  const [historyTick, setHistoryTick] = useState(0);
  const draftRef = useRef(draft);
  const reduceMotion = useReducedMotion();
  const bp = getBreakpoint(width);
  const cols = columnsFor(bp);
  const track = (width - 16 * (cols - 1)) / cols;
  const byId = new Map(draft.widgets.map((w) => [w.id, w]));
  const desktopOrder = readingOrder(draft.layouts.desktop ?? {})
    .map((id) => byId.get(id))
    .filter((w): w is WidgetInstance => !!w);
  const orderedWidgets = [
    ...desktopOrder,
    ...draft.widgets.filter((w) => !desktopOrder.some((x) => x.id === w.id)),
  ];
  const storedLayout = draft.layouts[bp];
  const currentLayout = storedLayout
    ? reconcileLayout(storedLayout, orderedWidgets, bp, width)
    : arrange(orderedWidgets, bp, width);
  const layout = gesture?.proposed ?? currentLayout;
  // Keep the captured control under the same DOM ancestry for the whole
  // gesture. Placement previews may move cards, but only commit changes order.
  const visualOrder = readingOrder(gesture?.original ?? layout);

  useEffect(() => {
    setRecords(structuredClone(sourceRecords));
  }, [sourceRecords]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const measuredWidth = Math.round(entries[0]?.contentRect.width ?? 0);
      // Hidden panels can briefly report zero; retain the last usable grid.
      if (measuredWidth > 0) setWidth(measuredWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const save = (_next: Draft) => {
    setSaveState("Template draft updated");
  };
  const commit = (next: Draft, message: string) => {
    history.current.past.push(structuredClone(draftRef.current));
    history.current.future = [];
    draftRef.current = next;
    setDraft(next);
    setName(next.name);
    save(next);
    setHistoryTick((x) => x + 1);
    setAnnouncement(message);
  };
  const travel = (direction: "undo" | "redo") => {
    cancelGesture();
    const from =
      direction === "undo" ? history.current.past : history.current.future;
    const to =
      direction === "undo" ? history.current.future : history.current.past;
    const next = from.pop();
    if (!next) return;
    to.push(structuredClone(draftRef.current));
    draftRef.current = next;
    setDraft(next);
    setName(next.name);
    save(next);
    setHistoryTick((x) => x + 1);
    setAnnouncement(direction === "undo" ? "Change undone" : "Change restored");
  };
  const changeRecords = (next: SourceRecords) => {
    setRecords(next);
    setAnnouncement("Sample preview updated for this editing session.");
  };
  const syncGesture = useCallback((value: Gesture | null) => {
    gestureRef.current = value;
    setGesture(value);
  }, []);
  const cancelGesture = useCallback(
    (event?: globalThis.PointerEvent) => {
      const active = gestureRef.current;
      if (event && (!active || active.pointerId !== event.pointerId)) return;
      syncGesture(null);
      if (active?.pointerId !== null && active?.pointerId !== undefined) {
        try {
          if (canvas.current?.hasPointerCapture(active.pointerId))
            canvas.current.releasePointerCapture(active.pointerId);
        } catch {
          // The browser may already have released capture during cancellation.
        }
      }
      if (active)
        setAnnouncement("Move or resize cancelled. Previous layout restored.");
    },
    [syncGesture],
  );
  const commitLayout = (next: Layout, message: string) => {
    const order = readingOrder(next);
    const ordered = order
      .map((id) => byId.get(id))
      .filter((w): w is WidgetInstance => !!w);
    commit(
      {
        ...draftRef.current,
        widgets: ordered,
        layouts: { ...draftRef.current.layouts, [bp]: next },
        widths: { ...draftRef.current.widths, [bp]: width },
      },
      message,
    );
  };
  const completeGesture = (event?: globalThis.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    if (event && g.pointerId !== event.pointerId) return;
    syncGesture(null);
    if (!event && g.pointerId !== null) {
      try {
        if (canvas.current?.hasPointerCapture(g.pointerId))
          canvas.current.releasePointerCapture(g.pointerId);
      } catch {
        // Capture can already be gone after a browser-level pointer release.
      }
    }
    if (g.valid) {
      if (JSON.stringify(g.original) !== JSON.stringify(g.proposed))
        commitLayout(
          g.proposed,
          g.type === "move"
            ? `Moved card to column ${g.rect.x + 1}, row ${g.rect.y + 1}.`
            : `Resized card to ${g.rect.w} columns × ${g.rect.h} rows (${g.rect.w * (track + 16) - 16} × ${g.rect.h * 80 - 16} px).`,
        );
    } else setAnnouncement("Invalid destination. Previous layout restored.");
  };
  const propose = useCallback(
    (g: Gesture, rect: Rect) => {
      const sizedRect =
        g.type === "resize"
          ? { ...rect, size: classifyFootprint(rect.w, rect.h, bp, width) }
          : rect;
      const widget = draftRef.current.widgets.find((item) => item.id === g.id);
      const max = maximumFootprint(widget?.kind ?? "BN21", bp);
      const withinLimit =
        g.type !== "resize" || (sizedRect.w <= max.w && sizedRect.h <= max.h);
      const proposed = withinLimit
        ? resolvePlacement(
            g.original,
            g.id,
            sizedRect,
            cols,
            minimumWidthSpan(cols, width),
            minimumHeight(bp),
          )
        : null;
      const next = {
        ...g,
        rect: sizedRect,
        valid: !!proposed,
        proposed: proposed ?? g.original,
      };
      if (
        next.valid === g.valid &&
        next.rect.x === g.rect.x &&
        next.rect.y === g.rect.y &&
        next.rect.w === g.rect.w &&
        next.rect.h === g.rect.h &&
        next.rect.size === g.rect.size
      ) {
        // Keep the live pointer coordinate fresh for edge scrolling without
        // forcing a React render for every pixel inside the same grid cell.
        gestureRef.current = next;
        return;
      }
      syncGesture(next);
      setAnnouncement(
        `${sizedRect.size} · ${sizedRect.w} columns by ${sizedRect.h} rows, column ${sizedRect.x + 1}, row ${sizedRect.y + 1}${proposed ? "" : !withinLimit ? `. Maximum ${max.w} columns × ${max.h} rows for useful content` : ". Invalid destination"}`,
      );
    },
    [bp, cols, syncGesture, width],
  );
  const startGesture = (
    id: string,
    type: "move" | "resize",
    e?: PointerEvent<HTMLButtonElement>,
  ) => {
    if (clientPreview || gestureRef.current || (e && e.button !== 0)) return;
    const base = currentLayout[id];
    if (!base) return;
    e?.preventDefault();
    syncGesture({
      id,
      type,
      original: structuredClone(currentLayout),
      proposed: structuredClone(currentLayout),
      rect: base,
      base,
      valid: true,
      startX: e?.clientX ?? 0,
      startY: e?.clientY ?? 0,
      scrollY: window.scrollY,
      pointerY: e?.clientY ?? 0,
      pointerId: e?.pointerId ?? null,
      startWidth: width,
      keyboard: !e,
    });
    if (e) {
      try {
        canvas.current?.setPointerCapture(e.pointerId);
      } catch {
        // Window listeners below still finish the gesture if capture fails.
      }
    }
    setAnnouncement(
      `${type === "move" ? "Move" : "Resize"} ${byId.get(id)?.settings.title}. ${type === "move" ? "Use arrows to change position" : "Use left and right arrows for width, up and down for height"}; Enter to commit, Escape to cancel.`,
    );
  };
  const movePointer = (e: globalThis.PointerEvent) => {
    const g = gestureRef.current;
    if (!g || g.keyboard || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startX,
      dy = e.clientY - g.startY + window.scrollY - g.scrollY;
    const rect = { ...g.base };
    if (g.type === "move") {
      rect.x = g.base.x + Math.round(dx / (track + 16));
      rect.y = Math.max(0, g.base.y + Math.round(dy / 80));
    } else {
      const widget = byId.get(g.id);
      if (!widget) return;
      rect.w =
        bp === "mobile" ? cols : g.base.w + Math.round(dx / (track + 16));
      rect.h = Math.max(minimumHeight(bp), g.base.h + Math.round(dy / 80));
      rect.size = classifyFootprint(rect.w, rect.h, bp, width);
    }
    propose({ ...g, pointerY: e.clientY }, rect);
  };
  const pointerGesture = !!gesture && !gesture.keyboard;
  const pointerHandlers = useRef({
    movePointer,
    completeGesture,
    cancelGesture,
  });
  pointerHandlers.current = { movePointer, completeGesture, cancelGesture };
  useEffect(() => {
    if (gesture && gesture.startWidth !== width) cancelGesture();
  }, [gesture, width, cancelGesture]);
  useLayoutEffect(() => {
    if (!pointerGesture) return;
    const finish = (event: globalThis.PointerEvent) => {
      pointerHandlers.current.movePointer(event);
      pointerHandlers.current.completeGesture(event);
    };
    const cancel = (event: globalThis.PointerEvent) =>
      pointerHandlers.current.cancelGesture(event);
    const loseFocus = () => pointerHandlers.current.cancelGesture();
    const visibility = () => {
      if (document.visibilityState !== "visible")
        pointerHandlers.current.cancelGesture();
    };
    const move = (event: globalThis.PointerEvent) =>
      pointerHandlers.current.movePointer(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("lostpointercapture", cancel);
    window.addEventListener("blur", loseFocus);
    window.addEventListener("pointerleave", loseFocus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("blur", loseFocus);
      window.removeEventListener("pointerleave", loseFocus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [pointerGesture]);
  useEffect(() => {
    if (!pointerGesture) return;
    let frame = 0;
    const scroll = () => {
      const g = gestureRef.current;
      if (!g) return;
      const delta =
        g.pointerY > window.innerHeight - 70 ? 12 : g.pointerY < 90 ? -12 : 0;
      if (delta) {
        window.scrollBy(0, delta);
        const scrollDelta = window.scrollY - g.scrollY;
        const rect = { ...g.base };
        const verticalSteps = Math.round(
          (g.pointerY - g.startY + scrollDelta) / 80,
        );
        if (g.type === "move") rect.y = Math.max(0, g.base.y + verticalSteps);
        else {
          rect.h = Math.max(minimumHeight(bp), g.base.h + verticalSteps);
          rect.size = classifyFootprint(rect.w, rect.h, bp, width);
        }
        propose(g, rect);
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [pointerGesture, bp, propose, width]);
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && gestureRef.current) {
        e.preventDefault();
        cancelGesture();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [cancelGesture]);
  const handleKeys = (
    e: KeyboardEvent<HTMLButtonElement>,
    id: string,
    type: "move" | "resize",
  ) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelGesture();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (gestureRef.current?.id === id && gestureRef.current.keyboard)
        completeGesture();
      else startGesture(id, type);
      return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
      return;
    e.preventDefault();
    if (!gestureRef.current) startGesture(id, type);
    const g = gestureRef.current;
    if (!g || g.id !== id || !g.keyboard) return;
    const rect = { ...g.rect };
    if (type === "move") {
      rect.x += e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      rect.y = Math.max(
        0,
        rect.y + (e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0),
      );
    } else {
      const step = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight")
        rect.w = bp === "mobile" ? cols : rect.w + step;
      else rect.h = Math.max(minimumHeight(bp), rect.h + step);
      rect.size = classifyFootprint(rect.w, rect.h, bp, width);
    }
    propose(g, rect);
  };
  const applySize = (widget: WidgetInstance, size: SizeName) => {
    const current = currentLayout[widget.id];
    const preset = footprint(size, bp, width);
    const max = maximumFootprint(widget.kind, bp);
    if (preset.w > max.w || preset.h > max.h) {
      setAnnouncement(
        `Maximum ${max.w} columns × ${max.h} rows for this widget.`,
      );
      return;
    }
    const rect = {
      ...current,
      ...preset,
      x: Math.min(current.x, cols - preset.w),
    };
    const next = resolvePlacement(
      currentLayout,
      widget.id,
      rect,
      cols,
      minimumWidthSpan(cols, width),
      minimumHeight(bp),
    );
    if (!next) {
      setAnnouncement("This preset does not fit. Move the card left first.");
      return;
    }
    const updatedWidgets = draft.widgets.map((item) =>
      item.id === widget.id
        ? { ...item, settings: { ...item.settings, size } }
        : item,
    );
    if (
      JSON.stringify(next) === JSON.stringify(currentLayout) &&
      widget.settings.size === size
    )
      return;
    commit(
      {
        ...draft,
        widgets: updatedWidgets,
        layouts: { ...draft.layouts, [bp]: next },
        widths: { ...draft.widths, [bp]: width },
      },
      `Resized ${widget.settings.title} to ${next[widget.id].w} columns × ${next[widget.id].h} rows using the ${size} preset.`,
    );
  };
  const moveStep = (id: string, x: number, y: number) => {
    const rect = currentLayout[id];
    const next = resolvePlacement(
      currentLayout,
      id,
      { ...rect, x: rect.x + x, y: Math.max(0, rect.y + y) },
      cols,
    );
    if (next) commitLayout(next, "Card moved one grid step.");
    else setAnnouncement("Move would cross the canvas edge.");
  };
  const reorder = (id: string, step: number) => {
    const ids = readingOrder(currentLayout);
    const at = ids.indexOf(id),
      to = Math.max(0, Math.min(ids.length - 1, at + step));
    if (at === to) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    const reordered = ids.flatMap((key) => {
      const widget = byId.get(key);
      return widget
        ? [
            {
              ...widget,
              settings: {
                ...widget.settings,
                size: currentLayout[widget.id].size,
              },
            },
          ]
        : [];
    });
    commitLayout(
      arrangeInReadingOrder(reordered, bp, width, currentLayout),
      "Reading order and visual order updated.",
    );
  };
  const remove = (id: string) => {
    const layouts = { ...draft.layouts };
    for (const key of Object.keys(layouts) as Breakpoint[]) {
      layouts[key] = { ...layouts[key] };
      delete layouts[key]?.[id];
    }
    commit(
      { ...draft, widgets: draft.widgets.filter((w) => w.id !== id), layouts },
      "Widget removed. Source records retained. Undo is available.",
    );
  };
  const add = (
    widgets: WidgetInstance[],
    replaceId?: string,
    duplicateRects?: Partial<Record<Breakpoint, Rect>>,
  ) => {
    let nextWidgets = [...draft.widgets];
    const layouts = { ...draft.layouts };
    const widths = { ...draft.widths };
    if (replaceId) {
      const old = byId.get(replaceId);
      if (!old || !widgets[0]) return;
      const replacement = { ...widgets[0], id: replaceId };
      nextWidgets = nextWidgets.map((w) =>
        w.id === replaceId ? replacement : w,
      );
      for (const key of Object.keys(layouts) as Breakpoint[]) {
        const oldRect = layouts[key]?.[replaceId];
        if (!oldRect) continue;
        const max = maximumFootprint(replacement.kind, key);
        const same =
          oldRect.w <= max.w &&
          oldRect.h <= max.h &&
          catalogue
            .find((c) => c.id === replacement.kind)
            ?.sizes.includes(oldRect.size);
        const canvasWidth =
          widths[key] ??
          (key === "desktop" ? 1040 : key === "tablet" ? 768 : 288);
        const rect = same
          ? {
              ...oldRect,
              size: classifyFootprint(oldRect.w, oldRect.h, key, canvasWidth),
            }
          : {
              ...oldRect,
              ...footprint(replacement.settings.size, key, canvasWidth),
            };
        rect.x = Math.min(rect.x, columnsFor(key) - rect.w);
        layouts[key] =
          resolvePlacement(
            layouts[key] ?? {},
            replaceId,
            rect,
            columnsFor(key),
            minimumWidthSpan(columnsFor(key), canvasWidth),
            minimumHeight(key),
          ) ?? layouts[key];
      }
      commit(
        { ...draft, widgets: nextWidgets, layouts },
        `Replaced ${old.settings.title} with ${replacement.settings.title}.`,
      );
    } else {
      nextWidgets.push(...widgets);
      const keys = new Set<Breakpoint>([
        "desktop",
        bp,
        ...(Object.keys(layouts) as Breakpoint[]),
      ]);
      for (const key of keys) {
        const canvasWidth =
          key === bp
            ? width
            : (widths[key] ??
              (key === "desktop" ? 1040 : key === "tablet" ? 768 : 288));
        let next = layouts[key] ?? arrange(orderedWidgets, key, canvasWidth);
        for (const widget of widgets) {
          next = addToLayout(next, widget, key, canvasWidth);
          const copied = duplicateRects?.[key];
          const inserted = next[widget.id];
          if (copied && inserted) {
            const custom = {
              ...inserted,
              w: key === "mobile" ? columnsFor(key) : copied.w,
              h: copied.h,
              size: classifyFootprint(copied.w, copied.h, key, canvasWidth),
            };
            next =
              resolvePlacement(
                next,
                widget.id,
                custom,
                columnsFor(key),
                minimumWidthSpan(columnsFor(key), canvasWidth),
                minimumHeight(key),
              ) ?? next;
          }
        }
        layouts[key] = next;
        widths[key] = canvasWidth;
      }
      const location = layouts[bp]?.[widgets[0]?.id];
      commit(
        { ...draft, widgets: nextWidgets, layouts, widths },
        `Added ${widgets.length} widget${widgets.length === 1 ? "" : "s"}. ${widgets[0]?.settings.title ?? "Widget"}${location ? ` at column ${location.x + 1}, row ${location.y + 1}` : ""}.`,
      );
      requestAnimationFrame(() =>
        document.getElementById(`widget-${widgets[0].id}`)?.focus(),
      );
    }
  };
  const galleryCommit = (widgets: WidgetInstance[]) => {
    if (gallery?.mode === "configure") {
      const old = gallery.existing;
      if (!old || !widgets[0]) return;
      const updated = { ...widgets[0], id: old.id };
      let next = {
        ...draft,
        widgets: draft.widgets.map((w) => (w.id === old.id ? updated : w)),
      };
      if (updated.settings.size !== old.settings.size) {
        const rect = {
          ...currentLayout[old.id],
          ...footprint(updated.settings.size, bp, width),
        };
        rect.x = Math.min(rect.x, cols - rect.w);
        const result = resolvePlacement(
          currentLayout,
          old.id,
          rect,
          cols,
          minimumWidthSpan(cols, width),
          minimumHeight(bp),
        );
        if (result)
          next = { ...next, layouts: { ...next.layouts, [bp]: result } };
      }
      commit(next, "Widget settings saved.");
    } else
      add(
        widgets,
        gallery?.mode === "replace" ? gallery.existing?.id : undefined,
      );
    setGallery(null);
  };
  const rows =
    Math.max(5, ...Object.values(layout).map((rect) => rect.y + rect.h)) +
    (gesture ? 3 : 0);
  const titleFor = (widget: WidgetInstance) =>
    widget.settings.title ||
    catalogue.find((c) => c.id === widget.kind)?.name ||
    "Widget";

  return (
    <section
      className="cb-db-builder"
      aria-label="Dashboard builder"
      data-history={historyTick}
    >
      <header className="cb-db-heading">
        <div>
          {previewOnly ? (
            <h2>{draft.name || "Dashboard"}</h2>
          ) : (
            <>
              <label className="cb-db-name-label" htmlFor="dashboard-name">
                Dashboard name
              </label>
              <input
                id="dashboard-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  if (name.trim() && name !== draft.name)
                    commit(
                      { ...draft, name: name.trim() },
                      "Dashboard renamed.",
                    );
                  else setName(draft.name);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </>
          )}
          <p>
            {records.client.name}
            {!previewOnly && " · Sample athlete"} · {records.client.asOf}
          </p>
        </div>
        {!previewOnly && (
          <span className="cb-db-save" role="status">
            <Check size={13} />
            {saveState}
          </span>
        )}
      </header>
      {!previewOnly && (
        <div className="cb-db-toolbar">
          <div className="cb-db-action-group">
            {!clientPreview && (
              <>
                <button
                  className="cb-db-primary"
                  type="button"
                  onClick={() => setGallery({ mode: "add" })}
                  disabled={!ready}
                >
                  <Plus size={17} />
                  Add widget
                </button>
                <button
                  type="button"
                  aria-label="Undo"
                  title="Undo"
                  disabled={!history.current.past.length}
                  onClick={() => travel("undo")}
                >
                  <Undo2 size={17} />
                </button>
                <button
                  type="button"
                  aria-label="Redo"
                  title="Redo"
                  disabled={!history.current.future.length}
                  onClick={() => travel("redo")}
                >
                  <Redo2 size={17} />
                </button>
              </>
            )}
          </div>
          <button
            className="cb-db-client-switch"
            type="button"
            aria-pressed={clientPreview}
            onClick={() => {
              cancelGesture();
              setClientPreview(!clientPreview);
            }}
          >
            <Eye size={16} />
            {clientPreview ? "Back to editor" : "Client preview"}
          </button>
          {!clientPreview && (
            <details
              className="cb-db-dashboard-menu"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button"))
                  event.currentTarget.removeAttribute("open");
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.removeAttribute("open");
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}
            >
              <summary aria-label="Dashboard actions">
                <MoreHorizontal size={19} />
              </summary>
              <div>
                <button
                  type="button"
                  onClick={() =>
                    commitLayout(
                      arrange(
                        visualOrder.flatMap((id) => {
                          const widget = byId.get(id);
                          return widget
                            ? [
                                {
                                  ...widget,
                                  settings: {
                                    ...widget.settings,
                                    size: currentLayout[id].size,
                                  },
                                },
                              ]
                            : [];
                        }),
                        bp,
                        width,
                        currentLayout,
                      ),
                      "Dashboard automatically arranged.",
                    )
                  }
                  disabled={!draft.widgets.length}
                >
                  <LayoutGrid size={15} />
                  Auto arrange
                </button>
                <button type="button" onClick={() => setReset(true)}>
                  Reset dashboard
                </button>
              </div>
            </details>
          )}
        </div>
      )}
      {!previewOnly && (
        <div className="cb-db-canvas-meta">
          <span>
            {clientPreview ? "Client presentation preview" : "Edit canvas"} ·{" "}
            {cols} columns · {width} px
          </span>
          <span>
            {draft.widgets.length} widgets
            {gesture
              ? ` · ${gesture.valid ? `${gesture.rect.w} × ${gesture.rect.h}` : "Invalid destination"} · Row ${gesture.rect.y + 1}, column ${gesture.rect.x + 1}`
              : ""}
          </span>
        </div>
      )}
      <div className="cb-db-canvas-wrap" data-preview="Desktop">
        <section
          className="cb-db-canvas"
          ref={canvas}
          style={{ height: draft.widgets.length ? rows * 80 - 16 : 400 }}
          aria-label={`${cols}-column dashboard canvas`}
        >
          {!draft.widgets.length && (
            <motion.div
              className="cb-db-empty"
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
              <div className="cb-db-empty-symbol">
                <LayoutGrid size={28} strokeWidth={1} />
              </div>
              <h2>A canvas for your coaching.</h2>
              <p>
                Choose the signals, plans and actions your athlete needs.
                <br />
                Your widgets will find their place.
              </p>
              {!clientPreview && (
                <>
                  <button
                    className="cb-db-primary"
                    type="button"
                    onClick={() => setGallery({ mode: "add" })}
                  >
                    <Plus size={17} />
                    Choose your first widgets
                  </button>
                  <button
                    className="cb-db-example"
                    type="button"
                    onClick={() =>
                      add(
                        (
                          [
                            "CU04",
                            "CU10",
                            "CU02",
                            "TL22",
                            "BN15",
                            "TL21",
                            "TL26",
                            "BN01",
                            "TL11",
                          ] as const
                        ).map((kind) => ({
                          id: crypto.randomUUID(),
                          kind,
                          settings: {
                            ...defaultSettings(kind),
                            ...(["TL26", "TL11"].includes(kind)
                              ? { size: "Compact" as const }
                              : {}),
                            ...(kind === "BN01"
                              ? { size: "Expanded" as const }
                              : {}),
                            ...(kind === "CU10"
                              ? { summary: "days-remaining" }
                              : {}),
                          },
                        })),
                      )
                    }
                  >
                    Load example layout
                  </button>
                </>
              )}
            </motion.div>
          )}
          {visualOrder.map((id) => {
            const widget = byId.get(id);
            const rect = layout[id];
            if (!widget || !rect) return null;
            const changed =
              gesture &&
              JSON.stringify(gesture.original[id]) !== JSON.stringify(rect);
            const cardWidth = rect.w * (track + 16) - 16,
              cardHeight = rect.h * 80 - 16;
            const availableSizes = supportedSizes(
              widget.kind,
              catalogue.find((entry) => entry.id === widget.kind)?.sizes ?? [],
            );
            const matchingPreset = availableSizes.find((size) => {
              const preset = footprint(size, bp, width);
              return preset.w === rect.w && preset.h === rect.h;
            });
            return (
              <article
                key={id}
                id={`widget-${id}`}
                tabIndex={-1}
                className="cb-db-card"
                data-size={classifyFootprint(rect.w, rect.h, bp, width)}
                data-affected={!!changed}
                data-moving={gesture?.id === id}
                style={{
                  left: rect.x * (track + 16),
                  top: rect.y * 80,
                  width: cardWidth,
                  height: cardHeight,
                }}
                aria-label={`${titleFor(widget)}, ${rect.w} columns by ${rect.h} rows, row ${rect.y + 1}, column ${rect.x + 1}`}
              >
                <header className="cb-db-card-header">
                  <h2 title={titleFor(widget)}>
                    <button
                      type="button"
                      className="cb-db-source-title"
                      aria-label={`Open ${titleFor(widget)} source details`}
                      onClick={() => setDetail(widgetDetailKey(widget))}
                    >
                      {titleFor(widget)}
                    </button>
                  </h2>
                  {!clientPreview && (
                    <div className="cb-db-card-tools">
                      <button
                        type="button"
                        className="cb-db-move"
                        aria-label={`Move ${titleFor(widget)}`}
                        title="Move · Arrows to preview, Enter to commit"
                        onPointerDown={(e) => startGesture(id, "move", e)}
                        onKeyDown={(e) => handleKeys(e, id, "move")}
                      >
                        <Grip size={16} />
                      </button>
                      <details
                        className="cb-db-card-menu"
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.currentTarget.removeAttribute("open");
                            event.currentTarget
                              .querySelector("summary")
                              ?.focus();
                          }
                        }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("button"))
                            e.currentTarget.removeAttribute("open");
                        }}
                        onKeyUp={(e) => {
                          if (
                            (e.key === "Enter" || e.key === " ") &&
                            (e.target as HTMLElement).closest("button")
                          )
                            e.currentTarget.removeAttribute("open");
                        }}
                      >
                        <summary
                          aria-label={`Card menu for ${titleFor(widget)}`}
                        >
                          <MoreHorizontal size={17} />
                        </summary>
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setGallery({
                                mode: "configure",
                                existing: {
                                  ...widget,
                                  settings: { ...widget.settings },
                                },
                              })
                            }
                          >
                            Configure
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              document
                                .getElementById(`widget-${id}`)
                                ?.querySelector<HTMLButtonElement>(
                                  ".cb-db-move",
                                )
                                ?.focus();
                              startGesture(id, "move");
                            }}
                          >
                            Move with keyboard
                          </button>
                          <label>
                            Resize
                            <select
                              aria-label={`Resize ${titleFor(widget)}`}
                              value={matchingPreset ?? "custom"}
                              onChange={(e) =>
                                applySize(widget, e.target.value as SizeName)
                              }
                            >
                              {!matchingPreset && (
                                <option value="custom" disabled>
                                  Custom · {rect.w} × {rect.h}
                                </option>
                              )}
                              {availableSizes.map((size) => (
                                <option key={size} value={size}>
                                  {size}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              document
                                .getElementById(`widget-${id}`)
                                ?.querySelector<HTMLButtonElement>(
                                  ".cb-db-resize",
                                )
                                ?.focus();
                              startGesture(id, "resize");
                              requestAnimationFrame(() =>
                                document
                                  .querySelector<HTMLInputElement>(
                                    bp === "mobile"
                                      ? '[aria-label="Widget height in rows"]'
                                      : '[aria-label="Widget width in columns"]',
                                  )
                                  ?.focus(),
                              );
                            }}
                          >
                            Set exact dimensions
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              add(
                                [
                                  {
                                    ...structuredClone(widget),
                                    id: crypto.randomUUID(),
                                    settings: { ...widget.settings },
                                  },
                                ],
                                undefined,
                                Object.fromEntries(
                                  breakpoints.map((key) => [
                                    key,
                                    key === bp
                                      ? rect
                                      : (draft.layouts[key]?.[id] ?? rect),
                                  ]),
                                ),
                              )
                            }
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setGallery({
                                mode: "replace",
                                existing: {
                                  ...widget,
                                  settings: {
                                    ...widget.settings,
                                    size: rect.size,
                                  },
                                },
                              })
                            }
                          >
                            Replace
                          </button>
                          <button type="button" onClick={() => reorder(id, -1)}>
                            Move earlier in reading order
                          </button>
                          <button type="button" onClick={() => reorder(id, 1)}>
                            Move later in reading order
                          </button>
                          <fieldset className="cb-db-step-buttons">
                            <legend className="cb-db-sr">
                              Move one grid step
                            </legend>
                            {(
                              [
                                ["Left", -1, 0],
                                ["Up", 0, -1],
                                ["Down", 0, 1],
                                ["Right", 1, 0],
                              ] as const
                            ).map(([label, x, y]) => (
                              <button
                                type="button"
                                key={label}
                                onClick={() => moveStep(id, x, y)}
                              >
                                {label}
                              </button>
                            ))}
                          </fieldset>
                          <button
                            className="cb-db-remove"
                            type="button"
                            onClick={() => remove(id)}
                          >
                            Remove
                          </button>
                        </div>
                      </details>
                    </div>
                  )}
                </header>
                <WidgetContent
                  widget={widget}
                  records={records}
                  width={cardWidth}
                  height={cardHeight}
                  columnSpan={rect.w}
                  clientPreview={clientPreview}
                  onRecordsChange={changeRecords}
                  onDetail={setDetail}
                  onPeriodChange={(period) =>
                    commit(
                      {
                        ...draftRef.current,
                        widgets: draftRef.current.widgets.map((item) =>
                          item.id === widget.id
                            ? {
                                ...item,
                                settings: { ...item.settings, period },
                              }
                            : item,
                        ),
                      },
                      `Chart range changed to ${period}.`,
                    )
                  }
                />
                {!clientPreview && (
                  <button
                    className="cb-db-resize"
                    type="button"
                    aria-label={`Resize handle for ${titleFor(widget)}`}
                    title="Resize · Horizontal drag changes width, vertical drag changes height"
                    onPointerDown={(e) => startGesture(id, "resize", e)}
                    onKeyDown={(e) => handleKeys(e, id, "resize")}
                  >
                    <Maximize2 size={13} />
                  </button>
                )}
              </article>
            );
          })}
          {gesture && (
            <div
              className="cb-db-proposed"
              data-valid={gesture.valid}
              style={{
                left: gesture.rect.x * (track + 16),
                top: gesture.rect.y * 80,
                width: gesture.rect.w * (track + 16) - 16,
                height: gesture.rect.h * 80 - 16,
              }}
            >
              <span>
                {gesture.rect.w} × {gesture.rect.h}
              </span>
            </div>
          )}
        </section>
      </div>
      {gesture?.keyboard && (
        <form
          className="cb-db-gesture-bar"
          aria-label={`${gesture.type === "resize" ? "Resize dimensions" : "Move card"}`}
          onSubmit={(event) => {
            event.preventDefault();
            completeGesture();
          }}
        >
          <span>
            {gesture.rect.size} · {gesture.rect.w} columns × {gesture.rect.h}{" "}
            rows · Row {gesture.rect.y + 1}, column {gesture.rect.x + 1} ·{" "}
            {gesture.valid
              ? "Ready to place"
              : gesture.rect.w < minimumWidthSpan(cols, width) ||
                  gesture.rect.h < minimumHeight(bp)
                ? `Minimum ${minimumWidthSpan(cols, width)} columns × ${minimumHeight(bp)} rows`
                : `Maximum ${maximumFootprint(byId.get(gesture.id)?.kind ?? "BN21", bp).w} columns × ${maximumFootprint(byId.get(gesture.id)?.kind ?? "BN21", bp).h} rows; keep within canvas`}
          </span>
          {gesture.type === "resize" && (
            <div className="cb-db-size-fields">
              <label>
                Width (columns)
                <input
                  aria-label="Widget width in columns"
                  type="number"
                  min={bp === "mobile" ? cols : minimumWidthSpan(cols, width)}
                  max={
                    maximumFootprint(byId.get(gesture.id)?.kind ?? "BN21", bp).w
                  }
                  step={1}
                  value={gesture.rect.w}
                  disabled={bp === "mobile"}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isInteger(value))
                      propose(gesture, { ...gesture.rect, w: value });
                  }}
                />
              </label>
              <label>
                Height (rows)
                <input
                  aria-label="Widget height in rows"
                  type="number"
                  min={minimumHeight(bp)}
                  max={
                    maximumFootprint(byId.get(gesture.id)?.kind ?? "BN21", bp).h
                  }
                  step={1}
                  value={gesture.rect.h}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isInteger(value))
                      propose(gesture, { ...gesture.rect, h: value });
                  }}
                />
              </label>
            </div>
          )}
          <button type="button" onClick={() => cancelGesture()}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!gesture.valid}
            className="cb-db-primary"
          >
            Confirm {gesture.type}
          </button>
        </form>
      )}
      <p className="cb-db-footnote">
        {clientPreview
          ? "Presentation preview only. Habit and task actions update the shared fictional records."
          : "Drag the Move handle to rearrange. Drag Resize or set exact column and row spans. Keyboard arrows adjust one grid step; Enter confirms and Escape cancels."}
      </p>
      <div className="cb-db-toast" role="status" aria-live="polite">
        {announcement}
        {announcement.includes("removed") && (
          <button type="button" onClick={() => travel("undo")}>
            Undo
          </button>
        )}
      </div>
      {gallery && (
        <BuilderGallery
          mode={gallery.mode}
          existing={gallery.existing}
          placedDimensions={
            gallery.existing && currentLayout[gallery.existing.id]
              ? {
                  width:
                    currentLayout[gallery.existing.id].w * (track + 16) - 16,
                  height: currentLayout[gallery.existing.id].h * 80 - 16,
                  columnSpan: currentLayout[gallery.existing.id].w,
                }
              : undefined
          }
          records={records}
          onClose={() => setGallery(null)}
          onCommit={galleryCommit}
        />
      )}
      {detail && (
        <LocalDialog
          title={`${records.client.name} · Sample source detail`}
          onClose={() => setDetail(null)}
        >
          <DetailContent
            detail={detail}
            records={records}
            clientPreview={clientPreview}
            onRecordsChange={changeRecords}
          />
        </LocalDialog>
      )}
      {reset && (
        <LocalDialog
          title="Reset this dashboard?"
          onClose={() => setReset(false)}
        >
          <p>
            Remove all widgets and breakpoint arrangements. The athlete’s sample
            records remain available. You can undo this reset.
          </p>
          <div className="cb-db-dialog-actions">
            <button type="button" onClick={() => setReset(false)}>
              Keep dashboard
            </button>
            <button
              className="cb-db-primary"
              type="button"
              onClick={() => {
                commit(
                  emptyDraft(),
                  "Dashboard reset. Sample source records retained.",
                );
                setReset(false);
              }}
            >
              Reset dashboard
            </button>
          </div>
        </LocalDialog>
      )}
    </section>
  );
}
