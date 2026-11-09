import {
  displayWeek,
  exerciseKey,
  scheduledSessions,
  weekRange,
} from "../../../client-app/training-log/model";
import { applicablePlan, trainingVersionAt } from "../domain";
import type {
  LoggedSet,
  PlanLifecycle,
  TrainingCoachNote,
  TrainingExercise,
  TrainingPlan,
  TrainingSessionLog,
  TrainingSet,
} from "../types";
import { effectiveSessions } from "./training-model";

export type LogbookWeek = {
  week: number;
  start: string;
  end: string;
  isCurrent: boolean;
  versionChanged?: { activatedAt: string };
};

export type TrendDir = "up" | "down";
export type LogbookSet = {
  /** index within the prescribed set list (0-based) */
  index: number;
  logged?: LoggedSet;
  isNew?: boolean;
  /**
   * vs the same set index in the most recent earlier week that has a logged
   * value for that field; "up"/"down" vs prev, equal/missing → omitted.
   */
  trend?: Partial<
    Record<
      "weight" | "reps" | "rir" | "rpe",
      { dir: TrendDir; prev: number; prevWeek: number }
    >
  >;
};

export type LogbookCell = {
  status: "logged" | "planned" | "not-in-plan" | "removed" | "not-scheduled";
  /** a past week that was scheduled but has no finished log → "Not logged" chip */
  missed?: boolean;
  prescription?: TrainingExercise;
  sets: LogbookSet[];
  /** indices of struck-through "removed" rows appended after the live sets */
  removedSets: number[];
  changes: string[];
  /** set-level coach notes, keyed `"setIndex:field"` (field "" = set-level) */
  cellNotes: Record<string, TrainingCoachNote[]>;
  /** exercise-level ("All sets") coach notes — setIndex undefined */
  exerciseNotes: TrainingCoachNote[];
  /** collapsed top-set arrow: this week's top set vs the last earlier week's top */
  topTrend?: {
    dir: TrendDir;
    prev: { weight: number; reps: number };
    prevWeek: number;
  };
};

export type LogbookExercise = {
  key: string;
  name: string;
  muscle?: string;
  current?: TrainingExercise;
  addedInWeek?: number;
  removedInWeek?: number;
  history: string[];
  cells: LogbookCell[];
};

export type Logbook = {
  plan: TrainingPlan;
  weeks: LogbookWeek[];
  exercises: LogbookExercise[];
};

function sessionForWeek(
  content: TrainingPlan,
  range: { start: string; end: string },
  sessionId: string,
) {
  // Per-week overrides are keyed by display week (the column's index), so the
  // week's session template is the latest override at or before this week.
  return effectiveSessions(content, displayWeek(content, range.start)).find(
    (s) => s.id === sessionId,
  );
}

const repsOf = (s: TrainingSet) =>
  s.repsMax && s.repsMax !== s.reps ? `${s.reps}–${s.repsMax}` : `${s.reps}`;

/** Plain-words change list vs the previous week the exercise existed. */
export function diffPrescriptions(
  a: TrainingExercise | undefined,
  b: TrainingExercise | undefined,
  /** the template's intensity — only that target is reported */
  intensity?: "rir" | "rpe",
): string[] {
  if (!a || !b) return [];
  const d: string[] = [];
  if (b.sets.length !== a.sets.length)
    d.push(
      `${b.sets.length > a.sets.length ? "+" : "−"}${Math.abs(b.sets.length - a.sets.length)} set`,
    );
  const sa = a.sets[0];
  const sb = b.sets[0];
  if (sa && sb) {
    if (repsOf(sa) !== repsOf(sb)) d.push(`Reps ${repsOf(sa)} → ${repsOf(sb)}`);
    if (intensity === "rir" && sa.rir !== sb.rir)
      d.push(`RIR ${sa.rir ?? "–"} → ${sb.rir ?? "–"}`);
    if (intensity === "rpe" && sa.rpe !== sb.rpe)
      d.push(`RPE ${sa.rpe ?? "–"} → ${sb.rpe ?? "–"}`);
    if (sa.tempo !== sb.tempo) d.push(`Tempo ${sa.tempo} → ${sb.tempo}`);
    if (sa.rest !== sb.rest) d.push(`Rest ${sa.rest} → ${sb.rest}`);
    if (sa.type !== sb.type) d.push(`Type ${sa.type} → ${sb.type}`);
  }
  return d;
}

