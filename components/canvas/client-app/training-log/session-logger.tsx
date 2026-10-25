"use client";

import { Check, ChevronLeft, Flag, StickyNote } from "lucide-react";
import { useState } from "react";
import {
  type CoachClient,
  formatDate,
  uid,
  type Variant,
} from "../../coach/model";
import type {
  LoggedSet,
  TrainingExercise,
  TrainingPlan,
  TrainingSessionLog,
} from "../../coach/plans/types";
import {
  Button,
  Card,
  IconButton,
  Input,
  Modal,
  Status,
  Toggle,
} from "../../vari8/components";
import { DateTimePicker } from "../../vari8/inputs";
import {
  DEFAULT_LOG_FIELDS,
  findLog,
  finishLog,
  notDoneCount,
  previousPerformance,
  type ScheduledSession,
  startLog,
  updateSet,
} from "./model";

const hasField = (configuration: Variant, label: string) =>
  configuration.training.fields.includes(label);

const numOrNull = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

function repsText(set: { reps: number; repsMax?: number }): string {
  return `×${set.repsMax !== undefined && set.repsMax > set.reps ? `${set.reps}–${set.repsMax}` : set.reps}`;
}

function previousLine(set: LoggedSet, fields: string[], unit: string): string {
  const parts: string[] = [];
  if (fields.includes("weight") && set.weight !== null)
    parts.push(`${set.weight} ${unit}`);
  if (fields.includes("reps") && set.reps !== null) parts.push(`× ${set.reps}`);
  if (fields.includes("rpe") && set.rpe !== null) parts.push(`RPE ${set.rpe}`);
  if (fields.includes("rir") && set.rir !== null) parts.push(`RIR ${set.rir}`);
  return parts.join(" ") || "—";
}

function prescriptionText(
  exercise: TrainingExercise,
  configuration: Variant,
): string {
  const parts: string[] = [];
  if (hasField(configuration, "Sets"))
    parts.push(
      `${exercise.sets.length} ${exercise.sets.length === 1 ? "set" : "sets"}`,
    );
  if (
    (hasField(configuration, "Fixed reps") ||
      hasField(configuration, "Rep ranges")) &&
    exercise.sets.length
  )
    parts.push(
      `${exercise.sets
        .map((set) =>
          hasField(configuration, "Rep ranges") &&
          set.repsMax !== undefined &&
          set.repsMax > set.reps
            ? `${set.reps}–${set.repsMax}`
            : `${set.reps}`,
        )
        .join(" / ")} reps`,
    );
  if (hasField(configuration, "Tempo") && exercise.sets.some((s) => s.tempo))
    parts.push(`Tempo ${exercise.sets.map((s) => s.tempo || "—").join(" / ")}`);
  if (hasField(configuration, "Set type")) {
    const types = [
      ...new Set(exercise.sets.map((s) => s.type).filter(Boolean)),
    ];
    if (types.length) parts.push(types.join(", "));
  }
  if (hasField(configuration, "Rest / pause")) {
    const rests = [
      ...new Set(exercise.sets.map((s) => s.rest).filter(Boolean)),
    ];
    if (rests.length) parts.push(`Rest ${rests.join(" / ")}`);
  }
  return parts.join(" · ");
}

const NUMERIC_FIELDS = [
  { id: "weight", label: "Weight", inputMode: "decimal" },
  { id: "reps", label: "Reps", inputMode: "numeric" },
  { id: "rpe", label: "RPE", inputMode: "decimal" },
  { id: "rir", label: "RIR", inputMode: "numeric" },
] as const;

type SetField = (typeof NUMERIC_FIELDS)[number]["id"];

