"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AdditionalDetailContent } from "./additional-widget-content";
import { CoachingWidgetContent } from "./coaching-content";
import {
  type ClientTask,
  dateLabel,
  type HabitRecord,
  type SourceRecords,
  type WidgetInstance,
} from "./model";
import { NutritionWidgetContent } from "./nutrition-content";
import { ProgressWidgetContent } from "./progress-content";
import { SmoothTrend } from "./smooth-trend";
import "./widgets.css";
import { initialBodyBudget } from "./widget-geometry";
import "./adaptive-frame.css";

type ContentProps = {
  widget: WidgetInstance;
  records: SourceRecords;
  width: number;
  height: number;
  columnSpan?: number;
  clientPreview: boolean;
  onRecordsChange: (records: SourceRecords) => void;
  onDetail: (key: string) => void;
  onPeriodChange?: (period: string) => void;
};

type DetailProps = {
  detail: string;
  records: SourceRecords;
  clientPreview: boolean;
  onRecordsChange: (records: SourceRecords) => void;
};

type Layout = "Compact" | "Regular" | "Wide" | "Tall" | "Expanded";

function actualLayout(width: number, height: number): Layout {
  if (width >= 480 && height >= 384) return "Expanded";
  if (width >= 480 && height >= 224) return "Wide";
  if (width >= 240 && height >= 384) return "Tall";
  if (width >= 320 && height >= 224) return "Regular";
  return "Compact";
}

function numericSeries(records: SourceRecords, source: string) {
  return source === "bodyweight"
    ? records.bodyweight
    : source === "steps"
      ? records.steps
      : records.waist;
}

function number(value: number | null | undefined, digits = 1) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(
        value,
      );
}

