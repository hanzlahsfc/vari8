import { describe, expect, it } from "vitest";

import {
  BIOFEEDBACK_KEYS,
  COMPUTED_COLUMNS,
  DAILY_FIELDS,
  EXCLUDED_FIELD_KEYS,
  isDailyPrototypeEnabled,
  TODO_MARKER,
  validateDailyEntry,
} from "../../lib/daily-prototype";

const byKey = new Map(DAILY_FIELDS.map((field) => [field.key, field]));

describe("Phase B0 field schema", () => {
  it("contains only source-backed in-scope fields", () => {
    const keys = DAILY_FIELDS.map((field) => field.key);
    for (const excluded of EXCLUDED_FIELD_KEYS) {
      expect(keys).not.toContain(excluded);
    }
    expect(keys).not.toContain("calories");
    expect(keys).not.toContain("targets");
    expect(keys).not.toContain("averages");
  });

  it("uses the source labels and units as written", () => {
    expect(byKey.get("weightKg")).toMatchObject({
      label: "Weight",
      unit: "kg",
    });
    expect(byKey.get("bbtC")).toMatchObject({ label: "BBT", unit: "°C" });
    expect(byKey.get("glucoseMmol")).toMatchObject({
      label: "Blood glucose",
      unit: "mmol/L",
    });
    expect(byKey.get("cardioMin")).toMatchObject({
      label: "Cardio",
      unit: "min",
    });
    expect(byKey.get("saltG")).toMatchObject({ label: "Salt", unit: "g" });
    expect(byKey.get("waterL")).toMatchObject({ label: "Water", unit: "L" });
    expect(byKey.get("dayLabel")).toMatchObject({
      options: ["HIGH", "MEDIUM", "LOW"],
    });
  });

  it("defines the eight biofeedback fields with a 1-10 range", () => {
    expect(BIOFEEDBACK_KEYS).toHaveLength(8);
    for (const key of BIOFEEDBACK_KEYS) {
      expect(byKey.get(key)).toMatchObject({ type: "number", min: 1, max: 10 });
    }
  });

  it("marks computed columns with TODO(product) and never a value", () => {
    expect(COMPUTED_COLUMNS[0]).toEqual({
      key: "calories",
      label: "Calories (automatic)",
      marker: TODO_MARKER,
    });
  });
});

describe("validateDailyEntry", () => {
  const base = Object.fromEntries(DAILY_FIELDS.map((field) => [field.key, ""]));

  it("requires only the date (week-view key)", () => {
    expect(validateDailyEntry({ ...base })).toEqual([
      { field: "date", message: "Date is required to add a prototype entry" },
    ]);
    expect(validateDailyEntry({ ...base, date: "2026-01-05" })).toEqual([]);
  });

  it("enforces the source-confirmed biofeedback 1-10 range", () => {
    expect(
      validateDailyEntry({ ...base, date: "2026-01-05", desireToTrain: "11" }),
    ).toContainEqual({
      field: "desireToTrain",
      message: "Desire to train must be 1-10",
    });
    expect(
      validateDailyEntry({ ...base, date: "2026-01-05", desireToTrain: "5" }),
    ).toEqual([]);
  });

  it("enforces the day-label enum", () => {
    expect(
      validateDailyEntry({ ...base, date: "2026-01-05", dayLabel: "HUGE" }),
    ).toContainEqual({
      field: "dayLabel",
      message: "Day label must be one of HIGH/MEDIUM/LOW",
    });
  });

  it("does not invent constraints for other fields", () => {
    // steps has no source range; a non-numeric value is not rejected here.
    expect(
      validateDailyEntry({ ...base, date: "2026-01-05", steps: "abc" }),
    ).toEqual([]);
  });
});

describe("isDailyPrototypeEnabled", () => {
  it("is enabled only by the explicit dev flag", () => {
    expect(isDailyPrototypeEnabled("1")).toBe(true);
    expect(isDailyPrototypeEnabled(undefined)).toBe(false);
    expect(isDailyPrototypeEnabled("")).toBe(false);
    expect(isDailyPrototypeEnabled("true")).toBe(false);
    expect(isDailyPrototypeEnabled("0")).toBe(false);
  });
});
