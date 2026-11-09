import {
  allTrackerParameters,
  configuredDecimals,
  displayedValue,
  formatValue,
  type TrackerConfig,
  type TrackerEntry,
  type TrackerParameter,
  weeklyAverage,
} from "./preview-model";

export type MetricGroup = { label: string; parameters: TrackerParameter[] };
export type TrackerData = {
  config: TrackerConfig;
  entries: TrackerEntry[];
  textValues: Record<string, string>;
};
export type TrackerViewProps = TrackerData & {
  groups: MetricGroup[];
  selectedDate: string;
  asOf: string;
  onSelectDate: (date: string, parameterId?: string) => void;
};

export const DAY_MS = 86_400_000;
export const dateAt = (date: string) => new Date(`${date}T00:00:00.000Z`);
export const dateKey = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (date: string, days: number) =>
  dateKey(new Date(dateAt(date).getTime() + days * DAY_MS));
export function mondayOf(date: string) {
  const day = dateAt(date).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export const weekDates = (date: string) =>
  Array.from({ length: 7 }, (_, index) => addDays(mondayOf(date), index));
export const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = {},
) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    dateAt(date),
  );
export function weekLabel(date: string) {
  const dates = weekDates(date);
  return `${dateLabel(dates[0], { day: "numeric", month: "short" })} – ${dateLabel(dates[6], { day: "numeric", month: "short", year: "numeric" })}`;
}

export function metricGroups(
  config: TrackerConfig,
  labels: Record<string, string> = {},
): MetricGroup[] {
  const catalog = new Map(
    allTrackerParameters().map((parameter) => [parameter.id, parameter]),
  );
  for (const parameter of config.parameterDefinitions ?? [])
    catalog.set(parameter.id, parameter);
  const buckets = new Map<string, TrackerParameter[]>();
  for (const id of config.parameterIds) {
    const parameter = catalog.get(id);
    if (
      !parameter ||
      (config.cycleTrackingEnabled === false &&
        [
          "bleeding-level",
          "cramps",
          "pms-symptoms",
          "basal-body-temperature",
          "period-start",
          "cycle-day",
        ].includes(id))
    )
      continue;
    const label = labels[id] ?? parameter.categoryId ?? "Other";
    const bucket = buckets.get(label) ?? [];
    if (!bucket.some((item) => item.id === id)) bucket.push(parameter);
    buckets.set(label, bucket);
  }
  return [...buckets].map(([label, groupParameters]) => ({
    label,
    parameters: groupParameters,
  }));
}

export function textValueFor(
  parameter: TrackerParameter,
  date: string,
  textValues: Record<string, string>,
) {
  if (parameter.inputType !== "cycle-day")
    return textValues[`${date}:${parameter.id}`];
  const start = Object.entries(textValues)
    .filter(
      ([key, value]) =>
        key.endsWith(":period-start") &&
        value.toLowerCase() === "yes" &&
        key.slice(0, 10) <= date,
    )
    .map(([key]) => key.slice(0, 10))
    .sort()
    .at(-1);
  return start
    ? String(
        Math.floor(
          (dateAt(date).getTime() - dateAt(start).getTime()) / DAY_MS,
        ) + 1,
      )
    : undefined;
}

