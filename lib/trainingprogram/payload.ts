/**
 * TRAINING-I1A (PROMPT 244 — P3 §4.2–4.4 + P4 §3 contract) — training
 * draft payload model: the override-boundary document, its strict closed
 * validation, week materialization, and client serialization.
 *
 * Representation (P4 §3.1): per addressable node a sparse ordered set of
 * boundaries `{week: value}`. Week N resolves from the greatest boundary
 * ≤ N — order-independent by construction; later explicit overrides are
 * preserved. Publish materializes weeks 1..weekCount into a
 * self-contained immutable payload (P4 §3.4).
 *
 * The eight configurable fields (P3 §4.3, FRONTEND `TRAINING_FIELDS`):
 * sets, fixedReps, repRanges, tempo, setType, restPause, instructions,
 * progressionNotes — plus the always-on per-exercise `note`. Disabled
 * fields are hidden on every client path, never purged (P4 §6).
 */

import { TRAINING_LIMITS } from "./limits";

export class TrainingError extends Error {
  readonly code: string;
  readonly detail?: Record<string, unknown>;
  constructor(code: string, detail?: Record<string, unknown>) {
    super(`training_program:${code}`);
    this.name = "TrainingError";
    this.code = code;
    this.detail = detail;
  }
}

// ── Field config ─────────────────────────────────────────────────────────

export const TRAINING_FIELD_KEYS = [
  "sets",
  "fixedReps",
  "repRanges",
  "tempo",
  "setType",
  "restPause",
  "instructions",
  "progressionNotes",
] as const;
export type TrainingFieldKey = (typeof TRAINING_FIELD_KEYS)[number];
export type TrainingFieldConfig = Record<TrainingFieldKey, boolean>;

/** fieldConfig key → payload key on a materialized exercise. */
const FIELD_PAYLOAD_KEY: Record<TrainingFieldKey, string> = {
  sets: "sets",
  fixedReps: "reps",
  repRanges: "reps",
  tempo: "tempo",
  setType: "setType",
  restPause: "rest",
  instructions: "instructions",
  progressionNotes: "progressionNotes",
};

/** Payload keys addressable as field-cell nodes (note is always-on). */
const ADDRESSABLE_CELL_KEYS = new Set([
  "sets",
  "reps",
  "tempo",
  "setType",
  "rest",
  "instructions",
  "progressionNotes",
  "note",
]);

export function normalizeFieldConfig(raw: unknown): TrainingFieldConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    throw new TrainingError("invalid_input");
  const keys = Object.keys(raw as Record<string, unknown>);
  if (keys.some((k) => !(TRAINING_FIELD_KEYS as readonly string[]).includes(k)))
    throw new TrainingError("invalid_input");
  const out = {} as TrainingFieldConfig;
  for (const k of TRAINING_FIELD_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (v !== undefined && typeof v !== "boolean")
      throw new TrainingError("invalid_input");
    out[k] = v === true;
  }
  return out;
}

/** Payload keys enabled by a config — fixedReps and repRanges share the
 * single `reps` value (P3 §4.3 one-field rule). */
export function enabledPayloadKeys(
  cfg: TrainingFieldConfig,
): ReadonlySet<string> {
  const s = new Set<string>(["note"]);
  for (const k of TRAINING_FIELD_KEYS) if (cfg[k]) s.add(FIELD_PAYLOAD_KEY[k]);
  return s;
}

// ── Small validators ─────────────────────────────────────────────────────

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function reqId(v: unknown): string {
  if (typeof v !== "string" || !ID_RE.test(v))
    throw new TrainingError("invalid_input");
  return v;
}

function reqText(v: unknown, max: number, allowEmpty = false): string {
  if (typeof v !== "string") throw new TrainingError("invalid_input");
  const t = v.trim();
  if ((!allowEmpty && t.length < 1) || t.length > max)
    throw new TrainingError("invalid_input");
  return t;
}

function optText(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  return reqText(v, max);
}

function reqWeekKey(k: string): number {
  if (!/^\d{1,2}$/.test(k)) throw new TrainingError("invalid_input");
  const w = Number(k);
  if (
    !Number.isInteger(w) ||
    w < TRAINING_LIMITS.weekCountMin ||
    w > TRAINING_LIMITS.weekCountMax
  )
    throw new TrainingError("invalid_input");
  return w;
}

