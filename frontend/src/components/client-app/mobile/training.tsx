"use client";

import { useMemo, useState } from "react";
import { type CoachClient, formatDate } from "../../coach/model";
import { trainingPlanAt } from "../../coach/plans/domain";
import {
  adjustmentBannerText,
  planForDisplayWeek,
} from "../../coach/plans/training/adjustments";
import {
  cellNotesFor,
  cellNotesList,
  exerciseNotesFor,
} from "../../coach/plans/training/logbook-model";
import type { TrainingCoachNote } from "../../coach/plans/types";
import { adjustmentForWeek, exerciseInfoFields } from "../../coach/plans/types";
import { useCoach } from "../../coach/store";
import { useLocalToday } from "../../coach/targets/use-local-today";
import { templateSetup } from "../../coach/template-setup";
import type { ScheduledSession } from "../training-log/model";
import {
  displayWeek,
  exerciseKey,
  findLog,
  previousPerformance,
  scheduledSessions,
  sessionStatus,
  weekRange,
} from "../training-log/model";

export function MobileTraining({
  client,
  onOpenSession,
  readOnly,
  embedded,
}: {
  client: CoachClient;
  onOpenSession: (item: ScheduledSession) => void;
  readOnly?: boolean;
  embedded?: boolean;
}) {
  const { state } = useCoach();
  const today = useLocalToday();
  const plan = client.plans
    ? trainingPlanAt(client.plans.training, today)
    : undefined;
  const currentWeek = plan ? Math.min(displayWeek(plan, today), plan.weeks) : 1;
  const [weekSel, setWeekSel] = useState<number | null>(null);
  const week = weekSel ?? currentWeek;
  const logs = state.trainingLogs ?? [];
  const configuration = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  // the selected week's own plan version — a mid-plan activation changes the
  // prescription for its week and onward
  const weekPlan = useMemo(() => {
    if (!client.plans || !plan) return plan;
    return (
      trainingPlanAt(client.plans.training, weekRange(plan, week).start) ?? plan
    );
  }, [client.plans, plan, week]);
  const displayPlan = weekPlan ? planForDisplayWeek(weekPlan, week) : undefined;
  const adjustment = displayPlan
    ? adjustmentForWeek(displayPlan, week)
    : undefined;
  const items = useMemo(
    () => (displayPlan ? scheduledSessions(displayPlan, week) : []),
    [displayPlan, week],
  );
  if (!plan) return <div className="cm-note">No training plan.</div>;
  const doneWeeks = new Set<number>();
  for (let w = 1; w <= plan.weeks; w++) {
    const wp = client.plans
      ? (trainingPlanAt(client.plans.training, weekRange(plan, w).start) ??
        plan)
      : plan;
    const wk = scheduledSessions(wp, w);
    if (wk.length && wk.every((i) => sessionStatus(i, logs, today) === "done"))
      doneWeeks.add(w);
  }
  const firstOpen = items.find((i) => sessionStatus(i, logs, today) !== "done");
  return (
    <>
      {!embedded && (
        <>
          <div className="cm-h1" style={{ marginBottom: 2 }}>
            {plan.name}
          </div>
          <div className="cm-mut" style={{ fontSize: 12.5, marginBottom: 12 }}>
            {plan.rotation?.mode === "weekly"
              ? `${Object.values(plan.rotation.weekdays).filter((v) => Array.isArray(v) && v.length > 0).length}-day split`
              : plan.rotation?.mode === "cycle"
                ? "Cycle"
                : "Program"}{" "}
            · {plan.weeks} weeks
          </div>
        </>
      )}
      <div
        ref={(el) => {
          if (el)
            el.querySelector(".cm-chipA")?.scrollIntoView({
              inline: "center",
              block: "nearest",
            });
        }}
        className="cm-row cm-weekrow"
        style={{ gap: 6, marginBottom: 12 }}
      >
        {Array.from({ length: plan.weeks }, (_, w) => w + 1).map((w) => (
          <button
            key={`w-${w}`}
            type="button"
            className={`cm-chip${w === week ? " cm-chipA" : ""}${w > currentWeek ? "" : ""}`}
            style={{ fontSize: 11.5, opacity: w > currentWeek ? 0.45 : 1 }}
            onClick={() => setWeekSel(w)}
          >
            {doneWeeks.has(w) ? "✓" : ""}W{w}
          </button>
        ))}
      </div>
      {adjustment && (
        <div className="cm-adjustment-banner" role="status">
          <strong>
            {adjustmentBannerText(
              adjustment,
              configuration?.training.intensity,
            )}
          </strong>
          {adjustment.note && <span>{adjustment.note}</span>}
        </div>
      )}
      {items.map((item) => {
        const st = sessionStatus(item, logs, today);
        const log = findLog(logs, plan.id, item.date, item.occurrenceKey);
        const isUpNext = item === firstOpen && week === currentWeek;
        return (
          <button
            key={item.occurrenceKey}
            type="button"
            className="cm-card cm-navcard"
            style={isUpNext ? { borderColor: "var(--cd-accent)" } : {}}
            onClick={() => onOpenSession(item)}
          >
            {st === "done" ? (
              <div className="cm-row" style={{ gap: 11, opacity: 0.7 }}>
                <span className="cm-tick on" style={{ width: 20, height: 20 }}>
                  <svg
                    aria-hidden="true"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {item.session.name}
                  </div>
                  <div className="cm-mut" style={{ fontSize: 12 }}>
                    Completed{" "}
                    {formatDate(item.date, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    {log?.finishedAt && log?.startedAt
                      ? ` · ${Math.max(1, Math.round((Date.parse(log.finishedAt) - Date.parse(log.startedAt)) / 60000))} min`
                      : ""}
                    {` · ${item.session.exercises.reduce((n, e) => n + e.sets.length, 0)} sets`}
                  </div>
                </div>
              </div>
            ) : isUpNext ? (
              <>
                <div
                  className="cm-row"
                  style={{ justifyContent: "space-between", marginBottom: 4 }}
                >
                  <span className="cm-chip cm-chipA" style={{ fontSize: 11 }}>
                    Up next
                  </span>
                  <span className="cm-mut" style={{ fontSize: 12 }}>
                    {item.session.exercises.length} exercises · ~
                    {Math.ceil(
                      (item.session.exercises.reduce(
                        (n, e) => n + e.sets.length,
                        0,
                      ) *
                        2.5) /
                        5,
                    ) * 5}{" "}
                    min
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  {item.session.name}
                </div>
                <div
                  className="cm-mut"
                  style={{ fontSize: 12, marginBottom: 8 }}
                >
                  {st === "in-progress" ? "In progress" : "Not started"}
                </div>
                {!readOnly && (
                  <span className="cm-btn cm-btnA" style={{ fontSize: 13 }}>
                    {st === "in-progress"
                      ? "Continue session"
                      : "Start session"}
                  </span>
                )}
              </>
            ) : (
              <div
                className="cm-row"
                style={{ justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {item.session.name}
                  </div>
                  <div className="cm-mut" style={{ fontSize: 12 }}>
                    {st === "in-progress" ? "In progress" : "Upcoming"}
                  </div>
                </div>
                <span className="cm-mut" style={{ fontSize: 12 }}>
                  {formatDate(item.date, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </>
  );
}

export function MobileSessionOverview({
  client,
  item,
  onStart,
  readOnly,
}: {
  client: CoachClient;
  item: ScheduledSession;
  onStart: () => void;
  readOnly?: boolean;
}) {
  const { state } = useCoach();
  const today = useLocalToday();
  const plan = client.plans
    ? trainingPlanAt(client.plans.training, today)
    : undefined;
  const configuration = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const tcfg = configuration?.training;
  const logs = state.trainingLogs ?? [];
  const log = plan
    ? findLog(logs, plan.id, item.date, item.occurrenceKey)
    : undefined;
  const totalSets = item.session.exercises.reduce(
    (n, e) => n + e.sets.length,
    0,
  );
  const est = Math.ceil((totalSets * 2.5) / 5) * 5;
  const done = log?.status === "finished";
  const itemWeek = plan ? displayWeek(plan, item.date) : 1;
  const adjustment = plan
    ? adjustmentForWeek(planForDisplayWeek(plan, itemWeek), itemWeek)
    : undefined;
  return (
    <>
      <div className="cm-h1" style={{ fontSize: 22, marginBottom: 4 }}>
        {item.session.name}
      </div>
      {adjustment && (
        <div className="cm-adjustment-banner" role="status">
          <strong>
            {adjustmentBannerText(
              adjustment,
              configuration?.training.intensity,
            )}
          </strong>
          {adjustment.note && <span>{adjustment.note}</span>}
        </div>
      )}
      <div className="cm-row" style={{ gap: 6, marginBottom: 12 }}>
        <span className="cm-chip cm-chipF">
          {item.session.exercises.length} exercises
        </span>
        <span className="cm-chip cm-chipF">~{est} min</span>
        <span className="cm-chip cm-chipF">{totalSets} sets</span>
      </div>
      {item.session.exercises.map((ex, i) => {
        const prev = plan
          ? previousPerformance(logs, {
              clientId: client.id,
              sessionId: item.session.id,
              exerciseKey: exerciseKey(ex),
              plan,
              date: item.date,
            })
          : undefined;
        const exNotes = plan
          ? [
              ...exerciseNotesFor(state.trainingNotes ?? [], {
                sessionId: item.session.id,
                exerciseKey: exerciseKey(ex),
                week: displayWeek(plan, item.date),
              }),
              ...cellNotesList(
                cellNotesFor(state.trainingNotes ?? [], {
                  sessionId: item.session.id,
                  exerciseKey: exerciseKey(ex),
                  week: displayWeek(plan, item.date),
                  setCount: ex.sets.length,
                }),
              ),
            ]
          : [];
        const intensity =
          tcfg?.intensity === "rir" || tcfg?.intensity === "rpe"
            ? tcfg.intensity
            : undefined;
        const exInfo = exerciseInfoFields(tcfg)
          .filter((f) => f !== "cues")
          .map((f) =>
            f === "equipment"
              ? ex.equipment
              : f === "movementPattern"
                ? ex.movementPattern
                : f === "position"
                  ? ex.position
                  : undefined,
          )
          .filter(Boolean);
        const setsText = ex.sets
          .map((s) => `${s.reps}${s.repsMax ? `–${s.repsMax}` : ""}`)
          .join(", ");
        return (
          <div key={ex.id} className="cm-card" style={{ padding: "10px 14px" }}>
            <div className="cm-row" style={{ gap: 10, alignItems: "baseline" }}>
              <span className="cm-mut" style={{ fontSize: 12, width: 16 }}>
                {i + 1}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{ex.name}</div>
                <div className="cm-mut" style={{ fontSize: 12 }}>
                  {ex.sets.length} × {setsText}
                  {intensity === "rir" && ex.sets[0]?.rir !== undefined
                    ? ` · RIR ${ex.sets[0].rir}`
                    : intensity === "rpe" && ex.sets[0]?.rpe !== undefined
                      ? ` · RPE ${ex.sets[0].rpe}`
                      : ""}
                  {ex.sets[0]?.rest ? ` · Rest ${ex.sets[0].rest}` : ""}
                </div>
                {exInfo.map((chip) => (
                  <div key={chip} className="cm-mut" style={{ fontSize: 11 }}>
                    {chip}
                  </div>
                ))}
              </div>
            </div>
            {exNotes.map((n: TrainingCoachNote) => (
              <div
                key={n.id}
                className="cm-cnote"
                style={{
                  display: "flex",
                  gap: 7,
                  alignItems: "flex-start",
                  background: "var(--cm-field, rgba(255,255,255,.05))",
                  borderRadius: 10,
                  padding: "8px 10px",
                  margin: "8px 0 0 26px",
                  fontSize: 11.5,
                  lineHeight: 1.45,
                }}
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  style={{
                    marginTop: 1,
                    flex: "none",
                    color: "var(--cm-muted)",
                  }}
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>
                  <b style={{ fontWeight: 600 }}>
                    {n.setIndex === undefined
                      ? "Coach"
                      : `Set ${n.setIndex + 1}`}
                    :
                  </b>{" "}
                  {n.text}
                </span>
              </div>
            ))}
            {prev && (
              <div
                className="cm-mut"
                style={{ fontSize: 11.5, marginTop: 6, marginLeft: 26 }}
              >
                Last: {prev.exercise.sets[0]?.weight ?? "—"} ×{" "}
                {prev.exercise.sets[0]?.reps ?? "—"}
              </div>
            )}
          </div>
        );
      })}
      {!readOnly && (
        <div style={{ position: "sticky", bottom: 0, padding: "12px 0 4px" }}>
          <button
            type="button"
            className="cm-btn cm-btnA"
            style={{ width: "100%", padding: 12 }}
            onClick={onStart}
          >
            {done ? "View log" : log ? "Continue session" : "Start session"}
          </button>
        </div>
      )}
    </>
  );
}