export function textSummary(
  parameter: TrackerParameter,
  value: string | undefined,
  config: TrackerConfig,
) {
  if (!value) return "—";
  try {
    if (parameter.inputType === "multi-choice") {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.join(", ")
        : [parsed.choices?.join(", "), parsed.note]
            .filter(Boolean)
            .join(" · ") || "—";
    }
    if (parameter.inputType === "context") {
      const parsed = JSON.parse(value);
      return [parsed.answer, parsed.context].filter(Boolean).join(" · ") || "—";
    }
    if (parameter.inputType === "location-rating") {
      const parsed = JSON.parse(value);
      return (
        [parsed.location, parsed.rating ? `${parsed.rating}/10` : ""]
          .filter(Boolean)
          .join(" · ") || "—"
      );
    }
  } catch {
    return value;
  }
  if (parameter.inputType === "cycle-day") return `Day ${value}`;
  if (parameter.inputType === "period-start")
    return value.toLowerCase() === "yes" ? "Yes" : "No";
  if (
    parameter.inputType === "time" &&
    config.fieldUnits?.[parameter.id] === "12-hour"
  ) {
    const [hours, minutes] = value.split(":");
    const hour = Number(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
  }
  return value;
}

export function valueLabel(
  parameter: TrackerParameter,
  date: string,
  data: TrackerData,
) {
  if (parameter.inputType)
    return textSummary(
      parameter,
      textValueFor(parameter, date, data.textValues),
      data.config,
    );
  const value = data.entries.find((entry) => entry.date === date)?.values[
    parameter.id
  ];
  return typeof value === "number" && Number.isFinite(value)
    ? formatValue(parameter, value, data.config)
    : "—";
}

export function hasValue(
  parameter: TrackerParameter,
  date: string,
  data: TrackerData,
) {
  if (parameter.inputType)
    return Boolean(textValueFor(parameter, date, data.textValues));
  const value = data.entries.find((entry) => entry.date === date)?.values[
    parameter.id
  ];
  return typeof value === "number" && Number.isFinite(value);
}

export function weeklySummary(
  parameter: TrackerParameter,
  dates: string[],
  data: TrackerData,
): { label: string; value: string } {
  if (
    parameter.inputType === "period-start" ||
    (parameter.inputType === "choice" &&
      (data.config.fieldOptions?.[parameter.id] ?? parameter.options ?? [])
        .length > 0 &&
      (data.config.fieldOptions?.[parameter.id] ?? parameter.options)?.every(
        (option) => ["yes", "no"].includes(option.toLowerCase()),
      ))
  ) {
    const recorded = dates
      .map((date) => textValueFor(parameter, date, data.textValues))
      .filter(Boolean);
    const completed = recorded.filter(
      (value) => value?.toLowerCase() === "yes",
    ).length;
    return {
      label: "Completed / recorded",
      value: recorded.length ? `${completed} / ${recorded.length}` : "—",
    };
  }
  if (parameter.inputType) return { label: "Summary", value: "—" };
  const entries = data.entries
    .filter((entry) => dates.includes(entry.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const recorded = entries.filter(
    (entry) =>
      typeof entry.values[parameter.id] === "number" &&
      Number.isFinite(entry.values[parameter.id]),
  );
  if (parameter.summary === "latest") {
    const last = recorded.at(-1)?.values[parameter.id];
    return {
      label: "Latest",
      value: last == null ? "—" : formatValue(parameter, last, data.config),
    };
  }
  if (
    parameter.summary === "distribution" ||
    (parameter.kind === "rating" &&
      (data.config.ratingScales?.[parameter.id] ?? data.config.ratingScale) ===
        "words")
  ) {
    const counts = new Map<string, number>();
    for (const entry of recorded) {
      const label = formatValue(
        parameter,
        entry.values[parameter.id] as number,
        data.config,
      );
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const common = [...counts].sort((a, b) => b[1] - a[1])[0];
    return {
      label: "Most frequent",
      value: common ? `${common[0]} · ${common[1]}×` : "—",
    };
  }
  if (parameter.summary === "total") {
    const total = recorded.reduce(
      (sum, entry) =>
        sum +
        displayedValue(
          parameter,
          entry.values[parameter.id] as number,
          data.config,
        ),
      0,
    );
    return {
      label: "Total",
      value: recorded.length
        ? total.toLocaleString("en-GB", {
            maximumFractionDigits: configuredDecimals(parameter, data.config),
          })
        : "—",
    };
  }
  const mean = weeklyAverage(parameter, entries, data.config);
  if (mean === null) return { label: "Average", value: "—" };
  return {
    label: "Average",
    value: mean.toLocaleString("en-GB", {
      maximumFractionDigits: Math.max(
        1,
        configuredDecimals(parameter, data.config),
      ),
    }),
  };
}

export function summaryParameters(
  groups: MetricGroup[],
  config: TrackerConfig,
) {
  const all = groups.flatMap((group) => group.parameters);
  if (config.summaryParameterIds)
    return [...new Set(config.summaryParameterIds)]
      .map((id) => all.find((parameter) => parameter.id === id))
      .filter((parameter): parameter is TrackerParameter => Boolean(parameter))
      .slice(0, 4);
  return groups
    .map((group) => group.parameters.find((parameter) => !parameter.inputType))
    .filter((parameter): parameter is TrackerParameter => Boolean(parameter))
    .slice(0, 4);
}
