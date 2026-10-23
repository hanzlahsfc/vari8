import type {
  TrainingPlan,
  TrainingSession,
  TrainingSet,
} from "@/components/coach/plans/types";

export type LoggedSet = {
  reps: number | null;
  load: number | null;
  rpe: number | null;
};

export type SessionStatus = "planned" | "in-progress" | "done" | "skipped";
export type FinishResult = "complete" | "partial" | "skipped";

// A prescription snapshot for one training session. Version pinning means a
// logged session keeps rendering the prescription it was performed against.
export type PrescriptionVersion = {
  version: number;
  session: TrainingSession;
};

export type LogSession = {
  id: string;
  planId: TrainingPlan["id"];
  version: number;
  sessionId: string;
  status: SessionStatus;
  result: FinishResult | null;
  setIds: string[];
  sets: Record<string, LoggedSet>;
};

export type LogbookState = {
  sessions: LogSession[];
};

const emptySet = (): LoggedSet => ({ reps: null, load: null, rpe: null });

const setIsLogged = (set: LoggedSet | undefined): boolean =>
  set !== undefined &&
  set.reps !== null &&
  set.load !== null &&
  set.rpe !== null;

const flattenSets = (session: TrainingSession): TrainingSet[] =>
  session.exercises.flatMap((exercise) => exercise.sets);

export function startSession(
  state: LogbookState,
  planId: string,
  version: PrescriptionVersion,
): LogbookState {
  const prescribed = flattenSets(version.session);
  const session: LogSession = {
    id: `log-${state.sessions.length + 1}`,
    planId,
    version: version.version,
    sessionId: version.session.id,
    status: "in-progress",
    result: null,
    setIds: prescribed.map((set) => set.id),
    sets: Object.fromEntries(prescribed.map((set) => [set.id, emptySet()])),
  };
  return { ...state, sessions: [...state.sessions, session] };
}

// Index of the first prescribed set that is not fully logged, or -1 when the
// session is done logging.
export function resumeIndex(session: LogSession): number {
  return session.setIds.findIndex((id) => !setIsLogged(session.sets[id]));
}

export function finishSession(
  session: LogSession,
  { skipped }: { skipped: boolean },
): LogSession {
  if (skipped) {
    return { ...session, status: "skipped", result: "skipped" };
  }
  const result: FinishResult =
    resumeIndex(session) === -1 ? "complete" : "partial";
  return { ...session, status: "done", result };
}

// The prescription a session was logged against, pinned by the version the
// session carries, so a later revision of the same session does not rewrite
// history.
export function prescriptionFor(
  session: LogSession,
  versions: PrescriptionVersion[],
): PrescriptionVersion | undefined {
  return versions.find(
    (v) => v.version === session.version && v.session.id === session.sessionId,
  );
}
