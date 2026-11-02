"use client";

import { Check, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { SegmentedControl } from "@/components/vari8/components";
import { PageHeader } from "@/components/vari8/layouts";
import { TrackerEditorContext } from "./editor-context";
import type { TrackerConfig, TrackerEntry } from "./preview-model";
import { TodayView } from "./today-view";
import { TrendsView } from "./trends-view";
import {
  addDays,
  dateLabel,
  hasValue,
  metricGroups,
  weekDates,
  weekLabel,
} from "./view-model";
import { WeekView } from "./week-view";
import "./tracking-view.css";

type TrackingViewProps = {
  config: TrackerConfig;
  entries: TrackerEntry[];
  onUpdateValue: (date: string, id: string, value: number | null) => void;
  textValues: Record<string, string>;
  onUpdateText: (date: string, id: string, value: string) => void;
  comments: Record<string, string>;
  onSaveComment: (date: string, id: string, text: string) => void;
  clientName: string;
  clientInitials: string;
  asOf: string;
  parameterGroups?: Record<string, string>;
  onConfigure?: () => void;
  allowCoachMode?: boolean;
  persistenceHint?: string;
  renderTargets?: (context: {
    date: string;
    view: "Today" | "Week";
  }) => ReactNode;
};
type View = "Today" | "Week" | "Trends";

export function TrackingView(props: TrackingViewProps) {
  const { config, asOf } = props;
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<View>("Today");
  const [mode, setMode] = useState<"coach" | "client">("client");
  const animationId = useId();
  const [selectedDate, setSelectedDate] = useState(asOf);
  const prevAsOf = useRef(asOf);
  const deferredAsOf = useRef<{ from: string; to: string } | null>(null);
  const [focusedParameter, setFocusedParameter] = useState<string>();
  const [editors, setEditors] = useState<Record<string, boolean>>({});
  const [updated, setUpdated] = useState(false);
  const groups = useMemo(
    () => metricGroups(config, props.parameterGroups),
    [config, props.parameterGroups],
  );
  const dates = weekDates(selectedDate);
  const editing = Object.values(editors).some(Boolean);
  useEffect(() => {
    const previous = prevAsOf.current;
    prevAsOf.current = asOf;
    if (asOf === previous) return;
    if (selectedDate !== previous) return;
    if (editing) deferredAsOf.current = { from: previous, to: asOf };
    else setSelectedDate(asOf);
  }, [asOf, selectedDate, editing]);
  useEffect(() => {
    if (editing || !deferredAsOf.current) return;
    const { from, to } = deferredAsOf.current;
    deferredAsOf.current = null;
    setSelectedDate((current) => (current === from ? to : current));
  }, [editing]);
  const reportEditing = useCallback((id: string, active: boolean) => {
    setEditors((current) => {
      if (Boolean(current[id]) === active) return current;
      const next = { ...current };
      if (active) next[id] = true;
      else delete next[id];
      return next;
    });
  }, []);
  const selectDate = (date: string, parameterId?: string) => {
    if (editing) return;
    setSelectedDate(date);
    setFocusedParameter(parameterId);
    if (parameterId || view === "Week") setView("Today");
  };
  const shared = { ...props, groups, selectedDate, onSelectDate: selectDate };

  const status = editing
    ? "Finish editing to change dates or views."
    : selectedDate > asOf && view === "Today"
      ? "Future date · logging unavailable"
      : updated
        ? "Updated"
        : (props.persistenceHint ?? "Preview session");

  return (
    <LayoutGroup id={animationId}>
      <section
        className="ct-tracking"
        aria-label={`${props.clientName}'s tracker`}
      >
        <PageHeader
          className="ct-tracker-header"
          width="wide"
          title="Tracker"
          description={props.allowCoachMode ? props.clientName : undefined}
          actions={
            <div className="ct-tracker-actions">
              {props.allowCoachMode && (
                <fieldset className="ct-role-switch" aria-label="Entry mode">
                  {(["client", "coach"] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      disabled={editing}
                      aria-pressed={mode === item}
                      onClick={() => setMode(item)}
                    >
                      {item === "client" ? "Log data" : "Coach notes"}
                    </button>
                  ))}
                </fieldset>
              )}
              {props.onConfigure && (
                <button
                  className="ct-configure"
                  type="button"
                  aria-label="Configure tracker"
                  title="Configure tracker"
                  disabled={editing}
                  onClick={props.onConfigure}
                >
                  <Settings2 size={15} strokeWidth={1.35} aria-hidden="true" />
                  <span>Configure</span>
                </button>
              )}
            </div>
          }
        />
        <div className="ct-workspace-toolbar">
          <SegmentedControl
            className="ct-view-switch"
            label="Tracker views"
            value={view}
            options={(["Today", "Week", "Trends"] as const).map((name) => ({
              value: name,
              label: name,
              disabled: editing,
            }))}
            onValueChange={(next) => {
              setView(next as View);
              setFocusedParameter(undefined);
            }}
          />
          <div className="ct-week-navigation">
            <button
              type="button"
              aria-label="Previous week"
              disabled={editing}
              onClick={() => {
                setSelectedDate(addDays(selectedDate, -7));
                setFocusedParameter(undefined);
              }}
            >
              <ChevronLeft size={16} strokeWidth={1.35} aria-hidden="true" />
            </button>
            <span>{weekLabel(selectedDate)}</span>
            <button
              type="button"
              aria-label="Next week"
              disabled={editing}
              onClick={() => {
                setSelectedDate(addDays(selectedDate, 7));
                setFocusedParameter(undefined);
              }}
            >
              <ChevronRight size={16} strokeWidth={1.35} aria-hidden="true" />
            </button>
            {selectedDate !== asOf && (
              <button
                className="ct-return-today"
                type="button"
                disabled={editing}
                onClick={() => {
                  setSelectedDate(asOf);
                  setFocusedParameter(undefined);
                }}
              >
                Today
              </button>
            )}
          </div>
        </div>
        {view === "Today" && (
          <div className="ct-date-tray">
            <div className="ct-date-navigation">
              <fieldset
                className="ct-week-strip"
                aria-label="Select tracking date"
              >
                {dates.map((date) => {
                  const recorded = groups.some((group) =>
                    group.parameters.some((parameter) =>
                      hasValue(parameter, date, props),
                    ),
                  );
                  return (
                    <button
                      key={date}
                      type="button"
                      aria-pressed={selectedDate === date}
                      aria-current={date === asOf ? "date" : undefined}
                      aria-label={`${dateLabel(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${recorded ? ", has tracking data" : ""}${date === asOf ? ", today" : ""}`}
                      disabled={editing}
                      data-today={date === asOf}
                      onClick={() => selectDate(date)}
                    >
                      {selectedDate === date && (
                        <motion.span
                          className="ct-date-highlight"
                          layoutId="tracker-date"
                          transition={{
                            type: "spring",
                            bounce: 0,
                            duration: reduceMotion ? 0 : 0.3,
                          }}
                        />
                      )}
                      <span>{dateLabel(date, { weekday: "short" })}</span>
                      <strong>{dateLabel(date, { day: "numeric" })}</strong>
                      <i data-recorded={recorded} aria-hidden="true" />
                    </button>
                  );
                })}
              </fieldset>
              <div className="ct-date-context">
                <span>
                  {mode === "coach" ? "Review & comment" : "Daily check-in"}
                </span>
                <small>
                  {dateLabel(asOf, { day: "numeric", month: "short" })} is today
                </small>
              </div>
            </div>
          </div>
        )}
        <div className="ct-status-row">
          <p className="ct-view-description">
            {view === "Today"
              ? mode === "coach"
                ? "Select a recorded value to add a coach note."
                : "Your daily metrics, in one place."
              : view === "Week"
                ? "Compare your week at a glance."
                : "Explore how your metrics change over time."}
          </p>
          <div className="ct-edit-status" role="status" data-editing={editing}>
            {updated && !editing && (
              <Check size={13} strokeWidth={1.5} aria-hidden="true" />
            )}
            {status}
          </div>
        </div>
        {view !== "Trends" &&
          props.renderTargets?.({ date: selectedDate, view })}
        {groups.length === 0 ? (
          <div className="ct-tracker-empty">
            <h2>No tracking fields configured</h2>
            <p>
              Select metrics in the template’s Tracker setup to start tracking.
            </p>
          </div>
        ) : (
          <div className="ct-tracker-content">
            <div hidden={view !== "Today"}>
              <TrackerEditorContext.Provider value={reportEditing}>
                <TodayView
                  {...shared}
                  focusedParameter={focusedParameter}
                  editing={editing}
                  mode={mode}
                  onUpdateValue={(date, id, value) => {
                    props.onUpdateValue(date, id, value);
                    setUpdated(true);
                  }}
                  onUpdateText={(date, id, value) => {
                    props.onUpdateText(date, id, value);
                    setUpdated(true);
                  }}
                />
              </TrackerEditorContext.Provider>
            </div>
            <div hidden={view !== "Week"}>
              <WeekView {...shared} />
            </div>
            <div hidden={view !== "Trends"}>
              <TrendsView {...shared} />
            </div>
          </div>
        )}
      </section>
    </LayoutGroup>
  );
}
