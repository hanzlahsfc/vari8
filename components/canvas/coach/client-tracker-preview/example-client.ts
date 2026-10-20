import type { CoachClient } from "../model";
import { createExampleHistory } from "./example-history";
import type { TrackerConfig } from "./preview-model";

const CORE_METRICS = ["weight", "sleep", "steps", "calories"] as const;

function requiredReading(
  values: Record<string, number | null>,
  metric: (typeof CORE_METRICS)[number],
) {
  const value = values[metric];
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Example history is missing the ${metric} reading.`);
  return value;
}

export function createExampleClient(
  client: CoachClient,
  config: TrackerConfig,
  asOf: string,
): CoachClient {
  const parameterIds = [...new Set([...config.parameterIds, ...CORE_METRICS])];
  const { entries } = createExampleHistory({ ...config, parameterIds }, asOf);

  return {
    ...client,
    entries: entries.map(({ date, values }) => ({
      date,
      weight: requiredReading(values, "weight"),
      sleep: requiredReading(values, "sleep"),
      steps: requiredReading(values, "steps"),
      calories: requiredReading(values, "calories"),
    })),
  };
}
