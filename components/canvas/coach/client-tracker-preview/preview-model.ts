import {
  type TrackerConfig as OriginalTrackerConfig,
  type TrackerParameter as OriginalTrackerParameter,
  displayedValue as originalDisplayedValue,
  formatValue as originalFormatValue,
  parameters as originalParameters,
  type TrackerEntry,
} from "@/components/canvas/ethereal/client-tracker/model";
import { ALL_PARAMETERS, PARAMETERS, type Parameter } from "../model";

export type TrackerParameter = OriginalTrackerParameter & {
  inputType?: Parameter["inputType"];
  options?: string[];
};

const originalById = new Map(originalParameters.map((item) => [item.id, item]));
const categoryIds: Record<string, string> = {
  "Weight basics": "body",
  Nutrition: "nutrition",
  Fluids: "nutrition",
  "Salt & sodium": "nutrition",
  "Caffeine & alcohol": "nutrition",
  "Fruit & vegetables": "nutrition",
  "Hunger & appetite": "nutrition",
  Sleep: "recovery",
  "Energy and readiness": "recovery",
  "Stress, mood and focus": "recovery",
  "Soreness & discomfort": "recovery",
  "Recovery context note": "recovery",
  "Movement and cardio": "movement",
  "Activity context note": "movement",
  "How training feels": "recovery",
  "Health readings": "health",
  "Cycle tracking": "health",
  Digestion: "health",
  "Day context": "context",
  Notes: "notes",
  Legacy: "legacy",
};

function asTrackerParameter(parameter: Parameter): TrackerParameter {
  const original = originalById.get(parameter.id);
  const isRating = parameter.units.some((unit) => ratingUnits.has(unit));
  const fallback: OriginalTrackerParameter = {
    id: parameter.id,
    label: parameter.name,
    categoryId: categoryIds[parameter.group] ?? "recovery",
    unit: parameter.units[0] ?? "",
    kind: isRating ? "rating" : "number",
    summary: parameter.inputType ? "latest" : "average",
    decimals:
      parameter.id === "basal-body-temperature"
        ? 2
        : parameter.id === "salt-intake" || parameter.id === "sodium-intake"
          ? 1
          : parameter.units.some((unit) =>
                [
                  "steps",
                  "count",
                  "sessions",
                  "minutes",
                  "mg",
                  "g",
                  "bpm",
                  "breaths/min",
                ].includes(unit),
              )
            ? 0
            : 1,
    min: isRating ? 1 : 0,
    max: isRating ? 10 : 100000,
  };
  return {
    ...(original ?? fallback),
    label: parameter.name,
    categoryId:
      categoryIds[parameter.group] ?? original?.categoryId ?? "recovery",
    unit: parameter.units[0] ?? original?.unit ?? "",
    ...(parameter.inputType ? { inputType: parameter.inputType } : {}),
    ...(parameter.options ? { options: parameter.options } : {}),
  };
}

const ratingUnits = new Set(["1–10", "1–5", "Word labels"]);

// Legacy fields remain available to render persisted templates and dashboards. The
// coach-facing option picker uses PARAMETERS, which contains only the visible catalog.
export const parameters: TrackerParameter[] =
  ALL_PARAMETERS.map(asTrackerParameter);
export const visibleParameters: TrackerParameter[] =
  PARAMETERS.map(asTrackerParameter);

export type { TrackerEntry };
export type TrackerConfig = OriginalTrackerConfig & {
  /** Optional presentation metadata; existing catalog IDs and stored values stay valid. */
  parameterDefinitions?: TrackerParameter[];
  summaryParameterIds?: string[];
  cycleTrackingEnabled?: boolean;
  energyUnit?: "kcal" | "kJ";
  ratingScales?: Record<string, OriginalTrackerConfig["ratingScale"]>;
  fieldUnits?: Record<string, string>;
  fieldOptions?: Record<string, string[]>;
};

export function fieldTrackerConfig(
  parameter: TrackerParameter,
  config: TrackerConfig,
): TrackerConfig {
  return {
    ...config,
    ratingScale: config.ratingScales?.[parameter.id] ?? config.ratingScale,
  };
}

export function canonicalEnergyValue(value: number, config: TrackerConfig) {
  return config.energyUnit === "kJ" ? value / 4.184 : value;
}

export function configuredUnit(
  parameter: TrackerParameter,
  config: TrackerConfig,
) {
  const field = fieldTrackerConfig(parameter, config);
  if (parameter.id === "calories") return config.energyUnit ?? parameter.unit;
  if (parameter.id === "weight") return field.weightUnit;
  if (parameter.id === "waist") return field.lengthUnit;
  if (parameter.id === "water") return field.waterUnit;
  if (parameter.kind === "rating") {
    const scale =
      field.ratingScale === "words"
        ? "rating"
        : field.ratingScale.replace("-", "–");
    return parameter.id === "sleep-quality" ? `Quality · ${scale}` : scale;
  }
  return field.fieldUnits?.[parameter.id] ?? parameter.unit;
}

