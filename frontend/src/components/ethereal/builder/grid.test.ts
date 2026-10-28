import assert from "node:assert/strict";
import test from "node:test";
import type { Layout, Rect } from "./grid";
// @ts-expect-error Node's built-in TypeScript runner imports the source file by extension.
import * as grid from "./grid.ts";
import type { SizeName, WidgetInstance } from "./model";
// @ts-expect-error Node's built-in TypeScript runner imports the source file by extension.
import { defaultSettings } from "./model.ts";

const {
  addToLayout,
  arrange,
  arrangeInReadingOrder,
  columnsFor,
  footprint,
  getBreakpoint,
  minimumHeight,
  minimumWidthSpan,
  readingOrder,
  reconcileLayout,
  resolvePlacement,
} = grid;

function widget(id: string, size: SizeName): WidgetInstance {
  return { id, kind: "BN21", settings: { ...defaultSettings("BN21"), size } };
}

function hasNoOverlaps(layout: Layout): boolean {
  const rects = Object.values(layout);
  return rects.every((rect, index) =>
    rects.slice(index + 1).every((other) => !intersects(rect, other)),
  );
}

function intersects(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

test("breakpoints and width-aware footprints follow the canvas contract", () => {
  assert.equal(getBreakpoint(320), "mobile");
  assert.equal(getBreakpoint(639), "mobile");
  assert.equal(getBreakpoint(640), "tablet");
  assert.equal(getBreakpoint(1039), "tablet");
  assert.equal(getBreakpoint(1040), "desktop");
  assert.deepEqual(
    [columnsFor("desktop"), columnsFor("tablet"), columnsFor("mobile")],
    [12, 6, 2],
  );
  assert.deepEqual(footprint("Regular", "tablet", 640), {
    w: 4,
    h: 3,
    size: "Regular",
  });
  assert.deepEqual(footprint("Regular", "desktop", 1040), {
    w: 4,
    h: 3,
    size: "Regular",
  });
  assert.deepEqual(footprint("Expanded", "mobile", 390), {
    w: 2,
    h: 6,
    size: "Expanded",
  });
});

test("arrange and addToLayout use the first top-left vacancy without mutating input", () => {
  const widgets = [
    widget("a", "Compact"),
    widget("b", "Compact"),
    widget("c", "Regular"),
  ];
  const arranged = arrange(widgets, "desktop", 1200);
  assert.deepEqual(arranged.a, { x: 0, y: 0, w: 3, h: 2, size: "Compact" });
  assert.deepEqual(arranged.b, { x: 3, y: 0, w: 3, h: 2, size: "Compact" });
  assert.deepEqual(arranged.c, { x: 6, y: 0, w: 4, h: 3, size: "Regular" });
  const before = JSON.stringify(arranged);
  const added = addToLayout(arranged, widget("d", "Tall"), "desktop", 1200);
  assert.equal(JSON.stringify(arranged), before);
  assert.deepEqual(added.d, { x: 0, y: 2, w: 3, h: 5, size: "Tall" });
  assert.equal(hasNoOverlaps(added), true);
});

test("section headings default to one full-width structural row", () => {
  const heading: WidgetInstance = {
    id: "heading",
    kind: "CU17",
    settings: defaultSettings("CU17"),
  };

  assert.deepEqual(addToLayout({}, heading, "desktop", 1280).heading, {
    x: 0,
    y: 0,
    w: 12,
    h: 1,
    size: "Compact",
  });
  assert.deepEqual(addToLayout({}, heading, "tablet", 768).heading, {
    x: 0,
    y: 0,
    w: 6,
    h: 1,
    size: "Compact",
  });
  assert.deepEqual(addToLayout({}, heading, "mobile", 390).heading, {
    x: 0,
    y: 0,
    w: 2,
    h: 3,
    size: "Compact",
  });
});

test("arrangeInReadingOrder preserves mixed-size widget order", () => {
  const widgets = [
    widget("compact-1", "Compact"),
    widget("wide-1", "Wide"),
    widget("wide-2", "Wide"),
    widget("compact-2", "Compact"),
  ];
  assert.notDeepEqual(
    readingOrder(arrange(widgets, "desktop", 1200)),
    widgets.map(({ id }) => id),
  );
  const ordered = arrangeInReadingOrder(widgets, "desktop", 1200);
  assert.deepEqual(
    readingOrder(ordered),
    widgets.map(({ id }) => id),
  );
  assert.equal(hasNoOverlaps(ordered), true);
});

test("resolvePlacement pins the moved widget, pushes collisions downward in reading order, and preserves unrelated positions", () => {
  const layout: Layout = {
    alpha: { x: 0, y: 0, w: 3, h: 2, size: "Compact" },
    beta: { x: 3, y: 0, w: 3, h: 2, size: "Compact" },
    guard: { x: 0, y: 2, w: 3, h: 2, size: "Compact" },
    unrelated: { x: 9, y: 0, w: 3, h: 2, size: "Compact" },
  };
  const placed = resolvePlacement(
    layout,
    "beta",
    { x: 0, y: 0, w: 3, h: 2, size: "Compact" },
    12,
  );
  if (!placed) throw new Error("Valid placement should resolve");
  assert.deepEqual(placed.beta, { x: 0, y: 0, w: 3, h: 2, size: "Compact" });
  assert.deepEqual(placed.alpha, { x: 0, y: 4, w: 3, h: 2, size: "Compact" });
  assert.deepEqual(placed.guard, layout.guard);
  assert.deepEqual(placed.unrelated, layout.unrelated);
  assert.equal(hasNoOverlaps(placed), true);
  assert.equal(
    resolvePlacement(
      layout,
      "beta",
      { x: 10, y: 0, w: 3, h: 2, size: "Compact" },
      12,
    ),
    null,
  );
});

test("reconcileLayout retains valid positions, drops removed widgets, and places new ones", () => {
  const previous: Layout = {
    keep: { x: 6, y: 4, w: 4, h: 3, size: "Regular" },
    remove: { x: 0, y: 0, w: 3, h: 2, size: "Compact" },
  };
  const widgets = [widget("keep", "Compact"), widget("added", "Compact")];
  const next = reconcileLayout(previous, widgets, "desktop", 1200);
  assert.deepEqual(next.keep, previous.keep);
  assert.equal("remove" in next, false);
  assert.ok(next.added);
  assert.equal(hasNoOverlaps(next), true);
  assert.deepEqual(readingOrder(next), ["added", "keep"]);

  const tablet = reconcileLayout(
    { keep: { x: 1, y: 6, w: 4, h: 3, size: "Regular" } },
    [widget("keep", "Compact")],
    "tablet",
    640,
  );
  assert.deepEqual(tablet.keep, { x: 1, y: 6, w: 4, h: 3, size: "Regular" });
});

test("custom rectangles keep independent width and height across breakpoint reconciliation", () => {
  const widgetInstance = widget("custom", "Regular");
  const custom: Layout = {
    custom: { x: 2, y: 4, w: 5, h: 7, size: "Wide" },
  };

  const desktop = reconcileLayout(custom, [widgetInstance], "desktop", 1200);
  assert.deepEqual(desktop.custom, {
    x: 2,
    y: 4,
    w: 5,
    h: 5,
    size: "Expanded",
  });

  const tablet = reconcileLayout(custom, [widgetInstance], "tablet", 768);
  assert.deepEqual(tablet.custom, {
    x: 1,
    y: 4,
    w: 5,
    h: 7,
    size: "Expanded",
  });

  const mobile = reconcileLayout(custom, [widgetInstance], "mobile", 288);
  assert.deepEqual(mobile.custom, {
    x: 0,
    y: 4,
    w: 2,
    h: 7,
    size: "Tall",
  });
  assert.equal(hasNoOverlaps(mobile), true);
});

test("minimum spans protect canvas width and keep breakpoint row floors", () => {
  assert.equal(minimumWidthSpan(12, 1200), 3);
  assert.equal(minimumWidthSpan(6, 768), 2);
  assert.equal(minimumWidthSpan(2, 288), 2);
  assert.deepEqual(
    [
      minimumHeight("desktop"),
      minimumHeight("tablet"),
      minimumHeight("mobile"),
    ],
    [2, 2, 3],
  );

  const layout: Layout = {
    card: { x: 0, y: 0, w: 3, h: 2, size: "Compact" },
  };
  assert.equal(
    resolvePlacement(
      layout,
      "card",
      { x: 0, y: 0, w: 2, h: 2, size: "Compact" },
      12,
      3,
      2,
    ),
    null,
  );
});

test("reading-order auto arrangement keeps custom spans while repacking", () => {
  const widgets = [widget("a", "Compact"), widget("b", "Compact")];
  const current: Layout = {
    a: { x: 7, y: 5, w: 4, h: 6, size: "Expanded" },
    b: { x: 0, y: 0, w: 2, h: 4, size: "Regular" },
  };
  const arranged = arrangeInReadingOrder(widgets, "desktop", 1200, current);
  assert.deepEqual([arranged.a.w, arranged.a.h], [4, 6]);
  assert.deepEqual([arranged.b.w, arranged.b.h], [2, 4]);
  assert.equal(hasNoOverlaps(arranged), true);
});

test("compact arrangement fills an earlier vacancy without changing custom spans", () => {
  const widgets = [
    widget("wide-first", "Compact"),
    widget("too-wide-next", "Compact"),
    widget("fills-gap", "Compact"),
  ];
  const previous: Layout = {
    "wide-first": { x: 4, y: 8, w: 8, h: 2, size: "Wide" },
    "too-wide-next": { x: 0, y: 0, w: 6, h: 2, size: "Regular" },
    "fills-gap": { x: 0, y: 5, w: 4, h: 2, size: "Regular" },
  };
  const arranged = arrange(widgets, "desktop", 1200, previous);

  assert.deepEqual(arranged["wide-first"], {
    x: 0,
    y: 0,
    w: 8,
    h: 2,
    size: "Compact",
  });
  assert.deepEqual(arranged["too-wide-next"], {
    x: 0,
    y: 2,
    w: 6,
    h: 2,
    size: "Compact",
  });
  assert.deepEqual(arranged["fills-gap"], {
    x: 8,
    y: 0,
    w: 4,
    h: 2,
    size: "Compact",
  });
  assert.equal(hasNoOverlaps(arranged), true);
});

test("content caps limit growth without setting a canvas row limit", () => {
  assert.deepEqual(grid.maximumFootprint("CU10", "desktop"), { w: 6, h: 4 });
  assert.deepEqual(grid.maximumFootprint("BN01", "desktop"), { w: 8, h: 6 });
  assert.deepEqual(
    grid.supportedSizes("CU16", ["Compact", "Wide", "Expanded"]),
    ["Compact", "Wide"],
  );
  const base: Layout = {
    first: { x: 0, y: 1000, w: 3, h: 2, size: "Compact" },
  };
  const placed = resolvePlacement(
    base,
    "first",
    { ...base.first, y: 2000 },
    12,
  );
  assert.equal(placed?.first.y, 2000);
  const widget: WidgetInstance = {
    id: "phase",
    kind: "CU10",
    settings: defaultSettings("CU10"),
  };
  const capped = reconcileLayout(
    { phase: { x: 4, y: 9, w: 8, h: 12, size: "Expanded" } },
    [widget],
    "desktop",
    1040,
  );
  assert.deepEqual(capped.phase, { x: 4, y: 9, w: 6, h: 4, size: "Wide" });
});
