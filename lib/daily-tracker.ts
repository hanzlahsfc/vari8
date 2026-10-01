/**
 * Phase 1.1 — Daily Tracker section/field contract (pure, testable).
 *
 * Source of truth: `docs/tasks/phase-0-1-source-blueprint.md` §2 (approved
 * PRGRSS field-level crosswalk). Only verified section names, labels, printed
 * units, and the two observed validations (biofeedback 1–10; DAY LABEL
 * HIGH/MEDIUM/LOW) are encoded here. Every other rule — requiredness, ranges,
 * formulas, targets, averages, cycle estimation — stays UNKNOWN and is
 * deliberately absent, so Phase 4 persistence can bind to this contract without
 * inheriting an invented assumption.
 *
 * This module is presentation/contract only: it stores nothing, computes
 * nothing, and performs no I/O.
 */

/** The source CALORIES column is marked "automatic"; its formula is unknown. */
export const TODO_PRODUCT_MARKER = "TODO(product)";

export type TrackerFieldKind =
  "text" | "date" | "time" | "number" | "enum" | "textarea" | "computed";

export type TrackerField = {
  /** Stable key for future persisted-record binding. */
  key: string;
  /** Source label (uppercase as printed in the export). */
  label: string;
  kind: TrackerFieldKind;
  /** Printed source unit, verbatim, when one exists. */
  unit?: string;
  /** Source-backed constraint/scale note (never an invented rule). */
  hint?: string;
  /** Present only for the observed biofeedback 1–10 scale. */
  min?: number;
  /** Present only for the observed biofeedback 1–10 scale. */
  max?: number;
  /** Present only for the observed DAY LABEL enum. */
  options?: readonly string[];
};

/** Extra gate a section needs before its data may ever be persisted. */
export type TrackerSectionRequirement = "cycleConsent";

export type TrackerSection = {
  id: string;
  /** Source row-8 section header, verbatim. */
  name: string;
  fields: readonly TrackerField[];
  requires?: readonly TrackerSectionRequirement[];
  note?: string;
};

const BIOFEEDBACK_SCALE_HINT = "Scale 1–10";
const BIOFEEDBACK_SCALE = { min: 1, max: 10, hint: BIOFEEDBACK_SCALE_HINT };

const biofeedbackFields: readonly TrackerField[] = [
  {
    key: "desireToTrain",
    label: "DESIRE TO TRAIN",
    kind: "number",
    ...BIOFEEDBACK_SCALE,
  },
  {
    key: "energyInGym",
    label: "ENERGY IN GYM",
    kind: "number",
    ...BIOFEEDBACK_SCALE,
  },
  {
    key: "moodInGym",
    label: "MOOD IN GYM",
    kind: "number",
    ...BIOFEEDBACK_SCALE,
  },
  {
    key: "energyOutsideGym",
    label: "ENERGY OUTSIDE GYM",
    kind: "number",
    ...BIOFEEDBACK_SCALE,
  },
  {
    key: "moodOutsideGym",
    label: "MOOD OUTSIDE GYM",
    kind: "number",
    ...BIOFEEDBACK_SCALE,
  },
  { key: "stress", label: "STRESS", kind: "number", ...BIOFEEDBACK_SCALE },
  { key: "hunger", label: "HUNGER", kind: "number", ...BIOFEEDBACK_SCALE },
  {
    key: "adherence",
    label: "ADHERENCE",
    kind: "number",
    ...BIOFEEDBACK_SCALE,
  },
];

export const BIOFEEDBACK_FIELD_KEYS = biofeedbackFields.map(
  (field) => field.key,
);

