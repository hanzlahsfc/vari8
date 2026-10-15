/* biome-ignore-all lint/a11y/noNoninteractiveTabindex: Keyboard focus is needed for the horizontally scrollable table region. */
"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  configuredDecimals,
  configuredUnit,
  displayedValue,
  fieldTrackerConfig,
  formatValue,
  type TrackerParameter,
} from "./preview-model";
import {
  dateLabel,
  hasValue,
  type TrackerViewProps,
  textSummary,
  textValueFor,
  weekDates,
  weeklySummary,
} from "./view-model";
import "./week-view.css";

function dailyValue(
  parameter: TrackerParameter,
  date: string,
  props: TrackerViewProps,
) {
  if (parameter.inputType) {
    return textSummary(
      parameter,
      textValueFor(parameter, date, props.textValues),
      props.config,
    );
  }
  const value = props.entries.find((entry) => entry.date === date)?.values[
    parameter.id
  ];
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (
    parameter.kind === "rating" &&
    fieldTrackerConfig(parameter, props.config).ratingScale === "words"
  ) {
    return formatValue(parameter, value, props.config);
  }
  return displayedValue(parameter, value, props.config).toLocaleString(
    "en-GB",
    {
      maximumFractionDigits: configuredDecimals(parameter, props.config),
    },
  );
}

function conciseSummaryLabel(label: string) {
  if (label === "Completed / recorded") return "Done";
  if (label === "Summary") return "Notes";
  return label;
}

export function WeekView(props: TrackerViewProps) {
  const dates = weekDates(props.selectedDate);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const metricCount = props.groups.reduce(
    (count, group) => count + group.parameters.length,
    0,
  );
  const recordedDayCount = dates.filter((date) =>
    props.groups.some((group) =>
      group.parameters.some((parameter) => hasValue(parameter, date, props)),
    ),
  ).length;

  return (
    <section className="ct-week-view" aria-label="Weekly tracker summary">
      <header className="ct-week-heading">
        <div>
          <h2>Weekly comparison</h2>
          <p>
            {metricCount} {metricCount === 1 ? "metric" : "metrics"}
            <span aria-hidden="true"> · </span>
            {recordedDayCount} {recordedDayCount === 1 ? "day" : "days"}{" "}
            recorded
          </p>
        </div>
        <span className="ct-week-hint">
          Scroll to compare <span aria-hidden="true">·</span> select a value to
          open its day
        </span>
      </header>
      <div className="ct-week-tray">
        <div className="ct-week-core">
          <section
            className="ct-week-scroll"
            aria-label="Weekly tracking table"
            tabIndex={0}
          >
            <table className="ct-week-table">
              <caption className="ct-week-visually-hidden">
                Daily readings and configured summaries for the selected week.
              </caption>
              <colgroup>
                <col className="ct-week-label-column" />
                {dates.map((date) => (
                  <col key={date} className="ct-week-day-column" />
                ))}
                <col className="ct-week-summary-column" />
              </colgroup>
              <thead>
                <tr>
                  <th className="ct-week-corner" scope="col">
                    Metric
                  </th>
                  {dates.map((date) => {
                    const future = date > props.asOf;
                    return (
                      <th
                        key={date}
                        scope="col"
                        className={[
                          date === props.asOf && "is-today",
                          date === props.selectedDate && "is-selected-day",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        data-today={date === props.asOf ? "true" : undefined}
                      >
                        <button
                          className="ct-week-date"
                          type="button"
                          disabled={future}
                          aria-label={`${dateLabel(date, { weekday: "long", day: "numeric", month: "long" })}${future ? ", unavailable future date" : ", open this day"}`}
                          onClick={() => props.onSelectDate(date)}
                        >
                          <span>{dateLabel(date, { weekday: "short" })}</span>
                          <small>
                            {dateLabel(date, {
                              day: "numeric",
                              month: "short",
                            })}
                          </small>
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="ct-week-summary-head">
                    <span>Summary</span>
                    <small>this week</small>
                  </th>
                </tr>
              </thead>
              {props.groups.map((group) => {
                const isCollapsed = collapsed[group.label] ?? false;
                return (
                  <tbody key={group.label}>
                    <tr className="ct-week-group-row">
                      <th scope="rowgroup">
                        <button
                          type="button"
                          className="ct-week-group-toggle"
                          aria-expanded={!isCollapsed}
                          onClick={() =>
                            setCollapsed((current) => ({
                              ...current,
                              [group.label]: !isCollapsed,
                            }))
                          }
                        >
                          <span
                            className={`ct-week-chevron${isCollapsed ? " is-collapsed" : ""}`}
                            aria-hidden="true"
                          >
                            <ChevronDown size={14} strokeWidth={1.8} />
                          </span>
                          <span>{group.label}</span>
                          <small>
                            {group.parameters.length}{" "}
                            {group.parameters.length === 1
                              ? "metric"
                              : "metrics"}
                          </small>
                        </button>
                      </th>
                      <td colSpan={8} aria-hidden="true" />
                    </tr>
                    {!isCollapsed &&
                      group.parameters.map((parameter) => {
                        const unit = parameter.inputType
                          ? undefined
                          : configuredUnit(parameter, props.config);
                        return (
                          <tr className="ct-week-metric-row" key={parameter.id}>
                            <th scope="row" className="ct-week-metric-label">
                              <span>{parameter.label}</span>
                              {unit && <small>{unit}</small>}
                            </th>
                            {dates.map((date) => {
                              const future = date > props.asOf;
                              const recorded = hasValue(parameter, date, props);
                              return (
                                <td
                                  key={date}
                                  className={`${date === props.asOf ? "is-today " : ""}${date === props.selectedDate ? "is-selected-day " : ""}${recorded ? "has-value" : "is-empty"}`}
                                  data-today={
                                    date === props.asOf ? "true" : undefined
                                  }
                                >
                                  <button
                                    type="button"
                                    className="ct-week-value"
                                    disabled={future}
                                    aria-label={`${parameter.label}, ${dateLabel(date, { weekday: "long", day: "numeric", month: "long" })}: ${dailyValue(parameter, date, props)}${future ? ", unavailable future date" : ", open this day"}`}
                                    onClick={() =>
                                      props.onSelectDate(date, parameter.id)
                                    }
                                  >
                                    {dailyValue(parameter, date, props)}
                                  </button>
                                </td>
                              );
                            })}
                            {(() => {
                              const summary = weeklySummary(
                                parameter,
                                dates,
                                props,
                              );
                              return (
                                <td className="ct-week-summary-cell">
                                  <span>{summary.value}</span>
                                  <small>
                                    {conciseSummaryLabel(summary.label)}
                                  </small>
                                </td>
                              );
                            })()}
                          </tr>
                        );
                      })}
                  </tbody>
                );
              })}
            </table>
          </section>
        </div>
      </div>
    </section>
  );
}
