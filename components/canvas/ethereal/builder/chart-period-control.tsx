"use client";
import "./chart-period-control.css";

const ranges = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "6month", label: "6 months" },
  { value: "year", label: "Year" },
];
export function ChartPeriodControl({
  period,
  onChange,
  label = "Chart date range",
}: {
  period: string;
  onChange?: (period: string) => void;
  label?: string;
}) {
  const aliases: Record<string, string> = {
    "7d": "week",
    "30d": "month",
  };
  const value = aliases[period] ?? period;
  return (
    <select
      className="dw-chart-range"
      aria-label={label}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      disabled={!onChange}
    >
      {!ranges.some((range) => range.value === value) && (
        <option value={value}>
          {period === "today"
            ? "Today"
            : period
                .replace(/^(\d+)w$/, "$1 weeks")
                .replace(/^(\d+)d$/, "$1 days")}
        </option>
      )}
      {ranges.map((range) => (
        <option key={range.value} value={range.value}>
          {range.label}
        </option>
      ))}
    </select>
  );
}
