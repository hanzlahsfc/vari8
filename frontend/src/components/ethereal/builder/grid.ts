import type { SizeName, WidgetInstance, WidgetKind } from "./model";

export type Breakpoint = "desktop" | "tablet" | "mobile";

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  size: SizeName;
};

export type Layout = Record<string, Rect>;

const GAP = 16;
const MIN_WIDTH: Record<SizeName, number> = {
  Compact: 240,
  Regular: 320,
  Wide: 480,
  Tall: 240,
  Expanded: 480,
};
const MIN_CARD_WIDTH = 240;
const DESKTOP_SPANS: Record<SizeName, { w: number; h: number }> = {
  Compact: { w: 3, h: 2 },
  Regular: { w: 4, h: 3 },
  Wide: { w: 6, h: 3 },
  Tall: { w: 3, h: 5 },
  Expanded: { w: 6, h: 5 },
};

/** Growth stops after a widget's useful detail composition; the canvas itself has no row limit. */
const MAX_SPANS: Partial<Record<WidgetKind, { w: number; h: number }>> = {
  BN01: { w: 8, h: 6 },
  BN08: { w: 8, h: 5 },
  BN21: { w: 8, h: 5 },
  BN15: { w: 8, h: 5 },
  BN19: { w: 8, h: 6 },
  TL06: { w: 6, h: 5 },
  TL11: { w: 6, h: 5 },
  TL28: { w: 8, h: 6 },
  TL14: { w: 6, h: 5 },
  TL21: { w: 8, h: 5 },
  TL22: { w: 8, h: 5 },
  TL26: { w: 6, h: 6 },
  CU01: { w: 6, h: 4 },
  CU02: { w: 6, h: 4 },
  CU03: { w: 6, h: 4 },
  CU04: { w: 6, h: 3 },
  CU06: { w: 6, h: 3 },
  CU09: { w: 8, h: 5 },
  CU10: { w: 6, h: 4 },
  CU16: { w: 6, h: 3 },
  CU17: { w: 12, h: 5 },
};
export function maximumFootprint(kind: WidgetKind, breakpoint: Breakpoint) {
  const max = MAX_SPANS[kind] ?? { w: 8, h: 5 };
  return breakpoint === "mobile"
    ? { w: 2, h: Math.max(6, max.h) }
    : { w: Math.min(columnsFor(breakpoint), max.w), h: max.h };
}
export function supportedSizes(kind: WidgetKind, sizes: readonly SizeName[]) {
  const max = MAX_SPANS[kind] ?? { w: 8, h: 5 };
  return sizes.filter(
    (size) => DESKTOP_SPANS[size].w <= max.w && DESKTOP_SPANS[size].h <= max.h,
  );
}

export function getBreakpoint(width: number): Breakpoint {
  if (width >= 1040) return "desktop";
  if (width >= 640) return "tablet";
  return "mobile";
}

export function columnsFor(breakpoint: Breakpoint): number {
  if (breakpoint === "desktop") return 12;
  if (breakpoint === "tablet") return 6;
  return 2;
}

function columnWidth(width: number, columns: number): number {
  return (width - GAP * (columns - 1)) / columns;
}

function widthSpan(size: SizeName, columns: number, width: number): number {
  const trackWidth = columnWidth(width, columns);
  return Math.min(
    columns,
    Math.max(1, Math.ceil((MIN_WIDTH[size] + GAP) / (trackWidth + GAP))),
  );
}

export function minimumWidthSpan(columns: number, width: number): number {
  const trackWidth = columnWidth(width, columns);
  return Math.min(
    columns,
    Math.max(1, Math.ceil((MIN_CARD_WIDTH + GAP) / (trackWidth + GAP))),
  );
}

export function minimumHeight(
  breakpoint: Breakpoint,
  kind?: WidgetKind,
): number {
  if (kind === "CU17" && breakpoint !== "mobile") return 1;
  return breakpoint === "mobile" ? 3 : 2;
}