function reqClosedObject(v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v))
    throw new TrainingError("invalid_input");
  return v as Record<string, unknown>;
}

function byteLen(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), "utf8");
}

// ── The draft boundary document ──────────────────────────────────────────

export type BoundaryMap<V> = Record<string, V>;

export type TrainingDraft = {
  programMode: "WEEK_BASED" | "EVERGREEN";
  /** Declared sessions — stable ids; declaration order = fallback order. */
  sessions: { id: string; name: string }[];
  /** Declared exercises with their home session. */
  exercises: {
    id: string;
    sessionId: string;
    name: string;
    catalogItemId?: string;
  }[];
  /** week → ordered session ids present that week. */
  sessionOrder: BoundaryMap<string[]>;
  /** sessionId → (week → ordered exercise ids). */
  exerciseOrder: Record<string, BoundaryMap<string[]>>;
  /** sessionId → (week → present). */
  sessionPresence: Record<string, BoundaryMap<boolean>>;
  /** "sessionId/exerciseId" → (week → present). */
  exercisePresence: Record<string, BoundaryMap<boolean>>;
  /** sessionId → (week → name). */
  sessionNames: Record<string, BoundaryMap<string>>;
  /** "sessionId/exerciseId/payloadKey" → (week → value). */
  fieldCells: Record<string, BoundaryMap<string | number>>;
};

export function emptyTrainingDraft(
  programMode: TrainingDraft["programMode"] = "WEEK_BASED",
): TrainingDraft {
  return {
    programMode,
    sessions: [],
    exercises: [],
    sessionOrder: {},
    exerciseOrder: {},
    sessionPresence: {},
    exercisePresence: {},
    sessionNames: {},
    fieldCells: {},
  };
}

function normalizeStringBoundaryMap(
  raw: unknown,
  maxLen: number,
): BoundaryMap<string> {
  const obj = reqClosedObject(raw);
  const out: BoundaryMap<string> = {};
  for (const [wk, v] of Object.entries(obj)) {
    reqWeekKey(wk);
    out[wk] = reqText(v, maxLen);
  }
  return out;
}

function normalizeValueBoundaryMap(raw: unknown): BoundaryMap<string | number> {
  const obj = reqClosedObject(raw);
  const out: BoundaryMap<string | number> = {};
  for (const [wk, v] of Object.entries(obj)) {
    reqWeekKey(wk);
    if (typeof v === "number") {
      if (!Number.isInteger(v) || v < 1 || v > 999)
        throw new TrainingError("invalid_input");
      out[wk] = v;
    } else if (typeof v === "string") {
      out[wk] = reqText(v, TRAINING_LIMITS.instructionsMax);
    } else {
      throw new TrainingError("invalid_input");
    }
  }
  return out;
}

function normalizeBoolBoundaryMap(raw: unknown): BoundaryMap<boolean> {
  const obj = reqClosedObject(raw);
  const out: BoundaryMap<boolean> = {};
  for (const [wk, v] of Object.entries(obj)) {
    reqWeekKey(wk);
    if (typeof v !== "boolean") throw new TrainingError("invalid_input");
    out[wk] = v;
  }
  return out;
}

function normalizeOrderBoundaryMap(raw: unknown): BoundaryMap<string[]> {
  const obj = reqClosedObject(raw);
  const out: BoundaryMap<string[]> = {};
  for (const [wk, v] of Object.entries(obj)) {
    reqWeekKey(wk);
    if (!Array.isArray(v) || v.length > TRAINING_LIMITS.maxSessions)
      throw new TrainingError("invalid_input");
    out[wk] = v.map(reqId);
  }
  return out;
}

/**
 * Strict closed validation + normalization of the draft boundary
 * document. Unknown keys at every level → `invalid_input`. Every node
 * reference must resolve to a declared session/exercise — dangling node
 * keys are rejected (structural coherence, not an error at render).
 */
