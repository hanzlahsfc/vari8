import { allParameters } from "../model";
import type {
  TrackerConfig,
  TrackerEntry,
  TrackerParameter,
} from "./preview-model";
import { metricGroups } from "./view-model";

const DAY = 86_400_000;

const roundTo = (value: number, decimals: number) => {
  const scale = 10 ** Math.max(0, decimals);
  return Math.round(value * scale) / scale;
};
const dateFor = (asOf: string, offset: number) =>
  new Date(Date.parse(`${asOf}T00:00:00.000Z`) - offset * DAY)
    .toISOString()
    .slice(0, 10);
const within = (value: number, parameter: TrackerParameter) =>
  Math.min(parameter.max, Math.max(parameter.min, value));
const optionsFor = (parameter: TrackerParameter, config: TrackerConfig) =>
  config.fieldOptions?.[parameter.id] ?? parameter.options ?? [];

function numericValue(parameter: TrackerParameter, index: number): number {
  const source = allParameters().find((item) => item.id === parameter.id);
  const sample = typeof source?.sample === "number" ? source.sample : undefined;
  const min = parameter.min;
  const max = parameter.max;
  const span = Math.max(0, max - min);
  let value: number;

  if (parameter.kind === "rating") {
    // Ratings are always stored on the canonical 1–10 scale. The view maps 1–5.
    const center = sample ?? (min + max) / 2;
    value = center + [0, 1, 0, -1, 1, 0, -1][index % 7];
  } else {
    const center = sample ?? min + span * 0.5;
    const weekly = Math.floor(index / 7);
    const weekday = index % 7;
    const drift = parameter.id === "weight" ? -0.035 * weekly : 0;
    const variation =
      parameter.id === "weight"
        ? [0.1, -0.2, 0.05, -0.1, 0.15, -0.05, 0.05][weekday]
        : parameter.id === "steps"
          ? [0.85, 1.08, 0.95, 1.12, 1.01, 1.2, 0.76][weekday]
          : parameter.id === "sleep"
            ? [0.15, 0.3, -0.25, 0.1, -0.15, 0.4, -0.3][weekday]
            : parameter.id === "calories"
              ? [0.96, 1.03, 0.94, 1.06, 1.01, 1.08, 0.92][weekday]
              : 1 + [0, 0.025, -0.02, 0.01, -0.015, 0.03, -0.025][weekday];
    value =
      parameter.id === "weight" || parameter.id === "sleep"
        ? center + drift + variation
        : center * variation;
  }

  return within(roundTo(value, parameter.decimals), parameter);
}

function dailyText(
  parameter: TrackerParameter,
  config: TrackerConfig,
  date: string,
  index: number,
): string | undefined {
  const options = optionsFor(parameter, config);
  const choose = (preferred: string[]) =>
    preferred.find((item) => options.includes(item)) ??
    options[index % options.length];

  switch (parameter.inputType) {
    case "time": {
      const idTime: Record<string, string[]> = {
        time: ["07:12", "07:18", "07:09", "07:24", "07:15", "08:02", "08:16"],
        bedtime: [
          "22:25",
          "22:38",
          "22:31",
          "22:47",
          "22:20",
          "23:05",
          "22:52",
        ],
        "wake-time": [
          "06:18",
          "06:22",
          "06:11",
          "06:35",
          "06:15",
          "07:02",
          "07:18",
        ],
      };
      return idTime[parameter.id]?.[index % 7] ?? "07:15";
    }
    case "blood-pressure":
      return "118/76";
    case "text": {
      const notes: Record<string, string[]> = {
        "daily-note": [
          "Meals were steady; took a short walk after lunch.",
          "Busy workday, packed lunch helped keep routine simple.",
          "Training felt smooth; added fruit with breakfast.",
          "A little rushed today, but hydration stayed consistent.",
          "Good appetite and energy through the afternoon.",
          "Social dinner; returned to usual routine the next meal.",
          "Quiet day with an easy walk and an early night.",
        ],
        "recovery-context-note": [
          "Slept well and woke feeling settled.",
          "Late meeting shortened wind-down time.",
          "Legs a little heavy after yesterday's session.",
          "Energy improved after lunch and a brief break.",
          "No unusual recovery concerns today.",
          "Kept the evening low-key and relaxed.",
          "Woke once overnight, otherwise felt rested.",
        ],
        "activity-context-note": [
          "Strength session completed as planned.",
          "Walked between errands during the day.",
          "Rest day with normal daily movement.",
          "Short cycle ride after work.",
          "Training session felt controlled and steady.",
          "Longer weekend walk with a friend.",
          "Mostly desk-based day; took movement breaks.",
        ],
      };
      return (
        notes[parameter.id]?.[index % 7] ??
        `${parameter.label} recorded for ${date}.`
      );
    }
    case "choice":
      return options.length
        ? choose(["Walking", "Day", "None", "No", "Mild"])
        : undefined;
    case "multi-choice": {
      const choices = options.length ? [options[index % options.length]] : [];
      return JSON.stringify({
        choices,
        note: index % 4 === 0 ? "Mild, brief" : "",
      });
    }
    case "location-rating": {
      const locations = [
        "Lower back",
        "Shoulders",
        "Knees",
        "No specific area",
      ];
      const reading = 1 + (index % 10);
      return JSON.stringify({
        location: locations[index % locations.length],
        rating: reading,
      });
    }
    case "context": {
      const answer = options.length ? choose(["No", "Day"]) : "No";
      const context =
        answer.toLowerCase() === "yes"
          ? parameter.id === "travel-day"
            ? "Local travel for work."
            : "Mild cold symptoms; routine adjusted."
          : "";
      return JSON.stringify({ answer, context });
    }
    case "period-start":
      return index % 28 === 27 ? "yes" : "no";
    case "cycle-day":
      return undefined;
    default:
      return undefined;
  }
}

export function createExampleHistory(
  config: TrackerConfig,
  asOf: string,
): { entries: TrackerEntry[]; textValues: Record<string, string> } {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
    Number.isNaN(Date.parse(`${asOf}T00:00:00.000Z`))
  )
    throw new Error(`Invalid asOf date: ${asOf}`);

  const metrics = metricGroups(config).flatMap((group) => group.parameters);
  const hasCycleDay = metrics.some(
    (parameter) => parameter.inputType === "cycle-day",
  );
  const hasPeriodStart = metrics.some(
    (parameter) => parameter.inputType === "period-start",
  );
  const entries: TrackerEntry[] = [];
  const textValues: Record<string, string> = {};

  for (let index = 55; index >= 0; index -= 1) {
    const date = dateFor(asOf, index);
    const values: TrackerEntry["values"] = {};
    if (hasCycleDay && !hasPeriodStart && index % 28 === 27)
      textValues[`${date}:period-start`] = "yes";
    for (const parameter of metrics) {
      if (parameter.inputType) {
        const value = dailyText(parameter, config, date, index);
        // A choice with no configured options cannot have a valid synthetic answer.
        if (value !== undefined) textValues[`${date}:${parameter.id}`] = value;
      } else {
        values[parameter.id] = numericValue(parameter, index);
      }
    }
    entries.push({ date, values });
  }

  return { entries, textValues };
}
