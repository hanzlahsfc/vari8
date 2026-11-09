import assert from "node:assert/strict";
import test from "node:test";
import { isCoachState, seedState } from "../model.ts";

test("timelineCompare is optional and only accepts booleans", () => {
  const state = seedState();
  assert.equal(state.timelineCompare, undefined);
  assert.equal(isCoachState(state), true);
  assert.equal(isCoachState({ ...state, timelineCompare: true }), true);
  assert.equal(isCoachState({ ...state, timelineCompare: false }), true);
  for (const bad of [null, "yes", 1, [], {}])
    assert.equal(
      isCoachState({ ...state, timelineCompare: bad }),
      false,
      JSON.stringify(bad),
    );
});

test("deprecated timelineViews still loads previously persisted state", () => {
  const state = seedState();
  const legacyState = {
    ...state,
    timelineOrder: "newest",
    timelineViews: [
      {
        id: "overview",
        name: "Overview",
        columns: ["weight-avg", "kcal-plan"],
        builtIn: true,
        compare: true,
      },
    ],
  };
  assert.equal(isCoachState(legacyState), true);
  const round = JSON.parse(JSON.stringify(legacyState));
  assert.equal(isCoachState(round), true);
  assert.deepEqual(round.timelineViews, legacyState.timelineViews);
});