export function normalizeTrainingDraft(raw: unknown): TrainingDraft {
  const obj = reqClosedObject(raw);
  const allowed = new Set([
    "programMode",
    "sessions",
    "exercises",
    "sessionOrder",
    "exerciseOrder",
    "sessionPresence",
    "exercisePresence",
    "sessionNames",
    "fieldCells",
  ]);
  if (Object.keys(obj).some((k) => !allowed.has(k)))
    throw new TrainingError("invalid_input");
  if (obj.programMode !== "WEEK_BASED" && obj.programMode !== "EVERGREEN")
    // Any other mode fails closed — never coerced.
    throw new TrainingError("invalid_input");

  const sessionsRaw = obj.sessions ?? [];
  if (
    !Array.isArray(sessionsRaw) ||
    sessionsRaw.length > TRAINING_LIMITS.maxSessions
  )
    throw new TrainingError("invalid_input");
  const sessions = sessionsRaw.map((s) => {
    const o = reqClosedObject(s);
    if (Object.keys(o).some((k) => k !== "id" && k !== "name"))
      throw new TrainingError("invalid_input");
    return {
      id: reqId(o.id),
      name: reqText(o.name, TRAINING_LIMITS.sessionNameMax),
    };
  });
  const sessionIds = new Set(sessions.map((s) => s.id));
  if (sessionIds.size !== sessions.length)
    throw new TrainingError("invalid_input");

  const exercisesRaw = obj.exercises ?? [];
  if (!Array.isArray(exercisesRaw)) throw new TrainingError("invalid_input");
  const perSessionCount = new Map<string, number>();
  const exercises = exercisesRaw.map((e) => {
    const o = reqClosedObject(e);
    if (
      Object.keys(o).some(
        (k) => !["id", "sessionId", "name", "catalogItemId"].includes(k),
      )
    )
      throw new TrainingError("invalid_input");
    const sessionId = reqId(o.sessionId);
    if (!sessionIds.has(sessionId)) throw new TrainingError("invalid_input");
    const n = (perSessionCount.get(sessionId) ?? 0) + 1;
    if (n > TRAINING_LIMITS.maxExercisesPerSession)
      throw new TrainingError("invalid_input");
    perSessionCount.set(sessionId, n);
    const catalogItemId = optText(
      o.catalogItemId,
      TRAINING_LIMITS.catalogItemIdMax,
    );
    return {
      id: reqId(o.id),
      sessionId,
      name: reqText(o.name, TRAINING_LIMITS.exerciseNameMax),
      ...(catalogItemId !== undefined ? { catalogItemId } : {}),
    };
  });
  const exerciseIds = new Set(exercises.map((e) => e.id));
  if (exerciseIds.size !== exercises.length)
    throw new TrainingError("invalid_input");

  const draft: TrainingDraft = {
    programMode: obj.programMode as TrainingDraft["programMode"],
    sessions,
    exercises,
    sessionOrder: normalizeOrderBoundaryMap(obj.sessionOrder ?? {}),
    exerciseOrder: {},
    sessionPresence: {},
    exercisePresence: {},
    sessionNames: {},
    fieldCells: {},
  };

  // Order boundaries may only reference declared sessions/exercises.
  for (const ids of Object.values(draft.sessionOrder))
    for (const id of ids)
      if (!sessionIds.has(id)) throw new TrainingError("invalid_input");

  const eo = reqClosedObject(obj.exerciseOrder ?? {});
  for (const [sid, bm] of Object.entries(eo)) {
    if (!sessionIds.has(sid)) throw new TrainingError("invalid_input");
    const norm = normalizeOrderBoundaryMap(bm);
    for (const ids of Object.values(norm))
      for (const id of ids)
        if (!exerciseIds.has(id)) throw new TrainingError("invalid_input");
    draft.exerciseOrder[sid] = norm;
  }

  const sp = reqClosedObject(obj.sessionPresence ?? {});
  for (const [sid, bm] of Object.entries(sp)) {
    if (!sessionIds.has(sid)) throw new TrainingError("invalid_input");
    draft.sessionPresence[sid] = normalizeBoolBoundaryMap(bm);
  }

  const ep = reqClosedObject(obj.exercisePresence ?? {});
  for (const [key, bm] of Object.entries(ep)) {
    const [sid, eid] = key.split("/");
    if (!sid || !eid || !sessionIds.has(sid) || !exerciseIds.has(eid))
      throw new TrainingError("invalid_input");
    draft.exercisePresence[key] = normalizeBoolBoundaryMap(bm);
  }

  const sn = reqClosedObject(obj.sessionNames ?? {});
  for (const [sid, bm] of Object.entries(sn)) {
    if (!sessionIds.has(sid)) throw new TrainingError("invalid_input");
    draft.sessionNames[sid] = normalizeStringBoundaryMap(
      bm,
      TRAINING_LIMITS.sessionNameMax,
    );
  }

  const fc = reqClosedObject(obj.fieldCells ?? {});
  for (const [key, bm] of Object.entries(fc)) {
    const parts = key.split("/");
    if (parts.length !== 3) throw new TrainingError("invalid_input");
    const [sid, eid, payloadKey] = parts;
    if (
      !sessionIds.has(sid) ||
      !exerciseIds.has(eid) ||
      !ADDRESSABLE_CELL_KEYS.has(payloadKey)
    )
      throw new TrainingError("invalid_input");
    const norm = normalizeValueBoundaryMap(bm);
    // Per-key value bounds.
    for (const v of Object.values(norm)) {
      switch (payloadKey) {
        case "sets":
          if (
            typeof v !== "number" ||
            v < TRAINING_LIMITS.setsMin ||
            v > TRAINING_LIMITS.setsMax
          )
            throw new TrainingError("invalid_input");
          break;
        case "reps":
          if (typeof v !== "string" || v.length > TRAINING_LIMITS.repsTextMax)
            throw new TrainingError("invalid_input");
          break;
        case "tempo":
          if (typeof v !== "string" || v.length > TRAINING_LIMITS.tempoMax)
            throw new TrainingError("invalid_input");
          break;
        case "setType":
          if (typeof v !== "string" || v.length > TRAINING_LIMITS.setTypeMax)
            throw new TrainingError("invalid_input");
          break;
        case "rest":
          if (typeof v !== "string" || v.length > TRAINING_LIMITS.restMax)
            throw new TrainingError("invalid_input");
          break;
        case "instructions":
          if (
            typeof v !== "string" ||
            v.length > TRAINING_LIMITS.instructionsMax
          )
            throw new TrainingError("invalid_input");
          break;
        case "progressionNotes":
          if (
            typeof v !== "string" ||
            v.length > TRAINING_LIMITS.progressionNotesMax
          )
            throw new TrainingError("invalid_input");
          break;
        case "note":
          if (typeof v !== "string" || v.length > TRAINING_LIMITS.noteMax)
            throw new TrainingError("invalid_input");
          break;
      }
    }
    draft.fieldCells[key] = norm;
  }

  if (byteLen(draft) > TRAINING_LIMITS.payloadMaxBytes)
    throw new TrainingError("invalid_input");
  return draft;
}

