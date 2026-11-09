import { useEffect, useMemo, useRef, useState } from "react";
import { effectiveLogFields } from "../../../client-app/training-log/model";
import type { CoachClient } from "../../model";
import { useCoach } from "../../store";
import { useLocalToday } from "../../targets/use-local-today";
import { templateSetup } from "../../template-setup";
import { Toggle } from "../../ui";
import { applicablePlan, trainingWeek } from "../domain";
import type {
  TrainingCoachNote,
  TrainingExercise,
  TrainingPlan,
} from "../types";
import {
  buildLogbook,
  cellNotesList,
  type LogbookCell,
  type LogbookExercise,
  type LogbookWeek,
} from "./logbook-model";
import { effectiveSessions } from "./training-model";
import "./logbook.css";

const LF_LABEL: Record<string, string> = {
  weight: "kg",
  reps: "Reps",
  rir: "RIR",
  rpe: "RPE",
  note: "Note",
};
const COLS: Record<string, string> = {
  weight: "60px",
  reps: "52px",
  rir: "36px",
  rpe: "36px",
  note: "minmax(0,1fr)",
};
const fmt = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

function prescShort(ex: TrainingExercise, intensity?: "rir" | "rpe"): string {
  const s = ex.sets[0];
  const r =
    s?.repsMax && s.repsMax !== s.reps
      ? `${s.reps}–${s.repsMax}`
      : `${s?.reps ?? ""}`;
  const target =
    intensity === "rir" ? s?.rir : intensity === "rpe" ? s?.rpe : undefined;
  return `${ex.sets.length} × ${r}${
    target === undefined
      ? ""
      : ` · ${intensity === "rir" ? "RIR" : "RPE"} ${target}`
  }`;
}
function _prescFor(ex: TrainingExercise, fields: string[]): string {
  const s = ex.sets[0];
  const r =
    s?.repsMax && s.repsMax !== s.reps
      ? `${s.reps}–${s.repsMax}`
      : `${s?.reps ?? ""}`;
  const out: string[] = [];
  if (fields.includes("Sets")) out.push(`${ex.sets.length} sets`);
  if (fields.includes("Rep ranges")) out.push(`${r} reps`);
  else if (fields.includes("Fixed reps"))
    out.push(`${r.split("–").pop()} reps`);
  if (fields.includes("Set type") && s?.type) out.push(s.type);
  if (fields.includes("Tempo") && s?.tempo) out.push(`Tempo ${s.tempo}`);
  if (fields.includes("Rest / pause") && s?.rest) out.push(`Rest ${s.rest}`);
  return out.join(" · ");
}

type NoteDraft = {
  id?: string;
  exerciseKey?: string;
  week?: number;
  setIndex?: number;
  scope?: "only" | "onwards";
  text?: string;
};