export function configuredDecimals(
  parameter: TrackerParameter,
  config: TrackerConfig,
) {
  const unit = configuredUnit(parameter, config);
  if (parameter.id === "sodium-intake") return unit === "g" ? 1 : 0;
  if (parameter.id === "fbg") return unit === "mg/dL" ? 0 : 1;
  return parameter.decimals;
}

function convertAdditionalUnit(
  parameter: TrackerParameter,
  value: number,
  config: TrackerConfig,
) {
  const unit = configuredUnit(parameter, config);
  if (parameter.id === "calories" && unit === "kJ") return value * 4.184;
  if (parameter.id === "fbg" && unit === "mg/dL") return value * 18;
  if (parameter.id === "other-fluid-intake" && unit === "fl oz")
    return value * 33.814;
  if (parameter.id === "sodium-intake" && unit === "g") return value / 1000;
  if (parameter.id === "basal-body-temperature" && unit === "°F")
    return (value * 9) / 5 + 32;
  return value;
}

export function displayedValue(
  parameter: TrackerParameter,
  value: number,
  config: TrackerConfig,
) {
  const originalValue = originalDisplayedValue(
    parameter,
    value,
    fieldTrackerConfig(parameter, config),
  );
  return convertAdditionalUnit(parameter, originalValue, config);
}

/** Convert a value in its configured display unit into the catalog's canonical unit. */
export function canonicalValue(
  parameter: TrackerParameter,
  shown: number,
  config: TrackerConfig,
) {
  const unit = configuredUnit(parameter, config);
  let value = shown;
  if (parameter.id === "calories" && unit === "kJ") value /= 4.184;
  else if (parameter.id === "fbg" && unit === "mg/dL") value /= 18;
  else if (parameter.id === "other-fluid-intake" && unit === "fl oz")
    value /= 33.814;
  else if (parameter.id === "sodium-intake" && unit === "g") value *= 1000;
  else if (parameter.id === "basal-body-temperature" && unit === "°F")
    value = ((value - 32) * 5) / 9;

  if (parameter.id === "weight" && config.weightUnit === "lb")
    return value / 2.20462;
  if (parameter.id === "waist" && config.lengthUnit === "in")
    return value * 2.54;
  if (parameter.id === "water" && config.waterUnit === "fl oz")
    return value / 33.814;
  return value;
}

export function formatValue(
  parameter: TrackerParameter,
  value: number,
  config: TrackerConfig,
) {
  const field = fieldTrackerConfig(parameter, config);
  if (parameter.kind !== "rating") {
    const number = displayedValue(parameter, value, config).toLocaleString(
      "en-GB",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: configuredDecimals(parameter, config),
      },
    );
    const unit = configuredUnit(parameter, config);
    return `${number}${unit ? ` ${unit}` : ""}`;
  }
  if (field.ratingScale === "words")
    return originalFormatValue(parameter, value, field);
  const number = displayedValue(parameter, value, config).toLocaleString(
    "en-GB",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: configuredDecimals(parameter, config),
    },
  );
  const scale = field.ratingScale === "1-5" ? 5 : 10;
  return `${number} / ${scale}`;
}

const hasNumericSummary = (parameter: TrackerParameter) => !parameter.inputType;

export function weeklyAverage(
  parameter: TrackerParameter,
  entries: TrackerEntry[],
  config: TrackerConfig,
) {
  if (!hasNumericSummary(parameter)) return null;
  const values = entries
    .map((entry) => entry.values[parameter.id])
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  return values.length
    ? values.reduce(
        (sum, value) => sum + displayedValue(parameter, value, config),
        0,
      ) / values.length
    : null;
}

export function weeklyDifference(
  parameter: TrackerParameter,
  currentEntries: TrackerEntry[],
  previousEntries: TrackerEntry[],
  config: TrackerConfig,
) {
  if (!hasNumericSummary(parameter)) return null;
  const current = weeklyAverage(parameter, currentEntries, config);
  const previous = weeklyAverage(parameter, previousEntries, config);
  if (current === null || previous === null) return null;
  // Subtracting displayed averages cancels the Fahrenheit offset automatically.
  return current - previous;
}

export function previousReadingDifference(
  parameter: TrackerParameter,
  date: string,
  entries: TrackerEntry[],
  config: TrackerConfig,
) {
  if (!hasNumericSummary(parameter)) return null;
  const current = entries.find((entry) => entry.date === date)?.values[
    parameter.id
  ];
  if (typeof current !== "number" || !Number.isFinite(current)) return null;
  const previous = [...entries]
    .filter(
      (entry) =>
        entry.date < date && typeof entry.values[parameter.id] === "number",
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.values[parameter.id];
  return typeof previous === "number"
    ? displayedValue(parameter, current, config) -
        displayedValue(parameter, previous, config)
    : null;
}
