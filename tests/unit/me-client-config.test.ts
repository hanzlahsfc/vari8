// Card w2-c1: the real client shell resolves its sections from the signed-in
// client's active template version definition. The definition's optional
// `modules` slot (lib/db-types/template-slots.ts) mirrors the canvas Variant:
// when a coach published views/habits they are authoritative; a definition
// that predates the slot keeps every section the registry knows (nothing was
// ever disabled).

import { describe, expect, it } from "vitest";

import {
  clientConfigFromDefinition,
  clientEntriesFromRows,
  clientPlansPresence,
} from "../../app/(canvas)/me/client-config";

describe("clientConfigFromDefinition", () => {
  it("enables every registered view when the definition carries no modules slot", () => {
    const config = clientConfigFromDefinition({
      sections: [],
      parameters: {},
    });
    expect(config.views).toEqual([
      "Dashboard",
      "Tracker",
      "Nutrition",
      "Timeline / Roadmap",
      "Training Program",
      "Check-In",
    ]);
    expect(config.habits).toBe(false);
    expect(config.nutrition).toBe("Meal plan");
  });

  it("takes the coach's published views verbatim: a disabled section is absent", () => {
    const config = clientConfigFromDefinition({
      sections: [],
      parameters: {},
      modules: {
        views: ["Dashboard", "Tracker", "Check-In"],
        habits: false,
      },
    });
    expect(config.views).toEqual(["Dashboard", "Tracker", "Check-In"]);
    expect(config.views).not.toContain("Training Program");
  });

  it("reads habits and nutrition mode from the modules and slots", () => {
    const config = clientConfigFromDefinition({
      sections: [],
      parameters: {},
      modules: { views: ["Tracker"], habits: true },
      nutritionMode: "IIFYM",
    });
    expect(config.habits).toBe(true);
    expect(config.nutrition).toBe("IIFYM");
  });

  it("falls back to the full default set on a malformed definition", () => {
    const config = clientConfigFromDefinition("not-json-shaped");
    expect(config.views.length).toBe(6);
    expect(config.habits).toBe(false);
  });

  it("maps the published fields, roadmap rows and planning columns verbatim", () => {
    const config = clientConfigFromDefinition({
      sections: [],
      parameters: {},
      fields: [
        { id: "weight", unit: "kg" },
        { id: "steps", unit: "steps" },
        { id: "not-a-parameter", unit: "x" },
      ],
      roadmap: [
        { source: "weight", calculation: "Weekly average", comparison: true },
        { source: "bogus", calculation: "Trend", comparison: false },
      ],
      roadmapActivityTargets: ["steps", "cardio"],
    });
    expect(config.fields).toEqual([
      { id: "weight", unit: "kg" },
      { id: "steps", unit: "steps" },
    ]);
    expect(config.roadmap).toEqual([
      { source: "weight", calculation: "Weekly average", comparison: true },
    ]);
    expect(config.roadmapActivityTargets).toEqual(["steps", "cardio"]);
  });

  it("keeps the roadmap slots empty when the definition predates them", () => {
    const config = clientConfigFromDefinition({
      sections: [],
      parameters: {},
    });
    expect(config.fields).toEqual([]);
    expect(config.roadmap).toEqual([]);
    expect(config.roadmapActivityTargets).toBeUndefined();
  });
});

describe("clientEntriesFromRows", () => {
  it("keeps the declared date plus the recorded roadmap fields only", () => {
    const entries = clientEntriesFromRows([
      {
        entryDate: "2026-10-12",
        values: {
          weight: 75,
          sleep: 6.6,
          water: 4.3,
          steps: 9000,
          calories: 1810,
          protein: 153,
        },
      },
    ]);
    expect(entries).toEqual([
      {
        date: "2026-10-12",
        weight: 75,
        sleep: 6.6,
        steps: 9000,
        calories: 1810,
      },
    ]);
  });

  it("drops rows whose values carry no recorded field", () => {
    expect(
      clientEntriesFromRows([
        { entryDate: "2026-10-12", values: { water: 2 } },
      ]),
    ).toEqual([{ date: "2026-10-12" }]);
  });
});

describe("clientPlansPresence", () => {
  it("exposes a supplements part only when a plan exists", () => {
    expect(
      clientPlansPresence({ hasSupplementPlan: true }).supplements,
    ).toBeDefined();
    expect(
      clientPlansPresence({ hasSupplementPlan: false }).supplements,
    ).toBeUndefined();
  });

  it("mirrors the activity target count so an empty list hides the part", () => {
    expect(
      clientPlansPresence({ activityTargetCount: 0 }).activityTargets,
    ).toHaveLength(0);
    expect(
      clientPlansPresence({ activityTargetCount: 3 }).activityTargets,
    ).toHaveLength(3);
  });
});
