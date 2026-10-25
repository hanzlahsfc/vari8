"use client";

// Card 11/#176 coach surface: the client's logged training sessions on
// client detail — each log with its PINNED prescription beside the
// actual sets, newest performed date first. Feeds the staff
// `clients/:clientProfileId/training-logs` read; in the unsigned demo
// (no workspaceId) the surface keeps the canvas fixture logbook data.

import { useEffect, useState } from "react";
import {
  fetchStaffTrainingLogs,
  type StaffSessionLogEntryWire,
} from "../data/training-logs";
import { formatDate, type CoachClient } from "./model";
import { useCoach } from "./store";
import { Empty, Status, Surface } from "./ui";

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  PARTIAL: "Partial",
  SKIPPED: "Skipped",
};

function setLine(set: StaffSessionLogEntryWire["sets"][number]): string {
  const a = set.actuals;
  const parts = [`Set ${set.position + 1}`, `${a.actualReps} reps`];
  if (a.load !== undefined)
    parts.push(`${a.load}${a.loadUnit ? ` ${a.loadUnit}` : ""}`);
  if (a.rpe !== undefined) parts.push(`RPE ${a.rpe}`);
  return parts.join(" · ");
}

export function ClientTrainingLogs({ client }: { client: CoachClient }) {
  const { state, workspaceId, clientProfileIdFor } = useCoach();
  const [logs, setLogs] = useState<StaffSessionLogEntryWire[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    clientProfileIdFor(client.name)
      .then((id) =>
        id
          ? fetchStaffTrainingLogs(workspaceId, id)
          : Promise.reject(new Error("no profile")),
      )
      .then((page) => {
        if (live) setLogs(page.logs);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [workspaceId, client.name, clientProfileIdFor]);

  const localLogs = (state.trainingLogs ?? []).filter(
    (log) => log.clientId === client.id,
  );
  if (!workspaceId && !localLogs.length) return null;
  if (failed) return null;

  return (
    <Surface>
      <h2>Logged sessions</h2>
      {workspaceId ? (
        logs === null ? (
          <p className="cd-muted">Loading logged sessions…</p>
        ) : logs.length ? (
          <div className="cd-training-logs">
            {logs.map((log) => (
              <div className="cd-training-log" key={log.sessionLogId}>
                <div className="cd-stat-row">
                  <span>
                    <strong>{log.session.name}</strong>
                    <small>
                      {formatDate(log.performedDate)} · Week {log.bookedWeek} ·{" "}
                      {log.programTitle}
                    </small>
                  </span>
                  <Status text={STATUS_LABEL[log.status] ?? log.status} />
                </div>
                {log.session.exercises.map((exercise) => {
                  const sets = log.sets.filter(
                    (s) => s.exerciseId === exercise.id,
                  );
                  if (!sets.length) return null;
                  return (
                    <div className="cd-training-log-ex" key={exercise.id}>
                      <strong>{exercise.name}</strong>
                      {sets.map((set) => (
                        <small key={set.id}>{setLine(set)}</small>
                      ))}
                    </div>
                  );
                })}
                {log.sets.length === 0 && (
                  <p className="cd-muted">No sets logged yet.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="cd-muted">No logged sessions yet.</p>
        )
      ) : localLogs.length ? (
        <div className="cd-training-logs">
          {localLogs.map((log) => (
            <div className="cd-training-log" key={log.id}>
              <div className="cd-stat-row">
                <span>
                  <strong>{log.sessionName}</strong>
                  <small>
                    {formatDate(log.scheduledDate)} · Week {log.week}
                  </small>
                </span>
                <Status
                  text={log.status === "finished" ? "Completed" : "In progress"}
                />
              </div>
              {log.exercises.map((exercise) => (
                <div className="cd-training-log-ex" key={exercise.exerciseId}>
                  <strong>{exercise.prescription.name}</strong>
                  {exercise.sets
                    .filter((set) => set.done)
                    .map((set, index) => (
                      <small key={set.setId}>
                        Set {index + 1}
                        {set.reps !== null ? ` · ${set.reps} reps` : ""}
                        {set.weight !== null
                          ? ` · ${set.weight} ${log.loadUnit}`
                          : ""}
                        {set.rpe !== null ? ` · RPE ${set.rpe}` : ""}
                      </small>
                    ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No logged sessions yet" />
      )}
    </Surface>
  );
}
