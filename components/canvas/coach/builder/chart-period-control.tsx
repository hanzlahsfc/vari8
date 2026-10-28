"use client";
import { Select as SharedSelect } from "@/components/canvas/vari8/components";
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
    <SharedSelect
      label={label}
      className="cb-dw-chart-range"
      value={value}
      onValueChange={(next) => onChange?.(next)}
      disabled={!onChange}
      options={[
        ...(!ranges.some((range) => range.value === value)
          ? [
              {
                value,
                label:
                  period === "today"
                    ? "Today"
                    : period
                        .replace(/^(\d+)w$/, "$1 weeks")
                        .replace(/^(\d+)d$/, "$1 days"),
              },
            ]
          : []),
        ...ranges,
      ]}
      size="sm"
    />
  );
}
