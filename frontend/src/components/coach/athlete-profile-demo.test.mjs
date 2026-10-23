import assert from "node:assert/strict";
import { test } from "node:test";
import { nutritionForDate } from "./athlete/timeline.ts";
import {
  ATHLETE_PROFILE_DEMO_REVISION,
  adoptAthleteProfileDemo,
} from "./athlete-profile-demo.ts";
import { isCoachState, seedState } from "./model.ts";

const TODAY = "2026-10-22";

const clientOf = (state) =>
  state.clients.find((client) => client.id === "client-007");

function baseWithoutDemo() {
  const seeded = seedState();
  const clients = seeded.clients.map((client) =>
    client.id === "client-007"
      ? {
          ...client,
          phasePlan: undefined,
          contestDate: undefined,
          timelineEvents: undefined,
          plans: client.plans
            ? {
                ...client.plans,
                nutrition: {
                  ...client.plans.nutrition,
                  mealPlan: client.plans.nutrition.mealPlan.active
                    ? {
                        ...client.plans.nutrition.mealPlan,
                        active: {
                          ...client.plans.nutrition.mealPlan.active,
                          content: {
                            ...client.plans.nutrition.mealPlan.active.content,
                            variants:
                              client.plans.nutrition.mealPlan.active.content.variants.filter(
                                (v) => v.label !== "Refeed day",
                              ),
                          },
                        },
                      }
                    : client.plans.nutrition.mealPlan,
                },
              }
            : client.plans,
        }
      : client,
  );
  return {
    ...seeded,
    demoSeeds: { ...seeded.demoSeeds, athleteProfileDemo: undefined },
    clients,
  };
}

test("adoptAthleteProfileDemo seeds client-007 and sets the flag", () => {
  const state = adoptAthleteProfileDemo(baseWithoutDemo(), TODAY);
  assert.equal(
    state.demoSeeds?.athleteProfileDemo,
    ATHLETE_PROFILE_DEMO_REVISION,
  );
  const amara = clientOf(state);
  assert.ok(amara.phasePlan);
  assert.ok(amara.contestDate);
  assert.equal(amara.phasePlan.phases.length, 3);
  assert.ok(amara.timelineEvents.length >= 4);
  const kinds = amara.timelineEvents.map((e) => e.kind);
  assert.ok(kinds.includes("refeed"));
  assert.ok(kinds.includes("deload"));
  assert.ok(kinds.includes("diet-break"));
  // A refeed lands two days out and overrides nutrition for that date.
  const refeed = amara.timelineEvents.find(
    (e) => e.kind === "refeed" && e.startDate === "2026-10-24",
  );
  assert.ok(refeed?.nutritionOverride);
  const resolved = nutritionForDate(amara, "2026-10-24");
  assert.equal(resolved.event?.id, refeed.id);
  assert.equal(resolved.label, "Refeed day");
  assert.ok(isCoachState(state));
});

test("second adoption is a no-op", () => {
  const once = adoptAthleteProfileDemo(baseWithoutDemo(), TODAY);
  const twice = adoptAthleteProfileDemo(once, TODAY);
  assert.deepEqual(twice, once);
});

test("other clients are untouched", () => {
  const base = baseWithoutDemo();
  const state = adoptAthleteProfileDemo(base, TODAY);
  for (const client of state.clients)
    if (client.id !== "client-007")
      assert.deepEqual(
        client,
        base.clients.find((c) => c.id === client.id),
      );
});

test("existing phase plan and contest date are preserved", () => {
  const base = baseWithoutDemo();
  const existing = {
    startDate: "2026-09-01",
    phases: [{ id: "x", name: "Mine", durationWeeks: 4 }],
  };
  const clients = base.clients.map((client) =>
    client.id === "client-007"
      ? { ...client, phasePlan: existing, contestDate: "2026-12-31" }
      : client,
  );
  const state = adoptAthleteProfileDemo({ ...base, clients }, TODAY);
  const amara = clientOf(state);
  assert.deepEqual(amara.phasePlan, existing);
  assert.equal(amara.contestDate, "2026-12-31");
});

test("no client-007 or no assignment leaves state unchanged", () => {
  const base = baseWithoutDemo();
  const without = {
    ...base,
    clients: base.clients.filter((client) => client.id !== "client-007"),
  };
  assert.equal(adoptAthleteProfileDemo(without, TODAY), without);
});
