import assert from "node:assert/strict";
import test from "node:test";
import { effectiveLogFields } from "../client-app/training-log/model.ts";
import { normalizeTimelineSetup } from "./athlete/timeline-config.ts";
import { buildGroups, trackerFields } from "./athlete/tracker-columns.ts";
import {
  clientSetupCustomized,
  resetAllSections,
  resetSection,
  sectionDiffs,
} from "./client-setup.ts";
import { seedState } from "./model.ts";
import {
  assignedVariant,
  normalizeTemplateSetups,
  templateSetup,
} from "./template-setup.ts";
import { clientTracking, withTrackingValue } from "./tracking/data.ts";

const CLIENT = "client-001";

function fixture(clientId = CLIENT) {
  const state = normalizeTemplateSetups(seedState("2026-11-03"));
  const client = state.clients.find((item) => item.id === clientId);
  const template = state.templates.find(
    (item) => item.id === client.assignment.templateId,
  );
  const variantId = client.assignment.variantId;
  return {
    state,
    client,
    template,
    variantId,
    snapshot: templateSetup(client.assignment.snapshot, variantId),
    library: templateSetup(template, variantId),
  };
}

const withSnapshotEdit = (client, edit) => {
  const snapshot = structuredClone(client.assignment.snapshot);
  const variant = snapshot.variants.find(
    (item) => item.id === client.assignment.variantId,
  );
  edit(variant);
  return {
    ...client,
    assignment: { ...client.assignment, snapshot },
  };
};

test("a fresh assignment matches its library template section by section", () => {
  const { snapshot, library } = fixture();
  assert.deepEqual(sectionDiffs(snapshot, library), []);
});

test("each editor section reports only its own drift", () => {
  const { snapshot, library } = fixture();
  const cases = [
    ["Tabs", (variant) => (variant.views = variant.views.slice(0, -1))],
    [
      "Tracker",
      (variant) =>
        (variant.fields = variant.fields.filter(
          (field) => field.id !== "sleep",
        )),
    ],
    [
      "Timeline",
      (variant) =>
        (variant.timeline = {
          ...normalizeTimelineSetup(variant),
          order: "newest",
        }),
    ],
    ["Nutrition", (variant) => (variant.nutrition = "IIFYM")],
    [
      "Training",
      (variant) =>
        (variant.training = { ...variant.training, intensity: "rpe" }),
    ],
    [
      "Check-In",
      (variant) =>
        (variant.questions = [
          ...variant.questions,
          {
            id: "q-extra",
            label: "Extra question",
            type: "Long text",
            required: false,
            options: "",
          },
        ]),
    ],
    ["Habits", (variant) => (variant.habits = !variant.habits)],
  ];
  for (const [section, edit] of cases) {
    const edited = structuredClone(snapshot);
    edit(edited);
    assert.deepEqual(sectionDiffs(edited, library), [section], section);
  }
});

test("resetSection copies one section and leaves unrelated edits alone", () => {
  const { snapshot, library } = fixture();
  const edited = structuredClone(snapshot);
  edited.views = ["Overview"];
  edited.nutrition = "IIFYM";
  edited.fields = edited.fields.filter((field) => field.id !== "weight");
  edited.training = { ...edited.training, intensity: "rpe" };
  const templateTracker = structuredClone(library);
  templateTracker.fields = templateTracker.fields.map((field) =>
    field.id === "weight" ? { ...field, unit: "lb" } : field,
  );

  const next = resetSection(edited, templateTracker, "Tracker");
  assert.deepEqual(
    next.fields.find((field) => field.id === "weight")?.unit,
    "lb",
  );
  assert.deepEqual(next.views, ["Overview"]);
  assert.equal(next.nutrition, "IIFYM");
  assert.equal(next.training.intensity, "rpe");
  assert.ok(sectionDiffs(next, templateTracker).includes("Tracker") === false);
});

test("resetAllSections clears every difference", () => {
  const { snapshot, library } = fixture();
  const edited = structuredClone(snapshot);
  edited.views = [];
  edited.fields = [];
  edited.nutrition = "IIFYM";
  edited.training = { ...edited.training, volume: false };
  const next = resetAllSections(edited, library);
  assert.deepEqual(sectionDiffs(next, library), []);
  assert.deepEqual(next.views, library.views);
  assert.deepEqual(next.fields, library.fields);
});

test("clientSetupCustomized detects personalization and a deleted template", () => {
  const { state, client } = fixture();
  assert.equal(clientSetupCustomized(client, state.templates), false);
  const personalized = withSnapshotEdit(client, (variant) => {
    variant.nutrition = "IIFYM";
  });
  assert.equal(clientSetupCustomized(personalized, state.templates), true);
  assert.equal(
    clientSetupCustomized(
      personalized,
      state.templates.filter((t) => t.id !== client.assignment.templateId),
    ),
    true,
  );
});

