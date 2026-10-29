/**
 * Card 05a tracker adapter: a ready daily-entry surface maps into the shared
 * TrackingView model (definitions, groups, current values, history), and user
 * edits map back into the canonical `raw` contract: OPTION as a positional
 * index, SCALE_1_5 ratings through the cell's 1-10 space.
 */
import { describe, expect, it } from "vitest";

import {
  dailyEntrySurfaceToTrackerView,
  remoteDayDataFromHistory,
  remoteDayDataFromRaws,
  remoteOrdinalValues,
  remoteRawsFromSurface,
  remoteRawFromNumber,
  remoteRawFromText,
  type DailyEntrySurfaceReadyWire,
} from "../../components/canvas/data/tracker";

const surface: DailyEntrySurfaceReadyWire = {
  state: "ready",
  formToken: "token-1",
  entryDate: "2026-10-25",
  sections: [
    {
      sectionKey: "body",
      label: "Body",
      items: [
        {
          ordinal: 0,
          parameterKey: "weight",
          label: "Bodyweight",
          helpText: null,
          unit: "kg",
          kind: "MEASUREMENT",
          required: true,
          ratingScheme: null,
          options: [],
          validation: { min: 30, max: 250 },
          current: "68.5",
        },
        {
          ordinal: 1,
          parameterKey: "sleep-quality",
          label: "Sleep quality",
          helpText: null,
          unit: null,
          kind: "RATING",
          required: false,
          ratingScheme: "SCALE_1_5",
          options: [],
          validation: null,
          current: "3",
        },
      ],
    },
    {
      sectionKey: "habits",
      label: "Habits",
      items: [
        {
          ordinal: 2,
          parameterKey: "breakfast",
          label: "Breakfast",
          helpText: null,
          unit: null,
          kind: "OPTION",
          required: false,
          ratingScheme: null,
          options: [
            { ordinal: 0, label: "Skipped" },
            { ordinal: 1, label: "Eaten" },
          ],
          validation: null,
          current: "1",
        },
        {
          ordinal: 3,
          parameterKey: "notes",
          label: "Notes",
          helpText: null,
          unit: null,
          kind: "TEXT",
          required: false,
          ratingScheme: null,
          options: [],
          validation: null,
          current: "Felt strong",
        },
      ],
    },
  ],
  history: [
    {
      entryDate: "2026-10-24",
      declaredAt: "2026-10-24T19:00:00.000Z",
      revisionCount: 1,
      values: [
        {
          parameterKey: "weight",
          label: "Bodyweight",
          unit: "kg",
          display: "69.0",
        },
        {
          parameterKey: "sleep-quality",
          label: "Sleep quality",
          unit: null,
          display: "4",
        },
        {
          parameterKey: "breakfast",
          label: "Breakfast",
          unit: null,
          display: "Eaten",
        },
        {
          parameterKey: "dropped-param",
          label: "Old metric",
          unit: null,
          display: "42",
        },
      ],
    },
  ],
};

describe("dailyEntrySurfaceToTrackerView", () => {
  it("maps sections to grouped parameter definitions in surface order", () => {
    const { config, parameterGroups, metas } =
      dailyEntrySurfaceToTrackerView(surface);
    expect(config.parameterIds).toEqual([
      "srv-weight",
      "srv-sleep-quality",
      "srv-breakfast",
      "srv-notes",
    ]);
    expect(parameterGroups).toEqual({
      "srv-weight": "Body",
      "srv-sleep-quality": "Body",
      "srv-breakfast": "Habits",
      "srv-notes": "Habits",
    });
    expect(metas.map((meta) => meta.ordinal)).toEqual([0, 1, 2, 3]);
    expect(config.ratingScales?.["srv-sleep-quality"]).toBe("1-5");
    expect(config.fieldOptions?.["srv-breakfast"]).toEqual([
      "Skipped",
      "Eaten",
    ]);
    const weight = config.parameterDefinitions?.find(
      (parameter) => parameter.id === "srv-weight",
    );
    expect(weight?.kind).toBe("number");
    expect(weight?.min).toBe(30);
    expect(weight?.max).toBe(250);
    const breakfast = config.parameterDefinitions?.find(
      (parameter) => parameter.id === "srv-breakfast",
    );
    expect(breakfast?.inputType).toBe("choice");
    expect(breakfast?.options).toEqual(["Skipped", "Eaten"]);
  });
});