function action(label: string, onClick: () => void, quiet = false) {
  return (
    <button
      className={`dw-action${quiet ? " is-quiet" : ""}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Empty({
  children,
  actionLabel,
  onAction,
}: {
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="dw-empty">
      <span>{children}</span>
      {actionLabel && onAction ? action(actionLabel, onAction, true) : null}
    </div>
  );
}

function usePlotWidth() {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [plotWidth, setPlotWidth] = useState(300);
  const plotRef = useCallback((plot: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!plot) return;
    const updateWidth = () => {
      const nextWidth = Math.max(
        1,
        Math.round(plot.getBoundingClientRect().width),
      );
      setPlotWidth((current) => (current === nextWidth ? current : nextWidth));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(plot);
    observerRef.current = observer;
  }, []);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { plotRef, plotWidth };
}

function LinePlot({
  values,
  unit,
  height = 64,
}: {
  values: { date: string; value: number | null }[];
  unit: string;
  height?: number;
}) {
  const { plotRef, plotWidth } = usePlotWidth();
  return (
    <div ref={plotRef}>
      <SmoothTrend
        rows={values}
        unit={unit}
        width={plotWidth}
        height={height}
        label="Source history"
      />
    </div>
  );
}

function completionFor(habit: HabitRecord, date: string) {
  return habit.completions.find((entry) => entry.date === date)?.status;
}

function setHabit(
  records: SourceRecords,
  id: string,
  date: string,
  status: "done" | "skipped" | null,
): SourceRecords {
  return {
    ...records,
    habits: records.habits.map((habit) =>
      habit.id !== id
        ? habit
        : {
            ...habit,
            completions: [
              ...habit.completions.filter((entry) => entry.date !== date),
              ...(status ? [{ date, status }] : []),
            ],
          },
    ),
  };
}

function setTask(
  records: SourceRecords,
  id: string,
  completed: boolean,
): SourceRecords {
  return {
    ...records,
    tasks: records.tasks.map((task) =>
      task.id === id ? { ...task, completed } : task,
    ),
  };
}

function TaskRow({
  task,
  onToggle,
  interactive = true,
}: {
  task: ClientTask;
  onToggle: () => void;
  interactive?: boolean;
}) {
  return (
    <div className="dw-check-row">
      {interactive ? (
        <button
          type="button"
          className={`dw-check-toggle${task.completed ? " is-done" : ""}`}
          aria-label={`${task.completed ? "Undo" : "Complete"} ${task.title}`}
          onClick={onToggle}
        >
          {task.completed ? "Done" : "Mark done"}
        </button>
      ) : (
        <span className="dw-task-state">
          {task.completed ? "Done" : "Open"}
        </span>
      )}
      <span>
        {task.title}
        <small>
          {dateLabel(task.dueDate)} · {task.completed ? "Completed" : "Open"}
        </small>
      </span>
    </div>
  );
}

export function WidgetContent(props: ContentProps) {
  const layout = actualLayout(props.width, props.height);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState(() =>
    initialBodyBudget(props.width, props.height),
  );
  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      const width = Math.max(
        1,
        box.width -
          Number.parseFloat(styles.paddingLeft) -
          Number.parseFloat(styles.paddingRight),
      );
      const height = Math.max(
        1,
        box.height -
          Number.parseFloat(styles.paddingTop) -
          Number.parseFloat(styles.paddingBottom),
      );
      setBody((current) =>
        Math.abs(current.width - width) < 0.5 &&
        Math.abs(current.height - height) < 0.5
          ? current
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const adaptiveProps = {
    ...props,
    bodyWidth: body.width,
    bodyHeight: body.height,
  };
  return (
    <div
      ref={bodyRef}
      className={`dw-content dw-adaptive dw-${layout.toLowerCase()}${props.clientPreview ? " is-client-preview" : ""}`}
      data-layout={layout}
      data-kind={props.widget.kind}
      data-body-width={Math.round(body.width)}
      data-body-height={Math.round(body.height)}
    >
      {["BN15", "BN19"].includes(props.widget.kind) ? (
        <NutritionWidgetContent {...adaptiveProps} />
      ) : ["TL21", "TL22", "CU01", "CU02", "CU04", "CU10"].includes(
          props.widget.kind,
        ) ? (
        <CoachingWidgetContent {...adaptiveProps} />
      ) : (
        <ProgressWidgetContent {...adaptiveProps} />
      )}
    </div>
  );
}

function DetailRows({
  rows,
  unit,
}: {
  rows: { date: string; value: number | null }[];
  unit: string;
}) {
  return (
    <div className="dw-dated-rows">
      {[...rows].reverse().map((row) => (
        <div className="dw-data-row" key={row.date}>
          <span>
            {dateLabel(row.date, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <strong>
            {row.value == null ? "Not logged" : `${number(row.value)} ${unit}`}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function DetailContent({
  detail,
  records,
  clientPreview,
  onRecordsChange,
}: DetailProps) {
  const data = useMemo(() => {
    if (detail === "bodyweight")
      return {
        title: "Bodyweight history",
        rows: records.bodyweight,
        unit: "kg",
      };
    if (detail.startsWith("metric:")) {
      const source = detail.split(":")[1];
      const rows = numericSeries(records, source);
      return {
        title: `${source === "waist" ? "Waist" : source === "steps" ? "Steps" : "Bodyweight"} history`,
        rows,
        unit: rows.at(-1)?.unit ?? "",
      };
    }
    if (detail === "steps")
      return { title: "Step history", rows: records.steps, unit: "steps" };
    if (detail.startsWith("exercise:")) {
      const exerciseId = detail.split(":")[1];
      const sessions = records.exerciseSessions.filter(
        (session) => session.exerciseId === exerciseId,
      );
      return {
        title: `${sessions[0]?.exercise ?? exerciseId.replaceAll("-", " ")} sessions`,
        rows: sessions.map((session) => ({
          date: session.date,
          value: session.load,
        })),
        unit: sessions[0]?.unit ?? "",
      };
    }
    return null;
  }, [detail, records]);

  if (detail.startsWith("additional:"))
    return (
      <AdditionalDetailContent
        detail={detail}
        records={records}
        clientPreview={clientPreview}
        onRecordsChange={onRecordsChange}
      />
    );

  if (data)
    return (
      <section className="dw-detail">
        <h3>{data.title}</h3>
        <DetailRows rows={data.rows} unit={data.unit} />
        {detail.startsWith("exercise:") &&
          records.exerciseSessions
            .filter((session) => session.exerciseId === detail.split(":")[1])
            .map((session) => (
              <div className="dw-data-row" key={`session-${session.date}`}>
                <span>
                  {dateLabel(session.date)} · {session.exercise}
                </span>
                <strong>
                  {session.sets} sets × {session.reps} reps · {session.load}{" "}
                  {session.unit}
                </strong>
              </div>
            ))}
        {detail === "bodyweight" || detail === "metric:bodyweight" ? (
          <LinePlot values={data.rows} unit={data.unit} height={118} />
        ) : null}
      </section>
    );

  if (detail.startsWith("nutrition:")) {
    const active = detail.split(":")[1] === "active";
    const option =
      detail.split(":")[1] === "TD" || detail.split(":")[1] === "NTD"
        ? (detail.split(":")[1] as "TD" | "NTD")
        : records.activeNutritionOption;
    const days = records.macroIntake.filter((day) => day.option === option);
    const optionLabel = option === "TD" ? "Training day" : "Non-training day";
    return (
      <section className="dw-detail">
        <h3>{optionLabel} nutrition</h3>
        {active && (
          <div className="dw-switch-line">
            <span>Shared active option</span>
            <button
              type="button"
              onClick={() =>
                onRecordsChange({
                  ...records,
                  activeNutritionOption: option === "TD" ? "NTD" : "TD",
                })
              }
            >
              Switch to {option === "TD" ? "NTD" : "TD"}
            </button>
          </div>
        )}
        {days.length ? (
          days.map((day) => (
            <div className="dw-detail-group" key={day.date}>
              <h4>
                {dateLabel(day.date, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </h4>
              {(["protein", "carbs", "fat"] as const).map((macro) => {
                const target = records.macroTargets.find(
                  (entry) =>
                    entry.macro === macro &&
                    entry.option === option &&
                    entry.effectiveFrom <= day.date &&
                    (!entry.effectiveTo || entry.effectiveTo >= day.date),
                );
                const amount = day[macro];
                const goal = !target
                  ? "No target"
                  : target.kind === "range"
                    ? `Range ${target.low}–${target.high} ${target.unit}`
                    : target.kind === "minimum"
                      ? `Minimum ≥${target.low} ${target.unit}`
                      : `Fixed ${target.low} ${target.unit}`;
                return (
                  <div className="dw-data-row" key={macro}>
                    <span>
                      {macro} · target {goal}
                    </span>
                    <strong>
                      {amount == null ? "Not logged" : `${amount} g`}
                    </strong>
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <Empty>
            Nothing logged for this option. Targets remain available from the
            active plan.
          </Empty>
        )}
      </section>
    );
  }

  if (detail === "workouts")
    return (
      <section className="dw-detail">
        <h3>Assigned training</h3>
        {records.workoutSchedule
          .filter((session) => session.date >= records.client.asOf)
          .map((session) => {
            const plan = [...records.prescriptions]
              .filter((entry) => entry.effectiveFrom <= session.date)
              .sort((a, b) =>
                b.effectiveFrom.localeCompare(a.effectiveFrom),
              )[0];
            return (
              <div className="dw-detail-group" key={session.date}>
                <h4>
                  {session.name} · {plan?.label ?? `Week ${session.week}`} ·{" "}
                  {dateLabel(session.date)}
                </h4>
                {session.exercises.map((exercise) => (
                  <div className="dw-data-row" key={exercise.id}>
                    <span>
                      {exercise.name}
                      {plan?.exercises.find((entry) => entry.id === exercise.id)
                        ?.note
                        ? ` · ${plan.exercises.find((entry) => entry.id === exercise.id)?.note}`
                        : ""}
                    </span>
                    <strong>
                      {exercise.sets} × {exercise.reps}
                    </strong>
                  </div>
                ))}
              </div>
            );
          })}
        {records.prescriptions
          .filter((plan) => plan.effectiveFrom <= records.client.asOf)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
          .slice(0, 1)
          .map((plan) => (
            <div className="dw-detail-group" key={plan.week}>
              <h4>
                {plan.label} prescriptions · effective{" "}
                {dateLabel(plan.effectiveFrom)}
              </h4>
              {plan.exercises.map((exercise) => (
                <div className="dw-data-row" key={exercise.id}>
                  <span>
                    {exercise.name}
                    {exercise.note ? ` · ${exercise.note}` : ""}
                  </span>
                  <strong>
                    {exercise.sets} × {exercise.reps}
                  </strong>
                </div>
              ))}
            </div>
          ))}
      </section>
    );

  if (detail === "recovery")
    return (
      <section className="dw-detail">
        <h3>Recovery answers</h3>
        {records.recovery.map((field) => (
          <div className="dw-detail-group" key={field.field}>
            <h4>
              {field.label} · {field.scale.join(" / ")}
            </h4>
            {field.entries.map((entry) => (
              <div className="dw-data-row" key={entry.date}>
                <span>
                  {dateLabel(entry.date, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <strong>{entry.value}</strong>
              </div>
            ))}
          </div>
        ))}
      </section>
    );

  if (detail === "habits")
    return (
      <section className="dw-detail">
        <h3>Today’s habits</h3>
        {records.habits
          .filter((habit) => habit.scheduledDates.includes(records.client.asOf))
          .map((habit) => {
            const status = completionFor(habit, records.client.asOf);
            return (
              <div className="dw-check-row" key={habit.id}>
                <button
                  type="button"
                  className={`dw-check-toggle${status === "done" ? " is-done" : ""}`}
                  aria-label={`${status === "done" ? "Undo" : "Complete"} ${habit.name}`}
                  aria-pressed={status === "done"}
                  onClick={() =>
                    onRecordsChange(
                      setHabit(
                        records,
                        habit.id,
                        records.client.asOf,
                        status === "done" ? null : "done",
                      ),
                    )
                  }
                >
                  {status === "done" ? "Done" : "Mark done"}
                </button>
                <span>
                  {habit.name}
                  <small>
                    {habit.target} · {status ?? "Not logged"}
                  </small>
                </span>
              </div>
            );
          })}
      </section>
    );

  if (detail === "tasks")
    return (
      <section className="dw-detail">
        <h3>Client tasks</h3>
        {records.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={() =>
              onRecordsChange(setTask(records, task.id, !task.completed))
            }
          />
        ))}
      </section>
    );

  if (detail === "checkins")
    return (
      <section className="dw-detail">
        <h3>Check-in history</h3>
        {records.checkInSchedule.map((entry) => (
          <div className="dw-data-row" key={`${entry.date}-${entry.kind}`}>
            <span>
              {dateLabel(entry.date, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              · {entry.kind === "additional" ? "Added" : "Scheduled"}
            </span>
            <strong>Scheduled</strong>
          </div>
        ))}
        {records.checkIns.map((entry) => (
          <div className="dw-detail-group" key={entry.id}>
            <h4>
              {dateLabel(entry.date)} ·{" "}
              {entry.status === "feedback received"
                ? "Feedback received"
                : entry.status === "draft"
                  ? "Draft · not submitted"
                  : "Submitted"}
            </h4>
            <p>{entry.summary}</p>
            {entry.status !== "draft" && (
              <span>{entry.visualCount} submitted visuals</span>
            )}
          </div>
        ))}
      </section>
    );

  if (detail === "feedback")
    return (
      <section className="dw-detail">
        <h3>Published coach feedback</h3>
        {records.feedback.map((feedback) => (
          <article className="dw-detail-group" key={feedback.id}>
            <h4>
              {dateLabel(feedback.sentAt)} · {feedback.read ? "Read" : "Unread"}
            </h4>
            <p>{feedback.excerpt}</p>
            {feedback.video && <span>Video response available</span>}
            {feedback.links.map((link) => (
              <div className="dw-data-row" key={link.label}>
                <span>{link.label}</span>
                <strong>{link.destination}</strong>
              </div>
            ))}
          </article>
        ))}
      </section>
    );

  if (detail.startsWith("destination:")) {
    const destination = detail.split(":")[1];
    const panels: Record<string, string> = {
      Tracker: "bodyweight",
      Mealplan: "nutrition:active",
      Training: "workouts",
      "Check-in": "checkins",
      "Habit Tracker": "habits",
      Chat: "chat",
    };
    return (
      <DetailContent
        detail={panels[destination] ?? "bodyweight"}
        records={records}
        clientPreview={clientPreview}
        onRecordsChange={onRecordsChange}
      />
    );
  }

  if (detail === "chat")
    return (
      <section className="dw-detail">
        <h3>Coach conversation</h3>
        {records.messages.map((message) => (
          <div className="dw-detail-group" key={message.id}>
            <h4>
              {message.sender} ·{" "}
              {dateLabel(message.date, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              {message.unread ? " · Unread" : ""}
            </h4>
            <p>{message.excerpt}</p>
          </div>
        ))}
      </section>
    );

  return (
    <section className="dw-detail">
      <h3>Source history</h3>
      <p>
        {clientPreview
          ? "No additional client-visible records."
          : "No records are available for this source."}
      </p>
    </section>
  );
}
