/**
 * Phase B0 — Daily Tracker entry prototype field schema (pure, testable).
 *
 * Source-backed labels/units only (see docs/tasks/phase-b0.md). This is a
 * development-only, non-persistent prototype: no storage, no computed values.
 * Computed source columns (CALORIES "automatic", targets, averages) are shown
 * as a plain TODO(product) marker, never guessed.
 */

export const TODO_MARKER = "TODO(product)";

export type DailyFieldType =
  "date" | "time" | "number" | "text" | "textarea" | "enum";

export type DailyField = {
  key: string;
  label: string;
  group: string;
  type: DailyFieldType;
  unit?: string;
  min?: number;
  max?: number;
  options?: string[];
};

const biofeedback: DailyField[] = [
  {
    key: "desireToTrain",
    label: "Desire to train",
    group: "BIOFEEDBACK",
    type: "number",
    min: 1,
    max: 10,
  },
  {
    key: "energyInGym",
    label: "Energy in gym",
    group: "BIOFEEDBACK",
    type: "number",
    min: 1,
    max: 10,
  },
  {
    key: "moodInGym",
    label: "Mood in gym",
    group: "BIOFEEDBACK",
    type: "number",
    min: 1,
    max: 10,
  },
  {
    key: "energyOutsideGym",
    label: "Energy outside gym",
    group: "BIOFEEDBACK",
    type: "number",
    min: 1,
    max: 10,
  },
  {
    key: "moodOutsideGym",
    label: "Mood outside gym",
    group: "BIOFEEDBACK",
    type: "number",
    min: 1,
    max: 10,
  },
  {
    key: "stress",
    label: "Stress",
    group: "BIOFEEDBACK",
    type: "number",
    min: 1,
    max: 10,
  },
  {
    key: "hunger",
    label: "Hunger",
    group: "BIOFEEDBACK",
    type: "number",
    min: 1,
    max: 10,
  },
  {
    key: "adherence",
    label: "Adherence",
    group: "BIOFEEDBACK",
    type: "number",
    min: 1,
    max: 10,
  },
];

export const DAILY_FIELDS: DailyField[] = [
  { key: "date", label: "Date", group: "DATE & PHASE", type: "date" },
  {
    key: "weightKg",
    label: "Weight",
    group: "BODYWEIGHT",
    type: "number",
    unit: "kg",
  },
  {
    key: "weighInTime",
    label: "Weigh-in time",
    group: "BODYWEIGHT",
    type: "time",
  },
  { key: "cycleDay", label: "Cycle day", group: "MENSES", type: "number" },
  { key: "pmsSymptoms", label: "PMS symptoms", group: "MENSES", type: "text" },
  { key: "bbtC", label: "BBT", group: "MENSES", type: "number", unit: "°C" },
  {
    key: "sleepDuration",
    label: "Sleep duration",
    group: "SLEEP",
    type: "number",
  },
  {
    key: "sleepQuality",
    label: "Sleep quality",
    group: "SLEEP",
    type: "number",
  },
  { key: "sleepTime", label: "Sleep time", group: "SLEEP", type: "time" },
  { key: "wakeTime", label: "Wake time", group: "SLEEP", type: "time" },
  { key: "steps", label: "Steps", group: "ACTIVITY", type: "number" },
  {
    key: "cardioMin",
    label: "Cardio",
    group: "ACTIVITY",
    type: "number",
    unit: "min",
  },
  {
    key: "trainingLabel",
    label: "Training session",
    group: "ACTIVITY",
    type: "text",
  },
  {
    key: "trainingTime",
    label: "Training time",
    group: "ACTIVITY",
    type: "time",
  },
  ...biofeedback,
  { key: "rhr", label: "RHR", group: "BIOMETRICS", type: "number" },
  { key: "bpSys", label: "BP systolic", group: "BIOMETRICS", type: "number" },
  { key: "bpDia", label: "BP diastolic", group: "BIOMETRICS", type: "number" },
  {
    key: "glucoseMmol",
    label: "Blood glucose",
    group: "BIOMETRICS",
    type: "number",
    unit: "mmol/L",
  },
  {
    key: "dayLabel",
    label: "Day label",
    group: "NUTRITION",
    type: "enum",
    options: ["HIGH", "MEDIUM", "LOW"],
  },
  {
    key: "carbsG",
    label: "Carbs",
    group: "NUTRITION",
    type: "number",
    unit: "g",
  },
  {
    key: "proteinG",
    label: "Protein",
    group: "NUTRITION",
    type: "number",
    unit: "g",
  },
  {
    key: "fatsG",
    label: "Fats",
    group: "NUTRITION",
    type: "number",
    unit: "g",
  },
  {
    key: "saltG",
    label: "Salt",
    group: "NUTRITION",
    type: "number",
    unit: "g",
  },
  {
    key: "waterL",
    label: "Water",
    group: "NUTRITION",
    type: "number",
    unit: "L",
  },
  {
    key: "offPlanMeal",
    label: "Off-plan meal",
    group: "NUTRITION",
    type: "text",
  },
  {
    key: "bowelMovements",
    label: "Bowel movements",
    group: "NUTRITION",
    type: "text",
  },
  { key: "clientNote", label: "Client note", group: "NOTES", type: "textarea" },
];

/** Fields intentionally excluded in Phase B0 (undecided access/consent or computed). */
export const EXCLUDED_FIELD_KEYS = [
  "e2",
  "prog",
  "coachNote",
  "calories",
  "targets",
  "averages",
] as const;

export const BIOFEEDBACK_KEYS = biofeedback.map((field) => field.key);

/** Computed source columns shown as a marker, never computed here. */
export const COMPUTED_COLUMNS = [
  { key: "calories", label: "Calories (automatic)", marker: TODO_MARKER },
];

export type ValidationError = { field: string; message: string };

/**
 * Apply ONLY source-confirmed constraints: biofeedback 1-10 and the day-label
 * enum. No ranges/requiredness are invented for other fields. Date is required
 * solely as the week-view key (a prototype UI necessity, not a source rule).
 */
export function validateDailyEntry(
  values: Record<string, string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if ((values.date ?? "").trim() === "") {
    errors.push({
      field: "date",
      message: "Date is required to add a prototype entry",
    });
  }
  for (const field of DAILY_FIELDS) {
    const value = (values[field.key] ?? "").trim();
    if (value === "") continue;
    if (
      field.type === "number" &&
      (field.min !== undefined || field.max !== undefined)
    ) {
      const numeric = Number(value);
      if (Number.isNaN(numeric)) {
        errors.push({
          field: field.key,
          message: `${field.label} must be a number`,
        });
      } else if (field.min !== undefined && numeric < field.min) {
        errors.push({
          field: field.key,
          message: `${field.label} must be ${field.min}-${field.max}`,
        });
      } else if (field.max !== undefined && numeric > field.max) {
        errors.push({
          field: field.key,
          message: `${field.label} must be ${field.min}-${field.max}`,
        });
      }
    }
    if (
      field.type === "enum" &&
      field.options &&
      !field.options.includes(value)
    ) {
      errors.push({
        field: field.key,
        message: `${field.label} must be one of ${field.options.join("/")}`,
      });
    }
  }
  return errors;
}

/** The prototype is development-only: enabled ONLY by an explicit flag. */
export function isDailyPrototypeEnabled(env: string | undefined): boolean {
  return env === "1";
}