export function SessionLogger({
  client,
  configuration,
  plan,
  week,
  item,
  logs,
  today,
  writeLog,
  onBack,
}: {
  client: CoachClient;
  configuration: Variant;
  plan: TrainingPlan;
  week: number;
  item: ScheduledSession;
  logs: TrainingSessionLog[];
  today: string;
  writeLog: (log: TrainingSessionLog) => void;
  onBack: () => void;
}) {
  const log = findLog(logs, plan.id, item.date, item.occurrenceKey);
  const [editing, setEditing] = useState(log?.status !== "finished");
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});

  const fields =
    log?.logFields ?? configuration.training.logFields ?? DEFAULT_LOG_FIELDS;
  const unit = log?.loadUnit ?? configuration.training.loadUnit ?? "kg";
  const numericFields = NUMERIC_FIELDS.filter((field) =>
    fields.includes(field.id),
  );
  const showNotes = fields.includes("note");
  const editable = log?.status !== "finished" || editing;

  const ensure = (): TrainingSessionLog => {
    if (log) return log;
    const created = startLog({
      id: uid("log"),
      clientId: client.id,
      plan,
      item,
      logFields: fields,
      loadUnit: unit,
      now: new Date().toISOString(),
    });
    writeLog(created);
    return created;
  };

  const patchSet = (
    exerciseId: string,
    setId: string,
    patch: Partial<Omit<LoggedSet, "setId">>,
  ) => {
    const current = ensure();
    writeLog(updateSet(current, exerciseId, setId, patch));
  };

  const finish = (at: string) => {
    writeLog(finishLog(ensure(), at));
    setConfirmFinish(false);
    setEditing(false);
  };
  const requestFinish = () => {
    const current = ensure();
    if (notDoneCount(current) > 0) setConfirmFinish(true);
    else finish(new Date().toISOString());
  };

  const exercises =
    log?.exercises ??
    item.session.exercises.map((exercise) => ({
      exerciseId: exercise.id,
      exerciseKey: exercise.libraryId ?? exercise.id,
      prescription: exercise,
      sets: exercise.sets.map((set) => ({
        setId: set.id,
        done: false,
        weight: null,
        reps: null,
        rpe: null,
        rir: null,
        note: "",
        flagged: false,
      })),
    }));
  const doneCount = exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => set.done).length,
    0,
  );
  const totalSets = exercises.reduce(
    (count, exercise) => count + exercise.sets.length,
    0,
  );

  const finishedAt = log?.finishedAt ?? "";
  const setFinishedAt = (date: string, time: string) => {
    if (!log) return;
    writeLog({ ...log, finishedAt: `${date}T${time || "00:00"}` });
  };

  return (
    <section
      className="cd-preview-section ctl-session-view"
      aria-label="Session log"
    >
      <header className="ctl-session-head">
        <Button size="sm" onClick={onBack}>
          <ChevronLeft size={15} aria-hidden="true" /> Week {week}
        </Button>
        <div className="ctl-session-head-title">
          <h2>{item.session.name}</h2>
          <span>
            {item.weekdayLabel ? `${item.weekdayLabel} · ` : ""}
            {formatDate(item.date, { day: "numeric", month: "short" })}
            {item.date === today ? " · Today" : ""}
          </span>
        </div>
      </header>

      {log?.status === "finished" && (
        <Card variant="subtle" className="ctl-summary">
          <div className="ctl-summary-line">
            <b>Session finished</b>
            <span>
              {doneCount} of {totalSets} sets done
            </span>
          </div>
          <DateTimePicker
            label="Completed"
            date={finishedAt.slice(0, 10)}
            time={finishedAt.slice(11, 16)}
            onDateChange={(date) =>
              setFinishedAt(date, finishedAt.slice(11, 16))
            }
            onTimeChange={(time) =>
              setFinishedAt(finishedAt.slice(0, 10), time)
            }
          />
          {!editing && (
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit log
            </Button>
          )}
        </Card>
      )}

      <div className="ctl-exercises">
        {exercises.map((exercise) => {
          const previous = previousPerformance(logs, {
            clientId: client.id,
            sessionId: item.session.id,
            exerciseKey: exercise.exerciseKey,
            plan,
            date: item.date,
          });
          const prescription = exercise.prescription;
          const cues = hasField(configuration, "Detailed instructions")
            ? [
                ...new Set(
                  [
                    prescription.instructions,
                    prescription.generalNotes,
                    ...prescription.sets.map((set) => set.instructions),
                  ].filter((cue) => cue?.trim()),
                ),
              ]
            : [];
          const progression =
            hasField(configuration, "Progression notes") &&
            prescription.progression
              ? prescription.progression
              : "";
          return (
            <Card key={exercise.exerciseId} className="ctl-exercise">
              <div className="ctl-exercise-head">
                <h3>{prescription.name}</h3>
                <p className="ctl-exercise-rx">
                  {prescriptionText(prescription, configuration)}
                </p>
                {progression && (
                  <p className="ctl-exercise-note">{progression}</p>
                )}
                {cues.map((cue) => (
                  <p className="ctl-exercise-note" key={cue}>
                    {cue}
                  </p>
                ))}
                <div className="ctl-last-time">
                  {previous ? (
                    <>
                      <span>
                        Last time ·{" "}
                        {formatDate(previous.date, {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      {previous.exercise.sets.map((set, index) => (
                        <span key={set.setId}>
                          {index + 1} · {previousLine(set, fields, unit)}
                        </span>
                      ))}
                    </>
                  ) : (
                    <span>No previous entry</span>
                  )}
                </div>
              </div>
              <ul className="ctl-sets">
                {exercise.sets.map((set, index) => {
                  const prescribed = prescription.sets[index];
                  const noteKey = `${exercise.exerciseId}:${set.setId}`;
                  const noteOpen =
                    openNotes[noteKey] ?? Boolean(set.note || set.flagged);
                  return (
                    <li className="ctl-set-wrap" key={set.setId}>
                      <div
                        className="ctl-set"
                        data-done={set.done || undefined}
                      >
                        <span className="ctl-set-index">
                          <b>{index + 1}</b>
                          <small>
                            {prescribed ? repsText(prescribed) : ""}
                          </small>
                        </span>
                        {editable ? (
                          <>
                            {numericFields.map((field) => (
                              <span className="ctl-set-field" key={field.id}>
                                <input
                                  className="v8-input"
                                  aria-label={`Set ${index + 1} ${field.label}${
                                    field.id === "weight" ? ` (${unit})` : ""
                                  }`}
                                  inputMode={field.inputMode}
                                  value={set[field.id as SetField] ?? ""}
                                  onChange={(event) =>
                                    patchSet(exercise.exerciseId, set.setId, {
                                      [field.id]: numOrNull(
                                        event.currentTarget.value,
                                      ),
                                    } as Partial<Omit<LoggedSet, "setId">>)
                                  }
                                />
                                {field.id === "weight" && (
                                  <span
                                    className="ctl-set-unit"
                                    aria-hidden="true"
                                  >
                                    {unit}
                                  </span>
                                )}
                              </span>
                            ))}
                            {showNotes && (
                              <IconButton
                                label={`Note for set ${index + 1}`}
                                size="sm"
                                className={
                                  set.flagged
                                    ? "ctl-ghost-icon ctl-flag-active"
                                    : "ctl-ghost-icon"
                                }
                                onClick={() =>
                                  setOpenNotes((current) => ({
                                    ...current,
                                    [noteKey]: !noteOpen,
                                  }))
                                }
                              >
                                {set.flagged ? (
                                  <Flag size={15} aria-hidden="true" />
                                ) : (
                                  <StickyNote size={15} aria-hidden="true" />
                                )}
                              </IconButton>
                            )}
                            <IconButton
                              label={`Set ${index + 1} done`}
                              size="sm"
                              className="ctl-set-done"
                              aria-pressed={set.done}
                              onClick={() =>
                                patchSet(exercise.exerciseId, set.setId, {
                                  done: !set.done,
                                })
                              }
                            >
                              <Check size={16} aria-hidden="true" />
                            </IconButton>
                          </>
                        ) : (
                          <span className="ctl-set-values">
                            {numericFields.map((field) => (
                              <span key={field.id} className="ctl-set-value">
                                <small>
                                  {field.id === "weight" ? unit : field.label}
                                </small>
                                {set[field.id as SetField] ?? "—"}
                              </span>
                            ))}
                            {set.flagged && (
                              <Flag
                                size={14}
                                className="ctl-flag-readonly"
                                aria-label="Flagged for coach"
                              />
                            )}
                            <Status tone={set.done ? "positive" : "neutral"}>
                              {set.done ? (
                                <>
                                  <Check size={12} aria-hidden="true" /> Done
                                </>
                              ) : (
                                "—"
                              )}
                            </Status>
                          </span>
                        )}
                      </div>
                      {showNotes && noteOpen && (
                        <div className="ctl-set-note">
                          {editable ? (
                            <>
                              <Input
                                size="sm"
                                label={`Set ${index + 1} note`}
                                value={set.note}
                                onChange={(event) =>
                                  patchSet(exercise.exerciseId, set.setId, {
                                    note: event.currentTarget.value,
                                  })
                                }
                              />
                              <Toggle
                                label="Flag for coach"
                                checked={set.flagged}
                                onCheckedChange={(checked) =>
                                  patchSet(exercise.exerciseId, set.setId, {
                                    flagged: checked,
                                  })
                                }
                              />
                            </>
                          ) : (
                            <p>{set.note || "—"}</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>

      <footer className="ctl-footer">
        {log?.status !== "finished" || editing ? (
          <Button variant="primary" onClick={requestFinish}>
            Finish session
          </Button>
        ) : null}
      </footer>

      <Modal
        open={confirmFinish}
        onOpenChange={setConfirmFinish}
        title="Finish session?"
        size="compact"
        footer={
          <>
            <Button onClick={() => setConfirmFinish(false)}>
              Keep logging
            </Button>
            <Button
              variant="primary"
              onClick={() => finish(new Date().toISOString())}
            >
              Finish
            </Button>
          </>
        }
      >
        <p>
          {log ? notDoneCount(log) : totalSets} sets are not done. They&apos;ll
          be saved as not done.
        </p>
      </Modal>
    </section>
  );
}
