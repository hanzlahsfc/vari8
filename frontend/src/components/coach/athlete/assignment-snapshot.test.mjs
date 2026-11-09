import assert from "node:assert/strict";
import test from "node:test";
import { isCoachState, seedState } from "../model.ts";
import {
  assignedVariant,
  clientHabitsEnabled,
  normalizeTemplateSetups,
  templateSetup,
} from "../template-setup.ts";
import { defaultTimelineGroups } from "./timeline-config.ts";
import { buildGroups, trackerFields } from "./tracker-columns.ts";

const seeded = (clientId) => {
  const state = seedState("2026-11-03");
  const client = state.clients.find((item) => item.id === clientId);
  const liveTemplate = state.templates.find(
    (template) => template.id === client.assignment.templateId,
  );
  const liveVariant = liveTemplate.variants.find(
    (variant) => variant.id === client.assignment.variantId,
  );
  return { state, client, liveVariant };
};

const editLiveTemplate = (liveVariant) => {
  const weight = liveVariant.fields.find((field) => field.id === "weight");
  if (weight) {
    weight.unit = "lb";
    weight.summary = "sum";
  }
  liveVariant.fields.push({ id: "water", unit: "L" });
  liveVariant.habits = false;
  liveVariant.timeline = {
    groups: [
      { id: "custom-live", label: "Live only", columns: ["weight-avg"] },
    ],
    showPhases: false,
    compare: true,
    order: "newest",
  };
};

test("trackerFields reads the assignment snapshot, never the live template", () => {
  const { client, liveVariant } = seeded("client-001");
  const snapshot = structuredClone(trackerFields(client));
  editLiveTemplate(liveVariant);
  assert.deepEqual(trackerFields(client), snapshot);
  assert.ok(!trackerFields(client).some((field) => field.id === "water"));
  assert.equal(
    trackerFields(client).find((field) => field.id === "weight")?.unit,
    "kg",
  );
});

test("buildGroups for an assigned client ignores live template field edits", () => {
  const { client, liveVariant } = seeded("client-001");
  const before = buildGroups(client);
  editLiveTemplate(liveVariant);
  assert.deepEqual(buildGroups(client), before);
});

test("client habits follow the assignment snapshot, not the live template", () => {
  const { client, liveVariant } = seeded("client-001");
  assert.equal(clientHabitsEnabled(client), true);
  editLiveTemplate(liveVariant);
  assert.equal(clientHabitsEnabled(client), true);
});

test("timeline configuration is read from the assignment snapshot only", () => {
  const { client, liveVariant } = seeded("client-007");
  const before = assignedVariant(client).timeline;
  assert.deepEqual(before?.groups, defaultTimelineGroups());
  editLiveTemplate(liveVariant);
  const after = assignedVariant(client).timeline;
  assert.deepEqual(after, before);
  assert.equal(
    assignedVariant(client) &&
      templateSetup(client.assignment.snapshot, client.assignment.variantId)
        .timeline?.showPhases,
    true,
  );
});

test("persisted template and snapshot layouts round-trip through the validator", () => {
  const { state } = seeded("client-007");
  const templateTimeline = {
    groups: [
      {
        id: "custom-stack",
        label: "Stack",
        columns: ["weight-avg", "sleep"],
        collapsed: true,
        pinned: true,
      },
    ],
    showPhases: false,
    compare: true,
    order: "newest",
  };
  const trackerLayout = {
    groups: [
      {
        id: "custom-main",
        label: "Main",
        fieldIds: ["weight", "calories"],
        collapsed: true,
        pinned: true,
      },
    ],
  };
  const template = state.templates[0];
  template.variants[0].timeline = templateTimeline;
  template.variants[0].trackerLayout = trackerLayout;
  const client = state.clients.find((item) => item.id === "client-007");
  const snapshotVariant = client.assignment.snapshot.variants.find(
    (variant) => variant.id === client.assignment.variantId,
  );
  snapshotVariant.timeline = structuredClone(templateTimeline);
  snapshotVariant.trackerLayout = structuredClone(trackerLayout);

  assert.equal(isCoachState(state), true);
  const stored = JSON.parse(JSON.stringify(state));
  assert.equal(isCoachState(stored), true);
  const normalized = normalizeTemplateSetups(stored);
  assert.deepEqual(
    normalized.templates[0].variants[0].timeline,
    templateTimeline,
  );
  assert.deepEqual(
    normalized.templates[0].variants[0].trackerLayout?.groups[0],
    trackerLayout.groups[0],
  );
  assert.ok(
    (normalized.templates[0].variants[0].trackerLayout?.groups.length ?? 0) > 1,
  );
  assert.deepEqual(
    normalized.clients
      .find((item) => item.id === "client-007")
      .assignment.snapshot.variants.find(
        (variant) =>
          variant.id ===
          normalized.clients.find((item) => item.id === "client-007").assignment
            .variantId,
      ).timeline,
    templateTimeline,
  );
});

test("malformed new fields are accepted on load and cleaned without throwing", () => {
  const { state } = seeded("client-001");
  state.templates[0].variants[0].timeline = {
    groups: [
      {
        id: "custom-a",
        label: 7,
        columns: ["weight-avg", "weight-avg", "unknown", 4],
        collapsed: "yes",
      },
      { id: "custom-a", label: "dup", columns: ["sleep"] },
      { id: 4, columns: ["sleep"] },
    ],
    showPhases: "no",
    compare: "yes",
    order: "sideways",
  };
  state.templates[0].variants[0].trackerLayout = {
    groups: [
      {
        id: "custom-main",
        fieldIds: ["weight", "weight", "removed", 4],
        pinned: "yes",
      },
      { id: "custom-main", fieldIds: ["sleep"] },
    ],
  };
  assert.equal(isCoachState(state), true);
  const normalized = normalizeTemplateSetups(state);
  assert.deepEqual(normalized.templates[0].variants[0].timeline?.groups, [
    { id: "custom-a", label: "custom-a", columns: ["weight-avg"] },
  ]);
  assert.equal(normalized.templates[0].variants[0].timeline?.showPhases, true);
  assert.equal(
    normalized.templates[0].variants[0].timeline?.compare,
    undefined,
  );
  assert.equal(normalized.templates[0].variants[0].timeline?.order, undefined);
  assert.deepEqual(
    normalized.templates[0].variants[0].trackerLayout?.groups[0],
    { id: "custom-main", label: "custom-main", fieldIds: ["weight"] },
  );
  assert.equal(
    normalized.templates[0].variants[0].trackerLayout?.groups.some(
      (group) => group.id === "custom-main" && group.fieldIds.length > 1,
    ),
    false,
  );
});
