import assert from "node:assert/strict";
import { test } from "node:test";
import { clientAppSections, sectionForLegacyTab } from "./sections.ts";

const ALL = [
  "Dashboard",
  "Tracker",
  "Timeline / Roadmap",
  "Nutrition",
  "Training Program",
  "Check-In",
];
const ids = (sections) => sections.map((s) => s.id);

test("all views plus assigned plans give five sections in fixed order", () => {
  const sections = clientAppSections(
    { views: [...ALL].reverse(), habits: false },
    { supplements: { items: [] }, activityTargets: [{ id: "v1" }] },
  );
  assert.deepEqual(ids(sections), [
    "home",
    "plans",
    "tracker",
    "training",
    "check-ins",
  ]);
  assert.deepEqual(
    sections.map((s) => s.label),
    ["Home", "Plans", "Tracker", "Training", "Check-ins"],
  );
  assert.deepEqual(sections[1].planParts, [
    "nutrition",
    "supplements",
    "activity-targets",
    "roadmap",
  ]);
  assert.deepEqual(sections[0].planParts, []);
});

test("plan-driven parts appear without their template view; empty targets do not", () => {
  const sections = clientAppSections(
    { views: ["Check-In"], habits: false },
    { supplements: { items: [] }, activityTargets: [] },
  );
  assert.deepEqual(ids(sections), ["plans", "check-ins"]);
  assert.deepEqual(sections[0].planParts, ["supplements"]);
});

test("Plans is hidden when no part qualifies; legacy Mealplan counts as Nutrition", () => {
  assert.deepEqual(
    ids(clientAppSections({ views: ["Tracker"], habits: false }, undefined)),
    ["tracker"],
  );
  const legacy = clientAppSections(
    { views: ["Mealplan"], habits: false },
    undefined,
  );
  assert.deepEqual(legacy[0].planParts, ["nutrition"]);
});

test("habits alone enable Tracker; nothing enabled gives no sections", () => {
  assert.deepEqual(
    ids(clientAppSections({ views: [], habits: true }, undefined)),
    ["tracker"],
  );
  assert.deepEqual(
    clientAppSections({ views: [], habits: false }, undefined),
    [],
  );
});

test("legacy preview tab names map to sections and plan parts", () => {
  assert.deepEqual(sectionForLegacyTab("Dashboard"), { section: "home" });
  assert.deepEqual(sectionForLegacyTab("Habits"), { section: "tracker" });
  assert.deepEqual(sectionForLegacyTab("Supplements"), {
    section: "plans",
    planPart: "supplements",
  });
  assert.deepEqual(sectionForLegacyTab("Timeline / Roadmap"), {
    section: "plans",
    planPart: "roadmap",
  });
  assert.deepEqual(sectionForLegacyTab("Nutrition"), {
    section: "plans",
    planPart: "nutrition",
  });
  assert.deepEqual(sectionForLegacyTab("Training Program"), {
    section: "training",
  });
  assert.deepEqual(sectionForLegacyTab("Check-In"), { section: "check-ins" });
  assert.equal(sectionForLegacyTab("Unknown"), undefined);
  assert.equal(sectionForLegacyTab(undefined), undefined);
});