test("client snapshot edits drive tracker, training, nutrition and habits consumers", () => {
  const { state, client } = fixture();
  const edited = withSnapshotEdit(client, (variant) => {
    variant.fields.push({ id: "cramps", unit: "1–10" });
    variant.trackerLayout = {
      groups: [
        {
          id: "custom-wellbeing",
          label: "Wellbeing",
          fieldIds: ["cramps", "sleep"],
        },
      ],
    };
    variant.timeline = { ...normalizeTimelineSetup(variant), order: "newest" };
    variant.nutrition = "IIFYM";
    variant.training = { ...variant.training, intensity: "rpe" };
    variant.questions = [
      ...variant.questions,
      {
        id: "q-extra",
        label: "Extra",
        type: "Short text",
        required: false,
        options: "",
      },
    ];
    variant.habits = false;
  });
  const variant = assignedVariant(edited);
  assert.ok(trackerFields(edited).some((field) => field.id === "cramps"));
  assert.equal(
    buildGroups(edited).find((group) => group.id === "custom-wellbeing")?.label,
    "Wellbeing",
  );
  assert.equal(variant.timeline.order, "newest");
  assert.equal(variant.nutrition, "IIFYM");
  assert.deepEqual(
    effectiveLogFields(variant.training).filter(
      (field) => field === "rir" || field === "rpe",
    ),
    ["rpe"],
  );
  assert.ok(variant.questions.some((question) => question.id === "q-extra"));
  assert.equal(variant.habits, false);

  // The library template never changes when a client setup changes.
  const library = state.templates.find(
    (item) => item.id === client.assignment.templateId,
  );
  assert.equal(templateSetup(library).nutrition, "Meal plan");
  assert.ok(
    !templateSetup(library).fields.some((field) => field.id === "cramps"),
  );
});

test("removing tracker and timeline configuration hides data without deleting it", () => {
  const { client } = fixture();
  const seeded = withTrackingValue(client, "2026-11-01", "sleep", 7.8);
  const before = clientTracking(seeded).find(
    (entry) => entry.date === "2026-11-01",
  )?.values.sleep;
  assert.equal(before, 7.8);

  const hidden = withSnapshotEdit(seeded, (variant) => {
    variant.fields = variant.fields.filter((field) => field.id !== "sleep");
    variant.timeline = { groups: [], showPhases: false };
  });
  assert.ok(!trackerFields(hidden).some((field) => field.id === "sleep"));
  assert.equal(
    clientTracking(hidden).find((entry) => entry.date === "2026-11-01")?.values
      .sleep,
    7.8,
  );
  assert.deepEqual(assignedVariant(hidden).timeline.groups, []);

  const again = withSnapshotEdit(hidden, (variant) => {
    variant.fields.push({ id: "sleep", unit: "h" });
  });
  assert.ok(trackerFields(again).some((field) => field.id === "sleep"));
  assert.equal(
    clientTracking(again).find((entry) => entry.date === "2026-11-01")?.values
      .sleep,
    7.8,
  );
});

test("training log fields keep logged values across an intensity change", () => {
  const { client } = fixture();
  const loggedSet = {
    setId: "set-1",
    done: true,
    weight: 80,
    reps: 5,
    rir: 2,
    rpe: null,
    note: "Strong set",
  };
  const seeded = {
    ...client,
    trainingLogs: [
      {
        id: "log-1",
        clientId: client.id,
        logFields: ["weight", "reps", "rir", "note"],
        exercises: [{ exerciseId: "ex-1", sets: [loggedSet] }],
      },
    ],
  };
  const hidden = withSnapshotEdit(seeded, (variant) => {
    variant.training = { ...variant.training, intensity: "off" };
  });
  assert.ok(
    !effectiveLogFields(assignedVariant(hidden).training).includes("rir"),
  );
  assert.deepEqual(hidden.trainingLogs[0].exercises[0].sets[0], loggedSet);
  const again = withSnapshotEdit(hidden, (variant) => {
    variant.training = { ...variant.training, intensity: "rir" };
  });
  assert.ok(
    effectiveLogFields(assignedVariant(again).training).includes("rir"),
  );
  assert.deepEqual(again.trainingLogs[0].exercises[0].sets[0], loggedSet);
});

test("sectionDiffs ignores comparable legacy defaults", () => {
  const { snapshot, library } = fixture();
  const legacy = structuredClone(snapshot);
  delete legacy.timeline;
  delete legacy.trackerLayout;
  legacy.roadmapPhases = true;
  assert.deepEqual(sectionDiffs(legacy, library), []);
});

test("assignment snapshots remain complete templates", () => {
  const { state, client } = fixture();
  const snapshot = client.assignment.snapshot;
  assert.equal(
    snapshot.id,
    state.templates.find((t) => t.id === client.assignment.templateId).id,
  );
});
