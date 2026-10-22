import assert from "node:assert/strict";
import { isCoachState, seedState } from "../model.ts";
import {
  canSaveClientPhasePlan,
  isClientPhasePlan,
  isValidPhaseStartDate,
  phaseForDate,
  phasePlanRanges,
} from "./phase-planning.ts";

const plan = {
  startDate: "2026-10-19",
  phases: [
    { id: "cut", name: "Fat loss", durationWeeks: 2 },
    { id: "maintain", name: "Maintenance", durationWeeks: 1 },
  ],
};

assert.equal(isClientPhasePlan(plan), true);
assert.equal(canSaveClientPhasePlan(plan), true);
assert.equal(isValidPhaseStartDate("2026-10-19"), true);
assert.equal(isValidPhaseStartDate("2026-02-30"), false);
assert.equal(isValidPhaseStartDate(""), false);
assert.equal(
  canSaveClientPhasePlan({ ...plan, startDate: "" }),
  false,
  "the setup save gate rejects a cleared start date",
);
assert.equal(
  canSaveClientPhasePlan({
    ...plan,
    phases: [{ ...plan.phases[0], durationWeeks: 1.5 }],
  }),
  false,
  "the setup save gate rejects fractional week durations",
);
assert.equal(
  canSaveClientPhasePlan({ startDate: "", phases: [] }),
  true,
  "an empty plan can be saved as a removal",
);
assert.deepEqual(phasePlanRanges(plan), [
  {
    id: "cut",
    name: "Fat loss",
    durationWeeks: 2,
    startDate: "2026-10-19",
    endDate: "2026-11-01",
  },
  {
    id: "maintain",
    name: "Maintenance",
    durationWeeks: 1,
    startDate: "2026-11-02",
    endDate: "2026-11-08",
  },
]);
assert.equal(phaseForDate(plan, "2026-10-19"), "Fat loss");
assert.equal(phaseForDate(plan, "2026-11-01"), "Fat loss");
assert.equal(phaseForDate(plan, "2026-11-02"), "Maintenance");
assert.equal(phaseForDate(plan, "2026-11-08"), "Maintenance");
assert.equal(phaseForDate(plan, "2026-10-18"), undefined);
assert.equal(phaseForDate(plan, "2026-11-09"), undefined);
assert.equal(phaseForDate(plan, "2026-02-30"), undefined);
assert.deepEqual(phasePlanRanges(undefined), []);

assert.equal(
  isClientPhasePlan({
    startDate: "2026-10-19",
    phases: [{ id: "bad", name: "Invalid duration", durationWeeks: 0 }],
  }),
  false,
);
assert.equal(
  isClientPhasePlan({
    startDate: "2026-02-30",
    phases: [{ id: "bad", name: "Valid phase", durationWeeks: 1 }],
  }),
  false,
);

const state = seedState();
state.clients[0].phasePlan = plan;
assert.equal(
  isCoachState(state),
  true,
  "valid saved phase plans pass storage validation",
);
state.clients[0].phasePlan.phases[0].durationWeeks = 0;
assert.equal(
  isCoachState(state),
  false,
  "invalid saved phase durations fail storage validation",
);