// ── Boundary resolution + materialization ────────────────────────────────

function resolveBoundary<V>(bm: BoundaryMap<V>, week: number): V | undefined {
  let best = -1;
  for (const k of Object.keys(bm)) {
    const w = Number(k);
    if (w <= week && w > best) best = w;
  }
  return best < 0 ? undefined : bm[String(best)];
}

function isPresent(
  bm: BoundaryMap<boolean> | undefined,
  week: number,
): boolean {
  if (!bm) return false;
  return resolveBoundary(bm, week) === true;
}

export type MaterializedExercise = {
  id: string;
  name: string;
  catalogItemId?: string;
  sets?: number;
  reps?: string;
  tempo?: string;
  setType?: string;
  rest?: string;
  instructions?: string;
  progressionNotes?: string;
  note?: string;
};

export type MaterializedSession = {
  id: string;
  name: string;
  exercises: MaterializedExercise[];
};

export type MaterializedWeek = {
  week: number;
  sessions: MaterializedSession[];
};

export type MaterializedProgram = {
  programMode: "WEEK_BASED" | "EVERGREEN";
  startDate: string;
  weekCount: number;
  weeks: MaterializedWeek[];
};

/**
 * Projection of the boundary sets into weeks 1..weekCount (P4 §3.4).
 * Sparse boundaries beyond a shrunk weekCount are simply never
 * materialized — re-extending restores them (P4 §3.6).
 */
