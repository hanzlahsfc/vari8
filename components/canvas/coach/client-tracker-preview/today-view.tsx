"use client";

import { useEffect, useRef, useState } from "react";
import {
  configuredUnit,
  fieldTrackerConfig,
  type TrackerConfig,
  type TrackerParameter,
} from "./preview-model";
import { TextTrackerCell, TrackerCell } from "./tracker-cell";
import {
  dateLabel,
  hasValue,
  summaryParameters,
  type TrackerViewProps,
  textValueFor,
  valueLabel,
} from "./view-model";
import "./today-view.css";

export type TodayViewProps = TrackerViewProps & {
  comments: Record<string, string>;
  onUpdateValue: (date: string, id: string, value: number | null) => void;
  onUpdateText: (date: string, id: string, value: string) => void;
  onSaveComment: (date: string, id: string, text: string) => void;
  focusedParameter?: string;
  editing: boolean;
  mode?: "coach" | "client";
};

function unitLabel(parameter: TrackerParameter, config: TrackerConfig) {
  if (parameter.inputType) return "";
  if (parameter.kind === "rating") {
    const scale = fieldTrackerConfig(parameter, config).ratingScale;
    return scale === "words" ? "" : scale === "1-5" ? "/ 5" : "/ 10";
  }
  return configuredUnit(parameter, config);
}

const wideInputTypes = new Set([
  "text",
  "context",
  "multi-choice",
  "location-rating",
]);