export function classifyFootprint(
  w: number,
  h: number,
  breakpoint: Breakpoint,
  width: number,
): SizeName {
  const cardWidth =
    w * (columnWidth(width, columnsFor(breakpoint)) + GAP) - GAP;
  const cardHeight = h * 80 - GAP;
  if (cardWidth >= 480 && cardHeight >= 384) return "Expanded";
  if (cardWidth >= 480 && cardHeight >= 224) return "Wide";
  if (cardWidth >= 240 && cardHeight >= 384) return "Tall";
  if (cardWidth >= 320 && cardHeight >= 224) return "Regular";
  return "Compact";
}

export function footprint(
  size: SizeName,
  breakpoint: Breakpoint,
  width: number,
  kind?: WidgetKind,
): Pick<Rect, "w" | "h" | "size"> {
  if (kind === "CU17" && size === "Compact") {
    return {
      w: columnsFor(breakpoint),
      h: breakpoint === "mobile" ? 3 : 1,
      size,
    };
  }
  if (breakpoint === "mobile") {
    const height = size === "Tall" || size === "Expanded" ? 6 : 3;
    return { w: 2, h: height, size };
  }

  if (breakpoint === "desktop") {
    return { ...DESKTOP_SPANS[size], size };
  }

  const columns = columnsFor(breakpoint);
  return {
    w: widthSpan(size, columns, width),
    h: DESKTOP_SPANS[size].h,
    size,
  };
}

export function supportedFootprints(
  sizes: readonly SizeName[],
  breakpoint: Breakpoint,
  width: number,
): Array<Pick<Rect, "w" | "h" | "size">> {
  return sizes.map((size) => footprint(size, breakpoint, width));
}

export function readingOrder(layout: Layout): string[] {
  return Object.keys(layout).sort((a, b) => {
    const first = layout[a];
    const second = layout[b];
    return first.y - second.y || first.x - second.x || a.localeCompare(b);
  });
}

