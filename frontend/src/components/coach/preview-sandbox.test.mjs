import assert from "node:assert/strict";
import test from "node:test";
import { seedState } from "./model.ts";
import { buildPreviewState, PREVIEW_CLIENT_ID } from "./preview-sandbox.ts";

test("preview sandbox uses the Amara sample athlete and the draft template", () => {
  const state = seedState("2026-11-03");
  const template = state.templates[0];
  const variantId = template.defaultVariant;
  const preview = buildPreviewState(state, template, variantId);
  assert.equal(preview.client.id, PREVIEW_CLIENT_ID);
  assert.equal(preview.client.name, "Amara Lewis");
  assert.equal(preview.client.assignment?.templateId, template.id);
  assert.equal(preview.client.assignment?.variantId, preview.variantId);
  assert.deepEqual(preview.client.assignment?.snapshot, {
    ...template,
    defaultVariant: preview.variantId,
  });
  // Plans and history stay with the sample athlete.
  assert.ok(preview.client.plans);
  assert.ok(
    preview.state.clients.some((client) => client.id === PREVIEW_CLIENT_ID),
  );
});

test("mutating the preview sandbox never touches the live state", () => {
  const state = seedState("2026-11-03");
  const before = structuredClone(state);
  const template = state.templates[0];
  const preview = buildPreviewState(state, template, template.defaultVariant);

  preview.client.name = "Mutated athlete";
  preview.client.habits = [];
  preview.client.assignment?.snapshot.variants[0].fields.push({
    id: "water",
    unit: "L",
  });
  preview.state.clients[0].name = "Mutated workspace client";
  preview.state.templates[0].name = "Mutated template";
  preview.state.templates[0].variants[0].views.push("Injected");

  assert.deepEqual(state, before);
  assert.notEqual(preview.state, state);
  assert.notEqual(
    preview.client,
    state.clients.find((client) => client.id === PREVIEW_CLIENT_ID),
  );
});

test("preview follows the draft defaults, not coach-wide timeline overrides", () => {
  const state = seedState("2026-11-03");
  state.timelineOrder = "newest";
  state.timelineCompare = true;
  const preview = buildPreviewState(
    state,
    state.templates[0],
    state.templates[0].defaultVariant,
  );
  assert.equal(preview.state.timelineOrder, undefined);
  assert.equal(preview.state.timelineCompare, undefined);
  assert.equal(state.timelineOrder, "newest");
});

test("preview falls back to an example athlete when Amara is absent", () => {
  const state = seedState("2026-11-03");
  const withoutAmara = {
    ...structuredClone(state),
    clients: state.clients.filter((client) => client.id !== PREVIEW_CLIENT_ID),
  };
  const preview = buildPreviewState(
    withoutAmara,
    state.templates[0],
    state.templates[0].defaultVariant,
  );
  assert.ok(preview.client.entries.length > 0);
  assert.equal(preview.state.clients[0].id, preview.client.id);
});
