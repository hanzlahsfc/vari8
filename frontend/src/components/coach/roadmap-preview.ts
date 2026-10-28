import type { CoachClient, FieldConfig, Variant } from "./model";
import { planTargets } from "./plans/domain";
import {
  type ActivityMetric,
  type ActivitySegment,
  activitySegments,
  localToday,
} from "./targets/model";

const DAY = 86_400_000;
const RECORDED_FIELDS = new Set(["weight", "sleep", "steps", "calories"]);
const ACTIVITY_FIELD_METRICS: Record<string, ActivityMetric> = {
  steps: "steps",
  "cardio-duration": "cardio",
  "cardio-sessions": "cardio",
};

function monday(date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

function endOfWeek(start: string) {
  return new Date(Date.parse(`${start}T12:00:00Z`) + 6 * DAY)
    .toISOString()
    .slice(0, 10);
}

function convert(value: number, field: FieldConfig) {
  if (field.id === "weight" && field.unit === "lb") return value * 2.20462;
  if (field.id === "calories" && field.unit === "kJ") return value * 4.184;
  return value;
}

export function weeklyRoadmapRows(
  configuration: Variant,
  client: CoachClient,
  options?: { asOf?: string },
) {
  const entries = [...client.entries].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const planning = configuration.roadmapActivityTargets ?? [];
  const activityVersions = client.plans?.activityTargets ?? [];
  const weeks = new Set(entries.map((entry) => monday(entry.date)));
  if (planning.length) {
    const selected = new Set<ActivityMetric>(planning);
    for (const version of activityVersions)
      if (selected.has(version.metric))
        weeks.add(monday(version.effectiveFrom));
    weeks.add(monday(options?.asOf ?? localToday()));
  }
  return [...weeks].sort().map((start) => {
    const end = endOfWeek(start);
    const recorded = entries.filter(
      (entry) => entry.date >= start && entry.date <= end,
    );
    return {
      start,
      end,
      phase: client.phase,
      activityTargets: planning.map(
        (
          metric,
        ): {
          metric: ActivityMetric;
          segments: ActivitySegment[];
        } => ({
          metric,
          segments: activitySegments({
            versions: activityVersions,
            metric,
            start,
            end,
          }),
        }),
      ),
      metrics: configuration.roadmap.flatMap((metric) => {
        const field = configuration.fields.find(
          (candidate) => candidate.id === metric.source,
        );
        if (!field) return [];
        const values = RECORDED_FIELDS.has(field.id)
          ? recorded
              .map(
                (entry) =>
                  entry[field.id as "weight" | "sleep" | "steps" | "calories"],
              )
              .filter((value) => Number.isFinite(value))
          : [];
        const applicable = recorded.flatMap((entry) => {
          const t = planTargets(client, entry.date);
          return t ? [t] : [];
        });
        const nutrient =
          field.id === "calories" || field.id === "protein"
            ? field.id
            : undefined;
        const activityMetric = ACTIVITY_FIELD_METRICS[field.id];
        const structured =
          activityMetric !== undefined &&
          activityVersions.some((version) => version.metric === activityMetric);
        const target = structured
          ? null
          : nutrient && applicable.length
            ? applicable.reduce((sum, t) => sum + t[nutrient], 0) /
              applicable.length
            : (client.plans?.goals.find(
                (g) => g.fieldId === field.id && g.date <= end,
              )?.value ?? null);
        let value: number | null = values.length
          ? values.reduce((sum, reading) => sum + reading, 0) / values.length
          : null;
        if (metric.calculation === "Trend")
          value =
            values.length > 1 ? values[values.length - 1] - values[0] : null;
        if (metric.calculation === "Adherence")
          value =
            !structured && values.length && target !== null
              ? (values.filter((reading) => reading >= target).length /
                  values.length) *
                100
              : null;
        return [
          {
            source: field.id,
            calculation: metric.calculation,
            unit: metric.calculation === "Adherence" ? "%" : field.unit,
            value:
              value === null || metric.calculation === "Adherence"
                ? value
                : convert(value, field),
            target: target === null ? null : convert(target, field),
            count: values.length,
            comparison: metric.comparison,
          },
        ];
      }),
    };
  });
}