function overlaps(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

function fitsAt(rect: Rect, layout: Layout, ignoredId?: string): boolean {
  return Object.entries(layout).every(
    ([id, other]) => id === ignoredId || !overlaps(rect, other),
  );
}

function firstVacancy(
  rect: Rect,
  layout: Layout,
  columns: number,
): Rect | null {
  if (rect.w > columns || rect.w < 1 || rect.h < 1) return null;
  for (let y = 0; ; y += 1) {
    for (let x = 0; x <= columns - rect.w; x += 1) {
      const candidate = { ...rect, x, y };
      if (fitsAt(candidate, layout)) return candidate;
    }
  }
}

export function arrange(
  widgets: readonly WidgetInstance[],
  breakpoint: Breakpoint,
  width: number,
  currentLayout?: Layout,
): Layout {
  const columns = columnsFor(breakpoint);
  let layout: Layout = {};
  for (const widget of widgets) {
    const saved = currentLayout?.[widget.id];
    if (!saved) {
      layout = addToLayout(layout, widget, breakpoint, width, columns);
      continue;
    }
    const w = breakpoint === "mobile" ? columns : saved.w;
    const h = saved.h;
    const shape = {
      w,
      h,
      size: classifyFootprint(w, h, breakpoint, width),
    };
    const vacancy = firstVacancy({ ...shape, x: 0, y: 0 }, layout, columns);
    if (vacancy) layout[widget.id] = vacancy;
  }
  return layout;
}

export function arrangeInReadingOrder(
  widgets: readonly WidgetInstance[],
  breakpoint: Breakpoint,
  width: number,
  currentLayout?: Layout,
): Layout {
  const columns = columnsFor(breakpoint);
  const layout: Layout = {};
  let startY = 0;
  let startX = 0;

  for (const widget of widgets) {
    const oldRect = currentLayout?.[widget.id];
    const shape = oldRect
      ? {
          w: breakpoint === "mobile" ? columns : oldRect.w,
          h: oldRect.h,
          size: classifyFootprint(oldRect.w, oldRect.h, breakpoint, width),
        }
      : footprint(widget.settings.size, breakpoint, width, widget.kind);
    let placement: Rect | null = null;
    for (let y = startY; !placement; y += 1) {
      const firstX = y === startY ? startX : 0;
      for (let x = firstX; x <= columns - shape.w; x += 1) {
        const candidate = { ...shape, x, y };
        if (fitsAt(candidate, layout)) {
          placement = candidate;
          break;
        }
      }
    }
    if (!placement) throw new Error("Grid placement could not be resolved");
    layout[widget.id] = placement;
    startY = placement.y;
    startX = placement.x;
  }
  return layout;
}

export function addToLayout(
  layout: Layout,
  widget: WidgetInstance,
  breakpoint: Breakpoint,
  width: number,
  columns = columnsFor(breakpoint),
): Layout {
  const next = { ...layout };
  const shape = footprint(widget.settings.size, breakpoint, width, widget.kind);
  const vacancy = firstVacancy({ ...shape, x: 0, y: 0 }, next, columns);
  if (vacancy) next[widget.id] = vacancy;
  return next;
}

export function resolvePlacement(
  layout: Layout,
  id: string,
  rect: Rect,
  columns: number,
  minWidth = 1,
  minHeight = 1,
): Layout | null {
  if (
    !Number.isInteger(rect.x) ||
    !Number.isInteger(rect.y) ||
    !Number.isInteger(rect.w) ||
    !Number.isInteger(rect.h) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.w < minWidth ||
    rect.h < minHeight ||
    rect.x + rect.w > columns
  ) {
    return null;
  }

  const next: Layout = { ...layout, [id]: { ...rect } };
  const order = readingOrder(layout).filter((otherId) => otherId !== id);
  for (const otherId of order) {
    const current = layout[otherId];
    if (fitsAt(current, next, otherId)) continue;

    let moved: Rect | null = null;
    for (let y = current.y + 1; ; y += 1) {
      const candidate = { ...current, y };
      if (fitsAt(candidate, next, otherId)) {
        moved = candidate;
        break;
      }
    }
    if (!moved) return null;
    next[otherId] = moved;
  }
  return next;
}

export function reconcileLayout(
  layout: Layout,
  widgets: readonly WidgetInstance[],
  breakpoint: Breakpoint,
  width: number,
): Layout {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const next: Layout = {};
  const columns = columnsFor(breakpoint);

  for (const id of readingOrder(layout)) {
    const widget = byId.get(id);
    if (!widget) continue;
    const oldRect = layout[id];
    const max = maximumFootprint(widget.kind, breakpoint);
    const normalizedWidth =
      breakpoint === "mobile"
        ? columns
        : Math.max(
            minimumWidthSpan(columns, width),
            breakpoint === "desktop" ? Math.min(max.w, oldRect.w) : oldRect.w,
          );
    const normalizedHeight = Math.max(
      minimumHeight(breakpoint, widget.kind),
      breakpoint === "desktop" ? Math.min(max.h, oldRect.h) : oldRect.h,
    );
    const size = classifyFootprint(
      normalizedWidth,
      normalizedHeight,
      breakpoint,
      width,
    );
    const shape = {
      w: normalizedWidth,
      h: normalizedHeight,
      size,
    };
    const candidate: Rect = {
      x: Math.min(Math.max(0, oldRect.x), columns - shape.w),
      y: Math.max(0, oldRect.y),
      ...shape,
    };
    const placement = resolvePlacement(next, id, candidate, columns);
    if (placement) Object.assign(next, placement);
  }

  for (const widget of widgets) {
    if (!(widget.id in next)) {
      Object.assign(
        next,
        addToLayout(next, widget, breakpoint, width, columns),
      );
    }
  }
  return next;
}
