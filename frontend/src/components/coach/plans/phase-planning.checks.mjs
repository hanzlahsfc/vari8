import assert from "node:assert/strict";
import { isCoachState, seedState } from "../model.ts";
import {
  canSavePhases,
  isClientPhase,
  isClientPhasePlan,
  isClientPhases,
  isValidPhaseStartDate,
  legacyPhasePlanToPhases,
  normalizePhases,
  phaseForDate,
  phaseRanges,
} from "./phase-planning.ts";

const phases = [
  { id: "cut", name: "Fat loss", startDate: "2026-10-19", durationWeeks: 2 },
  {
    id: "maintain",
    name: "Maintenance",
    startDate: "2026-11-02",
    durationWeeks: 1,
  },
];

assert.equal(isClientPhase(phases[0]), true);
assert.equal(isClientPhases(phases), true);
assert.equal(canSavePhases(phases), true);
assert.equal(canSavePhases([]), true, "an empty list saves as removal");
assert.equal(isValidPhaseStartDate("2026-10-19"), true);
assert.equal(isValidPhaseStartDate("2026-02-30"), false);
assert.equal(isValidPhaseStartDate(""), false);
assert.equal(
  canSavePhases([{ ...phases[0], durationWeeks: 1.5 }]),
  false,
  "the save gate rejects fractional week durations",
);
assert.equal(
  canSavePhases([{ ...phases[0], startDate: "" }]),
  false,
  "the save gate rejects a cleared start date",
);
assert.equal(
  canSavePhases([{ ...phases[0], name: " " }]),
  false,
  "the save gate rejects an empty phase name",
);

assert.deepEqual(phaseRanges(phases), [
  {
    id: "cut",
    name: "Fat loss",
    startDate: "2026-10-19",
    durationWeeks: 2,
    endDate: "2026-11-01",
  },
  {
    id: "maintain",
    name: "Maintenance",
    startDate: "2026-11-02",
    durationWeeks: 1,
    endDate: "2026-11-08",
  },
]);

// Back-to-back: out-of-order starts are sorted and rewritten.
assert.deepEqual(
  normalizePhases([
    {
      id: "b",
      name: "Second",
      startDate: "2026-12-01",
      durationWeeks: 1,
    },
    { id: "a", name: "First", startDate: "2026-10-19", durationWeeks: 2 },
  ]).map((p) => [p.id, p.startDate]),
  [
    ["a", "2026-10-19"],
    ["b", "2026-11-02"],
  ],
  "phases normalize back-to-back from the first start",
);

assert.equal(phaseForDate(phases, "2026-10-19"), "Fat loss");
assert.equal(phaseForDate(phases, "2026-11-01"), "Fat loss");
assert.equal(phaseForDate(phases, "2026-11-02"), "Maintenance");
assert.equal(phaseForDate(phases, "2026-11-08"), "Maintenance");
assert.equal(phaseForDate(phases, "2026-10-18"), undefined);
assert.equal(phaseForDate(phases, "2026-11-09"), undefined);
assert.equal(phaseForDate(phases, "2026-02-30"), undefined);
assert.deepEqual(phaseRanges(undefined), []);

// ─── Legacy plan migration ──────────────────────────────────────────
const legacy = {
  startDate: "2026-10-19",
  phases: [
    { id: "cut", name: "Fat loss", durationWeeks: 2 },
    { id: "maintain", name: "Maintenance", durationWeeks: 1 },
  ],
};
assert.equal(isClientPhasePlan(legacy), true);
assert.deepEqual(legacyPhasePlanToPhases(legacy), phases);

const state = seedState();
state.clients[0].phases = phases;
assert.equal(
  isCoachState(state),
  true,
  "valid saved phases pass storage validation",
);
state.clients[0].phases[0].durationWeeks = 0;
assert.equal(
  isCoachState(state),
  false,
  "invalid saved phase durations fail storage validation",
);
