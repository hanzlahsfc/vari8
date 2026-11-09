"use client";

import { Flag, StickyNote } from "lucide-react";
import {
  type CSSProperties,
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type CoachClient, formatDate, uid } from "../../coach/model";
import { trainingPlanAt } from "../../coach/plans/domain";
import {
  adjustmentBannerText,
  planForDisplayWeek,
} from "../../coach/plans/training/adjustments";
import {
  cellNotesFor,
  exerciseNotesFor,
} from "../../coach/plans/training/logbook-model";
import { adjustmentForWeek, exerciseInfoFields } from "../../coach/plans/types";
import { useCoach } from "../../coach/store";
import { useLocalToday } from "../../coach/targets/use-local-today";
import { templateSetup } from "../../coach/template-setup";
import {
  displayWeek,
  effectiveLogFields,
  findLog,
  finishLog,
  notDoneCount,
  previousPerformance,
  type ScheduledSession,
  startLog,
  updateSet,
} from "../training-log/model";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function MobileLogbook({
  client,
  item,
  onDone,
}: {
  client: CoachClient;
  item: ScheduledSession;
  onDone: () => void;
}) {
  const { state, setState } = useCoach();
  const today = useLocalToday();
  const plan = client.plans
    ? trainingPlanAt(client.plans.training, today)
    : undefined;
  const configuration = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const logs = state.trainingLogs ?? [];
  const existing = plan
    ? findLog(logs, plan.id, item.date, item.occurrenceKey)
    : undefined;
  const [, setTick] = useState(0);
  const [exIdx, setExIdx] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (restLeft == null) return;
    const t = setInterval(
      () => setRestLeft((v) => (v == null || v <= 0 ? null : v - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [restLeft]);
  const log = useMemo(() => {
    if (existing) return existing;
    if (!plan || !configuration) return undefined;
    return startLog({
      id: uid("log"),
      clientId: client.id,
      plan,
      item,
      logFields: effectiveLogFields(configuration.training),
      loadUnit: configuration.training.loadUnit ?? "kg",
      now: new Date().toISOString(),
    });
  }, [existing, plan, configuration, client.id, item]);
  // persist the in-progress log on first render
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot mount effect
  useEffect(() => {
    if (log && !existing) {
      setState((s) => ({
        ...s,
        trainingLogs: [
          ...(s.trainingLogs ?? []).filter((e) => e.id !== log.id),
          log,
        ],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!log || !plan) return <div className="cm-note">Nothing to log.</div>;
  const writeLog = (next: typeof log) =>
    setState((s) => ({
      ...s,
      trainingLogs: [
        ...(s.trainingLogs ?? []).filter((e) => e.id !== next.id),
        next,
      ],
    }));
  const ex = log.exercises[exIdx];
  const itemWeek = plan ? displayWeek(plan, item.date) : 1;
  const adjustment = plan
    ? adjustmentForWeek(planForDisplayWeek(plan, itemWeek), itemWeek)
    : undefined;
  const curSet = ex.sets.findIndex((s) => !s.done);
  const elapsed = Date.now() - Date.parse(log.startedAt);
  const allDone = log.exercises.every((e) => e.sets.every((s) => s.done));
  const rest = (() => {
    const r = ex.prescription.sets[0]?.rest ?? "";
    const m = /(\d+)\s*(?:min|s)?/.exec(r);
    return m ? Number(m[1]) * (r.includes("min") ? 60 : 1) : 90;
  })();
  const infoChips = exerciseInfoFields(configuration?.training)
    .filter((f) => f !== "cues")
    .map((f) =>
      f === "equipment"
        ? ex.prescription.equipment
        : f === "movementPattern"
          ? ex.prescription.movementPattern
          : f === "position"
            ? ex.prescription.position
            : undefined,
    )
    .filter(Boolean) as string[];
  const hasRir = log.logFields.includes("rir");
  const hasRpe = log.logFields.includes("rpe");
  const hasNote = log.logFields.includes("note");
  const hasWeight = log.logFields.includes("weight");
  const hasReps = log.logFields.includes("reps");
  // set-row grid: set# + one column per logged field + note icon + tick
  const setGridCols = `24px${hasWeight ? " minmax(0,1fr)" : ""}${hasReps ? " minmax(0,1fr)" : ""}${hasRir || hasRpe ? " minmax(0,1fr)" : ""}${hasNote ? " 32px" : ""} 32px`;
  const cellNotes = cellNotesFor(state.trainingNotes ?? [], {
    sessionId: item.session.id,
    exerciseKey: ex.exerciseKey,
    week: plan ? displayWeek(plan, item.date) : 0,
    setCount: ex.prescription.sets.length,
  });
  const exNotes = exerciseNotesFor(state.trainingNotes ?? [], {
    sessionId: item.session.id,
    exerciseKey: ex.exerciseKey,
    week: plan ? displayWeek(plan, item.date) : 0,
  });
  // notes attached to set index i ("${i}:field" keys) → small muted lines
  const setNotesAt = (i: number) =>
    Object.entries(cellNotes)
      .filter(([k]) => k.startsWith(`${i}:`))
      .flatMap(([, list]) => list);
  const prev = previousPerformance(logs, {
    clientId: client.id,
    sessionId: item.session.id,
    exerciseKey: ex.exerciseKey,
    plan,
    date: item.date,
  });
  const targetSet =
    ex.prescription.sets[curSet < 0 ? 0 : Math.min(curSet, ex.sets.length - 1)];
  const finish = () => {
    if (!allDone) {
      setConfirm(true);
      return;
    }
    writeLog(finishLog(log, new Date().toISOString()));
    onDone();
  };
  const numField = (
    set: (typeof ex.sets)[number],
    field: "weight" | "reps" | "rir" | "rpe",
    label: string,
    placeholder: string,
  ) => (
    <input
      className="cm-lb-input"
      inputMode="decimal"
      placeholder={placeholder}
      defaultValue={set[field] ?? ""}
      key={`${field}-${set.setId}-${exIdx}`}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        const v = raw === "" ? null : Number(raw.replace(/,/g, "."));
        if (v !== null && !Number.isFinite(v)) {
          e.target.value = String(set[field] ?? "");
          return;
        }
        writeLog(updateSet(log, ex.exerciseId, set.setId, { [field]: v }));
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      aria-label={label}
    />
  );
  const intensityField = hasRir ? "rir" : "rpe";
  const prescriptionLine = [
    `${ex.prescription.sets.length} × ${targetSet?.reps ?? ""}${targetSet?.repsMax ? `–${targetSet.repsMax}` : ""}`,
    hasRir && targetSet?.rir !== undefined
      ? `RIR ${targetSet.rir}`
      : hasRpe && targetSet?.rpe !== undefined
        ? `RPE ${targetSet.rpe}`
        : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <div className="cm-lb-top">
        <div>
          <div className="cm-lb-session">{log.sessionName}</div>
          <div className="cm-mut cm-lb-progress">
            Exercise {exIdx + 1} of {log.exercises.length} · {mmss(elapsed)}
          </div>
        </div>
        <button type="button" className="cm-btn cm-btnA" onClick={finish}>
          Finish
        </button>
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
      <div className="cm-lb-chips">
        {log.exercises.map((e, i) => {
          const done = e.sets.filter((s) => s.done).length;
          return (
            <button
              key={e.exerciseId}
              type="button"
              className={`cm-chip${i === exIdx ? " cm-chipA" : ""}`}
              title={e.prescription.name}
              onClick={() => setExIdx(i)}
            >
              <span className="cm-lb-chipname">{e.prescription.name}</span>
              <span>
                {done}/{e.sets.length}
              </span>
            </button>
          );
        })}
      </div>
      <div className="cm-lb-title">
        <h2>{ex.prescription.name}</h2>
        <p className="cm-lb-rx">{prescriptionLine}</p>
        {infoChips.length > 0 && (
          <p className="cm-mut cm-lb-info">{infoChips.join(" · ")}</p>
        )}
        {hasNote && ex.prescription.instructions && (
          <p className="cm-mut cm-lb-cue">{ex.prescription.instructions}</p>
        )}
      </div>
      {exNotes.map((n) => (
        <div key={n.id} className="cm-lb-coach">
          <b className="cm-lb-coach-label">Coach</b>
          <span>{n.text}</span>
        </div>
      ))}
      <div
        className="cm-card cm-lb-sets"
        style={{ "--lb-cols": setGridCols } as CSSProperties}
      >
        <div className="cm-lb-row cm-lb-head" aria-hidden="true">
          <span>Set</span>
          {hasWeight && <span>{log.loadUnit}</span>}
          {hasReps && <span>Reps</span>}
          {(hasRir || hasRpe) && <span>{hasRir ? "RIR" : "RPE"}</span>}
          {hasNote && <span />}
          <span />
        </div>
        {ex.sets.map((set, i) => {
          const pres = ex.prescription.sets[i];
          const prevSet = prev?.exercise.sets[i];
          const rowSetNotes = setNotesAt(i);
          const noteOpen =
            openNotes[set.setId] ?? Boolean(set.note || set.flagged);
          const target = hasRir ? pres?.rir : pres?.rpe;
          return (
            <Fragment key={set.setId}>
              <div
                className="cm-lb-row"
                data-current={i === curSet || undefined}
                data-done={set.done || undefined}
              >
                <span className="cm-lb-index">{i + 1}</span>
                {hasWeight &&
                  numField(
                    set,
                    "weight",
                    `Weight set ${i + 1}`,
                    prevSet?.weight != null ? String(prevSet.weight) : "",
                  )}
                {hasReps &&
                  numField(
                    set,
                    "reps",
                    `Reps set ${i + 1}`,
                    String(pres?.repsMax ?? pres?.reps ?? ""),
                  )}
                {(hasRir || hasRpe) &&
                  numField(
                    set,
                    intensityField,
                    `${hasRir ? "RIR" : "RPE"} set ${i + 1}`,
                    target !== undefined ? String(target) : "",
                  )}
                {hasNote && (
                  <button
                    type="button"
                    className="cm-lb-icon"
                    data-active={set.flagged || undefined}
                    data-has-note={(set.note && !set.flagged) || undefined}
                    onClick={() =>
                      setOpenNotes((o) => ({ ...o, [set.setId]: !noteOpen }))
                    }
                    aria-label={`Note for set ${i + 1}`}
                    aria-expanded={noteOpen}
                  >
                    {set.flagged ? (
                      <Flag size={15} aria-hidden="true" />
                    ) : (
                      <StickyNote size={15} aria-hidden="true" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className={`cm-tick cm-lb-tick${set.done ? " on" : ""}`}
                  onClick={() =>
                    writeLog(
                      updateSet(log, ex.exerciseId, set.setId, {
                        done: !set.done,
                      }),
                    )
                  }
                  aria-label={`Set ${i + 1} done`}
                  aria-pressed={set.done}
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </button>
              </div>
              {hasNote && noteOpen && (
                <div className="cm-lb-noterow">
                  <input
                    className="cm-lb-input cm-lb-noteinput"
                    placeholder="Note for your coach"
                    defaultValue={set.note}
                    key={`n-${set.setId}-${exIdx}`}
                    onBlur={(e) =>
                      writeLog(
                        updateSet(log, ex.exerciseId, set.setId, {
                          note: e.target.value.trim(),
                        }),
                      )
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" && e.currentTarget.blur()
                    }
                    aria-label={`Set ${i + 1} note for coach`}
                  />
                  <button
                    type="button"
                    className="cm-lb-flag"
                    aria-pressed={set.flagged}
                    aria-label="Flag for coach"
                    onClick={() =>
                      writeLog(
                        updateSet(log, ex.exerciseId, set.setId, {
                          flagged: !set.flagged,
                        }),
                      )
                    }
                  >
                    <Flag size={13} aria-hidden="true" /> Flag
                  </button>
                </div>
              )}
              {rowSetNotes.map((n) => (
                <p key={n.id} className="cm-lb-setnote">
                  Coach: {n.text}
                </p>
              ))}
            </Fragment>
          );
        })}
      </div>
      {prev && (
        <div
          className="cm-card"
          style={{ padding: "10px 14px", marginTop: 10 }}
        >
          <div className="cm-mut" style={{ fontSize: 11.5, marginBottom: 6 }}>
            Last time ·{" "}
            {formatDate(prev.date, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </div>
          {prev.exercise.sets.map((s, i) => (
            <div key={s.setId} className="cm-mut" style={{ fontSize: 12 }}>
              Set {i + 1} · {s.weight ?? "—"} {log.loadUnit} × {s.reps ?? "—"}
            </div>
          ))}
        </div>
      )}
      <div className="cm-lb-footer">
        <button
          type="button"
          className="cm-cbtn cm-lb-rest"
          onClick={() => setRestLeft(rest)}
          aria-label="Start rest timer"
        >
          {restLeft != null ? mmss(restLeft * 1000) : mmss(rest * 1000)}
        </button>
        <button
          type="button"
          className="cm-btn cm-btnG"
          onClick={() =>
            setExIdx(Math.min(exIdx + 1, log.exercises.length - 1))
          }
        >
          Next exercise
        </button>
      </div>
      {confirm && (
        <>
          <button
            type="button"
            className="cm-dim"
            onClick={() => setConfirm(false)}
            aria-label="Cancel"
          />
          <div
            className="cm-sheet"
            style={{ top: "auto", borderRadius: "18px 18px 0 0" }}
          >
            <div className="cm-sheet-head" style={{ paddingTop: 18 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>
                  Finish session?
                </div>
                <div className="cm-mut" style={{ fontSize: 12 }}>
                  {notDoneCount(log)} sets still open — finish anyway?
                </div>
              </div>
            </div>
            <div className="cm-row" style={{ gap: 8, padding: "0 18px 20px" }}>
              <button
                type="button"
                className="cm-btn cm-btnG"
                style={{ flex: 1 }}
                onClick={() => setConfirm(false)}
              >
                Keep going
              </button>
              <button
                type="button"
                className="cm-btn cm-btnA"
                style={{ flex: 1 }}
                onClick={() => {
                  writeLog(finishLog(log, new Date().toISOString()));
                  onDone();
                }}
              >
                Finish anyway
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