/** Notes applying to one exercise of one session for a given week. */
/**
 * Group the set-level coach notes applying to one exercise in one week by the
 * value cell they point at. Keys are `"setIndex:field"` — `field` is a logged
 * column ("weight" | "reps" | "rir" | "rpe" | "note") or "" for a set note with
 * no field, which renders on the set-number cell.
 *
 * Scope: a note applies from `fromWeek` to `untilWeek` (undefined = onwards),
 * to the same setIndex + field, only while the exercise has that set
 * (`setIndex < setCount`). A field the template doesn't log isn't rendered but
 * the note is kept. Exercise-level notes (`setIndex` undefined) are returned by
 * `exerciseNotesFor` instead.
 */
export function cellNotesFor(
  notes: TrainingCoachNote[],
  args: {
    sessionId: string;
    exerciseKey: string;
    week: number;
    setCount: number;
  },
): Record<string, TrainingCoachNote[]> {
  const out: Record<string, TrainingCoachNote[]> = {};
  for (const n of notes) {
    if (n.sessionId !== args.sessionId || n.exerciseKey !== args.exerciseKey)
      continue;
    if (args.week < n.fromWeek) continue;
    if (n.untilWeek !== undefined && args.week > n.untilWeek) continue;
    if (n.setIndex === undefined) continue; // exercise-level → exerciseNotes
    if (n.setIndex >= args.setCount) continue;
    const key = `${n.setIndex}:${n.field ?? ""}`;
    const list = out[key] ?? [];
    out[key] = list;
    list.push(n);
  }
  for (const k of Object.keys(out))
    out[k].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}

/**
 * The exercise-level ("All sets") coach notes applying to one exercise-week —
 * `setIndex` is undefined. They apply onwards while the exercise exists (the
 * caller only asks for weeks where the exercise is in the plan).
 */
