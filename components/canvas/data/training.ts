// Training domain provider (PR-W0). Owns the coach exercise library, the
// per-client training plan lifecycles and the per-client activity target
// versions. W2-A2 wires the coach-facing lifecycle and the library to the
// server: the slice stays a write-through cache so first paint is instant,
// and the store hydration re-reads `/api/v1` as the authority on every
// client switch.

import type { CoachState } from "../coach/model";
import {
  emptyClientPlans,
  type ClientPlans,
  type ExerciseDefinition,
  type TrainingExercise,
  type TrainingPlan,
  type TrainingSession,
  type TrainingSet,
} from "../coach/plans/types";
import { apiFetch } from "./http";
import type { CoachSlice } from "./provider";

export const TRAINING_KEY = "coach-data-training-v1";

type TrainingData = {
  exerciseLibrary?: ExerciseDefinition[];
  /** Training plan lifecycle per client id. */
  training: Record<string, ClientPlans["training"]>;
  /** Activity target versions per client id (prescriptions sit with training). */
  activityTargets?: Record<string, ClientPlans["activityTargets"]>;
  /** Client-logged training sessions (the client app's logbook). */
  trainingLogs?: CoachState["trainingLogs"];
  /** One-shot demo seeds, kept so the Amara example is adopted exactly once. */
  demoSeeds?: CoachState["demoSeeds"];
};

export const trainingSlice: CoachSlice = {
  key: TRAINING_KEY,
  extract: (state): TrainingData => ({
    exerciseLibrary: state.exerciseLibrary,
    training: Object.fromEntries(
      state.clients.flatMap((client) =>
        client.plans ? [[client.id, client.plans.training]] : [],
      ),
    ),
    activityTargets: Object.fromEntries(
      state.clients.flatMap((client) =>
        client.plans ? [[client.id, client.plans.activityTargets]] : [],
      ),
    ),
    trainingLogs: state.trainingLogs,
    demoSeeds: state.demoSeeds,
  }),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid training slice");
    const data = slice as Partial<TrainingData>;
    if (data.exerciseLibrary) state.exerciseLibrary = data.exerciseLibrary;
    if (data.trainingLogs) state.trainingLogs = data.trainingLogs;
    if (data.demoSeeds) state.demoSeeds = data.demoSeeds;
    if (data.training && typeof data.training === "object")
      for (const client of state.clients) {
        const training = data.training[client.id];
        if (training !== undefined)
          (client.plans ??= emptyClientPlans()).training = training;
      }
    if (data.activityTargets && typeof data.activityTargets === "object")
      for (const client of state.clients) {
        const targets = data.activityTargets[client.id];
        if (client.plans) client.plans.activityTargets = targets;
      }
  },
};

/* -------------------------------------------------------------------------
 * W2-A2 remote surface: staff training-program lifecycle and the workspace
 * exercise library. Wire shapes mirror `lib/trainingprogram/service.ts` -
 * duplicated here so the canvas never imports server modules.
 *
 * The backend draft is the boundary document: sessions/exercises
 * declarations plus per-week boundary maps (order, presence, field cells,
 * set rows). The canvas `TrainingPlan.overrides` is the same semantics in
 * materialized form (week -> session list, greatest boundary <= N wins),
 * so hydration materializes and re-sparsifies, and saving replays the
 * demo-seed conversion (scripts/seed/50-demo-coverage.seed.ts).
 * ---------------------------------------------------------------------- */

export type ExerciseLibraryEntryWire = ExerciseDefinition;

/** GET workspaces/:workspaceId/exercise-library - staff library list. */
export function fetchExerciseLibrary(
  workspaceId: string,
): Promise<ExerciseLibraryEntryWire[]> {
  return apiFetch<ExerciseLibraryEntryWire[]>(
    `/workspaces/${workspaceId}/exercise-library`,
  );
}

export type TrainingProgramListItemWire = {
  programId: string;
  title: string;
  startDate: string;
  weekCount: number;
  programMode: "WEEK_BASED" | "EVERGREEN";
  firstPublishedAt: string | null;
  cancelledAt: string | null;
  state: "draft" | "pending" | "current" | "superseded" | "dead" | "cancelled";
};

export type StaffProgramListWire = {
  programs: TrainingProgramListItemWire[];
  nextCursor: { createdAt: string; id: string } | null;
  canWrite: boolean;
};

export type BoundaryMapWire<V> = Record<string, V>;

