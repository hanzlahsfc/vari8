"use client";

import { useState, useTransition, type ReactNode } from "react";

import {
  TRAINING_FIELD_KEYS,
  type TrainingDraft,
  type TrainingFieldConfig,
  type StaffProgramDetail,
} from "@/lib/trainingprogram/service";

import {
  cancelTrainingProgramAction,
  confirmTrainingTimezoneAction,
  publishTrainingVersionAction,
  saveTrainingDraftAction,
} from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/actions";

/**
 * TRAINING-I1A (PROMPT 244) — staff training-program draft editor.
 *
 * Client-side editing model only: the sparse week-boundary document is
 * edited directly — every cell write at week W is a boundary entry that
 * carries forward until a later explicit override. Nothing is computed:
 * no volume, no progression, no recommendations. Weeks at or below the
 * published-history ceiling render read-only; the server independently
 * rejects every locked-week change.
 */

const FIELD_LABELS: Record<(typeof TRAINING_FIELD_KEYS)[number], string> = {
  sets: "Sets",
  fixedReps: "Fixed reps",
  repRanges: "Rep ranges",
  tempo: "Tempo",
  setType: "Set type",
  restPause: "Rest / pause",
  instructions: "Instructions",
  progressionNotes: "Progression notes",
};

/** Boundary cell payload keys per field toggle (fixedReps/repRanges
 * share the "reps" cell — both render the same cell input). */
const CELL_FIELDS: readonly {
  toggle: string;
  cell: string;
  numeric: boolean;
}[] = [
  { toggle: "sets", cell: "sets", numeric: true },
  { toggle: "fixedReps", cell: "reps", numeric: false },
  { toggle: "repRanges", cell: "reps", numeric: false },
  { toggle: "tempo", cell: "tempo", numeric: false },
  { toggle: "setType", cell: "setType", numeric: false },
  { toggle: "restPause", cell: "rest", numeric: false },
  { toggle: "instructions", cell: "instructions", numeric: false },
  { toggle: "progressionNotes", cell: "progressionNotes", numeric: false },
];

