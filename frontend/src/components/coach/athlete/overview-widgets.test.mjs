import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ATHLETE_WIDGETS,
  isAthleteOverviewSetting,
  layoutOverviewWidgets,
  resolveOverviewWidgets,
} from "./overview-widgets.ts";

const DEFAULT_ORDER = [
  "bodyweight",
  "next-check-in",
  "nutrition-targets",
  "activity-targets",
  "needs-attention",
  "timeline",
  "recent-training",
  "coaching-setup",
  "training-plan",
  "supplements",
];

test("defaults: table order, widths and default visibility", () => {
  assert.deepEqual(
    ATHLETE_WIDGETS.map((w) => w.id),
    DEFAULT_ORDER,
  );
  const resolved = resolveOverviewWidgets(undefined);
  assert.deepEqual(
    resolved.map((w) => w.id),
    DEFAULT_ORDER,
  );
  const hidden = resolved.filter((w) => !w.visible).map((w) => w.id);
  assert.deepEqual(hidden, ["training-plan", "supplements"]);
  assert.equal(resolved.find((w) => w.id === "bodyweight").width, "small");
  assert.equal(resolved.find((w) => w.id === "timeline").width, "full");
  assert.equal(
    resolved.find((w) => w.id === "nutrition-targets").width,
    "medium",
  );
});

test("setting order is honoured and visibility kept", () => {
  const setting = {
    widgets: [
      { id: "timeline", visible: true },
      { id: "bodyweight", visible: false },
      { id: "next-check-in", visible: true },
      { id: "nutrition-targets", visible: true },
      { id: "activity-targets", visible: true },
      { id: "needs-attention", visible: true },
      { id: "recent-training", visible: false },
      { id: "coaching-setup", visible: true },
      { id: "training-plan", visible: true },
      { id: "supplements", visible: true },
    ],
  };
  const resolved = resolveOverviewWidgets(setting);
  assert.equal(resolved[0].id, "timeline");
  assert.equal(resolved[1].id, "bodyweight");
  assert.equal(resolved[1].visible, false);
  assert.equal(resolved.find((w) => w.id === "training-plan").visible, true);
});

test("unknown ids are dropped, missing ids appear at their default position", () => {
  const resolved = resolveOverviewWidgets({
    widgets: [
      { id: "bogus-widget", visible: true },
      { id: "timeline", visible: true },
      { id: "bodyweight", visible: true },
    ],
  });
  assert.equal(
    resolved.some((w) => w.id === "bogus-widget"),
    false,
  );
  // timeline + bodyweight keep the saved order; every missing widget slots
  // back into its default place relative to the others.
  assert.deepEqual(
    resolved.map((w) => w.id),
    [
      "timeline",
      "bodyweight",
      "next-check-in",
      "nutrition-targets",
      "activity-targets",
      "needs-attention",
      "recent-training",
      "coaching-setup",
      "training-plan",
      "supplements",
    ],
  );
});

test("a widget added later lands at its default slot between saved neighbours", () => {
  // Saved layout covers every widget except coaching-setup: it re-appears
  // where the default table puts it — after timeline, not at the end.
  const ids = DEFAULT_ORDER.filter((id) => id !== "coaching-setup");
  const resolved = resolveOverviewWidgets({
    widgets: ids.map((id) => ({ id, visible: true })),
  });
  assert.deepEqual(
    resolved.map((w) => w.id),
    DEFAULT_ORDER,
  );
});

const widget = (id) => ATHLETE_WIDGETS.find((w) => w.id === id);
const spans = (ids) =>
  layoutOverviewWidgets(ids.map(widget)).map((cell) => ({
    id: cell.id,
    span: cell.span,
  }));

test("layoutOverviewWidgets packs the default visible order into 12-col rows", () => {
  assert.deepEqual(
    spans([
      "bodyweight",
      "next-check-in",
      "nutrition-targets",
      "activity-targets",
      "needs-attention",
      "timeline",
      "recent-training",
      "coaching-setup",
    ]),
    [
      // row 1: 3 + 3 + 6 = 12
      { id: "bodyweight", span: 3 },
      { id: "next-check-in", span: 3 },
      { id: "nutrition-targets", span: 6 },
      // row 2: 6 + 6 = 12
      { id: "activity-targets", span: 6 },
      { id: "needs-attention", span: 6 },
      // row 3: timeline full row
      { id: "timeline", span: 12 },
      // row 4: the last two mediums share a row (no grid holes)
      { id: "recent-training", span: 6 },
      { id: "coaching-setup", span: 6 },
    ],
  );
});

test("layoutOverviewWidgets lifts a lone medium between full rows", () => {
  assert.deepEqual(
    spans(["nutrition-targets", "timeline", "activity-targets"]),
    [
      { id: "nutrition-targets", span: 12 },
      { id: "timeline", span: 12 },
      { id: "activity-targets", span: 12 },
    ],
  );
});

test("layoutOverviewWidgets: single medium spans 12, smalls keep packing", () => {
  assert.deepEqual(spans(["needs-attention"]), [
    { id: "needs-attention", span: 12 },
  ]);
  assert.deepEqual(spans(["bodyweight", "next-check-in"]), [
    { id: "bodyweight", span: 3 },
    { id: "next-check-in", span: 3 },
  ]);
  assert.deepEqual(
    spans(["bodyweight", "nutrition-targets", "activity-targets"]),
    [
      // row 1: 3 + 6 = 9; row 2: lone medium → 12
      { id: "bodyweight", span: 3 },
      { id: "nutrition-targets", span: 6 },
      { id: "activity-targets", span: 12 },
    ],
  );
});

test("isAthleteOverviewSetting validates the stored shape", () => {
  assert.equal(
    isAthleteOverviewSetting({
      widgets: [{ id: "timeline", visible: true }],
    }),
    true,
  );
  assert.equal(isAthleteOverviewSetting({ widgets: [] }), true);
  assert.equal(isAthleteOverviewSetting({}), false);
  assert.equal(
    isAthleteOverviewSetting({ widgets: [{ id: "timeline" }] }),
    false,
  );
  assert.equal(isAthleteOverviewSetting({ widgets: "timeline" }), false);
  assert.equal(isAthleteOverviewSetting(null), false);
});