export type TrainingDraftWire = {
  programMode: "WEEK_BASED" | "EVERGREEN";
  sessions: { id: string; name: string }[];
  exercises: {
    id: string;
    sessionId: string;
    name: string;
    catalogItemId?: string;
    libraryItemId?: string;
    muscle?: string;
    secondaryMuscles?: string[];
    generalNotes?: string;
  }[];
  sessionOrder: BoundaryMapWire<string[]>;
  exerciseOrder: Record<string, BoundaryMapWire<string[]>>;
  sessionPresence: Record<string, BoundaryMapWire<boolean>>;
  exercisePresence: Record<string, BoundaryMapWire<boolean>>;
  sessionNames: Record<string, BoundaryMapWire<string>>;
  fieldCells: Record<string, BoundaryMapWire<string | number>>;
  setRows: Record<string, BoundaryMapWire<TrainingSet[]>>;
};

export type TrainingVersionHeaderWire = {
  id: string;
  versionSeq: number;
  effectiveDate: string;
  effectiveTimezone: string;
  activationInstant: string;
  publishedAt: string;
  label: "current" | "scheduled" | "past" | "shadowed" | "beyond_cutoff";
};

export type StaffProgramDetailWire = {
  program: {
    id: string;
    title: string;
    startDate: string;
    weekCount: number;
    programMode: "WEEK_BASED" | "EVERGREEN";
    fieldConfig: Record<string, boolean>;
    confirmedTimezone: string | null;
    anchorTimezone: string | null;
    draftRevision: number;
    draft: TrainingDraftWire;
    replacesProgramId: string | null;
    firstPublishedAt: string | null;
    firstPublishOriginRevision: number | null;
    cancelledAt: string | null;
    ceiling: number;
    currentWeekIndex: number | null;
    state: TrainingProgramListItemWire["state"];
  };
  versions: TrainingVersionHeaderWire[];
  nextVersionCursor: number | null;
  canWrite: boolean;
};

export type MaterializedExerciseWire = {
  id: string;
  name: string;
  catalogItemId?: string;
  libraryItemId?: string;
  muscle?: string;
  secondaryMuscles?: string[];
  generalNotes?: string;
  sets?: number;
  setRows?: ({ id: string } & Partial<TrainingSet>)[];
  reps?: string;
  tempo?: string;
  setType?: string;
  rest?: string;
  instructions?: string;
  progressionNotes?: string;
  note?: string;
};

export type MaterializedProgramWire = {
  programMode: "WEEK_BASED" | "EVERGREEN";
  startDate: string;
  weekCount: number;
  weeks: { week: number; sessions: TrainingSessionWire[] }[];
};

export type TrainingSessionWire = {
  id: string;
  name: string;
  exercises: MaterializedExerciseWire[];
};

export type StaffProgramVersionWire = {
  id: string;
  programId: string;
  versionSeq: number;
  effectiveDate: string;
  effectiveTimezone: string;
  activationInstant: string;
  payload: MaterializedProgramWire;
  publishedAt: string;
};

/** GET clients/:clientProfileId/training-programs - lifecycle list. */
export function fetchStaffTrainingPrograms(
  workspaceId: string,
  clientProfileId: string,
): Promise<StaffProgramListWire> {
  return apiFetch<StaffProgramListWire>(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/training-programs`,
  );
}

/** GET clients/:clientProfileId/training-programs/:programId - detail. */
export function fetchStaffTrainingProgram(
  workspaceId: string,
  clientProfileId: string,
  programId: string,
): Promise<StaffProgramDetailWire> {
  return apiFetch<StaffProgramDetailWire>(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/training-programs/${programId}`,
  );
}

/** GET .../training-programs/:programId/versions/:versionId - payload. */
export function fetchStaffTrainingProgramVersion(
  workspaceId: string,
  clientProfileId: string,
  programId: string,
  versionId: string,
): Promise<StaffProgramVersionWire> {
  return apiFetch<StaffProgramVersionWire>(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/training-programs/${programId}/versions/${versionId}`,
  );
}

/** PUT clients/:clientProfileId/training-programs - boundary draft CAS. */
export function saveStaffTrainingProgramDraft(
  workspaceId: string,
  clientProfileId: string,
  body: {
    programId?: string;
    expectedRevision: number;
    title?: string;
    startDate?: string;
    weekCount?: number;
    fieldConfig?: unknown;
    timezone?: string;
    draft: unknown;
  },
): Promise<{ programId: string; revision: number }> {
  return apiFetch(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/training-programs`,
    { method: "PUT", body },
  );
}