export function TrainingLogbook({
  client,
  sessionId,
  onBack,
}: {
  client: CoachClient;
  sessionId?: string;
  onBack: () => void;
}) {
  const { state, setState } = useCoach();
  const today = useLocalToday();
  const lifecycle = client.plans?.training;
  const configuration = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const tcfg = configuration?.training;
  const logFields = effectiveLogFields(tcfg);
  const intensity =
    tcfg?.intensity === "rir" || tcfg?.intensity === "rpe"
      ? tcfg.intensity
      : undefined;

  const [sessId, setSessId] = useState<string | undefined>(sessionId);
  const [showChanges, setShowChanges] = useState(true);
  const [hideRemoved, setHideRemoved] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [pop, setPop] = useState<{
    mode: "add";
    exerciseKey: string;
    exName: string;
    week: number;
    cell: LogbookCell;
  } | null>(null);

  const current = applicablePlan(lifecycle ?? { history: [] }, today) as
    | TrainingPlan
    | undefined;
  const sessNames: { id: string; name: string }[] = useMemo(() => {
    if (!current) return [];
    const wk = trainingWeek(current, today);
    const out = new Map<string, string>();
    // union of every week's session list, in current-week order first
    for (const sess of effectiveSessions(current, wk))
      out.set(sess.id, sess.name);
    for (const w of Object.keys(current.overrides ?? {}))
      for (const sess of effectiveSessions(current, Number(w)))
        if (!out.has(sess.id)) out.set(sess.id, sess.name);
    return [...out.entries()].map(([id, name]) => ({ id, name }));
  }, [current, today]);

  const activeSess = sessId ?? sessNames[0]?.id;
  const logbook = useMemo(
    () =>
      lifecycle && activeSess
        ? buildLogbook({
            lifecycle,
            logs: state.trainingLogs ?? [],
            notes: state.trainingNotes ?? [],
            today,
            sessionId: activeSess,
            intensity,
          })
        : undefined,
    [
      lifecycle,
      state.trainingLogs,
      state.trainingNotes,
      today,
      activeSess,
      intensity,
    ],
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollLeft > 4);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  const drag = useRef<{ x: number; l: number } | null>(null);

  if (!logbook) return null;
  const exercises = hideRemoved
    ? logbook.exercises.filter((e) => e.removedInWeek === undefined)
    : logbook.exercises;
  const hasRemoved = logbook.exercises.some(
    (e) => e.removedInWeek !== undefined,
  );
  const exNum = new Map(exercises.map((e, i) => [e.key, i + 1]));

  const saveNote = (d: NoteDraft) => {
    if (!d.text?.trim()) return;
    const existing = d.id
      ? (state.trainingNotes ?? []).find((n) => n.id === d.id)
      : undefined;
    if (!existing && (d.exerciseKey === undefined || d.week === undefined))
      return;
    const note: TrainingCoachNote = existing
      ? {
          ...existing,
          text: d.text,
          setIndex: d.setIndex,
          untilWeek: d.scope === "only" ? existing.fromWeek : undefined,
          updatedAt: new Date().toISOString(),
        }
      : {
          id: `note-${Date.now().toString(36)}-${Math.round(Math.random() * 9999)}`,
          clientId: client.id,
          sessionId: activeSess ?? "",
          exerciseKey: d.exerciseKey ?? "",
          setIndex: d.setIndex,
          fromWeek: d.week ?? 1,
          untilWeek: d.scope === "onwards" ? undefined : d.week,
          text: d.text,
          createdAt: new Date().toISOString(),
        };
    setState((s) => ({
      ...s,
      trainingNotes: existing
        ? (s.trainingNotes ?? []).map((n) => (n.id === note.id ? note : n))
        : [...(s.trainingNotes ?? []), note],
    }));
    setPop(null);
  };
  const deleteNote = (id: string) => {
    setState((s) => ({
      ...s,
      trainingNotes: (s.trainingNotes ?? []).filter((n) => n.id !== id),
    }));
    setPop(null);
  };

  const cols = `300px ${logbook.weeks
    .map((w) => (collapsed.has(w.week) ? "112px" : "270px"))
    .join(" ")}`;
  const setCols = `24px ${logFields.map((f) => COLS[f]).join(" ")}`;
  const sessName =
    sessNames.find((s) => s.id === activeSess)?.name ?? "Session";
  const lastLogged = [...(state.trainingLogs ?? [])]
    .reverse()
    .find((l) => l.sessionId === activeSess && l.finishedAt)?.scheduledDate;

  return (
    <div className="lb">
      <div className="lb-toolbar">
        <button type="button" className="lb-back" onClick={onBack}>
          ‹ Training
        </button>
        <div className="lb-ttl">Logbook</div>
        <div className="lb-right">
          <Toggle
            label="Show changes"
            checked={showChanges}
            onChange={setShowChanges}
          />
          {hasRemoved && (
            <Toggle
              label="Hide removed exercises"
              checked={hideRemoved}
              onChange={setHideRemoved}
            />
          )}
          <button
            type="button"
            className="tbtn"
            onClick={() => {
              const el = canvasRef.current;
              const cur = logbook.weeks.findIndex((w) => w.isCurrent);
              if (el && cur >= 0) el.scrollLeft = 300 + cur * (270 + 18) - 40;
            }}
          >
            Jump to current week
          </button>
          <button
            type="button"
            className="tbtn"
            onClick={() =>
              setCollapsed(
                collapsed.size
                  ? new Set()
                  : new Set(
                      logbook.weeks
                        .filter((w) => !w.isCurrent)
                        .map((w) => w.week),
                    ),
              )
            }
          >
            {collapsed.size ? "Expand weeks" : "Collapse weeks"}
          </button>
        </div>
      </div>
      <div className="lb-subbar">
        <div className="lb-seg">
          {sessNames.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === activeSess ? "on" : ""}
              onClick={() => setSessId(s.id)}
            >
              {s.name.split(" · ")[0]}
            </button>
          ))}
        </div>
        {lastLogged && (
          <span className="lb-last">last logged {fmt(lastLogged)}</span>
        )}
      </div>
      <div
        ref={canvasRef}
        className="lb-canvas"
        data-scrolled={scrolled ? "1" : "0"}
        onPointerDown={(e) => {
          drag.current = {
            x: e.clientX,
            l: canvasRef.current?.scrollLeft ?? 0,
          };
        }}
        onPointerMove={(e) => {
          if (drag.current && canvasRef.current)
            canvasRef.current.scrollLeft =
              drag.current.l - (e.clientX - drag.current.x);
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <div className={`lb-gw${showChanges ? " showchg" : ""}`}>
          {showChanges && logbook.weeks.some((w) => w.versionChanged) && (
            <div className="lb-verrow" style={{ gridTemplateColumns: cols }}>
              <div />
              {logbook.weeks.map((w) => (
                <div key={w.week} className="lb-vc">
                  {w.versionChanged && (
                    <>
                      <i className="lb-vline" />
                      <span
                        className="lb-vlab"
                        title={`New plan version · Activated ${fmt(w.versionChanged.activatedAt.slice(0, 10))} · open plan`}
                      >
                        New plan version ·{" "}
                        {fmt(w.versionChanged.activatedAt.slice(0, 10))}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="lb-wkhead" style={{ gridTemplateColumns: cols }}>
            <div className="lb-blank" />
            {logbook.weeks.map((w) => (
              <div
                key={w.week}
                className={`lb-wh${w.isCurrent ? " cur" : ""}${collapsed.has(w.week) ? " collapsed" : ""}`}
              >
                {showChanges && w.versionChanged && <i className="lb-vmark" />}
                <button
                  type="button"
                  className="lb-wh-t"
                  onClick={() =>
                    setCollapsed((c) => {
                      const n = new Set(c);
                      if (n.has(w.week)) n.delete(w.week);
                      else n.add(w.week);
                      return n;
                    })
                  }
                  aria-label={`${collapsed.has(w.week) ? "Expand" : "Collapse"} week ${w.week}`}
                >
                  <span>
                    W{w.week}
                    {w.isCurrent ? " · This week" : ""}
                  </span>
                  <span className="lb-sub">
                    {collapsed.has(w.week)
                      ? fmt(w.start)
                      : `${fmt(w.start)} – ${fmt(w.end)}`}
                  </span>
                  {collapsed.has(w.week) && <ChevDown />}
                </button>
                {!collapsed.has(w.week) && (
                  <div
                    className="lb-colhead"
                    style={{ gridTemplateColumns: setCols }}
                  >
                    <span className="sc-set">Set</span>
                    {logFields.map((f) => (
                      <span
                        key={f}
                        className={`sc-col${f === "note" ? " sc-left" : ""}`}
                      >
                        {LF_LABEL[f]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {exercises.map((ex) => (
            <div
              key={ex.key}
              className="lb-exrow"
              style={{ gridTemplateColumns: cols }}
            >
              <div className="lb-exmask">
                <div className="lb-excard">
                  <span className="nr">{exNum.get(ex.key)}</span>
                  <span className="exn">{ex.name}</span>
                  {ex.current && (
                    <span className="presc">
                      {prescShort(ex.current, intensity)}
                    </span>
                  )}
                </div>
              </div>
              {logbook.weeks.map((w, wi) => (
                <WeekCard
                  key={w.week}
                  week={w}
                  ex={ex}
                  isFirstRemoved={w.week === ex.removedInWeek}
                  cell={ex.cells[wi]}
                  lf={logFields}
                  showChanges={showChanges}
                  collapsed={collapsed.has(w.week)}
                  onOpenNotes={(exName, wk, cell) =>
                    setPop({
                      mode: "add",
                      exerciseKey: ex.key,
                      exName,
                      week: wk,
                      cell,
                    })
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {pop && (
        <NotePopover
          pop={pop}
          sessName={sessName}
          clientName={client.name.split(" ")[0]}
          onClose={() => setPop(null)}
          onSave={saveNote}
          onDelete={deleteNote}
        />
      )}
    </div>
  );
}

function NoteIcon() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      style={{ verticalAlign: "-1px" }}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function ChevDown() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function WeekCard({
  week,
  ex,
  isFirstRemoved,
  cell,
  lf,
  showChanges,
  collapsed,
  intensity,
  onOpenNotes,
}: {
  week: LogbookWeek;
  ex: LogbookExercise;
  isFirstRemoved?: boolean;
  cell: LogbookCell;
  lf: string[];
  showChanges: boolean;
  collapsed?: boolean;
  intensity?: "rir" | "rpe";
  onOpenNotes: (exName: string, week: number, cell: LogbookCell) => void;
}) {
  const cols = `24px ${lf.map((f) => COLS[f]).join(" ")}`;
  const pres = cell.prescription;
  const top = cell.sets
    .map((s) => s.logged)
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
    .sort(
      (a, b) =>
        (b.weight ?? 0) - (a.weight ?? 0) || (b.reps ?? 0) - (a.reps ?? 0),
    )[0];
  const doneN = cell.sets.filter((s) => s.logged).length;
  const prescN = cell.prescription?.sets.length ?? cell.sets.length;
  const curPres = ex.current ? prescShort(ex.current, intensity) : undefined;
  const showPresc = Boolean(
    pres &&
      (cell.changes.length > 0 ||
        (curPres !== undefined && prescShort(pres, intensity) !== curPres)),
  );
  const _setNotes = Object.entries(cell.cellNotes)
    .flatMap(([k, list]) =>
      list.map((n) => ({ n, setIndex: Number(k.split(":")[0]) })),
    )
    .sort((a, b) => a.setIndex - b.setIndex);
  const allNotes = [...cell.exerciseNotes, ...cellNotesList(cell.cellNotes)];
  const hasNote = allNotes.length > 0;
  const cur = week.isCurrent ? " cur" : "";

  // a logged value's trend arrow — sheer, no colour judgement
  const arr = (setIndex: number, f: "weight" | "reps" | "rir" | "rpe") => {
    const t = cell.sets[setIndex]?.trend?.[f];
    if (!t) return null;
    return (
      <span
        className="lb-arr"
        aria-hidden="true"
        title={`Last time: ${t.prev} ${f === "weight" ? "kg" : f} · W${t.prevWeek}`}
      >
        {t.dir === "up" ? "↑" : "↓"}
      </span>
    );
  };
  const setDot = (setIndex: number) =>
    Object.keys(cell.cellNotes).some((k) => k.startsWith(`${setIndex}:`));

  if (collapsed) {
    const st = cell.status;
    return (
      <div className={`lb-wkcard collapsed${cur}`}>
        {hasNote && (
          <span
            className="lb-cni"
            title={allNotes.map((n) => n.text).join(" · ")}
          >
            <NoteIcon />
          </span>
        )}
        {st === "logged" && top && (
          <>
            <div className="lb-cs-top">
              {top.weight} × {top.reps}
              {cell.topTrend && (
                <span
                  className="lb-arr"
                  title={`Last time: ${cell.topTrend.prev.weight} × ${cell.topTrend.prev.reps} · W${cell.topTrend.prevWeek}`}
                >
                  {cell.topTrend.dir === "up" ? "↑" : "↓"}
                </span>
              )}
            </div>
            <div className="lb-cs-sub">
              {doneN}/{prescN} sets
            </div>
          </>
        )}
        {st === "planned" && <div className="lb-cs-sub">Planned</div>}
        {st === "not-scheduled" && <div className="lb-cs-sub">—</div>}
      </div>
    );
  }
  if (cell.status === "not-in-plan")
    return (
      <div className={`lb-wkcard${cur}`}>
        <div className="lb-mut">Not in plan yet</div>
      </div>
    );
  if (cell.status === "removed")
    return (
      <div className={`lb-wkcard${cur}`}>
        <div className="lb-mut">
          {isFirstRemoved ? `Removed from plan in W${week.week}` : "–"}
        </div>
      </div>
    );
  if (cell.status === "not-scheduled")
    return (
      <div className={`lb-wkcard${cur}`}>
        <div className="lb-mut">Not scheduled</div>
      </div>
    );
  // logged, past-not-logged (missed) and future planned — the whole card opens notes
  return (
    // biome-ignore lint/a11y/useSemanticElements: composite card opens a dialog
    <div
      className={`lb-wkcard lb-clickable${cur}`}
      role="button"
      tabIndex={0}
      aria-label={`Notes for ${ex.name}, week ${week.week}`}
      onClick={() => onOpenNotes(ex.name, week.week, cell)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenNotes(ex.name, week.week, cell);
        }
      }}
    >
      {cell.exerciseNotes.length > 0 && (
        <span
          className="lb-exnote"
          aria-hidden="true"
          title={cell.exerciseNotes.map((n) => n.text).join(" · ")}
        />
      )}
      {(cell.missed ||
        (showChanges && cell.changes.length > 0) ||
        showPresc) && (
        <div className="lb-flags">
          {showChanges && cell.changes.length > 0 && (
            <span className="lb-chip" title={cell.changes.join(" · ")}>
              Changed
              <span className="lb-vhide">{cell.changes.join(" · ")}</span>
            </span>
          )}
          {cell.missed && <span className="lb-chip">Not logged</span>}
          {showPresc && pres && (
            <span className="lb-wh-pres">{prescShort(pres, intensity)}</span>
          )}
        </div>
      )}
      {cell.sets.map((s) => (
        <div
          key={s.index}
          className={`lb-sr${s.logged ? "" : " empty"}${s.logged?.flagged ? " flag" : ""}`}
          style={{ gridTemplateColumns: cols }}
        >
          <span className="sc-set">
            {s.index + 1}
            {setDot(s.index) && (
              <span
                className="lb-sdot"
                aria-hidden="true"
                title={cell.cellNotes[`${s.index}:`]?.[0]?.text ?? "Note"}
              />
            )}
            {s.isNew && !lf.includes("note") && (
              <span className="lb-newtag">New</span>
            )}
          </span>
          {lf.map((f) => {
            if (f === "note")
              return (
                <span key={f} className="sc-note">
                  {s.isNew && <span className="lb-newtag">New</span>}
                  {s.logged?.note}
                </span>
              );
            const v = s.logged
              ? f === "weight"
                ? s.logged.weight
                : f === "reps"
                  ? s.logged.reps
                  : f === "rir"
                    ? s.logged.rir
                    : f === "rpe"
                      ? s.logged.rpe
                      : null
              : null;
            return (
              <span key={f} className="sc-num">
                {v ?? <i className="sc-mut">–</i>}
                {s.logged &&
                  arr(s.index, f as "weight" | "reps" | "rir" | "rpe")}
              </span>
            );
          })}
        </div>
      ))}
      {cell.removedSets.map((i) => (
        <div key={i} className="lb-sr removed">
          <span className="sc-set">Set {i + 1}</span>
          <span className="sc-num">removed</span>
        </div>
      ))}
      {cell.status === "planned" && !cell.sets.length && (
        <div className="lb-mut">
          {pres ? `${prescShort(pres, intensity)} planned` : "Planned"}
        </div>
      )}
    </div>
  );
}

function NotePopover({
  pop,
  sessName,
  clientName,
  onClose,
  onSave,
  onDelete,
}: {
  pop: {
    exerciseKey: string;
    exName: string;
    week: number;
    cell: LogbookCell;
  };
  sessName: string;
  clientName: string;
  onClose: () => void;
  onSave: (d: NoteDraft) => void;
  onDelete: (id: string) => void;
}) {
  const { cell, week, exName } = pop;
  // existing notes for this card: exercise-level then per-set
  const existing = [
    ...cell.exerciseNotes.map((n) => ({
      n,
      setIndex: undefined as number | undefined,
    })),
    ...Object.entries(cell.cellNotes).flatMap(([k, list]) =>
      list.map((n) => ({ n, setIndex: Number(k.split(":")[0]) })),
    ),
  ].sort((a, b) => (a.setIndex ?? -1) - (b.setIndex ?? -1));
  const [editing, setEditing] = useState<TrainingCoachNote | undefined>();
  const [text, setText] = useState("");
  const [scope, setScope] = useState<"only" | "onwards">("only");
  const [target, setTarget] = useState<number | undefined>(undefined); // undefined = all sets
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const fill = (n: TrainingCoachNote, setIndex?: number) => {
    setEditing(n);
    setText(n.text);
    setScope(n.untilWeek === undefined ? "onwards" : "only");
    setTarget(setIndex);
  };
  return (
    <div className="lb-pop-layer">
      <button
        type="button"
        className="lb-pop-back"
        aria-label="Close note"
        onClick={onClose}
      />
      <div className="lb-pop" role="dialog" aria-label="Coach note">
        <h4>
          {exName} · W{week}
        </h4>
        {existing.length > 0 && (
          <div className="lb-notelist">
            {existing.map(({ n, setIndex }) => (
              <div key={n.id} className="lb-noterow">
                <span className="lb-ntarget">
                  {setIndex === undefined ? "All sets" : `Set ${setIndex + 1}`}
                </span>
                <span className="lb-ntext" title={n.text}>
                  {n.text}
                </span>
                <span className="lb-nscope">
                  {n.untilWeek === undefined
                    ? `from W${n.fromWeek} onwards`
                    : `W${week} only`}
                </span>
                <button
                  type="button"
                  className="lb-nicon"
                  aria-label="Edit note"
                  onClick={() => fill(n, setIndex)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="lb-nicon"
                  aria-label="Delete note"
                  onClick={() => onDelete(n.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note for the client…"
          aria-label="Note text"
        />
        <div className="lb-seg lb-target">
          <button
            type="button"
            className={target === undefined ? "on" : ""}
            onClick={() => setTarget(undefined)}
          >
            All sets
          </button>
          {cell.sets.map((s) => (
            <button
              key={`Set ${s.index + 1}`}
              type="button"
              className={target === s.index ? "on" : ""}
              onClick={() => setTarget(s.index)}
            >
              Set {s.index + 1}
            </button>
          ))}
        </div>
        <div className="lb-seg lb-scope">
          <button
            type="button"
            className={scope === "only" ? "on" : ""}
            onClick={() => setScope("only")}
          >
            Week {week} only
          </button>
          <button
            type="button"
            className={scope === "onwards" ? "on" : ""}
            onClick={() => setScope("onwards")}
          >
            Week {week} onwards
          </button>
        </div>
        <div className="lb-sees">
          {clientName} sees this in {sessName} · Week {week}
        </div>
        <div className="lb-pop-actions">
          <button type="button" className="lb-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="lb-save"
            onClick={() =>
              onSave({
                id: editing?.id,
                exerciseKey: pop.exerciseKey,
                week,
                setIndex: target,
                text,
                scope,
              })
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
