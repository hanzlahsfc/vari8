"use client";

import { useEffect, useMemo, useState } from "react";
import { type CoachClient, formatDate, uid } from "../../coach/model";
import { applicablePlan } from "../../coach/plans/domain";
import { useCoach } from "../../coach/store";
import { useLocalToday } from "../../coach/targets/use-local-today";
import { templateSetup } from "../../coach/template-setup";
import {
  DEFAULT_LOG_FIELDS,
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
    ? applicablePlan(client.plans.training, today)
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
      logFields: configuration.training.logFields ?? DEFAULT_LOG_FIELDS,
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
  const curSet = ex.sets.findIndex((s) => !s.done);
  const elapsed = Date.now() - Date.parse(log.startedAt);
  const allDone = log.exercises.every((e) => e.sets.every((s) => s.done));
  const rest = (() => {
    const r = ex.prescription.sets[0]?.rest ?? "";
    const m = /(\d+)\s*(?:min|s)?/.exec(r);
    return m ? Number(m[1]) * (r.includes("min") ? 60 : 1) : 90;
  })();
  const hasRir = log.logFields.includes("rir");
  const hasRpe = log.logFields.includes("rpe");
  const hasNote = log.logFields.includes("note");
  const prev = previousPerformance(logs, {
    clientId: client.id,
    sessionId: item.session.id,
    exerciseKey: ex.exerciseKey,
    plan,
    date: item.date,
  });
  const targetSet = ex.prescription.sets[Math.min(curSet, ex.sets.length - 1)];
  const finish = () => {
    if (!allDone) {
      setConfirm(true);
      return;
    }
    writeLog(finishLog(log, new Date().toISOString()));
    onDone();
  };
  return (
    <>
      <div
        className="cm-row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>
            {log.sessionName}
          </div>
          <div className="cm-mut" style={{ fontSize: 11.5 }}>
            Exercise {exIdx + 1} of {log.exercises.length}
          </div>
        </div>
        <div className="cm-row" style={{ gap: 8 }}>
          <span
            className="cm-mut"
            style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}
          >
            {mmss(elapsed)}
          </span>
          <button
            type="button"
            className="cm-btn cm-btnA"
            style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={finish}
          >
            Finish
          </button>
        </div>
      </div>
      <div
        className="cm-row"
        style={{
          gap: 6,
          marginBottom: 12,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {log.exercises.map((e, i) => {
          const done = e.sets.filter((s) => s.done).length;
          return (
            <button
              key={e.exerciseId}
              type="button"
              className={`cm-chip${i === exIdx ? " cm-chipA" : ""}`}
              style={{ flexShrink: 0, fontSize: 11.5 }}
              onClick={() => setExIdx(i)}
            >
              {e.prescription.name.split(" ")[0]} · {done}/{e.sets.length}
            </button>
          );
        })}
      </div>
      <div
        className="cm-row"
        style={{ justifyContent: "space-between", marginBottom: 2 }}
      >
        <span
          style={{ fontSize: 17, fontWeight: 600, color: "var(--cd-accent)" }}
        >
          {ex.prescription.name}
        </span>
        <button
          type="button"
          className="cm-mut"
          style={{
            background: "none",
            border: 0,
            fontSize: 18,
            cursor: "pointer",
          }}
          aria-label="Exercise options"
        >
          ⋯
        </button>
      </div>
      <div className="cm-mut" style={{ fontSize: 12, marginBottom: 10 }}>
        {ex.prescription.sets.length} × {targetSet?.reps}
        {targetSet?.repsMax ? `–${targetSet.repsMax}` : ""}
        {hasRir && targetSet ? " · RIR" : ""}
        {hasNote && ex.prescription.instructions
          ? ` · ${ex.prescription.instructions}`
          : ""}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `24px 1fr 1fr${hasRir || hasRpe ? " 1fr" : ""} 40px`,
          gap: 6,
          marginBottom: 4,
        }}
      >
        <span
          className="cm-mut"
          style={{ fontSize: 10, textTransform: "uppercase" }}
        >
          #
        </span>
        <span
          className="cm-mut"
          style={{ fontSize: 10, textTransform: "uppercase" }}
        >
          {log.loadUnit.toUpperCase()}
        </span>
        <span
          className="cm-mut"
          style={{ fontSize: 10, textTransform: "uppercase" }}
        >
          Reps
        </span>
        {hasRir && (
          <span
            className="cm-mut"
            style={{ fontSize: 10, textTransform: "uppercase" }}
          >
            RIR
          </span>
        )}
        {hasRpe && (
          <span
            className="cm-mut"
            style={{ fontSize: 10, textTransform: "uppercase" }}
          >
            RPE
          </span>
        )}
        <span />
      </div>
      {ex.sets.map((set, i) => {
        const pres = ex.prescription.sets[i];
        const isCur = i === curSet;
        const prevSet = prev?.exercise.sets[i];
        return (
          <div
            key={set.setId}
            style={{
              display: "grid",
              gridTemplateColumns: `24px 1fr 1fr${hasRir || hasRpe ? " 1fr" : ""} 40px`,
              gap: 6,
              marginBottom: 6,
              background: isCur ? "var(--cm-soft)" : "transparent",
              borderRadius: 10,
              padding: "4px 0",
            }}
          >
            <span
              className="cm-mut"
              style={{ fontSize: 13, alignSelf: "center", textAlign: "center" }}
            >
              {i + 1}
            </span>
            <input
              className="cm-num cm-lb-pill"
              inputMode="decimal"
              placeholder={
                isCur
                  ? prevSet?.weight != null
                    ? String(prevSet.weight)
                    : ""
                  : ""
              }
              defaultValue={set.weight ?? ""}
              key={`w-${set.setId}-${exIdx}`}
              onBlur={(e) => {
                const v =
                  e.target.value.trim() === ""
                    ? null
                    : Number(e.target.value.replace(/,/g, ""));
                if (v !== null && !Number.isFinite(v)) {
                  e.target.value = String(set.weight ?? "");
                  return;
                }
                writeLog(
                  updateSet(log, ex.exerciseId, set.setId, { weight: v }),
                );
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              aria-label={`Weight set ${i + 1}`}
            />
            <input
              className="cm-num cm-lb-pill"
              inputMode="decimal"
              placeholder={
                isCur ? String(pres?.repsMax ?? pres?.reps ?? "") : ""
              }
              defaultValue={set.reps ?? ""}
              key={`r-${set.setId}-${exIdx}`}
              onBlur={(e) => {
                const v =
                  e.target.value.trim() === ""
                    ? null
                    : Number(e.target.value.replace(/,/g, ""));
                if (v !== null && !Number.isFinite(v)) {
                  e.target.value = String(set.reps ?? "");
                  return;
                }
                writeLog(updateSet(log, ex.exerciseId, set.setId, { reps: v }));
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              aria-label={`Reps set ${i + 1}`}
            />
            {(hasRir || hasRpe) && (
              <input
                className="cm-num cm-lb-pill"
                inputMode="decimal"
                defaultValue={hasRir ? (set.rir ?? "") : (set.rpe ?? "")}
                key={`x-${set.setId}-${exIdx}`}
                onBlur={(e) => {
                  const v =
                    e.target.value.trim() === ""
                      ? null
                      : Number(e.target.value.replace(/,/g, ""));
                  if (v !== null && !Number.isFinite(v)) {
                    e.target.value = String(
                      hasRir ? (set.rir ?? "") : (set.rpe ?? ""),
                    );
                    return;
                  }
                  writeLog(
                    updateSet(
                      log,
                      ex.exerciseId,
                      set.setId,
                      hasRir ? { rir: v } : { rpe: v },
                    ),
                  );
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                aria-label={hasRir ? `RIR set ${i + 1}` : `RPE set ${i + 1}`}
              />
            )}
            <button
              type="button"
              className={`cm-tick${set.done ? " on" : ""}`}
              onClick={() =>
                writeLog(
                  updateSet(log, ex.exerciseId, set.setId, { done: !set.done }),
                )
              }
              aria-label={`Set ${i + 1} done`}
            >
              <svg
                aria-hidden="true"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
          </div>
        );
      })}
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
      <div
        className="cm-row"
        style={{
          justifyContent: "space-between",
          marginTop: 12,
          paddingBottom: 8,
        }}
      >
        <button
          type="button"
          className="cm-cbtn"
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
          }}
          onClick={() => setRestLeft(rest)}
        >
          {restLeft != null ? mmss(restLeft * 1000) : mmss(rest * 1000)}
        </button>
        <button
          type="button"
          className="cm-btn cm-btnG"
          style={{ fontSize: 13 }}
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