export function materializeWeeks(
  draft: TrainingDraft,
  startDate: string,
  weekCount: number,
): MaterializedProgram {
  const weeks: MaterializedWeek[] = [];
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

    const sessions: MaterializedSession[] = [];
    for (const s of ordered) {
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

      const materialized: MaterializedExercise[] = [];
      for (const e of orderedEx) {
        const ex: MaterializedExercise = { id: e.id, name: e.name };
        if (e.catalogItemId !== undefined) ex.catalogItemId = e.catalogItemId;
        for (const key of ADDRESSABLE_CELL_KEYS) {
          const v = resolveBoundary(
            draft.fieldCells[`${s.id}/${e.id}/${key}`] ?? {},
            w,
          );
          if (v !== undefined) (ex as Record<string, unknown>)[key] = v;
        }
        materialized.push(ex);
      }
      sessions.push({ id: s.id, name, exercises: materialized });
    }
    weeks.push({ week: w, sessions });
  }
  return { programMode: draft.programMode, startDate, weekCount, weeks };
}

/**
 * Publish completeness (P3 §4.4): at least one exercise prescribed in the
 * program; every materialized exercise must carry `sets` when the sets
 * toggle is on and `reps` when either rep toggle is on.
 */
export function validatePublishCompleteness(
  materialized: MaterializedProgram,
  cfg: TrainingFieldConfig,
): void {
  let any = false;
  for (const wk of materialized.weeks)
    for (const s of wk.sessions)
      for (const ex of s.exercises) {
        any = true;
        if (cfg.sets && ex.sets === undefined)
          throw new TrainingError("publish_incomplete");
        if ((cfg.fixedReps || cfg.repRanges) && ex.reps === undefined)
          throw new TrainingError("publish_incomplete");
      }
  if (!any) throw new TrainingError("publish_incomplete");
}

/**
 * Client serialization gate (P4 §6): every client-facing projection is
 * filtered through the applicable version's snapshotted fieldConfig —
 * disabled-field values are never serialized; retained in storage only.
 * `note` is always-on.
 */
export function projectForClient(
  materialized: MaterializedProgram,
  cfg: TrainingFieldConfig,
): MaterializedProgram {
  const enabled = enabledPayloadKeys(cfg);
  return {
    ...materialized,
    weeks: materialized.weeks.map((wk) => ({
      week: wk.week,
      sessions: wk.sessions.map((s) => ({
        id: s.id,
        name: s.name,
        exercises: s.exercises.map((ex) => {
          const out: MaterializedExercise = { id: ex.id, name: ex.name };
          for (const [k, v] of Object.entries(ex)) {
            if (k === "id" || k === "name") continue;
            if (k === "catalogItemId" || enabled.has(k))
              (out as Record<string, unknown>)[k] = v;
          }
          return out;
        }),
      })),
    })),
  };
}

/**
 * Deterministic serialization immune to JSONB key reordering: PG jsonb
 * stores object keys sorted by (length, bytes), so a draft read back
 * serializes differently than an equal in-memory draft. Every canonical
 * comparison in the service must go through this — never raw
 * JSON.stringify on round-tripped JSON.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

/**
 * Canonical content for the save-audit `changed` marker (PROMPT 244 §3-G):
 * the COMPLETE canonical draft including confirmedTimezone. Two saves are
 * content-identical iff their canonical forms serialize equal.
 */
export function canonicalDraftContent(input: {
  title: string;
  startDate: string;
  weekCount: number;
  fieldConfig: TrainingFieldConfig;
  confirmedTimezone: string | null;
  draft: TrainingDraft;
}): string {
  // Stable key order via canonicalJson — safe across JSONB round-trips.
  return canonicalJson({
    title: input.title,
    startDate: input.startDate,
    weekCount: input.weekCount,
    fieldConfig: TRAINING_FIELD_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: input.fieldConfig[k] }),
      {} as TrainingFieldConfig,
    ),
    confirmedTimezone: input.confirmedTimezone,
    draft: input.draft,
  });
}
