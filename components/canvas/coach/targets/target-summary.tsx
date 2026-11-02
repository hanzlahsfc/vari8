import {
  type ActivityMetric,
  type ActivitySegment,
  type ActivityTargetVersion,
  activitySegments,
  addLocalDays,
  formatActivityTarget,
  mondayOf,
  resolveActivityTarget,
} from "./model";

const METRIC_LABELS: Record<ActivityMetric, string> = {
  steps: "Steps",
  cardio: "Cardio",
};
const METRIC_UNITS: Record<ActivityMetric, string> = {
  steps: "steps/day",
  cardio: "sessions/week × min/session",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const weekday = (date: string) =>
  WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7];

const dayRange = (segment: ActivitySegment) =>
  segment.start === segment.end
    ? weekday(segment.start)
    : `${weekday(segment.start)}–${weekday(segment.end)}`;

const segmentText = (segment: ActivitySegment) => {
  if (!segment.version) return "No target";
  if (segment.version.target === null) return "Stopped";
  return formatActivityTarget(segment.version);
};

function DayReadout({
  versions,
  metric,
  date,
}: {
  versions: ActivityTargetVersion[];
  metric: ActivityMetric;
  date: string;
}) {
  const version = resolveActivityTarget({ versions, metric, date });
  return (
    <div className="at-summary-metric">
      <div className="at-summary-metric-head">
        <strong>{METRIC_LABELS[metric]}</strong>
        <small>{METRIC_UNITS[metric]}</small>
      </div>
      {!version ? (
        <p className="at-summary-value is-empty">No target prescribed</p>
      ) : version.target === null ? (
        <p className="at-summary-value is-stopped">
          Stopped · from {version.effectiveFrom}
        </p>
      ) : (
        <p className="at-summary-value">{formatActivityTarget(version)}</p>
      )}
    </div>
  );
}

function WeekReadout({
  versions,
  metric,
  start,
  end,
}: {
  versions: ActivityTargetVersion[];
  metric: ActivityMetric;
  start: string;
  end: string;
}) {
  const segments = activitySegments({ versions, metric, start, end });
  return (
    <div className="at-summary-metric">
      <div className="at-summary-metric-head">
        <strong>{METRIC_LABELS[metric]}</strong>
        <small>{METRIC_UNITS[metric]}</small>
      </div>
      <ul className="at-summary-segments">
        {segments.map((segment) => (
          <li
            key={`${segment.start}-${segment.version?.id ?? "none"}`}
            className={
              segment.version?.target === null
                ? "is-stopped"
                : segment.version
                  ? undefined
                  : "is-empty"
            }
          >
            <span className="at-summary-days">{dayRange(segment)}</span>
            <span>{segmentText(segment)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TargetSummary({
  versions,
  date,
  mode,
  metrics = ["steps", "cardio"],
}: {
  versions: ActivityTargetVersion[];
  date: string;
  mode: "day" | "week";
  metrics?: ActivityMetric[];
}) {
  const start = mondayOf(date);
  const end = addLocalDays(start, 6);
  return (
    <section className="at-summary" aria-label="Activity targets">
      <div className="at-summary-head">
        <h3>Activity targets</h3>
        <small>{mode === "day" ? date : `${start} – ${end}`}</small>
      </div>
      <div className="at-summary-grid">
        {metrics.map((metric) =>
          mode === "day" ? (
            <DayReadout
              key={metric}
              versions={versions}
              metric={metric}
              date={date}
            />
          ) : (
            <WeekReadout
              key={metric}
              versions={versions}
              metric={metric}
              start={start}
              end={end}
            />
          ),
        )}
      </div>
    </section>
  );
}
