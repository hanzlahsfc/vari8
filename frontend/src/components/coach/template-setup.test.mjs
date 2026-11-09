import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(
  new URL("./template-setup.ts", import.meta.url),
  "utf8",
);
const code = stripTypeScriptTypes(source, { mode: "strip" });
const { templateSetup, singleTemplateSetup, normalizeTemplateSetups } =
  await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
const configuration = (id, nutrition) => ({
  id,
  name: id,
  nutrition,
  views: ["Dashboard", "Mealplan"],
  habits: true,
  widgets: [],
  fields: [{ id: "weight", unit: "kg" }],
  roadmap: [],
  training: {
    fields: ["Sets"],
    volume: true,
    breakdown: "Per exercise",
    presentation: "Table",
  },
  questions: [],
  summaries: ["weight"],
});
const template = () => ({
  id: "strength",
  name: "Strength",
  description: "A saved setup",
  updated: "2026-10-13",
  defaultVariant: "meal-plan",
  variants: [
    configuration("meal-plan", "Meal plan"),
    configuration("iifym", "IIFYM"),
  ],
});

test("one active configuration retains legacy configurations without mutating the source", () => {
  const original = template();
  const before = structuredClone(original);
  const result = singleTemplateSetup(original);
  assert.deepEqual(original, before);
  assert.equal(result.variants.length, 1);
  assert.equal(result.defaultVariant, "meal-plan");
  assert.deepEqual(result.variants[0].views, ["Dashboard", "Nutrition"]);
  assert.equal(result.variants[0].roadmapPhases, true);
  assert.equal(
    result.variants[0].training.breakdown,
    "Primary / additional targets per week",
  );
  assert.deepEqual(result.legacyConfigurations, [before.variants[1]]);
  assert.deepEqual(singleTemplateSetup(result), result);
});

test("a client keeps the configuration actually assigned, including archived legacy selections", () => {
  const original = template();
  const result = singleTemplateSetup(original, "iifym");
  assert.equal(result.variants[0].nutrition, "IIFYM");
  assert.equal(result.variants[0].id, "iifym");
  assert.equal(result.defaultVariant, "iifym");
  assert.equal(result.legacyConfigurations[0].id, "meal-plan");
  assert.notEqual(result.variants[0], original.variants[1]);
  assert.notEqual(result.legacyConfigurations[0], original.variants[0]);
  result.legacyConfigurations[0].fields[0].unit = "lb";
  assert.equal(original.variants[0].fields[0].unit, "kg");
  const normalized = singleTemplateSetup(original);
  assert.equal(templateSetup(normalized, "iifym").nutrition, "IIFYM");
  assert.equal(
    singleTemplateSetup(normalized, "iifym").variants[0].nutrition,
    "IIFYM",
  );
});

test("workspace normalization preserves history, plans, messages, preferences and independent drafts", () => {
  const saved = template();
  const state = {
    version: 1,
    templates: [saved],
    editorDrafts: {
      strength: { ...structuredClone(saved), name: "Unsaved name" },
    },
    clients: [
      {
        id: "athlete",
        entries: [{ date: "2026-10-12", weight: 70 }],
        plan: { calories: 2200 },
        internalNotes: ["Private"],
        assignment: {
          templateId: saved.id,
          variantId: "iifym",
          snapshot: structuredClone(saved),
        },
      },
    ],
    messages: [{ text: "Existing conversation" }],
    submissions: [{ id: "submission" }],
    reviewDrafts: { submission: { text: "Feedback draft" } },
    drafts: { athlete: { text: "Message draft" } },
    extras: [{ date: "2026-10-15" }],
    preferences: { accent: "#D93A7F" },
  };
  const before = structuredClone(state);
  const normalized = normalizeTemplateSetups(state);
  assert.deepEqual(state, before);
  assert.equal(normalized.templates[0].variants.length, 1);
  assert.equal(normalized.editorDrafts.strength.name, "Unsaved name");
  assert.equal(
    normalized.clients[0].assignment.snapshot.variants[0].nutrition,
    "IIFYM",
  );
  for (const key of [
    "messages",
    "submissions",
    "reviewDrafts",
    "drafts",
    "extras",
    "preferences",
  ])
    assert.deepEqual(normalized[key], before[key]);
  for (const key of ["entries", "plan", "internalNotes"])
    assert.deepEqual(normalized.clients[0][key], before.clients[0][key]);
  assert.deepEqual(normalizeTemplateSetups(normalized), normalized);
});

test("explicit phase and habit choices survive normalization and serialization", () => {
  const original = template();
  original.variants[0].roadmapPhases = false;
  original.variants[0].phaseOptions = ["Recovery block"];
  original.variants[0].habits = false;
  const normalized = singleTemplateSetup(original);
  const stored = JSON.parse(JSON.stringify(normalized));
  assert.equal(stored.variants[0].roadmapPhases, false);
  assert.deepEqual(stored.variants[0].phaseOptions, ["Recovery block"]);
  assert.equal(stored.variants[0].habits, false);
});