export function exerciseNotesFor(
  notes: TrainingCoachNote[],
  args: { sessionId: string; exerciseKey: string; week: number },
): TrainingCoachNote[] {
  return notes
    .filter(
      (n) =>
        n.sessionId === args.sessionId &&
        n.exerciseKey === args.exerciseKey &&
        n.setIndex === undefined &&
        n.fromWeek <= args.week &&
        (n.untilWeek === undefined ? true : args.week <= n.untilWeek),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** all cell notes for one exercise-week, flattened (collapsed icon, client) */
export function cellNotesList(
  cellNotes: Record<string, TrainingCoachNote[]>,
): TrainingCoachNote[] {
  return Object.values(cellNotes).flat();
}

/** Human history lines, e.g. "+1 set since W3". */
function historyFor(
  cells: LogbookCell[],
  weeks: number[],
  intensity?: "rir" | "rpe",
): string[] {
  const out: string[] = [];
  for (let i = 1; i < cells.length; i++) {
    const c = cells[i];
    const prev = cells[i - 1];
    if (c.prescription && prev.prescription) {
      for (const ch of diffPrescriptions(
        prev.prescription,
        c.prescription,
        intensity,
      ))
        out.push(`${ch} since W${weeks[i]}`);
    }
  }
  return out;
}

export function buildLogbook(args: {
  lifecycle: PlanLifecycle<TrainingPlan>;
  logs: TrainingSessionLog[];
  notes: TrainingCoachNote[];
  today: string;
  sessionId: string;
  intensity?: "rir" | "rpe";
}): Logbook | undefined {
  const { lifecycle, logs, notes, today, sessionId, intensity } = args;
  const current = applicablePlan(lifecycle, today);
  if (!current) return undefined;
  const curWeek = Math.max(1, displayWeek(current, today));
  const nWeeks = Math.max(current.weeks, curWeek + 1);
  const weeks: LogbookWeek[] = [];
  const weekSession: ReturnType<typeof sessionForWeek>[] = [];
  const weekScheduled: boolean[] = [];
  let prevVersionId: string | undefined;
  for (let w = 1; w <= nWeeks; w++) {
    const range = weekRange(current, w);
    const versionDate =
      range.start < current.startDate ? current.startDate : range.start;
    const version = trainingVersionAt(lifecycle, versionDate);
    const content = version?.content ?? current;
    weekSession.push(sessionForWeek(content, range, sessionId));
    // whether the session actually occurs this week (a session in the plan
    // template but scheduled before the start date has no occurrence)
    weekScheduled.push(
      scheduledSessions(content, displayWeek(content, range.start)).some(
        (o) => o.session.id === sessionId,
      ),
    );
    const vChanged = version && prevVersionId && version.id !== prevVersionId;
    if (version) prevVersionId = version.id;
    weeks.push({
      week: w,
      start: range.start,
      end: range.end,
      isCurrent: w === curWeek,
      versionChanged: vChanged
        ? { activatedAt: version.activatedAt }
        : undefined,
    });
  }

  // collect exercise identities in current-week order, then removed appended
  const seen = new Map<string, { name: string; muscle?: string }>();
  const curSess = weekSession[curWeek - 1];
  const order: string[] = [];
  for (const e of curSess?.exercises ?? []) {
    const k = exerciseKey(e);
    seen.set(k, { name: e.name, muscle: e.muscle });
    order.push(k);
  }
  const lastSeen = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  weekSession.forEach((s, wi) => {
    for (const e of s?.exercises ?? []) {
      const k = exerciseKey(e);
      if (!seen.has(k)) {
        seen.set(k, { name: e.name, muscle: e.muscle });
        order.push(k);
      }
      if (!firstSeen.has(k)) firstSeen.set(k, wi + 1);
      lastSeen.set(k, wi + 1);
    }
  });

  const exercises: LogbookExercise[] = order.map((key) => {
    const info = seen.get(key) ?? { name: key };
    const added = firstSeen.get(key) ?? 1;
    const removed = lastSeen.get(key) ?? 0;
    // this exercise's logged sets, per week — used for the trend arrows
    const loggedByWeek = weekSession.map((_, wi) => {
      const l = [...logs]
        .reverse()
        .find(
          (lg) =>
            lg.clientId === current.clientId &&
            lg.sessionId === sessionId &&
            lg.scheduledDate >= weeks[wi].start &&
            lg.scheduledDate <= weeks[wi].end,
        );
      return l?.exercises.find((le) => le.exerciseKey === key);
    });
    // the most recent earlier week (< wi) with a logged value for set i · field f
    const prevVal = (
      wi: number,
      i: number,
      f: "weight" | "reps" | "rir" | "rpe",
    ): { prev: number; prevWeek: number } | undefined => {
      for (let j = wi - 1; j >= 0; j--) {
        const v = loggedByWeek[j]?.sets[i]?.[f];
        if (v !== undefined && v !== null) return { prev: v, prevWeek: j + 1 };
      }
      return undefined;
    };
    // best logged set per week (max weight, then max reps) — for the collapsed arrow
    const topByWeek = loggedByWeek.map((lx) =>
      lx?.sets
        .filter((s): s is NonNullable<typeof s> => Boolean(s?.weight && s.reps))
        .reduce<{ weight: number; reps: number } | undefined>(
          (acc, s) =>
            !acc ||
            (s.weight ?? 0) > acc.weight ||
            ((s.weight ?? 0) === acc.weight && (s.reps ?? 0) > acc.reps)
              ? { weight: s.weight ?? 0, reps: s.reps ?? 0 }
              : acc,
          undefined,
        ),
    );
    const prevTop = (
      wi: number,
    ):
      | { prev: { weight: number; reps: number }; prevWeek: number }
      | undefined => {
      for (let j = wi - 1; j >= 0; j--) {
        const t = topByWeek[j];
        if (t) return { prev: t, prevWeek: j + 1 };
      }
      return undefined;
    };
    const cellsArr: LogbookCell[] = weekSession.map((sess, wi) => {
      const week = wi + 1;
      const ex = sess?.exercises.find((e) => exerciseKey(e) === key);
      const loggedEx = loggedByWeek[wi];
      if (!ex)
        // absent from this week's plan — an "onwards" note does not continue here
        return {
          status: week < added ? "not-in-plan" : "removed",
          sets: [],
          removedSets: [],
          changes: [],
          cellNotes: {},
          exerciseNotes: [],
        };
      if (!weekScheduled[wi])
        // the session exists in this week's template but doesn't occur (e.g. a
        // Monday session in a week that starts mid-week) → a muted single line
        return {
          status: "not-scheduled",
          prescription: ex,
          sets: [],
          removedSets: [],
          changes: [],
          cellNotes: cellNotesFor(notes, {
            sessionId,
            exerciseKey: key,
            week,
            setCount: ex.sets.length,
          }),
          exerciseNotes: exerciseNotesFor(notes, {
            sessionId,
            exerciseKey: key,
            week,
          }),
        };
      const prevEx =
        wi > 0
          ? weekSession[wi - 1]?.exercises.find((e) => exerciseKey(e) === key)
          : undefined;
      const changes = wi > 0 ? diffPrescriptions(prevEx, ex, intensity) : [];
      const n = Math.max(ex.sets.length, loggedEx?.sets.length ?? 0);
      const sets: LogbookSet[] = Array.from({ length: n }, (_, i) => {
        const logged = loggedEx?.sets[i];
        const trend: NonNullable<LogbookSet["trend"]> = {};
        if (logged) {
          for (const f of ["weight", "reps", "rir", "rpe"] as const) {
            const cur = logged[f];
            if (cur === undefined || cur === null) continue;
            const pv = prevVal(wi, i, f);
            if (!pv || pv.prev === cur) continue;
            trend[f] = {
              dir: cur > pv.prev ? "up" : "down",
              prev: pv.prev,
              prevWeek: pv.prevWeek,
            };
          }
        }
        return {
          index: i,
          logged,
          isNew: prevEx ? i >= prevEx.sets.length && i < ex.sets.length : false,
          trend: Object.keys(trend).length ? trend : undefined,
        };
      });
      const removedSets =
        prevEx && ex.sets.length < prevEx.sets.length
          ? Array.from(
              { length: prevEx.sets.length - ex.sets.length },
              (_, k) => ex.sets.length + k,
            )
          : [];
      const pt = loggedEx ? prevTop(wi) : undefined;
      const curTop = topByWeek[wi];
      return {
        status: loggedEx ? "logged" : "planned",
        // a past scheduled week with no finished log reads "Not logged"
        missed: week < curWeek && !loggedEx,
        prescription: ex,
        sets,
        removedSets,
        topTrend:
          pt &&
          curTop &&
          (curTop.weight !== pt.prev.weight || curTop.reps !== pt.prev.reps)
            ? {
                dir:
                  curTop.weight > pt.prev.weight ||
                  (curTop.weight === pt.prev.weight &&
                    curTop.reps > pt.prev.reps)
                    ? "up"
                    : "down",
                prev: pt.prev,
                prevWeek: pt.prevWeek,
              }
            : undefined,
        changes,
        cellNotes: cellNotesFor(notes, {
          sessionId,
          exerciseKey: key,
          week,
          setCount: n,
        }),
        exerciseNotes: exerciseNotesFor(notes, {
          sessionId,
          exerciseKey: key,
          week,
        }),
      };
    });
    const wkNums = weeks.map((w) => w.week);
    const cur = curSess?.exercises.find((e) => exerciseKey(e) === key);
    return {
      key,
      name: info.name,
      muscle: info.muscle,
      current:
        cur ??
        weekSession[removed - 1]?.exercises.find((e) => exerciseKey(e) === key),
      addedInWeek: added > 1 ? added : undefined,
      removedInWeek: removed < nWeeks ? removed + 1 : undefined,
      history: historyFor(cellsArr, wkNums),
      cells: cellsArr,
    };
  });
  return { plan: current, weeks, exercises };
}
