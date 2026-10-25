// Card 11/#176 client+staff wire for the training session/set log
// surface. Thin typed fetchers over the /api/v1 training-logs and
// training-program routes; the canvas providers call these — nothing
// else reaches the transport.

import { apiFetch } from "./http";

/* ---- shared wire shapes (mirrors of the service return types) ---- */

export type WirePrescribedSet = {
  id: string;
  reps: number;
  repsMax?: number;
  tempo?: string;
  type?: string;
  rest?: string;
  instructions?: string;
  coachNote?: string;
};

export type WireExercise = {
  id: string;
  name: string;
  libraryItemId?: string;
  muscle?: string;
  secondaryMuscles?: string[];
  generalNotes?: string;
  instructions?: string;
  progressionNotes?: string;
  note?: string;
  sets?: number;
  reps?: string;
  tempo?: string;
  setType?: string;
  rest?: string;
  setRows?: WirePrescribedSet[];
};

export type WireSession = {
  id: string;
  name: string;
  exercises: WireExercise[];
};

export type OwnTrainingViewWire = {
  state: "none" | "upcoming" | "active" | "completed";
  agenda: {
    bookingId: string;
    scheduledDate: string;
    bookedWeek: number;
    session: WireSession;
  }[];
  current: {
    programId: string;
    title: string;
    versionSeq: number;
    weekIndex: number;
    weekCount: number;
    ongoing: boolean;
    startDate: string;
    anchorTimezone: string;
    marker: { label: "updated" | "updates"; effectiveDate: string } | null;
    week: { week: number; sessions: WireSession[] } | null;
  } | null;
  upcoming: {
    programId: string;
    title: string;
    startDate: string;
    takeoverInstant: string;
  } | null;
};

export type SessionLogStatusWire =
  | "IN_PROGRESS"
  | "COMPLETED"
  | "PARTIAL"
  | "SKIPPED";

export type SessionSetRowWire = {
  id: string;
  exerciseId: string;
  setId: string;
  setKey: string;
  position: number;
  actuals: {
    setId?: string;
    actualReps: number;
    load?: number;
    loadUnit?: string;
    rpe?: number;
    note?: string;
    flags?: string[];
  };
};

export type OwnSessionLogWire = {
  sessionLogId: string;
  programId: string;
  sessionId: string;
  bookedWeek: number;
  performedDate: string;
  status: SessionLogStatusWire;
  startedAt: string;
  completedAt: string | null;
  pinnedVersionId: string;
  pinnedVersionSeq: number;
  session: WireSession;
  sets: SessionSetRowWire[];
};

export type OwnLogWeekWire = {
  programId: string;
  logs: {
    sessionLogId: string;
    sessionId: string;
    sessionName: string;
    bookedWeek: number;
    performedDate: string;
    status: SessionLogStatusWire;
    completedAt: string | null;
    setCount: number;
  }[];
};

export type StaffSessionLogEntryWire = {
  sessionLogId: string;
  programId: string;
  programTitle: string;
  sessionId: string;
  bookedWeek: number;
  performedDate: string;
  status: SessionLogStatusWire;
  completedAt: string | null;
  pinnedVersionSeq: number;
  session: WireSession;
  sets: SessionSetRowWire[];
};

/* ---- own routes ---- */

export function fetchOwnTrainingProgram(
  workspaceId: string,
  week?: number,
): Promise<OwnTrainingViewWire> {
  return apiFetch(
    `/workspaces/${workspaceId}/training-program${week !== undefined ? `?week=${week}` : ""}`,
  );
}

export function fetchOwnLogWeek(
  workspaceId: string,
  week: number,
): Promise<OwnLogWeekWire | null> {
  return apiFetch(`/workspaces/${workspaceId}/training-logs?week=${week}`);
}

export function startSessionLog(
  workspaceId: string,
  body: {
    programId: string;
    sessionId: string;
    bookedWeek: number;
    performedDate: string;
  },
): Promise<{ sessionLogId: string; replayed: boolean }> {
  return apiFetch(
    `/workspaces/${workspaceId}/training-logs/sessions`,
    { body },
  );
}

export function fetchOwnSessionLog(
  workspaceId: string,
  sessionLogId: string,
): Promise<OwnSessionLogWire> {
  return apiFetch(
    `/workspaces/${workspaceId}/training-logs/sessions/${sessionLogId}`,
  );
}

export function saveSetLog(
  workspaceId: string,
  sessionLogId: string,
  body: {
    exerciseId: string;
    position: number;
    set: {
      setId: string;
      actualReps: number;
      load?: number;
      loadUnit?: string;
      rpe?: number;
      note?: string;
      flags?: string[];
    };
  },
): Promise<{ setLogId: string; replayed: boolean }> {
  return apiFetch(
    `/workspaces/${workspaceId}/training-logs/sessions/${sessionLogId}/sets`,
    { body },
  );
}

export function finishSessionLog(
  workspaceId: string,
  sessionLogId: string,
  outcome: "completed" | "skipped",
): Promise<{ status: SessionLogStatusWire }> {
  return apiFetch(
    `/workspaces/${workspaceId}/training-logs/sessions/${sessionLogId}/finish`,
    { body: { outcome } },
  );
}

/* ---- staff route ---- */

export function fetchStaffTrainingLogs(
  workspaceId: string,
  clientProfileId: string,
  cursor?: string,
): Promise<{
  logs: StaffSessionLogEntryWire[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  return apiFetch(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/training-logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
}
