import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clientTracking,
  clientTrackingText,
  withTrackingText,
  withTrackingValue,
} from "./data.ts";

const client = {
  id: "c1",
  entries: [
    { date: "2026-10-20", weight: 72.0, sleep: 7, steps: 8000, calories: 2000 },
    { date: "2026-10-21", weight: 71.8, sleep: 7, steps: 8200, calories: 1950 },
  ],
};

test("clientTracking derives legacy entries when tracking is absent", () => {
  const entries = clientTracking(client);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-10-20");
  assert.equal(entries[0].values.weight, 72.0);
  assert.equal(entries[0].values.sleep, 7);
  assert.equal(entries[0].values.steps, 8000);
  assert.equal(entries[0].values.calories, 2000);
  assert.equal(entries[0].values.waist, null);
  assert.equal(clientTrackingText(client).size === undefined, true);
  assert.deepEqual(clientTrackingText(client), {});
});

test("clientTracking prefers persisted tracking over legacy entries", () => {
  const tracked = {
    ...client,
    tracking: {
      entries: [{ date: "2026-10-21", values: { weight: 70 } }],
      text: { "2026-10-21:mood": "Good" },
    },
  };
  assert.equal(clientTracking(tracked).length, 1);
  assert.equal(clientTracking(tracked)[0].values.weight, 70);
  assert.equal(clientTrackingText(tracked)["2026-10-21:mood"], "Good");
});

test("withTrackingValue initialises tracking from the legacy fallback", () => {
  const next = withTrackingValue(client, "2026-10-21", "weight", 71.5);
  // Both legacy days carried over into the new persisted log.
  assert.equal(next.tracking.entries.length, 2);
  const day = next.tracking.entries.find((e) => e.date === "2026-10-21");
  assert.equal(day.values.weight, 71.5);
  assert.equal(day.values.sleep, 7);
  // New date rows are inserted in order.
  const added = withTrackingValue(client, "2026-10-19", "weight", 72.5);
  assert.equal(added.tracking.entries[0].date, "2026-10-19");
  assert.equal(added.tracking.entries.length, 3);
  // Existing tracking is updated, not reseeded.
  const tracked = { ...client, tracking: { entries: [], text: {} } };
  assert.equal(
    withTrackingValue(tracked, "2026-10-22", "steps", 9000).tracking.entries
      .length,
    1,
  );
});

test("withTrackingText writes and clears keyed values", () => {
  const next = withTrackingText(client, "2026-10-21", "mood", "Flat");
  assert.equal(next.tracking.text["2026-10-21:mood"], "Flat");
  const cleared = withTrackingText(next, "2026-10-21", "mood", "");
  assert.equal(cleared.tracking.text["2026-10-21:mood"], undefined);
});
