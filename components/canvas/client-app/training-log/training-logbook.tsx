"use client";

import { Check, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useMemo, useState } from "react";
import {
  addDays,
  type CoachClient,
  formatDate,
  uid,
  type Variant,
} from "../../coach/model";
import { applicablePlan } from "../../coach/plans/domain";
import type { TrainingPlan, TrainingSessionLog } from "../../coach/plans/types";
import { useCoach } from "../../coach/store";
import { useLocalToday } from "../../coach/targets/use-local-today";
import { Empty } from "../../coach/ui";
import {
  Button,
  IconButton,
  Status,
} from "../../vari8/components";
import {
  DEFAULT_LOG_FIELDS,
  displayWeek,
  findLog,
  nextSession,
  type ScheduledSession,
  scheduledSessions,
  sessionStatus,
  startLog,
  STATUS_META,
  weekRange,
} from "./model";
import { SessionLogger } from "./session-logger";
import "./training-log.css";

export function TrainingLogbook({
  client,
  configuration,
}: {
  client: CoachClient;
  configuration: Variant;
}) {
  const { state, setState } = useCoach();
  const today = useLocalToday();
  const plan: TrainingPlan | undefined = client.plans
    ? applicablePlan(client.plans.training, today)
    : undefined;
  const currentWeek = plan ? displayWeek(plan, today) : 1;
  const [navWeek, setNavWeek] = useState<number | undefined>(undefined);
  const [selectedDay, setSelectedDay] = useState<string | undefined>(undefined);
  const week = navWeek ?? currentWeek;
  const [open, setOpen] = useState<ScheduledSession | undefined>(undefined);
  const logs = useMemo(
    () =>
      (state.trainingLogs ?? []).filter((log) => log.clientId === client.id),
    [state.trainingLogs, client.id],
  );

  if (!plan)
    return (
      <section className="cd-preview-section" aria-label="Training week">
        <Empty title="No training program yet" />
      </section>
    );

  const writeLog = (log: TrainingSessionLog) =>
    setState((s) => ({
      ...s,
      trainingLogs: [
        ...(s.trainingLogs ?? []).filter((entry) => entry.id !== log.id),
        log,
      ],
    }));

  const openSession = (item: ScheduledSession, create: boolean) => {
    if (create && !findLog(logs, plan.id, item.date, item.occurrenceKey)) {
      writeLog(
        startLog({
          id: uid("log"),
          clientId: client.id,
          plan,
          item,
          logFields: configuration.training.logFields ?? DEFAULT_LOG_FIELDS,
          loadUnit: configuration.training.loadUnit ?? "kg",
          now: new Date().toISOString(),
        }),
      );
    }
    setOpen(item);
  };

  if (open)
    return (
      <SessionLogger
        client={client}
        configuration={configuration}
        plan={plan}
        week={week}
        item={open}
        logs={logs}
        today={today}
        writeLog={writeLog}
        onBack={() => setOpen(undefined)}
      />
    );

  if (plan.rotation?.mode === "cycle")
    return (
      <section className="cd-preview-section" aria-label="Training week">
        <Empty title="Mesocycle view arrives in the next update" />
      </section>
    );

  const items = scheduledSessions(plan, week);
  const range = weekRange(plan, week);
  const next = nextSession(items, logs, today);
  const maxWeek = currentWeek + 1;
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(range.start, index),
  );
  const selected =
    selectedDay && days.includes(selectedDay) ? selectedDay : undefined;
  const visible = selected
    ? items.filter((item) => item.date === selected)
    : items;
  return (
    <section className="cd-preview-section ctl-week" aria-label="Training week">
      <header className="ctl-week-head">
        <IconButton
          label="Previous week"
          size="sm"
          disabled={week <= 1}
          onClick={() => setNavWeek(Math.max(1, week - 1))}
        >
          <ChevronLeft size={18} />
        </IconButton>
        <div className="ctl-week-title">
          <h2>Week {week}</h2>
          <span>
            {formatDate(range.start, { day: "numeric", month: undefined })}–
            {formatDate(range.end, { day: "numeric", month: "short" })}
          </span>
        </div>
        <IconButton
          label="Next week"
          size="sm"
          disabled={week >= maxWeek}
          onClick={() => setNavWeek(Math.min(maxWeek, week + 1))}
        >
          <ChevronRight size={18} />
        </IconButton>
      </header>
      <fieldset className="ctl-day-strip" aria-label="Days of the week">
        {days.map((date) => {
          const dayItem = items.find((item) => item.date === date);
          const dayStatus = dayItem
            ? sessionStatus(dayItem, logs, today)
            : undefined;
          return (
            <button
              key={date}
              type="button"
              className="ctl-day"
              data-session={dayItem ? true : undefined}
              data-today={date === today || undefined}
              data-done={dayStatus === "done" || undefined}
              data-before-start={date < plan.startDate || undefined}
              aria-pressed={selected === date}
              aria-label={formatDate(date, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              onClick={() =>
                setSelectedDay((current) =>
                  current === date ? undefined : date,
                )
              }
            >
              <span className="ctl-day-dow">
                {formatDate(date, {
                  weekday: "short",
                  day: undefined,
                  month: undefined,
                })}
              </span>
              <b>{formatDate(date, { day: "numeric", month: undefined })}</b>
              <i className="ctl-day-dot" aria-hidden="true" />
            </button>
          );
        })}
      </fieldset>
      <div className="ctl-session-list">
        {visible.map((item) => {
          const status = sessionStatus(item, logs, today);
          const meta = STATUS_META[status];
          const isNext = next === item;
          const log = findLog(logs, plan.id, item.date, item.occurrenceKey);
          return (
            <div
              className="ctl-session"
              key={item.occurrenceKey}
              data-status={status}
              data-next={isNext || undefined}
            >
              <button
                type="button"
                className="ctl-session-row"
                onClick={() => openSession(item, false)}
              >
                <span className="ctl-session-top">
                  <span className="ctl-session-date">
                    <b>{item.weekdayLabel || "Session"}</b>
                    <small>
                      {formatDate(item.date, {
                        day: "numeric",
                        month: "short",
                      })}
                    </small>
                  </span>
                  <Status tone={meta.tone}>
                    {status === "done" && (
                      <Check size={12} aria-hidden="true" />
                    )}
                    {meta.label}
                  </Status>
                </span>
                <span className="ctl-session-name">
                  <b>{item.session.name}</b>
                  <small>
                    {item.session.exercises.length}{" "}
                    {item.session.exercises.length === 1
                      ? "exercise"
                      : "exercises"}
                  </small>
                </span>
              </button>
              {isNext && (
                <Button
                  variant="primary"
                  className="ctl-session-start"
                  onClick={(event) => {
                    event.stopPropagation();
                    openSession(item, !log);
                  }}
                >
                  <Play size={15} aria-hidden="true" />
                  {log ? "Resume" : "Start"}
                </Button>
              )}
            </div>
          );
        })}
        {!items.length && <Empty title="No sessions this week" />}
        {items.length > 0 && !visible.length && selected && (
          <Empty
            title={`No session on ${formatDate(selected, {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}`}
          />
        )}
      </div>
    </section>
  );
}