export function TodayView(props: TodayViewProps) {
  const {
    groups,
    config,
    entries,
    textValues,
    selectedDate,
    asOf,
    focusedParameter,
    editing,
  } = props;
  const [activeGroup, setActiveGroup] = useState("all");
  const [quickFocus, setQuickFocus] = useState<{
    id: string;
    request: number;
  }>();
  const focusRequest = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const all = groups.flatMap((group) => group.parameters);
  const summaries = summaryParameters(groups, config);
  const entry = entries.find((item) => item.date === selectedDate);
  const recorded = all.filter((parameter) =>
    hasValue(parameter, selectedDate, props),
  ).length;
  const effectiveGroup =
    activeGroup === "all" || groups.some((group) => group.label === activeGroup)
      ? activeGroup
      : "all";
  const visibleGroups =
    effectiveGroup === "all"
      ? groups
      : groups.filter((group) => group.label === effectiveGroup);

  const focusedGroup = groups.find((group) =>
    group.parameters.some((parameter) => parameter.id === focusedParameter),
  )?.label;
  useEffect(() => {
    if (focusedParameter && focusedGroup) setActiveGroup(focusedGroup);
  }, [focusedParameter, focusedGroup]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: date and category changes mount the target field before focus.
  useEffect(() => {
    const parameterId =
      quickFocus && quickFocus.id === focusedParameter
        ? quickFocus.id
        : focusedParameter;
    if (!parameterId) return;
    const field = [
      ...(root.current?.querySelectorAll<HTMLElement>("[data-metric-id]") ??
        []),
    ].find((item) => item.dataset.metricId === parameterId);
    field
      ?.querySelector<HTMLElement>("button, input, select, textarea")
      ?.focus();
  }, [focusedParameter, quickFocus, effectiveGroup, selectedDate]);

  const focusSummary = (parameter: TrackerParameter) => {
    if (editing) return;
    const group = groups.find((item) =>
      item.parameters.some(
        (itemParameter) => itemParameter.id === parameter.id,
      ),
    );
    if (group) setActiveGroup(group.label);
    props.onSelectDate(selectedDate, parameter.id);
    focusRequest.current += 1;
    setQuickFocus({ id: parameter.id, request: focusRequest.current });
  };

  const selectGroup = (label: string) => {
    if (!editing) setActiveGroup(label);
  };

  return (
    <div className="ct-today" ref={root}>
      <div className="ct-day-heading">
        <h2>
          {dateLabel(selectedDate, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </h2>
        <span
          className="ct-day-completion"
          data-complete={all.length > 0 && recorded === all.length}
        >
          {all.length > 0 && recorded === all.length && (
            <span className="ct-day-completion-dot" aria-hidden="true" />
          )}
          {recorded} of {all.length} recorded
        </span>
      </div>

      {summaries.length > 0 && (
        <dl className="ct-overview" aria-label="Daily overview">
          {summaries.map((parameter) => (
            <div key={parameter.id}>
              <dt>{parameter.label}</dt>
              <dd data-missing={!hasValue(parameter, selectedDate, props)}>
                <button
                  type="button"
                  disabled={editing}
                  onClick={() => focusSummary(parameter)}
                  aria-label={`Go to ${parameter.label} entry`}
                >
                  {valueLabel(parameter, selectedDate, props)}
                </button>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="ct-day-tray">
        <div className="ct-day-core">
          <nav className="ct-category-index" aria-label="Entry categories">
            <p className="ct-category-heading">Categories</p>
            <div className="ct-category-list">
              <button
                type="button"
                className="ct-category-option"
                aria-current={effectiveGroup === "all" ? "page" : undefined}
                aria-pressed={effectiveGroup === "all"}
                disabled={editing}
                onClick={() => selectGroup("all")}
              >
                <span>All fields</span>
                <small>
                  {recorded}/{all.length}
                </small>
              </button>
              {groups.map((group) => {
                const count = group.parameters.filter((parameter) =>
                  hasValue(parameter, selectedDate, props),
                ).length;
                const active = effectiveGroup === group.label;
                return (
                  <button
                    type="button"
                    className="ct-category-option"
                    key={group.label}
                    aria-pressed={active}
                    disabled={editing}
                    onClick={() => selectGroup(group.label)}
                  >
                    <span>{group.label}</span>
                    <small>
                      {count}/{group.parameters.length}
                    </small>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="ct-entry-content">
            <label
              className="ct-category-mobile-label"
              htmlFor="ct-category-select"
            >
              Category
            </label>
            <select
              id="ct-category-select"
              className="ct-category-select"
              value={effectiveGroup}
              disabled={editing}
              onChange={(event) => selectGroup(event.currentTarget.value)}
            >
              <option value="all">
                All fields ({recorded}/{all.length})
              </option>
              {groups.map((group) => {
                const count = group.parameters.filter((parameter) =>
                  hasValue(parameter, selectedDate, props),
                ).length;
                return (
                  <option key={group.label} value={group.label}>
                    {group.label} ({count}/{group.parameters.length})
                  </option>
                );
              })}
            </select>

            <div className="ct-daily-groups">
              {visibleGroups.map((group) => {
                const count = group.parameters.filter((parameter) =>
                  hasValue(parameter, selectedDate, props),
                ).length;
                return (
                  <section className="ct-daily-group" key={group.label}>
                    <header className="ct-section-heading">
                      <h3>{group.label}</h3>
                      <span>
                        {count} of {group.parameters.length} entered
                      </span>
                    </header>
                    <div className="ct-field-list">
                      {group.parameters.map((parameter) => {
                        const comment =
                          props.comments[`${selectedDate}:${parameter.id}`];
                        const wide = wideInputTypes.has(
                          parameter.inputType ?? "",
                        );
                        return (
                          <div
                            className={`ct-daily-field${wide ? " ct-field-wide" : ""}`}
                            key={`${selectedDate}:${parameter.id}`}
                            data-metric-id={parameter.id}
                          >
                            <div className="ct-field-label">
                              <span>{parameter.label}</span>
                            </div>
                            <div className="ct-field-control">
                              {parameter.inputType ? (
                                <TextTrackerCell
                                  parameter={parameter}
                                  config={config}
                                  date={selectedDate}
                                  value={textValueFor(
                                    parameter,
                                    selectedDate,
                                    textValues,
                                  )}
                                  disabled={selectedDate > asOf}
                                  onUpdateText={props.onUpdateText}
                                  emptyLabel={wide ? "Add note" : "Add value"}
                                />
                              ) : (
                                <TrackerCell
                                  parameter={parameter}
                                  config={config}
                                  date={selectedDate}
                                  value={entry?.values[parameter.id]}
                                  mode={props.mode ?? "client"}
                                  comment={comment}
                                  disabled={selectedDate > asOf}
                                  onUpdateValue={props.onUpdateValue}
                                  onSaveComment={props.onSaveComment}
                                  emptyLabel={
                                    props.mode === "coach"
                                      ? "Not recorded"
                                      : "Add value"
                                  }
                                />
                              )}
                              {unitLabel(parameter, config) && (
                                <span
                                  className="ct-control-unit"
                                  aria-hidden="true"
                                >
                                  {unitLabel(parameter, config)}
                                </span>
                              )}
                            </div>
                            {parameter.inputType === "cycle-day" && (
                              <small className="ct-field-help">
                                Calculated from the latest period start.
                              </small>
                            )}
                            {comment && (
                              <p className="ct-field-comment">
                                Coach note: {comment}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