export const DAILY_TRACKER_SECTIONS: readonly TrackerSection[] = [
  {
    id: "date-phase",
    name: "DATE & PHASE",
    fields: [
      { key: "weekday", label: "Weekday", kind: "text" },
      { key: "date", label: "Date", kind: "date" },
    ],
  },
  {
    id: "bodyweight",
    name: "BODYWEIGHT",
    fields: [
      { key: "weightKg", label: "WEIGHT", kind: "number", unit: "kg" },
      { key: "bodyweightTime", label: "TIME", kind: "time", unit: "hrs:mins" },
    ],
  },
  {
    id: "menses",
    name: "MENSES",
    requires: ["cycleConsent"],
    note: "Cycle data requires cycle-data consent. It is not captured here and stays unavailable until consent handling and persistence ship.",
    fields: [
      { key: "cycleDay", label: "CYCLE DAY", kind: "number", unit: "day" },
      { key: "pmsSymptoms", label: "PMS SYMPTOMS", kind: "text" },
      { key: "bbtC", label: "BBT", kind: "number", unit: "°C" },
    ],
  },
  {
    id: "sleep",
    name: "SLEEP",
    fields: [
      {
        key: "sleepDuration",
        label: "DURATION",
        kind: "number",
        unit: "hrs:mins",
      },
      { key: "sleepQuality", label: "QUALITY (Sleep Score)", kind: "number" },
      { key: "sleepTime", label: "SLEEP TIME", kind: "time", unit: "hrs:mins" },
      { key: "wakeTime", label: "WAKE TIME", kind: "time", unit: "hrs:mins" },
    ],
  },
  {
    id: "activity",
    name: "ACTIVITY",
    fields: [
      { key: "steps", label: "STEPS", kind: "number", unit: "steps" },
      { key: "cardioMin", label: "CARDIO", kind: "number", unit: "mins" },
      { key: "resistanceTraining", label: "RESISTANCE TRAINING", kind: "text" },
      {
        key: "trainingTime",
        label: "TIME OF TRAINING",
        kind: "time",
        unit: "hrs:mins",
      },
    ],
  },
  { id: "biofeedback", name: "BIOFEEDBACK", fields: biofeedbackFields },
  {
    id: "biometrics",
    name: "BIOMETRICS",
    fields: [
      { key: "rhr", label: "RHR", kind: "number", unit: "bpm" },
      {
        key: "bloodPressure",
        label: "BLOOD PRESSURE",
        kind: "text",
        unit: "mmHg",
      },
      {
        key: "bloodGlucose",
        label: "BLOOD GLUCOSE",
        kind: "number",
        unit: "mmol/L",
      },
    ],
  },
  {
    id: "nutrition-digestion",
    name: "NUTRITION & DIGESTION",
    fields: [
      {
        key: "dayLabel",
        label: "DAY LABEL",
        kind: "enum",
        options: ["HIGH", "MEDIUM", "LOW"],
      },
      { key: "carbsG", label: "CARBS", kind: "number", unit: "g" },
      { key: "proteinG", label: "PROTEIN", kind: "number", unit: "g" },
      { key: "fatsG", label: "FATS", kind: "number", unit: "g" },
      {
        key: "calories",
        label: "CALORIES",
        kind: "computed",
        hint: TODO_PRODUCT_MARKER,
      },
      { key: "saltG", label: "SALT", kind: "number", unit: "g" },
      { key: "waterL", label: "WATER", kind: "number", unit: "L" },
      { key: "offPlanMeal", label: "OFF-PLAN MEAL", kind: "text" },
      { key: "bowelMovements", label: "BOWEL MOVEMENTS", kind: "text" },
    ],
  },
  {
    id: "notes",
    name: "NOTES",
    note: "Coaches' notes are coach-authored and are not part of this client-facing shell.",
    fields: [{ key: "clientNotes", label: "Client Notes", kind: "textarea" }],
  },
];

/**
 * Fields/columns intentionally excluded in this slice: PED/HRT (E2, PROG —
 * legal/policy gate), coach-authored notes, and every computed/target column.
 */
export const EXCLUDED_TRACKER_FIELD_KEYS = [
  "e2",
  "prog",
  "coachNotes",
  "targets",
  "averages",
] as const;

export function getSectionById(id: string): TrackerSection | undefined {
  return DAILY_TRACKER_SECTIONS.find((section) => section.id === id);
}

export type TrackerValues = Record<string, string>;
export type TrackerValidationError = { field: string; message: string };

/**
 * Apply ONLY the two source-confirmed validations. Empty values are never
 * required, and fields without a verified range/enum are never constrained.
 */
export function validateDailyTrackerValues(
  values: TrackerValues,
): TrackerValidationError[] {
  const errors: TrackerValidationError[] = [];
  for (const section of DAILY_TRACKER_SECTIONS) {
    for (const field of section.fields) {
      const raw = values[field.key];
      if (typeof raw !== "string" || raw.trim() === "") continue;
      const value = raw.trim();

      if (field.min !== undefined && field.max !== undefined) {
        const numeric = Number(value);
        if (
          Number.isNaN(numeric) ||
          numeric < field.min ||
          numeric > field.max
        ) {
          errors.push({
            field: field.key,
            message: `${field.label} must be ${field.min}–${field.max}`,
          });
        }
      }

      if (
        field.kind === "enum" &&
        field.options &&
        !field.options.includes(value)
      ) {
        const options = field.options;
        const listed =
          options.length > 1
            ? `${options.slice(0, -1).join(", ")} or ${options.at(-1)}`
            : `${options[0]}`;
        errors.push({
          field: field.key,
          message: `${field.label} must be ${listed}`,
        });
      }
    }
  }
  return errors;
}
