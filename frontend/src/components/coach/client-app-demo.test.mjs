import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adoptClientAppDemo,
  CLIENT_APP_DEMO_CLIENT_ID,
  CLIENT_APP_DEMO_REVISION,
} from "./client-app-demo.ts";
import { isCoachState, seedState } from "./model.ts";

const TODAY = "2026-10-22";

// seedState() already applies the demo; reset client-007's demo-filled slots so
// the adoption path can be exercised directly.
function baseWithoutDemo() {
  const seeded = seedState();
  const clients = seeded.clients.map((client) =>
    client.id === CLIENT_APP_DEMO_CLIENT_ID
      ? {
          ...client,
          entries: [],
          habits: [],
          plans: {
            nutrition: {
              mealPlan: { history: [] },
              iifym: { history: [] },
            },
            training: client.plans?.training ?? { history: [] },
            goals: client.plans?.goals ?? [],
            activityTargets: undefined,
            supplements: undefined,
          },
        }
      : client,
  );
  return {
    ...seeded,
    demoSeeds: { amaraTraining: 1 },
    clients,
    submissions: seeded.submissions.filter(
      (s) => s.clientId !== CLIENT_APP_DEMO_CLIENT_ID,
    ),
  };
}

const clientOf = (state) =>
  state.clients.find((client) => client.id === CLIENT_APP_DEMO_CLIENT_ID);

test("adoptClientAppDemo fills client-007 and sets the flag", () => {
  const state = adoptClientAppDemo(baseWithoutDemo(), TODAY);
  assert.equal(state.demoSeeds?.clientAppDemo, CLIENT_APP_DEMO_REVISION);
  const amara = clientOf(state);
  assert.ok(amara);
  const variant = amara.assignment.snapshot.variants.find(
    (v) => v.id === amara.assignment.variantId,
  );
  assert.ok(variant);
  for (const view of [
    "Dashboard",
    "Tracker",
    "Timeline / Roadmap",
    "Nutrition",
    "Training Program",
    "Check-In",
  ])
    assert.ok(variant.views.includes(view), `missing view ${view}`);
  assert.equal(variant.habits, true);
  assert.ok(variant.questions.length >= 4, "at least four questions");
  for (const id of ["weight", "sleep", "steps", "calories"])
    assert.ok(
      variant.fields.some((f) => f.id === id),
      `missing tracker field ${id}`,
    );
  assert.equal(amara.plans.supplements.items.length, 4);
  assert.equal(amara.plans.supplements.clientId, "client-007");
  assert.equal(amara.plans.activityTargets.length, 3);
  assert.ok(amara.plans.nutrition.mealPlan.active, "meal plan activated");
  assert.equal(amara.habits.length, 3);
  const submissions = state.submissions.filter(
    (s) => s.clientId === CLIENT_APP_DEMO_CLIENT_ID,
  );
  assert.equal(submissions.length, 2);
  assert.equal(
    submissions.filter((s) => s.response).length,
    1,
    "one answered, one awaiting feedback",
  );
  assert.ok(isCoachState(state), "result passes the storage guard");
});

test("adoptClientAppDemo is a no-op once the flag is set", () => {
  const applied = adoptClientAppDemo(baseWithoutDemo(), TODAY);
  const again = adoptClientAppDemo(applied, "2026-10-23");
  assert.deepEqual(again, applied);
});

test("other clients and state sections stay untouched", () => {
  const base = baseWithoutDemo();
  const applied = adoptClientAppDemo(base, TODAY);
  assert.deepEqual(
    applied.clients.filter((c) => c.id !== CLIENT_APP_DEMO_CLIENT_ID),
    base.clients.filter((c) => c.id !== CLIENT_APP_DEMO_CLIENT_ID),
  );
  assert.deepEqual(applied.templates, base.templates);
  assert.deepEqual(
    applied.submissions.filter((s) => s.clientId !== CLIENT_APP_DEMO_CLIENT_ID),
    base.submissions,
  );
});

test("an existing supplement plan on client-007 is preserved", () => {
  const base = baseWithoutDemo();
  const existing = {
    id: "owner-plan",
    clientId: CLIENT_APP_DEMO_CLIENT_ID,
    name: "Owner stack",
    items: [],
    savedAt: "2026-10-20T10:00:00Z",
  };
  const withPlan = {
    ...base,
    clients: base.clients.map((client) =>
      client.id === CLIENT_APP_DEMO_CLIENT_ID
        ? { ...client, plans: { ...client.plans, supplements: existing } }
        : client,
    ),
  };
  const applied = adoptClientAppDemo(withPlan, TODAY);
  assert.deepEqual(
    clientOf(applied).plans.supplements,
    existing,
    "owner plan content preserved, not replaced by the demo plan",
  );
});

test("tracker history ends yesterday with blanks and a zero-steps day", () => {
  const applied = adoptClientAppDemo(baseWithoutDemo(), TODAY);
  const entries = clientOf(applied).entries;
  assert.equal(entries.at(-1).date, "2026-10-21");
  const first = entries[0].date;
  assert.equal(first, "2026-08-27", "covers eight weeks back");
  assert.ok(
    entries.some((e) => e.steps === 0),
    "includes a zero-steps day",
  );
  assert.ok(entries.length < 56, "some days missing entirely");
  // Missing dates are absent, not zero-filled.
  const dates = new Set(entries.map((e) => e.date));
  assert.equal(dates.size, entries.length, "one row per logged date");
});

test("deterministic: identical input produces identical output", () => {
  const a = adoptClientAppDemo(baseWithoutDemo(), TODAY);
  const b = adoptClientAppDemo(baseWithoutDemo(), TODAY);
  assert.deepEqual(
    clientOf(a).entries,
    clientOf(b).entries,
    "entries identical",
  );
});

test("missing client or missing assignment returns state unchanged", () => {
  const base = baseWithoutDemo();
  const absent = {
    ...base,
    clients: base.clients.filter((c) => c.id !== CLIENT_APP_DEMO_CLIENT_ID),
  };
  assert.deepEqual(adoptClientAppDemo(absent, TODAY).clients, absent.clients);
  const unassigned = {
    ...base,
    clients: base.clients.map((client) =>
      client.id === CLIENT_APP_DEMO_CLIENT_ID
        ? { ...client, assignment: undefined }
        : client,
    ),
  };
  const result = adoptClientAppDemo(unassigned, TODAY);
  assert.deepEqual(clientOf(result).plans, clientOf(unassigned).plans);
});