describe("remoteRawsFromSurface / remoteDayDataFromRaws", () => {
  it("turns current raws into the shared model's display form", () => {
    const { metas } = dailyEntrySurfaceToTrackerView(surface);
    const raws = remoteRawsFromSurface(surface);
    expect(raws).toEqual({
      weight: "68.5",
      "sleep-quality": "3",
      breakfast: "1",
      notes: "Felt strong",
    });
    const data = remoteDayDataFromRaws(raws, metas);
    expect(data.values["srv-weight"]).toBe(68.5);
    // SCALE_1_5 raw 3 maps into the cell's canonical 1-10 space: 5.5.
    expect(data.values["srv-sleep-quality"]).toBe(5.5);
    expect(data.texts["srv-breakfast"]).toBe("Eaten");
    expect(data.texts["srv-notes"]).toBe("Felt strong");
  });
});

describe("remoteDayDataFromHistory", () => {
  it("parses display rows and survives parameters removed from the surface", () => {
    const { metas } = dailyEntrySurfaceToTrackerView(surface);
    const data = remoteDayDataFromHistory(surface.history[0].values, metas);
    expect(data.values["srv-weight"]).toBe(69);
    // History display for a SCALE_1_5 rating is the 1-5 value.
    expect(data.values["srv-sleep-quality"]).toBe(7.75);
    expect(data.texts["srv-breakfast"]).toBe("Eaten");
    // Unknown keys fall back to a numeric parse under their srv- id.
    expect(data.values["srv-dropped-param"]).toBe(42);
  });
});

describe("edit -> wire raw", () => {
  const { metas } = dailyEntrySurfaceToTrackerView(surface);
  const meta = (key: string) => metas.find((item) => item.key === key)!;

  it("passes measurements through as decimal strings", () => {
    expect(remoteRawFromNumber(meta("weight"), 70.25)).toBe("70.25");
    expect(remoteRawFromNumber(meta("weight"), null)).toBe("");
  });

  it("collapses canonical 1-10 ratings back to the 1-5 wire value", () => {
    // The cell emits 1 + (shown - 1) * 9 / 4; shown 4 -> 7.75 -> raw "4".
    expect(remoteRawFromNumber(meta("sleep-quality"), 7.75)).toBe("4");
    expect(remoteRawFromNumber(meta("sleep-quality"), 1)).toBe("1");
    expect(remoteRawFromNumber(meta("sleep-quality"), 10)).toBe("5");
  });

  it("writes OPTION edits as the positional index, clearing unknown labels", () => {
    expect(remoteRawFromText(meta("breakfast"), "Skipped")).toBe("0");
    expect(remoteRawFromText(meta("breakfast"), "Eaten")).toBe("1");
    expect(remoteRawFromText(meta("breakfast"), "nonsense")).toBe("");
    expect(remoteRawFromText(meta("breakfast"), "")).toBe("");
  });

  it("keeps TEXT edits verbatim", () => {
    expect(remoteRawFromText(meta("notes"), "Ate late")).toBe("Ate late");
  });
});

describe("remoteOrdinalValues", () => {
  it("rebuilds the complete ordered payload, never just the edited field", () => {
    const { metas } = dailyEntrySurfaceToTrackerView(surface);
    const raws = {
      ...remoteRawsFromSurface(surface),
      weight: "70",
      notes: "",
    };
    expect(remoteOrdinalValues(metas, raws)).toEqual([
      { ordinal: 0, raw: "70" },
      { ordinal: 1, raw: "3" },
      { ordinal: 2, raw: "1" },
      { ordinal: 3, raw: "" },
    ]);
  });
});
