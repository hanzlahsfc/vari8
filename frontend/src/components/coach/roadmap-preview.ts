import type { CoachClient, FieldConfig, Variant } from "./model";

const DAY = 86_400_000;
const RECORDED_FIELDS = new Set(["weight", "sleep", "steps", "calories"]);

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

export function weeklyRoadmapRows(configuration: Variant, client: CoachClient) {
  const entries = [...client.entries].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const weeks = [...new Set(entries.map((entry) => monday(entry.date)))];
  return weeks.map((start) => {
    const end = endOfWeek(start);
    const recorded = entries.filter(
      (entry) => entry.date >= start && entry.date <= end,
    );
    return {
      start,
      end,
      phase: client.phase,
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
        const target =
          field.id === "calories"
            ? client.plan.calories
            : field.id === "protein"
              ? client.plan.protein
              : null;
        let value: number | null = values.length
          ? values.reduce((sum, reading) => sum + reading, 0) / values.length
          : null;
        if (metric.calculation === "Trend")
          value = values.length > 1 ? values[values.length - 1] - values[0] : null;
        if (metric.calculation === "Adherence")
          value =
            values.length && target !== null
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