function resolveBoundary<V>(
  bm: Record<string, V> | undefined,
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

function setBoundary<V>(
  bm: Record<string, V>,
  week: number,
  value: V | undefined,
): Record<string, V> {
  const out = { ...bm };
  if (value === undefined) delete out[String(week)];
  else out[String(week)] = value;
  return out;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function TrainingProgramEditor({
  workspaceId,
  clientProfileId,
  program,
  publishedPrograms,
  canWrite,
}: {
  workspaceId: string;
  clientProfileId: string;
  program: StaffProgramDetail["program"];
  /** Published programs offered as replacement predecessors. */
  publishedPrograms: { id: string; title: string }[];
  canWrite: boolean;
}) {
  const [draft, setDraft] = useState<TrainingDraft>(program.draft);
  const [revision, setRevision] = useState(program.draftRevision);
  const [week, setWeek] = useState(
    Math.min(Math.max(program.currentWeekIndex ?? 1, 1), program.weekCount),
  );
  const [title, setTitle] = useState(program.title);
  const [startDate, setStartDate] = useState(program.startDate);
  const [weekCount, setWeekCount] = useState(program.weekCount);
  const [fieldConfig, setFieldConfig] = useState<TrainingFieldConfig>(
    program.fieldConfig,
  );
  const [timezone, setTimezone] = useState(program.confirmedTimezone ?? "");
  const [effectiveDate, setEffectiveDate] = useState(program.startDate);
  const [predecessor, setPredecessor] = useState(
    program.replacesProgramId ?? "",
  );
  const [ackTakeover, setAckTakeover] = useState(false);
  const [status, setStatus] = useState<{
    tone: "ok" | "error" | "idle";
    message: string;
  }>({ tone: "idle", message: "" });
  const [pending, startTransition] = useTransition();

  const locked = week <= program.ceiling;
  const published = program.firstPublishedAt !== null;
  const cancellable =
    program.state === "pending" && program.replacesProgramId !== null;

  const updateDraft = (fn: (d: TrainingDraft) => TrainingDraft) =>
    setDraft((d) => fn(d));

  const setCell = (key: string, value: string | number | undefined) => {
    if (locked) return;
    updateDraft((d) => ({
      ...d,
      fieldCells: {
        ...d.fieldCells,
        [key]: setBoundary(d.fieldCells[key] ?? {}, week, value),
      },
    }));
  };

  const setSessionPresent = (sid: string, present: boolean) => {
    if (locked) return;
    updateDraft((d) => ({
      ...d,
      sessionPresence: {
        ...d.sessionPresence,
        [sid]: setBoundary(d.sessionPresence[sid] ?? {}, week, present),
      },
    }));
  };

  const setExercisePresent = (key: string, present: boolean) => {
    if (locked) return;
    updateDraft((d) => ({
      ...d,
      exercisePresence: {
        ...d.exercisePresence,
        [key]: setBoundary(d.exercisePresence[key] ?? {}, week, present),
      },
    }));
  };

  const addSession = () =>
    updateDraft((d) => {
      const id = uid();
      return {
        ...d,
        sessions: [...d.sessions, { id, name: "New session" }],
        sessionPresence: {
          ...d.sessionPresence,
          [id]: setBoundary({}, week, true),
        },
      };
    });

  const addExercise = (sid: string) =>
    updateDraft((d) => {
      const id = uid();
      return {
        ...d,
        exercises: [
          ...d.exercises,
          { id, sessionId: sid, name: "New exercise" },
        ],
        exercisePresence: {
          ...d.exercisePresence,
          [`${sid}/${id}`]: setBoundary({}, week, true),
        },
      };
    });

  const save = () =>
    startTransition(async () => {
      const r = await saveTrainingDraftAction({
        workspaceId,
        clientProfileId,
        programId: program.id,
        expectedRevision: revision,
        title,
        ...(published ? {} : { startDate }),
        weekCount,
        fieldConfig,
        ...(timezone.trim() !== "" && timezone !== program.confirmedTimezone
          ? { timezone: timezone.trim() }
          : {}),
        draft,
      });
      if (r.status !== "ok") {
        setStatus({
          tone: "error",
          message: r.status === "error" ? r.message : "Save failed.",
        });
        return;
      }
      if (typeof r.revision === "number") setRevision(r.revision);
      setStatus({ tone: "ok", message: "Draft saved." });
    });

  const confirmTimezone = () =>
    startTransition(async () => {
      const tz = timezone.trim();
      if (tz === "") {
        setStatus({ tone: "error", message: "Enter an IANA timezone." });
        return;
      }
      const r = await confirmTrainingTimezoneAction({
        workspaceId,
        clientProfileId,
        programId: program.id,
        timezone: tz,
      });
      setStatus(
        r.status === "ok"
          ? { tone: "ok", message: `Timezone confirmed: ${tz}` }
          : {
              tone: "error",
              message: r.status === "error" ? r.message : "Failed.",
            },
      );
    });

  const publish = () =>
    startTransition(async () => {
      const r = await publishTrainingVersionAction({
        workspaceId,
        clientProfileId,
        programId: program.id,
        expectedRevision: revision,
        effectiveDate,
        // The predecessor claim belongs to the FIRST publication — and to
        // a retry at v1's committed origin revision, where it reproduces
        // the ORIGINAL request (the stored replacesProgramId provenance)
        // so a lost-response/remount retry replays idempotently. A draft
        // save advances the revision, so any other post-publish call is a
        // genuinely new later version and must carry no claim (the
        // service rejects later-version claims).
        expectedPredecessor:
          published && revision !== program.firstPublishOriginRevision
            ? null
            : predecessor === ""
              ? null
              : predecessor,
        acknowledgeImmediateTakeover: ackTakeover,
      });
      setStatus(
        r.status === "ok"
          ? { tone: "ok", message: r.message }
          : {
              tone: "error",
              message: r.status === "error" ? r.message : "Publish failed.",
            },
      );
    });

  const cancel = () =>
    startTransition(async () => {
      const r = await cancelTrainingProgramAction({
        workspaceId,
        clientProfileId,
        programId: program.id,
      });
      setStatus(
        r.status === "ok"
          ? { tone: "ok", message: "Replacement cancelled." }
          : {
              tone: "error",
              message: r.status === "error" ? r.message : "Cancel failed.",
            },
      );
    });

  const statusNode: ReactNode =
    status.message === "" ? null : (
      <p
        className={status.tone === "error" ? "daily-errors" : "app-lede"}
        role={status.tone === "error" ? "alert" : "status"}
        data-testid="training-status"
      >
        {status.message}
      </p>
    );

  const visibleSessions = draft.sessions.filter(
    (s) => resolveBoundary(draft.sessionPresence[s.id], week) === true,
  );

  if (!canWrite) {
    return (
      <div data-testid="training-readonly">
        {statusNode}
        {visibleSessions.length === 0 ? (
          <p className="app-lede">No sessions prescribed in week {week}.</p>
        ) : (
          <p className="app-lede">
            {program.title} — {visibleSessions.length} session(s) in week {week}
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-testid="training-editor">
      {statusNode}

      <section className="tracker-section">
        <h2 className="tracker-section__title">Program</h2>
        <label htmlFor="tp-title">Title</label>
        <input
          id="tp-title"
          data-testid="tp-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          disabled={pending}
        />
        {!published ? (
          <>
            <label htmlFor="tp-start">Start date (YYYY-MM-DD)</label>
            <input
              id="tp-start"
              data-testid="tp-start"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              disabled={pending}
            />
          </>
        ) : (
          <p className="app-lede">Start date: {program.startDate} (locked)</p>
        )}
        <label htmlFor="tp-weeks">Weeks</label>
        <input
          id="tp-weeks"
          data-testid="tp-weeks"
          inputMode="numeric"
          value={String(weekCount)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 1 && n <= 104) setWeekCount(n);
          }}
          disabled={pending}
        />
        <p className="app-lede">
          State: {program.state} — draft revision {revision}
          {program.anchorTimezone !== null
            ? ` — weeks anchored in ${program.anchorTimezone}`
            : ""}
        </p>
      </section>

      <section className="tracker-section">
        <h2 className="tracker-section__title">Prescription fields</h2>
        <p className="app-lede">
          Enabled fields show on the client view; disabled values are kept but
          never displayed.
        </p>
        {TRAINING_FIELD_KEYS.map((k) => (
          <label key={k} data-testid={`tp-field-${k}`}>
            <input
              type="checkbox"
              checked={fieldConfig[k]}
              onChange={(e) =>
                setFieldConfig((c) => ({ ...c, [k]: e.target.checked }))
              }
              disabled={pending}
            />
            {FIELD_LABELS[k]}
          </label>
        ))}
      </section>

      <section className="tracker-section">
        <h2 className="tracker-section__title">Client timezone</h2>
        <label htmlFor="tp-timezone">IANA timezone</label>
        <input
          id="tp-timezone"
          data-testid="tp-timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="e.g. Europe/London"
          disabled={pending}
        />
        <button
          type="button"
          data-testid="tp-tz-confirm"
          onClick={confirmTimezone}
          disabled={pending}
        >
          Confirm timezone
        </button>
        {program.confirmedTimezone !== null ? (
          <p className="app-lede">Confirmed: {program.confirmedTimezone}</p>
        ) : null}
      </section>

      <section className="tracker-section">
        <h2 className="tracker-section__title">Draft</h2>
        <label htmlFor="tp-week">Week</label>
        <select
          id="tp-week"
          data-testid="tp-week"
          value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
          disabled={pending}
        >
          {Array.from({ length: weekCount }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              Week {w}
              {w <= program.ceiling ? " (locked)" : ""}
            </option>
          ))}
        </select>
        {locked ? (
          <p className="app-lede" data-testid="tp-week-locked">
            Week {week} is locked — published weeks can’t be changed.
          </p>
        ) : null}

        {draft.sessions.map((s) => {
          const present =
            resolveBoundary(draft.sessionPresence[s.id], week) === true;
          return (
            <fieldset key={s.id} data-testid={`tp-session-${s.id}`}>
              <legend>
                <input
                  type="checkbox"
                  checked={present}
                  onChange={(e) => setSessionPresent(s.id, e.target.checked)}
                  disabled={pending || locked}
                  aria-label={`Include ${s.name} in week ${week}`}
                />{" "}
                {resolveBoundary(draft.sessionNames[s.id], week) ?? s.name}
              </legend>
              <label htmlFor={`tp-session-name-${s.id}`}>Session name</label>
              <input
                id={`tp-session-name-${s.id}`}
                data-testid={`tp-session-name-${s.id}`}
                value={
                  resolveBoundary(draft.sessionNames[s.id], week) ?? s.name
                }
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    sessionNames: {
                      ...d.sessionNames,
                      [s.id]: setBoundary(
                        d.sessionNames[s.id] ?? {},
                        week,
                        e.target.value,
                      ),
                    },
                  }))
                }
                maxLength={80}
                disabled={pending || locked}
              />
              {present
                ? draft.exercises
                    .filter((e) => e.sessionId === s.id)
                    .map((e) => {
                      const ekey = `${s.id}/${e.id}`;
                      const epresent =
                        resolveBoundary(draft.exercisePresence[ekey], week) ===
                        true;
                      return (
                        <fieldset
                          key={e.id}
                          data-testid={`tp-exercise-${e.id}`}
                        >
                          <legend>
                            <input
                              type="checkbox"
                              checked={epresent}
                              onChange={(ev) =>
                                setExercisePresent(ekey, ev.target.checked)
                              }
                              disabled={pending || locked}
                              aria-label={`Include ${e.name} in week ${week}`}
                            />{" "}
                            {e.name}
                          </legend>
                          <label htmlFor={`tp-ex-name-${e.id}`}>Exercise</label>
                          <input
                            id={`tp-ex-name-${e.id}`}
                            data-testid={`tp-ex-name-${e.id}`}
                            value={e.name}
                            onChange={(ev) =>
                              updateDraft((d) => ({
                                ...d,
                                exercises: d.exercises.map((x) =>
                                  x.id === e.id
                                    ? { ...x, name: ev.target.value }
                                    : x,
                                ),
                              }))
                            }
                            maxLength={80}
                            disabled={pending || locked}
                          />
                          {epresent
                            ? CELL_FIELDS.filter(
                                (f, i, arr) =>
                                  arr.findIndex((x) => x.cell === f.cell) ===
                                    i &&
                                  (f.cell === "reps"
                                    ? fieldConfig.fixedReps ||
                                      fieldConfig.repRanges
                                    : fieldConfig[
                                        f.toggle as keyof TrainingFieldConfig
                                      ]),
                              ).map((f) => {
                                const cellKey = `${ekey}/${f.cell}`;
                                const v = resolveBoundary(
                                  draft.fieldCells[cellKey],
                                  week,
                                );
                                return (
                                  <span key={f.cell}>
                                    <label
                                      htmlFor={`tp-cell-${e.id}-${f.cell}`}
                                    >
                                      {f.cell === "reps"
                                        ? "Reps"
                                        : FIELD_LABELS[
                                            f.toggle as keyof typeof FIELD_LABELS
                                          ]}
                                    </label>
                                    <input
                                      id={`tp-cell-${e.id}-${f.cell}`}
                                      data-testid={`tp-cell-${e.id}-${f.cell}`}
                                      inputMode={
                                        f.numeric ? "numeric" : undefined
                                      }
                                      value={v === undefined ? "" : String(v)}
                                      onChange={(ev) => {
                                        const raw = ev.target.value;
                                        if (raw.trim() === "")
                                          setCell(cellKey, undefined);
                                        else if (f.numeric) {
                                          const n = Number(raw);
                                          if (Number.isInteger(n) && n >= 1)
                                            setCell(cellKey, n);
                                        } else setCell(cellKey, raw);
                                      }}
                                      disabled={pending || locked}
                                    />
                                  </span>
                                );
                              })
                            : null}
                          {epresent ? (
                            <span>
                              <label htmlFor={`tp-cell-${e.id}-note`}>
                                Note
                              </label>
                              <input
                                id={`tp-cell-${e.id}-note`}
                                data-testid={`tp-cell-${e.id}-note`}
                                value={
                                  resolveBoundary(
                                    draft.fieldCells[`${ekey}/note`],
                                    week,
                                  )?.toString() ?? ""
                                }
                                onChange={(ev) =>
                                  setCell(
                                    `${ekey}/note`,
                                    ev.target.value === ""
                                      ? undefined
                                      : ev.target.value,
                                  )
                                }
                                disabled={pending || locked}
                              />
                            </span>
                          ) : null}
                        </fieldset>
                      );
                    })
                : null}
              {present ? (
                <button
                  type="button"
                  data-testid={`tp-exercise-add-${s.id}`}
                  onClick={() => addExercise(s.id)}
                  disabled={pending || locked}
                >
                  Add exercise
                </button>
              ) : null}
            </fieldset>
          );
        })}
        <button
          type="button"
          data-testid="tp-session-add"
          onClick={addSession}
          disabled={pending || locked}
        >
          Add session
        </button>
        <button
          type="button"
          data-testid="tp-save-draft"
          onClick={save}
          disabled={pending}
        >
          Save draft
        </button>
      </section>

      <section className="tracker-section">
        <h2 className="tracker-section__title">Publish</h2>
        <p className="app-lede">
          Publishing freezes this draft as an immutable version effective on the
          date below (start of that day in the confirmed timezone).
        </p>
        {!published ? (
          <>
            <label htmlFor="tp-predecessor">Replaces</label>
            <select
              id="tp-predecessor"
              data-testid="tp-predecessor"
              value={predecessor}
              onChange={(e) => setPredecessor(e.target.value)}
              disabled={pending}
            >
              <option value="">Nothing (root program)</option>
              {publishedPrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            {predecessor !== "" ? (
              <label data-testid="tp-ack-takeover">
                <input
                  type="checkbox"
                  checked={ackTakeover}
                  onChange={(e) => setAckTakeover(e.target.checked)}
                  disabled={pending}
                />
                I understand an immediate takeover cannot be cancelled
                afterwards.
              </label>
            ) : null}
          </>
        ) : null}
        <label htmlFor="tp-effective">Effective date (YYYY-MM-DD)</label>
        <input
          id="tp-effective"
          data-testid="tp-effective"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          placeholder="YYYY-MM-DD"
          disabled={pending}
        />
        <button
          type="button"
          data-testid="tp-publish"
          onClick={publish}
          disabled={pending}
        >
          Publish version
        </button>
        {cancellable ? (
          <button
            type="button"
            data-testid="tp-cancel"
            onClick={cancel}
            disabled={pending}
          >
            Cancel replacement
          </button>
        ) : null}
      </section>
    </div>
  );
}
