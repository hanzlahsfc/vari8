"use client";

// Card 11/#176 remote logbook. The canvas surface stays Lilly's: the
// same ctl-* classes, the same SessionLogger. What changed is the data
// source: the week list, the pinned prescription and every set write
// go through /api/v1 training-logs routes instead of the local demo
// store. Session scheduling differs too: the server's materialized week
// carries undated sessions (no weekday placement), so an unlogged
// session is startable "today" and a logged one renders on its
// performedDate.

import { Check, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  type CoachClient,
  formatDate,
  type Variant,
} from "../../coach/model";
import type {
  LoggedSet,
  TrainingExercise,
  TrainingPlan,
  TrainingSessionLog,
  TrainingSet,
} from "../../coach/plans/types";
import { useLocalToday } from "../../coach/targets/use-local-today";
import { Empty } from "../../coach/ui";
import {
  fetchOwnLogWeek,
  fetchOwnSessionLog,
  fetchOwnTrainingProgram,
  finishSessionLog,
  saveSetLog,
  startSessionLog,
  type OwnLogWeekWire,
  type OwnSessionLogWire,
  type SessionLogStatusWire,
  type WireExercise,
  type WireSession,
} from "../../data/training-logs";
import {
  Button,
  IconButton,
  Status,
} from "../../vari8/components";
import {
  DEFAULT_LOG_FIELDS,
  findLog,
  type ScheduledSession,
  type SessionStatus,
  STATUS_META,
  weekRange,
} from "./model";
import { SessionLogger } from "./session-logger";
import "./training-log.css";

/* ---------- wire → canvas adapters ---------- */

function toCanvasSet(set: {
  id: string;
  reps?: number;
  repsMax?: number;
  tempo?: string;
  type?: string;
  rest?: string;
  instructions?: string;
}): TrainingSet {
  return {
    id: set.id,
    reps: set.reps ?? 0,
    repsMax: set.repsMax,
    tempo: set.tempo ?? "",
    type: set.type ?? "",
    rest: set.rest ?? "",
    instructions: set.instructions ?? "",
  };
}

function toCanvasExercise(exercise: WireExercise): TrainingExercise {
  // Ordered setRows are the prescription's identity; a scalar `sets`
  // count synthesizes positional rows so every set still has an id.
  const rows = exercise.setRows?.length
    ? exercise.setRows.map(toCanvasSet)
    : Array.from({ length: exercise.sets ?? 0 }, (_, index) =>
        toCanvasSet({ id: `set-${index + 1}` }),
      );
  const out: TrainingExercise = {
    id: exercise.id,
    name: exercise.name,
    instructions: exercise.instructions ?? "",
    progression: exercise.progressionNotes ?? "",
    sets: rows,
  };
  if (exercise.libraryItemId) out.libraryId = exercise.libraryItemId;
  if (exercise.muscle) out.muscle = exercise.muscle;
  if (exercise.secondaryMuscles)
    out.secondaryMuscles = exercise.secondaryMuscles;
  if (exercise.generalNotes) out.generalNotes = exercise.generalNotes;
  return out;
}

function toCanvasSession(session: WireSession) {
  return {
    id: session.id,
    name: session.name,
    exercises: session.exercises.map(toCanvasExercise),
  };
}

function canvasPlan(input: {
  programId: string;
  clientId: string;
  title: string;
  startDate: string;
  weekCount: number;
  ongoing: boolean;
  sessionsByWeek: Record<number, WireSession[]>;
}): TrainingPlan {
  return {
    id: input.programId,
    clientId: input.clientId,
    name: input.title,
    startDate: input.startDate,
    program: input.ongoing ? "Evergreen" : "Week-based",
    weeks: input.weekCount,
    overrides: Object.fromEntries(
      Object.entries(input.sessionsByWeek).map(([week, sessions]) => [
        week,
        sessions.map(toCanvasSession),
      ]),
    ),
  };
}

const wireStatus = (status: SessionLogStatusWire) =>
  status === "IN_PROGRESS" ? "in-progress" : "finished";

