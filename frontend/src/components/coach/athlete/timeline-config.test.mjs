import assert from "node:assert/strict";
import test from "node:test";
import { newTemplate, newVariant } from "../model.ts";
import { templateSetup } from "../template-setup.ts";
import {
  defaultTimelineGroups,
  normalizeTimelineSetup,
} from "./timeline-config.ts";
import {
  TIMELINE_COLUMN_IDS,
  TIMELINE_GROUP_BY_COLUMN,
  TIMELINE_GROUP_DEFAULTS,
} from "./timeline-groups.ts";

test("legacy variants normalise to today's default groups, columns and order", () => {
  const normalized = normalizeTimelineSetup(newVariant());
  assert.deepEqual(normalized.groups, defaultTimelineGroups());
  assert.deepEqual(
    normalized.groups.map((group) => ({
      id: group.id,
      columns: group.columns,
    })),
    TIMELINE_GROUP_DEFAULTS.map((group) => ({
      id: group.id,
      columns: group.columnIds,
    })),
  );
  assert.equal(normalized.showPhases, true);
  assert.equal(normalized.compare, undefined);
  assert.equal(normalized.order, undefined);
  assert.equal(
    new Set(normalized.groups.flatMap((group) => group.columns)).size,
    TIMELINE_COLUMN_IDS.length,
  );
});

test("showPhases falls back to roadmapPhases and an explicit value wins", () => {
  const legacyOff = { ...newVariant(), roadmapPhases: false };
  assert.equal(normalizeTimelineSetup(legacyOff).showPhases, false);
  const explicit = {
    ...newVariant(),
    roadmapPhases: false,
    timeline: { groups: [], showPhases: true },
  };
  assert.equal(normalizeTimelineSetup(explicit).showPhases, true);
});

test("configured timeline keeps order/labels, cleans duplicates and drops unknown or empty groups", () => {
  const normalized = normalizeTimelineSetup({
    timeline: {
      groups: [
        {
          id: "Notes",
          label: "Coach notes",
          columns: ["note", "changes", "note", "unknown-column"],
        },
        {
          id: "custom-body",
          label: "Body",
          columns: ["weight-avg", "changes"],
          collapsed: true,
          pinned: true,
        },
        { id: "Empty", label: "Empty", columns: ["also-unknown"] },
        { id: "Notes", label: "Duplicate", columns: ["checkin"] },
      ],
      compare: true,
      order: "newest",
    },
  });
  assert.deepEqual(normalized.groups, [
    { id: "Notes", label: "Coach notes", columns: ["note", "changes"] },
    {
      id: "custom-body",
      label: "Body",
      columns: ["weight-avg"],
      collapsed: true,
      pinned: true,
    },
  ]);
  assert.equal(normalized.compare, true);
  assert.equal(normalized.order, "newest");
  assert.equal(normalized.showPhases, true);
});

test("columns missing from a configured setup stay hidden", () => {
  const normalized = normalizeTimelineSetup({
    timeline: {
      groups: [
        { id: "custom-weight", label: "Weight", columns: ["weight-avg"] },
      ],
    },
  });
  assert.deepEqual(normalized.groups, [
    { id: "custom-weight", label: "Weight", columns: ["weight-avg"] },
  ]);
});

test("an explicit empty group list renders no columns", () => {
  assert.deepEqual(
    normalizeTimelineSetup({ timeline: { groups: [] } }).groups,
    [],
  );
});

test("malformed timeline data falls back without throwing", () => {
  for (const bad of [
    null,
    "newest",
    3,
    [],
    { groups: "not-an-array" },
    { groups: [{ id: 3, columns: ["weight-avg"] }] },
    { groups: [{ id: "", columns: ["weight-avg"] }] },
  ]) {
    const normalized = normalizeTimelineSetup({ timeline: bad });
    assert.deepEqual(normalized.groups, defaultTimelineGroups());
  }
  const oddColumns = normalizeTimelineSetup({
    timeline: { groups: [{ id: "custom-a", label: 3, columns: [3, null] }] },
  });
  assert.deepEqual(oddColumns.groups, []);
});

test("templateSetup returns a normalised timeline without mutating the template", () => {
  const template = newTemplate("strength");
  const setup = templateSetup(template);
  assert.deepEqual(setup.timeline?.groups, defaultTimelineGroups());
  assert.equal(setup.timeline?.showPhases, true);
  assert.equal(template.variants[0].timeline, undefined);
});

test("every registry column belongs to exactly one default group", () => {
  for (const id of TIMELINE_COLUMN_IDS)
    assert.ok(TIMELINE_GROUP_BY_COLUMN.has(id), id);
  assert.equal(
    new Set(TIMELINE_GROUP_DEFAULTS.flatMap((group) => group.columnIds)).size,
    TIMELINE_COLUMN_IDS.length,
  );
});

test("plain ids and parameter column objects normalise together", () => {
  const normalized = normalizeTimelineSetup({
    timeline: {
      groups: [
        {
          id: "Bodyweight",
          label: "Bodyweight",
          columns: [
            "weight-avg",
            {
              id: "param:stress",
              label: "Stress load",
              agg: "avg",
              decimals: 0,
            },
            { id: "param:steps", agg: "sum" },
            { id: "param:steps", label: "Duplicate" },
            "param:not a column",
          ],
        },
      ],
    },
  });
  assert.deepEqual(normalized.groups, [
    {
      id: "Bodyweight",
      label: "Bodyweight",
      columns: [
        "weight-avg",
        { id: "param:stress", label: "Stress load", agg: "avg", decimals: 0 },
        { id: "param:steps", agg: "sum" },
      ],
    },
  ]);
  assert.equal(normalized.showPhases, true);
});

test("unknown aggregation and decimals values are dropped, not fatal", () => {
  const normalized = normalizeTimelineSetup({
    timeline: {
      groups: [
        {
          id: "Recovery",
          label: "Recovery",
          columns: [
            { id: "param:stress", agg: "median", decimals: 5 },
            { id: "param:steps", agg: "sum", label: "  " },
          ],
        },
      ],
    },
  });
  assert.deepEqual(normalized.groups[0].columns, [
    "param:stress",
    { id: "param:steps", agg: "sum" },
  ]);
});