/** POST .../training-programs/:programId/publish - mint a version. */
export function publishStaffTrainingProgram(
  workspaceId: string,
  clientProfileId: string,
  programId: string,
  body: {
    expectedRevision: number;
    effectiveDate: string;
    expectedPredecessor?: string | null;
    acknowledgeImmediateTakeover?: boolean;
  },
): Promise<{
  versionId: string;
  versionSeq: number;
  programState: string;
  replayed: boolean;
}> {
  return apiFetch(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/training-programs/${programId}/publish`,
    { method: "POST", body },
  );
}

/* -------------------------------------------------------------------------
 * Boundary <-> canvas mapping. `resolveBoundary` mirrors the server helper
 * of the same name (greatest key <= week). Materializing produces every
 * week; emitting canvas `overrides` re-sparsifies on change so the canvas
 * resolveTrainingWeek rebuilds identical weeks.
 * ---------------------------------------------------------------------- */

function resolveBoundary<V>(
  bm: BoundaryMapWire<V> | undefined,
  week: number,
): V | undefined {
  if (!bm) return undefined;
  let best = -1;
  for (const k of Object.keys(bm)) {
    const w = Number(k);
    if (w <= week && w > best) best = w;
  }
  return best < 0 ? undefined : bm[String(best)];
}

function isPresent(
  bm: BoundaryMapWire<boolean> | undefined,
  week: number,
): boolean {
  return resolveBoundary(bm, week) === true;
}

const canonical = (value: unknown): string => JSON.stringify(value);

function materializedSessionToCanvas(
  session: TrainingSessionWire,
): TrainingSession {
  return {
    id: session.id,
    name: session.name,
    exercises: session.exercises.map((e): TrainingExercise => {
      const rows = e.setRows ?? [];
      const sets: TrainingSet[] = rows.map((row, i) => ({
        id: row.id ?? `set-${i + 1}`,
        reps: row.reps ?? 0,
        repsMax: row.repsMax,
        tempo: row.tempo ?? "",
        type: row.type ?? "Working",
        rest: row.rest ?? "",
        instructions: row.instructions ?? "",
      }));
      return {
        id: e.id,
        name: e.name,
        muscle: e.muscle,
        secondaryMuscles: e.secondaryMuscles,
        libraryId: e.libraryItemId,
        generalNotes: e.generalNotes,
        instructions: e.note ?? "",
        progression: e.progressionNotes ?? "",
        sets,
      };
    }),
  };
}

/** Boundary draft -> canvas overrides (materialize, then re-sparsify). */
export function draftWireToCanvasOverrides(
  draft: TrainingDraftWire,
  weekCount: number,
): Record<string, TrainingSession[]> {
  const overrides: Record<string, TrainingSession[]> = {};
  let previous = "";
  for (let w = 1; w <= weekCount; w++) {
    const presentSessions = draft.sessions.filter((s) =>
      isPresent(draft.sessionPresence[s.id], w),
    );
    const orderBoundary = resolveBoundary(draft.sessionOrder, w);
    const ordered = orderBoundary
      ? [
          ...orderBoundary
            .map((id) => presentSessions.find((s) => s.id === id))
            .filter((s): s is (typeof presentSessions)[number] => !!s),
          ...presentSessions.filter((s) => !orderBoundary.includes(s.id)),
        ]
      : presentSessions;
    const sessions: TrainingSession[] = ordered.map((s) => {
      const name = resolveBoundary(draft.sessionNames[s.id] ?? {}, w) ?? s.name;
      const presentExercises = draft.exercises.filter(
        (e) =>
          e.sessionId === s.id &&
          isPresent(draft.exercisePresence[`${s.id}/${e.id}`], w),
      );
      const exOrderBoundary = resolveBoundary(
        draft.exerciseOrder[s.id] ?? {},
        w,
      );
      const orderedEx = exOrderBoundary
        ? [
            ...exOrderBoundary
              .map((id) => presentExercises.find((e) => e.id === id))
              .filter((e): e is (typeof presentExercises)[number] => !!e),
            ...presentExercises.filter((e) => !exOrderBoundary.includes(e.id)),
          ]
        : presentExercises;
      return {
        id: s.id,
        name,
        exercises: orderedEx.map((e): TrainingExercise => {
          const key = `${s.id}/${e.id}`;
          const rows = resolveBoundary(draft.setRows[key] ?? {}, w) ?? [];
          const sets: TrainingSet[] = rows.map((row, i) => ({
            id: row.id ?? `set-${i + 1}`,
            reps: row.reps ?? 0,
            repsMax: row.repsMax,
            tempo: row.tempo ?? "",
            type: row.type ?? "Working",
            rest: row.rest ?? "",
            instructions: row.instructions ?? "",
          }));
          return {
            id: e.id,
            name: e.name,
            muscle: e.muscle,
            secondaryMuscles: e.secondaryMuscles,
            libraryId: e.libraryItemId,
            generalNotes: e.generalNotes,
            instructions:
              (resolveBoundary(draft.fieldCells[`${key}/note`] ?? {}, w) as
                | string
                | undefined) ?? "",
            progression:
              (resolveBoundary(
                draft.fieldCells[`${key}/progressionNotes`] ?? {},
                w,
              ) as string | undefined) ?? "",
            sets,
          };
        }),
      };
    });
    const json = canonical(sessions);
    if (json !== previous) overrides[String(w)] = sessions;
    previous = json;
  }
  return overrides;
}

/** Materialized version payload -> canvas overrides. */
export function materializedWireToCanvasOverrides(
  payload: MaterializedProgramWire,
): Record<string, TrainingSession[]> {
  const overrides: Record<string, TrainingSession[]> = {};
  let previous = "";
  for (const week of payload.weeks) {
    const sessions = week.sessions.map(materializedSessionToCanvas);
    const json = canonical(sessions);
    if (json !== previous) overrides[String(week.week)] = sessions;
    previous = json;
  }
  return overrides;
}

const ALL_FIELDS_ON: Record<string, boolean> = {
  sets: true,
  fixedReps: true,
  repRanges: true,
  tempo: true,
  setType: true,
  restPause: true,
  instructions: true,
  progressionNotes: true,
};

/**
 * Canvas plan -> backend boundary draft. Replays the demo-seed conversion
 * (scripts/seed/50-demo-coverage.seed.ts): each override week declares the
 * full session list for that week, presence boundaries flip on every known
 * id, field cells carry the set count / rep string / coach note, and
 * setRows carry the ordered per-set prescriptions.
 */
export function canvasTrainingToDraftWire(
  plan: TrainingPlan,
): TrainingDraftWire {
  const sessions: { id: string; name: string }[] = [];
  const exercises: TrainingDraftWire["exercises"] = [];
  const sessionOrder: BoundaryMapWire<string[]> = {};
  const exerciseOrder: Record<string, BoundaryMapWire<string[]>> = {};
  const sessionPresence: Record<string, BoundaryMapWire<boolean>> = {};
  const exercisePresence: Record<string, BoundaryMapWire<boolean>> = {};
  const sessionNames: Record<string, BoundaryMapWire<string>> = {};
  const fieldCells: Record<string, BoundaryMapWire<string | number>> = {};
  const setRows: Record<string, BoundaryMapWire<TrainingSet[]>> = {};
  const sessionIds = new Map<string, TrainingSession>();
  const exerciseIds = new Map<string, TrainingExercise & { sessionId: string }>();
  const weekList = Object.keys(plan.overrides ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  for (const w of weekList) {
    const wk = plan.overrides[String(w)] ?? [];
    const presentSessions = new Set<string>();
    const presentEx = new Set<string>();
    sessionOrder[String(w)] = [];
    for (const s of wk) {
      presentSessions.add(s.id);
      sessionIds.set(s.id, s);
      sessionOrder[String(w)].push(s.id);
      exerciseOrder[s.id] ??= {};
      exerciseOrder[s.id][String(w)] = [];
      for (const e of s.exercises ?? []) {
        const exKey = `${s.id}/${e.id}`;
        presentEx.add(exKey);
        exerciseIds.set(exKey, { ...e, sessionId: s.id });
        exerciseOrder[s.id][String(w)].push(e.id);
        const sets = (e.sets ?? []).map((set) => ({
          id: set.id,
          reps: set.reps,
          repsMax: set.repsMax,
          tempo: set.tempo ?? "",
          type: set.type ?? "Working",
          rest: set.rest ?? "",
          instructions: set.instructions ?? "",
        }));
        setRows[exKey] ??= {};
        setRows[exKey][String(w)] = sets;
        fieldCells[`${exKey}/sets`] = {
          ...(fieldCells[`${exKey}/sets`] ?? {}),
          [w]: sets.length,
        };
        const rx = sets[0];
        fieldCells[`${exKey}/reps`] = {
          ...(fieldCells[`${exKey}/reps`] ?? {}),
          [w]: rx
            ? rx.repsMax && rx.repsMax !== rx.reps
              ? `${rx.reps}-${rx.repsMax}`
              : `${rx.reps}`
            : "",
        };
        if (e.instructions)
          fieldCells[`${exKey}/note`] = {
            ...(fieldCells[`${exKey}/note`] ?? {}),
            [w]: e.instructions,
          };
        if (e.progression)
          fieldCells[`${exKey}/progressionNotes`] = {
            ...(fieldCells[`${exKey}/progressionNotes`] ?? {}),
            [w]: e.progression,
          };
      }
    }
    for (const sid of sessionIds.keys())
      sessionPresence[sid] = {
        ...(sessionPresence[sid] ?? {}),
        [w]: presentSessions.has(sid),
      };
    for (const exKey of exerciseIds.keys())
      exercisePresence[exKey] = {
        ...(exercisePresence[exKey] ?? {}),
        [w]: presentEx.has(exKey),
      };
  }
  for (const [sid, s] of sessionIds) sessions.push({ id: sid, name: s.name });
  for (const e of exerciseIds.values())
    exercises.push({
      id: e.id,
      sessionId: e.sessionId,
      name: e.name,
      muscle: e.muscle,
      secondaryMuscles: e.secondaryMuscles ?? [],
      libraryItemId: e.libraryId,
      generalNotes: e.generalNotes,
    });
  return {
    programMode: plan.program === "Week-based" ? "WEEK_BASED" : "EVERGREEN",
    sessions,
    exercises,
    sessionOrder,
    exerciseOrder,
    sessionPresence,
    exercisePresence,
    sessionNames,
    fieldCells,
    setRows,
  };
}

export { ALL_FIELDS_ON as TRAINING_FIELD_CONFIG };

/**
 * Locked-week preservation (W2-A2): the backend rejects any draft save
 * whose boundary entries at weeks <= `ceiling` differ from the stored
 * draft (`past_week_locked`). The canvas normalizes stored values on
 * hydration (a stored en dash rep range comes back as a hyphen), so a
 * rebuilt wire is not
 * byte-identical even when the coach touched nothing. This merge keeps
 * every stored entry at locked weeks verbatim and takes the canvas
 * rebuild only for editable weeks; declarations (sessions/exercises)
 * union by id so references stored at locked weeks stay resolvable.
 */
export function preserveLockedWeeks(
  raw: TrainingDraftWire | null | undefined,
  canvas: TrainingDraftWire,
  lockedWeeks: number,
): TrainingDraftWire {
  if (!raw || lockedWeeks <= 0) return canvas;
  const locked = (week: string) => Number(week) <= lockedWeeks;
  const merged: TrainingDraftWire = { ...canvas };

  // sessionOrder is keyed by week directly.
  const order: Record<string, string[]> = {};
  for (const week of new Set([
    ...Object.keys(raw.sessionOrder ?? {}),
    ...Object.keys(canvas.sessionOrder ?? {}),
  ])) {
    const rawWeek = (raw.sessionOrder ?? {})[week];
    const canvasWeek = (canvas.sessionOrder ?? {})[week];
    if (locked(week)) {
      if (rawWeek !== undefined) order[week] = rawWeek;
    } else if (canvasWeek !== undefined) order[week] = canvasWeek;
  }
  merged.sessionOrder = order;

  for (const key of [
    "exerciseOrder",
    "sessionPresence",
    "exercisePresence",
    "sessionNames",
    "fieldCells",
    "setRows",
  ] as const) {
    const rawMap = (raw[key] ?? {}) as Record<string, Record<string, unknown>>;
    const canvasMap = (canvas[key] ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const out: Record<string, Record<string, unknown>> = {};
    for (const k of new Set([...Object.keys(rawMap), ...Object.keys(canvasMap)])) {
      const cell: Record<string, unknown> = { ...(canvasMap[k] ?? {}) };
      for (const week of Object.keys(rawMap[k] ?? {}))
        if (locked(week)) cell[week] = rawMap[k][week];
      if (Object.keys(cell).length > 0) out[k] = cell;
    }
    (merged as Record<string, unknown>)[key] = out;
  }

  const unionById = <T extends { id: string }>(
    base: T[] | undefined,
    overlay: T[] | undefined,
  ): T[] => {
    const map = new Map((overlay ?? []).map((item) => [item.id, item]));
    for (const item of base ?? [])
      if (!map.has(item.id)) map.set(item.id, item);
    return [...map.values()];
  };
  merged.sessions = unionById(raw.sessions, canvas.sessions);
  merged.exercises = unionById(raw.exercises, canvas.exercises);
  return merged;
}