function stubLog(
  row: OwnLogWeekWire["logs"][number],
  input: {
    programId: string;
    clientId: string;
    fields: Variant["training"]["logFields"];
    unit: "kg" | "lb";
  },
): TrainingSessionLog {
  return {
    id: row.sessionLogId,
    clientId: input.clientId,
    planId: input.programId,
    week: row.bookedWeek,
    occurrenceKey: `legacy:${row.sessionId}`,
    sessionId: row.sessionId,
    sessionName: row.sessionName,
    scheduledDate: row.performedDate,
    logFields: input.fields ?? DEFAULT_LOG_FIELDS,
    loadUnit: input.unit,
    exercises: [],
    status: wireStatus(row.status) as TrainingSessionLog["status"],
    startedAt: row.completedAt ?? "",
    finishedAt: row.completedAt ?? undefined,
  };
}

function fullLog(
  wire: OwnSessionLogWire,
  input: {
    clientId: string;
    fields: Variant["training"]["logFields"];
    unit: "kg" | "lb";
  },
): TrainingSessionLog {
  const exercises = wire.session.exercises.map((exercise) => {
    const prescription = toCanvasExercise(exercise);
    const saved = wire.sets.filter((s) => s.exerciseId === exercise.id);
    const sets: LoggedSet[] = prescription.sets.map((row, index) => {
      const hit =
        saved.find((s) => s.setId === row.id) ??
        saved.find((s) => s.position === index);
      return hit
        ? {
            setId: row.id,
            done: true,
            weight: hit.actuals.load ?? null,
            reps: hit.actuals.actualReps,
            rpe: hit.actuals.rpe ?? null,
            rir: null,
            note: hit.actuals.note ?? "",
            flagged: (hit.actuals.flags ?? []).length > 0,
          }
        : {
            setId: row.id,
            done: false,
            weight: null,
            reps: null,
            rpe: null,
            rir: null,
            note: "",
            flagged: false,
          };
    });
    // Client-added sets (no prescribed row) render after the prescribed.
    for (const extra of saved.filter(
      (s) => !prescription.sets.some((row) => row.id === s.setId),
    ))
      sets.push({
        setId: extra.setId,
        done: true,
        weight: extra.actuals.load ?? null,
        reps: extra.actuals.actualReps,
        rpe: extra.actuals.rpe ?? null,
        rir: null,
        note: extra.actuals.note ?? "",
        flagged: (extra.actuals.flags ?? []).length > 0,
      });
    return {
      exerciseId: exercise.id,
      exerciseKey: exercise.libraryItemId ?? exercise.id,
      prescription,
      sets,
    };
  });
  return {
    id: wire.sessionLogId,
    clientId: input.clientId,
    planId: wire.programId,
    week: wire.bookedWeek,
    occurrenceKey: `legacy:${wire.sessionId}`,
    sessionId: wire.sessionId,
    sessionName: wire.session.name,
    scheduledDate: wire.performedDate,
    logFields: input.fields ?? DEFAULT_LOG_FIELDS,
    loadUnit: input.unit,
    exercises,
    status: wireStatus(wire.status) as TrainingSessionLog["status"],
    startedAt: wire.startedAt,
    finishedAt: wire.completedAt ?? undefined,
  };
}

/** Sets that differ between two canvas logs: the rows to persist. */
function changedSets(
  next: TrainingSessionLog,
  prev: TrainingSessionLog | undefined,
) {
  const out: { exerciseId: string; position: number; set: LoggedSet }[] = [];
  for (const exercise of next.exercises) {
    const before = prev?.exercises.find(
      (e) => e.exerciseId === exercise.exerciseId,
    );
    exercise.sets.forEach((set, position) => {
      const old = before?.sets.find((s) => s.setId === set.setId);
      if (old && JSON.stringify(old) === JSON.stringify(set)) return;
      const untouched =
        !set.done &&
        set.weight === null &&
        set.reps === null &&
        set.rpe === null &&
        set.rir === null &&
        set.note === "" &&
        !set.flagged;
      if (untouched && !old) return;
      out.push({ exerciseId: exercise.exerciseId, position, set });
    });
  }
  return out;
}

/* ---------- the remote logbook ---------- */

