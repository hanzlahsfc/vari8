import { describe, expect, it } from "vitest";

import {
  BIOFEEDBACK_FIELD_KEYS,
  DAILY_TRACKER_SECTIONS,
  EXCLUDED_TRACKER_FIELD_KEYS,
  getSectionById,
  TODO_PRODUCT_MARKER,
  validateDailyTrackerValues,
  type TrackerField,
} from "../../lib/daily-tracker";

const allFields = DAILY_TRACKER_SECTIONS.flatMap((section) => section.fields);
const byKey = new Map(allFields.map((field) => [field.key, field]));
const field = (key: string): TrackerField => {
  const found = byKey.get(key);
  if (!found) throw new Error(`missing field ${key}`);
  return found;
};

describe("Phase 1.1 Daily Tracker section/field contract", () => {
  it("exposes exactly the nine verified PRGRSS sections in source order", () => {
    expect(DAILY_TRACKER_SECTIONS.map((section) => section.name)).toEqual([
      "DATE & PHASE",
      "BODYWEIGHT",
      "MENSES",
      "SLEEP",
      "ACTIVITY",
      "BIOFEEDBACK",
      "BIOMETRICS",
      "NUTRITION & DIGESTION",
      "NOTES",
    ]);
    expect(new Set(DAILY_TRACKER_SECTIONS.map((s) => s.id)).size).toBe(
      DAILY_TRACKER_SECTIONS.length,
    );
    expect(getSectionById("nutrition-digestion")?.name).toBe(
      "NUTRITION & DIGESTION",
    );
  });

  it("uses only source labels and printed units from the blueprint", () => {
    expect(field("weightKg")).toMatchObject({ label: "WEIGHT", unit: "kg" });
    expect(field("bodyweightTime")).toMatchObject({
      label: "TIME",
      unit: "hrs:mins",
    });
    expect(field("bbtC")).toMatchObject({ label: "BBT", unit: "°C" });
    expect(field("sleepDuration")).toMatchObject({
      label: "DURATION",
      unit: "hrs:mins",
    });
    expect(field("sleepQuality").label).toBe("QUALITY (Sleep Score)");
    expect(field("cardioMin")).toMatchObject({ label: "CARDIO", unit: "mins" });
    expect(field("rhr")).toMatchObject({ label: "RHR", unit: "bpm" });
    expect(field("bloodPressure")).toMatchObject({
      label: "BLOOD PRESSURE",
      unit: "mmHg",
    });
    expect(field("bloodGlucose")).toMatchObject({
      label: "BLOOD GLUCOSE",
      unit: "mmol/L",
    });
    expect(field("carbsG")).toMatchObject({ label: "CARBS", unit: "g" });
    expect(field("proteinG")).toMatchObject({ label: "PROTEIN", unit: "g" });
    expect(field("fatsG")).toMatchObject({ label: "FATS", unit: "g" });
    expect(field("saltG")).toMatchObject({ label: "SALT", unit: "g" });
    expect(field("waterL")).toMatchObject({ label: "WATER", unit: "L" });
    expect(field("dayLabel")).toMatchObject({ label: "DAY LABEL" });
    expect(field("clientNotes")).toMatchObject({ label: "Client Notes" });
  });

  it("defines the eight biofeedback fields with the printed 1-10 scale", () => {
    expect(BIOFEEDBACK_FIELD_KEYS).toHaveLength(8);
    for (const key of BIOFEEDBACK_FIELD_KEYS) {
      expect(field(key)).toMatchObject({ min: 1, max: 10, hint: "Scale 1–10" });
    }
  });

  it("marks the source CALORIES column as a computed TODO(product) field only", () => {
    expect(field("calories")).toMatchObject({
      kind: "computed",
      hint: TODO_PRODUCT_MARKER,
    });
    expect(field("calories").unit).toBeUndefined();
  });

  it("excludes PED/HRT, coach notes, targets and averages", () => {
    const keys = allFields.map((f) => f.key);
    for (const excluded of EXCLUDED_TRACKER_FIELD_KEYS) {
      expect(keys).not.toContain(excluded);
    }
    expect(keys).not.toContain("targets");
    expect(keys).not.toContain("averages");
    expect(keys).not.toContain("calorieAuto");
  });

  it("flags MENSES as requiring cycle-data consent", () => {
    expect(getSectionById("menses")?.requires).toEqual(["cycleConsent"]);
  });

  it("encodes only the two verified validations", () => {
    expect(validateDailyTrackerValues({})).toEqual([]);
    expect(validateDailyTrackerValues({ desireToTrain: "11" })).toEqual([
      { field: "desireToTrain", message: "DESIRE TO TRAIN must be 1–10" },
    ]);
    expect(validateDailyTrackerValues({ desireToTrain: "5" })).toEqual([]);
    expect(validateDailyTrackerValues({ dayLabel: "HUGE" })).toEqual([
      { field: "dayLabel", message: "DAY LABEL must be HIGH, MEDIUM or LOW" },
    ]);
    expect(validateDailyTrackerValues({ dayLabel: "LOW" })).toEqual([]);
  });

  it("does not invent requiredness or ranges for unconstrained fields", () => {
    expect(
      validateDailyTrackerValues({ steps: "not-a-number", clientNotes: "" }),
    ).toEqual([]);
  });

  it("rejects a non-numeric biofeedback value as outside the verified scale", () => {
    expect(validateDailyTrackerValues({ stress: "abc" })).toEqual([
      { field: "stress", message: "STRESS must be 1–10" },
    ]);
  });
});