export function RemoteTrainingLogbook({
  client,
  configuration,
  own,
}: {
  client: CoachClient;
  configuration: Variant;
  own: { workspaceId: string; clientProfileId: string };
}) {
  const today = useLocalToday();
  const fields = configuration.training.logFields ?? DEFAULT_LOG_FIELDS;
  const unit = configuration.training.loadUnit ?? "kg";
  const meta = useMemo(
    () => ({ clientId: client.id, fields, unit }),
    [client.id, fields, unit],
  );

  const [program, setProgram] = useState<{
    programId: string;
    title: string;
    startDate: string;
    weekCount: number;
    ongoing: boolean;
    weekIndex: number;
  } | null>(null);
  const [programError, setProgramError] = useState(false);
  const [sessionsByWeek, setSessionsByWeek] = useState<
    Record<number, WireSession[]>
  >({});
  const [weekRows, setWeekRows] = useState<
    Record<number, OwnLogWeekWire["logs"]>
  >({});
  const [logs, setLogs] = useState<TrainingSessionLog[]>([]);
  const logsRef = useRef<TrainingSessionLog[]>([]);
  const [navWeek, setNavWeek] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState<ScheduledSession | undefined>(undefined);
  const [saveError, setSaveError] = useState(false);
  // Remote writes queued or in flight; the beforeunload guard follows this.
  const [pendingWrites, setPendingWrites] = useState(0);

  // Serialized write queue: start must land before the first set save.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const startedRef = useRef<Map<string, string>>(new Map());
  const naturalKey = (sessionId: string, date: string) =>
    `${sessionId}:${date}`;

  const applyLogs = useCallback(
    (updater: (cur: TrainingSessionLog[]) => TrainingSessionLog[]) => {
      setLogs((cur) => {
        const next = updater(cur);
        logsRef.current = next;
        return next;
      });
    },
    [],
  );

  const week = program?.ongoing ? 1 : (navWeek ?? program?.weekIndex ?? 1);
  const maxWeek = (program?.weekIndex ?? 1) + 1;

  const loadWeek = useCallback(
    (w: number) => {
      let live = true;
      fetchOwnTrainingProgram(own.workspaceId, w)
        .then((view) => {
          if (!live) return;
          if (!view.current) {
            setProgram(null);
            return;
          }
          setProgram({
            programId: view.current.programId,
            title: view.current.title,
            startDate: view.current.startDate,
            weekCount: view.current.weekCount,
            ongoing: view.current.ongoing,
            weekIndex: view.current.weekIndex,
          });
          if (view.current.week)
            setSessionsByWeek((cur) => ({
              ...cur,
              [view.current!.week!.week]: view.current!.week!.sessions,
            }));
        })
        .catch(() => {
          if (live) setProgramError(true);
        });
      fetchOwnLogWeek(own.workspaceId, w)
        .then((page) => {
          if (!live || !page) return;
          setWeekRows((cur) => ({ ...cur, [w]: page.logs }));
          const incoming = page.logs
            .filter((row) => row.status !== "SKIPPED")
            .map((row) =>
              stubLog(row, {
                programId: page.programId,
                clientId: meta.clientId,
                fields: meta.fields,
                unit: meta.unit,
              }),
            );
          applyLogs((cur) => {
            // A hydrated log (exercises loaded) or a local one the page
            // does not know yet outranks a fresh stub; bare stubs get
            // refreshed to server truth.
            const kept = cur.filter((l) => {
              const hit = incoming.some(
                (s) =>
                  s.occurrenceKey === l.occurrenceKey &&
                  s.scheduledDate === l.scheduledDate,
              );
              return !hit || l.exercises.length > 0;
            });
            for (const s of incoming)
              if (
                !kept.some(
                  (l) =>
                    l.occurrenceKey === s.occurrenceKey &&
                    l.scheduledDate === s.scheduledDate,
                )
              )
                kept.push(s);
            return kept;
          });
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    },
    [own.workspaceId, meta, applyLogs],
  );

  useEffect(() => loadWeek(week), [loadWeek, week]);

  const plan = useMemo(
    () =>
      program
        ? canvasPlan({
            programId: program.programId,
            clientId: client.id,
            title: program.title,
            startDate: program.startDate,
            weekCount: program.weekCount,
            ongoing: program.ongoing,
            sessionsByWeek,
          })
        : undefined,
    [program, client.id, sessionsByWeek],
  );

  /** Persist one canvas-log mutation: start if needed, save changed sets. */
  const writeLog = useCallback(
    (next: TrainingSessionLog) => {
      if (!plan) return;
      const prev = logsRef.current.find(
        (l) =>
          l.occurrenceKey === next.occurrenceKey &&
          l.scheduledDate === next.scheduledDate,
      );
      const changes = changedSets(next, prev);
      const finishing =
        next.status === "finished" && prev?.status !== "finished";
      applyLogs((cur) => [
        ...cur.filter(
          (l) =>
            !(
              l.occurrenceKey === next.occurrenceKey &&
              l.scheduledDate === next.scheduledDate
            ),
        ),
        next,
      ]);
      if (changes.length === 0 && !finishing) return;
      const programId = plan.id;
      const sessionId = next.sessionId;
      const date = next.scheduledDate;
      const bookedWeek = next.week;
      const key = naturalKey(sessionId, date);
      const prescribed = next.exercises.flatMap((e) =>
        e.prescription.sets.map((s) => ({ exerciseId: e.exerciseId, set: s })),
      );
      setPendingWrites((n) => n + 1);
      queue.current = queue.current.then(async () => {
        try {
          let logId = startedRef.current.get(key);
          if (!logId) {
            const started = await startSessionLog(own.workspaceId, {
              programId,
              sessionId,
              bookedWeek,
              performedDate: date,
            });
            logId = started.sessionLogId;
            startedRef.current.set(key, logId);
            applyLogs((cur) =>
              cur.map((l) =>
                l.occurrenceKey === next.occurrenceKey &&
                l.scheduledDate === next.scheduledDate
                  ? { ...l, id: logId! }
                  : l,
              ),
            );
          }
          for (const change of changes) {
            const prescribedSet = prescribed.find(
              (p) =>
                p.exerciseId === change.exerciseId &&
                p.set.id === change.set.setId,
            )?.set;
            await saveSetLog(own.workspaceId, logId, {
              exerciseId: change.exerciseId,
              position: change.position,
              set: {
                setId: change.set.setId,
                actualReps: change.set.reps ?? prescribedSet?.reps ?? 0,
                ...(change.set.weight !== null
                  ? { load: change.set.weight }
                  : {}),
                loadUnit: unit,
                ...(change.set.rpe !== null ? { rpe: change.set.rpe } : {}),
                ...(change.set.note !== "" ? { note: change.set.note } : {}),
                flags: change.set.flagged ? ["checkin-review"] : [],
              },
            });
          }
          if (finishing)
            await finishSessionLog(own.workspaceId, logId, "completed");
          setSaveError(false);
        } catch {
          setSaveError(true);
          // Resync the open log to wire truth: failed writes never linger.
          const logId = startedRef.current.get(key);
          if (logId)
            fetchOwnSessionLog(own.workspaceId, logId)
              .then((wire) =>
                applyLogs((cur) => [
                  ...cur.filter((l) => l.id !== logId),
                  fullLog(wire, meta),
                ]),
              )
              .catch(() => undefined);
        } finally {
          setPendingWrites((n) => Math.max(0, n - 1));
        }
      });
    },
    [plan, own.workspaceId, meta, unit, applyLogs],
  );

  // Dirty-only beforeunload: warn while a remote write is queued or in flight,
  // dropped as soon as the chain settles (a finished session goes quiet).
  useEffect(() => {
    if (pendingWrites === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingWrites]);

  const openSession = useCallback(
    (item: ScheduledSession, log?: TrainingSessionLog) => {
      // Hydrate the full log (sets) before the logger opens; a stub has
      // no exercises, a local pending log always does.
      if (log && log.exercises.length === 0) {
        fetchOwnSessionLog(own.workspaceId, log.id)
          .then((wire) => {
            applyLogs((cur) => [
              ...cur.filter((l) => l.id !== wire.sessionLogId),
              fullLog(wire, meta),
            ]);
            setOpen(item);
          })
          .catch(() => setOpen(item));
      } else {
        setOpen(item);
      }
    },
    [own.workspaceId, meta, applyLogs],
  );

  if (programError)
    return (
      <section className="cd-preview-section" aria-label="Training week">
        <Empty title="Training program could not be loaded" />
      </section>
    );
  if (!program || !plan)
    return (
      <section className="cd-preview-section" aria-label="Training week">
        <Empty title="No training program yet" />
      </section>
    );

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

  const weekSessions = sessionsByWeek[week];
  const items: ScheduledSession[] = [];
  if (weekSessions) {
    const rows = weekRows[week] ?? [];
    for (const session of weekSessions) {
      const sessionLogs = rows.filter(
        (row) => row.sessionId === session.id && row.status !== "SKIPPED",
      );
      if (sessionLogs.length === 0) {
        items.push({
          occurrenceKey: `legacy:${session.id}`,
          date: week === program.weekIndex ? today : weekRange(plan, week).start,
          session: toCanvasSession(session),
          weekdayLabel: "",
        });
      } else {
        for (const row of sessionLogs)
          items.push({
            occurrenceKey: `legacy:${session.id}`,
            date: row.performedDate,
            session: toCanvasSession(session),
            weekdayLabel: "",
          });
      }
    }
    // Logs whose session left the current materialized week still render.
    for (const row of rows)
      if (
        row.status !== "SKIPPED" &&
        !weekSessions.some((s) => s.id === row.sessionId)
      )
        items.push({
          occurrenceKey: `legacy:${row.sessionId}`,
          date: row.performedDate,
          session: { id: row.sessionId, name: row.sessionName, exercises: [] },
          weekdayLabel: "",
        });
  }

  const range = weekRange(plan, week);
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(range.start, index),
  );
  const statusOf = (item: ScheduledSession): SessionStatus => {
    const log = findLog(logs, plan.id, item.date, item.occurrenceKey);
    if (log?.status === "finished") return "done";
    if (log) return "in-progress";
    if (item.date === today) return "today";
    if (item.date > today) return "upcoming";
    return "missed";
  };
  const next =
    items.find((item) =>
      ["in-progress", "today"].includes(statusOf(item)),
    ) ?? items.find((item) => statusOf(item) === "upcoming");

  return (
    <section className="cd-preview-section ctl-week" aria-label="Training week">
      <header className="ctl-week-head">
        <IconButton
          label="Previous week"
          size="sm"
          disabled={week <= 1 || program.ongoing}
          onClick={() => setNavWeek(Math.max(1, week - 1))}
        >
          <ChevronLeft size={18} />
        </IconButton>
        <div className="ctl-week-title">
          <h2>Week {week}</h2>
          <span>
            {formatDate(range.start, { day: "numeric", month: undefined })}-
            {formatDate(range.end, { day: "numeric", month: "short" })}
          </span>
        </div>
        <IconButton
          label="Next week"
          size="sm"
          disabled={week >= maxWeek || program.ongoing}
          onClick={() => setNavWeek(Math.min(maxWeek, week + 1))}
        >
          <ChevronRight size={18} />
        </IconButton>
      </header>
      <fieldset className="ctl-day-strip" aria-label="Days of the week">
        {days.map((date) => {
          const logged = items.some(
            (item) => item.date === date && statusOf(item) === "done",
          );
          return (
            <button
              key={date}
              type="button"
              className="ctl-day"
              data-session={
                items.some((item) => item.date === date) || undefined
              }
              data-today={date === today || undefined}
              data-done={logged || undefined}
              data-before-start={date < plan.startDate || undefined}
              aria-label={formatDate(date, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
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
      {saveError && (
        <p className="cd-caption" role="alert">
          A set could not be saved: the last saved state is shown.
        </p>
      )}
      <div className="ctl-session-list">
        {weekSessions === undefined ? (
          <Empty title="Loading week…" />
        ) : (
          items.map((item) => {
            const status = statusOf(item);
            const isNext = next === item;
            const log = findLog(logs, plan.id, item.date, item.occurrenceKey);
            return (
              <div
                className="ctl-session"
                key={`${item.occurrenceKey}:${item.date}`}
                data-status={status}
                data-next={isNext || undefined}
              >
                <button
                  type="button"
                  className="ctl-session-row"
                  onClick={() => openSession(item, log)}
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
                    <Status tone={STATUS_META[status].tone}>
                      {status === "done" && (
                        <Check size={12} aria-hidden="true" />
                      )}
                      {STATUS_META[status].label}
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
                      openSession(item, log);
                    }}
                  >
                    <Play size={15} aria-hidden="true" />
                    {log ? "Resume" : "Start"}
                  </Button>
                )}
              </div>
            );
          })
        )}
        {weekSessions !== undefined && !items.length && (
          <Empty title="No sessions this week" />
        )}
      </div>
    </section>
  );
}
