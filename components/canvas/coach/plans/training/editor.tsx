"use client";

import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Copy,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Variant } from "../../model";
import { MUSCLE_GROUPS } from "../../muscle-volume";
import { useCoach } from "../../store";
import {
  DEFAULT_TRAINING_DEFAULTS,
  DEFAULT_TRAINING_OPTIONS,
  type TrainingOptionKey,
} from "../training-options";
import type {
  ExerciseDefinition,
  TrainingExercise,
  TrainingPlan,
  TrainingSession,
  TrainingSet,
} from "../types";
import { defaultExerciseLibrary } from "./library-model";
import {
  cloneExercise,
  cloneSession,
  effectiveSessions,
  freshExercise,
  freshSession,
  freshSet,
  makeId,
  prescribedMuscleVolume,
  reorder,
  type TrainingDefaults,
  writeTrainingWeek,
} from "./training-model";
import "./editor.css";

const hasField = (configuration: Variant, label: string) =>
  configuration.training.fields.includes(label);
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00`));
const numberValue = (raw: string, min = 0) => Math.max(min, Number(raw) || min);

function optionChoices(key: TrainingOptionKey, configuration: Variant) {
  return configuration.training.options?.[key] ?? DEFAULT_TRAINING_OPTIONS[key];
}

function configuredDefaults(configuration: Variant): TrainingDefaults {
  const defaults = configuration.training.defaults;
  return {
    setType: defaults?.setType ?? DEFAULT_TRAINING_DEFAULTS.setType,
    progression: defaults?.progression ?? DEFAULT_TRAINING_DEFAULTS.progression,
    tempo: defaults?.tempo ?? DEFAULT_TRAINING_DEFAULTS.tempo,
    rest: defaults?.rest ?? DEFAULT_TRAINING_DEFAULTS.rest,
  };
}

function OptionSelect({
  id,
  value,
  options,
  label,
  onChange,
}: {
  id: string;
  value: string;
  options: string[];
  label: string;
  onChange: (value: string) => void;
}) {
  const choices = [
    ...new Set([
      ...options,
      ...(value && !options.includes(value) ? [value] : []),
    ]),
  ];
  return (
    <>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!value && options.length > 0 && (
          <option value="">Choose template option</option>
        )}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
            {!options.includes(choice) ? " · saved value" : ""}
          </option>
        ))}
        {!options.length && !value && (
          <option value="" disabled>
            No template options configured
          </option>
        )}
      </select>
      {!options.length && (
        <small className="te-option-hint">
          No options configured in the template.
        </small>
      )}
    </>
  );
}

function LibraryPicker({
  library,
  onSelect,
  onClose,
}: {
  library: ExerciseDefinition[];
  onSelect: (exercise: ExerciseDefinition) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () =>
      library.filter((item) =>
        `${item.name} ${item.muscle} ${item.secondaryMuscles.join(" ")}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [library, query],
  );
  return (
    <div className="te-library-picker">
      <div className="te-library-picker-head">
        <label className="te-library-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search exercises or muscle groups"
            aria-label="Search exercise library"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          className="te-icon-button"
          type="button"
          aria-label="Close exercise picker"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      <div className="te-library-results">
        {matches.map((item) => (
          <button
            className="te-library-result"
            type="button"
            key={item.id}
            onClick={() => onSelect(item)}
          >
            <span>
              <strong>{item.name}</strong>
              <small>
                {MUSCLE_GROUPS.find((group) => group.id === item.muscle)
                  ?.label ?? "Unassigned"}
                {item.secondaryMuscles.length
                  ? ` · ${item.secondaryMuscles.map((id) => MUSCLE_GROUPS.find((group) => group.id === id)?.label ?? id).join(", ")}`
                  : ""}
              </small>
            </span>
            <Plus size={15} aria-hidden="true" />
          </button>
        ))}
        {!matches.length && (
          <p className="te-library-empty">
            No matches. Add a custom exercise to the library above.
          </p>
        )}
      </div>
    </div>
  );
}

function ExerciseLibraryManager({
  library,
  onChange,
}: {
  library: ExerciseDefinition[];
  onChange: (next: ExerciseDefinition[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("");
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const beginEdit = (item?: ExerciseDefinition) => {
    setEditingId(item?.id ?? null);
    setName(item?.name ?? "");
    setMuscle(item?.muscle ?? "");
    setSecondaryMuscles(item?.secondaryMuscles ?? []);
    setNotes(item?.notes ?? "");
  };
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !muscle) return;
    const definition: ExerciseDefinition = {
      id: editingId ?? makeId("library-exercise"),
      name: cleanName,
      muscle,
      secondaryMuscles,
      notes: notes.trim(),
    };
    onChange(
      editingId
        ? library.map((item) => (item.id === editingId ? definition : item))
        : [...library, definition],
    );
    beginEdit();
  };
  return (
    <section className="te-library">
      <header className="te-library-head">
        <div>
          <BookOpen size={16} aria-hidden="true" />
          <span>
            <strong>Exercise library</strong>
            <small>
              {library.length} exercises · plan prescriptions keep their own
              snapshot
            </small>
          </span>
        </div>
        <button
          className="te-text-button"
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            beginEdit();
          }}
        >
          {open ? "Done" : "Manage library"}
        </button>
      </header>
      {open && (
        <div className="te-library-manager">
          <form className="te-library-form" onSubmit={save}>
            <h3>{editingId ? "Edit library exercise" : "Add an exercise"}</h3>
            <label>
              <span>Exercise name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Single-arm cable row"
              />
            </label>
            <div className="te-library-form-row">
              <label>
                <span>Primary muscle</span>
                <select
                  required
                  value={muscle}
                  onChange={(e) => setMuscle(e.target.value)}
                >
                  <option value="">Choose group</option>
                  {MUSCLE_GROUPS.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Secondary groups</span>
                <select
                  multiple
                  value={secondaryMuscles}
                  onChange={(e) =>
                    setSecondaryMuscles(
                      Array.from(
                        e.currentTarget.selectedOptions,
                        (option) => option.value,
                      ),
                    )
                  }
                >
                  {MUSCLE_GROUPS.filter((item) => item.id !== muscle).map(
                    (item) => (
                      <option value={item.id} key={item.id}>
                        {item.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <label>
              <span>General coaching notes</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Shared cues for this movement"
              />
            </label>
            <div className="te-library-form-actions">
              <button
                className="te-text-button te-primary-action"
                type="submit"
              >
                {editingId ? "Save changes" : "Add to library"}
              </button>
              {editingId && (
                <button
                  className="te-text-button"
                  type="button"
                  onClick={() => beginEdit()}
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
          <div className="te-library-list">
            {library.map((item) => (
              <div className="te-library-item" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {MUSCLE_GROUPS.find((group) => group.id === item.muscle)
                      ?.label ?? "Unassigned"}
                    {item.notes ? ` · ${item.notes}` : ""}
                  </small>
                </div>
                <div className="te-actions">
                  <button
                    className="te-text-button"
                    type="button"
                    onClick={() => beginEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    className="te-icon-button"
                    type="button"
                    aria-label={`Remove ${item.name} from library`}
                    title="Remove from library"
                    onClick={() => {
                      onChange(library.filter((entry) => entry.id !== item.id));
                      if (editingId === item.id) beginEdit();
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {!library.length && (
              <p className="te-library-empty">
                The library is empty. Add an exercise to build a reusable
                movement.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Volume({
  plan,
  week,
  configuration,
}: {
  plan: TrainingPlan;
  week: number;
  configuration: Variant;
}) {
  if (!configuration.training.volume) return null;
  const sessions = effectiveSessions(plan, week);
  const result = prescribedMuscleVolume(sessions, week);
  return (
    <section className="te-volume" aria-label="Prescribed weekly volume">
      <div className="te-section-head">
        <h3>Weekly volume</h3>
        <span>{result.totalSets} prescribed sets</span>
      </div>
      {configuration.training.presentation === "Heatmap" ? (
        <div className="te-heatmap">
          {result.groups.map((group) => (
            <div
              key={group.id}
              data-active={group.sets > 0}
              style={
                { "--te-intensity": group.intensity } as React.CSSProperties
              }
            >
              <span>{group.label}</span>
              <b>{group.sets}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="te-volume-table">
          <div className="te-volume-head">
            <span>Muscle group</span>
            <span>Working sets</span>
          </div>
          {result.groups
            .filter((group) => group.sets > 0)
            .map((group) => (
              <div key={group.id}>
                <span>{group.label}</span>
                <b>{group.sets}</b>
              </div>
            ))}
          {result.unassignedSets > 0 && (
            <div className="te-unassigned">
              <span>Unassigned</span>
              <b>{result.unassignedSets}</b>
            </div>
          )}
          {!result.totalSets && <p>No prescribed sets yet.</p>}
        </div>
      )}
    </section>
  );
}

function SetFields({
  set,
  index,
  configuration,
  onChange,
  onRemove,
}: {
  set: TrainingSet;
  index: number;
  configuration: Variant;
  onChange: (next: TrainingSet) => void;
  onRemove: () => void;
}) {
  const setPatch = (patch: Partial<TrainingSet>) =>
    onChange({ ...set, ...patch });
  return (
    <div className="te-set-row">
      <span className="te-set-index">{String(index + 1).padStart(2, "0")}</span>
      {(hasField(configuration, "Fixed reps") ||
        hasField(configuration, "Rep ranges")) && (
        <label>
          <span>{hasField(configuration, "Fixed reps") ? "Reps" : "From"}</span>
          <input
            aria-label={`Set ${index + 1} reps`}
            type="number"
            min="1"
            value={set.reps}
            onChange={(e) => setPatch({ reps: numberValue(e.target.value, 1) })}
          />
        </label>
      )}
      {hasField(configuration, "Rep ranges") && (
        <label>
          <span>Up to</span>
          <input
            aria-label={`Set ${index + 1} maximum reps`}
            type="number"
            min={set.reps}
            value={set.repsMax ?? set.reps}
            onChange={(e) =>
              setPatch({ repsMax: numberValue(e.target.value, set.reps) })
            }
          />
        </label>
      )}
      {hasField(configuration, "Tempo") && (
        <label className="te-wide" htmlFor={`${set.id}-tempo`}>
          <span>Tempo</span>
          <OptionSelect
            id={`${set.id}-tempo`}
            value={set.tempo}
            options={optionChoices("tempo", configuration)}
            label={`Set ${index + 1} tempo`}
            onChange={(tempo) => setPatch({ tempo })}
          />
        </label>
      )}
      {hasField(configuration, "Set type") && (
        <label className="te-wide" htmlFor={`${set.id}-type`}>
          <span>Type</span>
          <OptionSelect
            id={`${set.id}-type`}
            value={set.type}
            options={optionChoices("setType", configuration)}
            label={`Set ${index + 1} type`}
            onChange={(type) => setPatch({ type })}
          />
        </label>
      )}
      {hasField(configuration, "Rest / pause") && (
        <label className="te-wide" htmlFor={`${set.id}-rest`}>
          <span>Rest</span>
          <OptionSelect
            id={`${set.id}-rest`}
            value={set.rest}
            options={optionChoices("rest", configuration)}
            label={`Set ${index + 1} rest`}
            onChange={(rest) => setPatch({ rest })}
          />
        </label>
      )}
      <button
        type="button"
        className="te-icon-button te-remove-set"
        aria-label={`Remove set ${index + 1}`}
        disabled={false}
        onClick={onRemove}
      >
        <Trash2 size={14} />
      </button>
      {hasField(configuration, "Detailed instructions") && (
        <label className="te-set-note">
          <span>Set instructions</span>
          <input
            aria-label={`Set ${index + 1} instructions`}
            value={set.instructions}
            onChange={(e) => setPatch({ instructions: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}

function ExerciseEditor({
  exercise,
  position,
  configuration,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  defaults,
}: {
  exercise: TrainingExercise;
  position: number;
  configuration: Variant;
  onChange: (next: TrainingExercise) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  defaults: TrainingDefaults;
}) {
  const patch = (next: Partial<TrainingExercise>) =>
    onChange({ ...exercise, ...next });
  return (
    <article className="te-exercise">
      <header className="te-exercise-head">
        <span className="te-index">
          {String(position + 1).padStart(2, "0")}
        </span>
        <input
          aria-label="Exercise name"
          className="te-exercise-name"
          value={exercise.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <div className="te-actions">
          <label className="te-muscle">
            <span>Muscle allocation</span>
            <select
              aria-label={`${exercise.name} muscle allocation`}
              value={exercise.muscle ?? ""}
              onChange={(e) => patch({ muscle: e.target.value || undefined })}
            >
              <option value="">Unassigned</option>
              {MUSCLE_GROUPS.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="te-icon-button"
            title="Move exercise up"
            aria-label="Move exercise up"
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="te-icon-button"
            title="Move exercise down"
            aria-label="Move exercise down"
            onClick={() => onMove(1)}
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            className="te-icon-button"
            title="Duplicate exercise"
            aria-label="Duplicate exercise"
            onClick={onDuplicate}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            className="te-icon-button"
            title="Remove exercise"
            aria-label="Remove exercise"
            onClick={onRemove}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>
      {exercise.generalNotes && (
        <p className="te-general-notes">
          <span>Library cue</span>
          {exercise.generalNotes}
        </p>
      )}
      {exercise.libraryId && (
        <p className="te-library-snapshot">
          Library details are saved with this prescription; library edits do not
          change this plan.
        </p>
      )}
      {hasField(configuration, "Progression notes") && (
        <label className="te-line-field" htmlFor={`${exercise.id}-progression`}>
          <span>Progression</span>
          <OptionSelect
            id={`${exercise.id}-progression`}
            value={exercise.progression}
            options={optionChoices("progression", configuration)}
            label={`${exercise.name} progression`}
            onChange={(progression) => patch({ progression })}
          />
        </label>
      )}
      {hasField(configuration, "Detailed instructions") && (
        <label className="te-line-field">
          <span>Exercise instructions</span>
          <textarea
            rows={2}
            value={exercise.instructions}
            aria-label={`${exercise.name} instructions`}
            onChange={(e) => patch({ instructions: e.target.value })}
          />
        </label>
      )}
      {(hasField(configuration, "Sets") ||
        hasField(configuration, "Fixed reps") ||
        hasField(configuration, "Rep ranges") ||
        hasField(configuration, "Tempo") ||
        hasField(configuration, "Set type") ||
        hasField(configuration, "Rest / pause") ||
        hasField(configuration, "Detailed instructions")) && (
        <div className="te-set-list">
          <div className="te-set-labels">
            <span>Set</span>
            <span>Prescription</span>
          </div>
          {exercise.sets.map((set, index) => (
            <SetFields
              key={set.id}
              set={set}
              index={index}
              configuration={configuration}
              onChange={(next) =>
                patch({
                  sets: exercise.sets.map((item) =>
                    item.id === set.id ? next : item,
                  ),
                })
              }
              onRemove={() =>
                patch({
                  sets: exercise.sets.filter((item) => item.id !== set.id),
                })
              }
            />
          ))}
          <button
            className="te-text-button"
            type="button"
            onClick={() =>
              patch({ sets: [...exercise.sets, freshSet(defaults)] })
            }
          >
            <Plus size={14} /> Add set
          </button>
        </div>
      )}
    </article>
  );
}

function SessionEditor({
  session,
  position,
  configuration,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  library,
  defaults,
}: {
  session: TrainingSession;
  position: number;
  configuration: Variant;
  onChange: (next: TrainingSession) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  library: ExerciseDefinition[];
  defaults: TrainingDefaults;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const patch = (next: Partial<TrainingSession>) =>
    onChange({ ...session, ...next });
  const moveExercise = (index: number, direction: -1 | 1) =>
    patch({ exercises: reorder(session.exercises, index, index + direction) });
  return (
    <section className="te-session">
      <div className="te-session-core">
        <header className="te-session-head">
          <span className="te-index">
            SESSION {String(position + 1).padStart(2, "0")}
          </span>
          <input
            aria-label="Session name"
            value={session.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <div className="te-actions">
            <button
              type="button"
              className="te-icon-button"
              aria-label="Move session up"
              onClick={() => onMove(-1)}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="te-icon-button"
              aria-label="Move session down"
              onClick={() => onMove(1)}
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className="te-icon-button"
              aria-label="Duplicate session"
              onClick={onDuplicate}
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              className="te-icon-button"
              aria-label="Remove session"
              onClick={onRemove}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </header>
        <div className="te-exercises">
          {session.exercises.map((exercise, index) => (
            <ExerciseEditor
              key={exercise.id}
              exercise={exercise}
              position={index}
              configuration={configuration}
              defaults={defaults}
              onChange={(next) =>
                patch({
                  exercises: session.exercises.map((item) =>
                    item.id === exercise.id ? next : item,
                  ),
                })
              }
              onRemove={() =>
                patch({
                  exercises: session.exercises.filter(
                    (item) => item.id !== exercise.id,
                  ),
                })
              }
              onDuplicate={() =>
                patch({
                  exercises: [
                    ...session.exercises.slice(0, index + 1),
                    cloneExercise(exercise),
                    ...session.exercises.slice(index + 1),
                  ],
                })
              }
              onMove={(direction) => moveExercise(index, direction)}
            />
          ))}
        </div>
        {pickerOpen && (
          <LibraryPicker
            library={library}
            onClose={() => setPickerOpen(false)}
            onSelect={(item) => {
              const blank = freshExercise(defaults);
              patch({
                exercises: [
                  ...session.exercises,
                  {
                    ...blank,
                    name: item.name,
                    muscle: item.muscle,
                    libraryId: item.id,
                    secondaryMuscles: [...item.secondaryMuscles],
                    generalNotes: item.notes,
                  },
                ],
              });
              setPickerOpen(false);
            }}
          />
        )}
        <button
          type="button"
          className="te-text-button te-add-exercise"
          onClick={() => setPickerOpen((current) => !current)}
        >
          <Plus size={14} /> Add from exercise library
        </button>
      </div>
    </section>
  );
}

function prescriptionLines(exercise: TrainingExercise, configuration: Variant) {
  const include = (field: string) => hasField(configuration, field);
  return (
    <>
      {include("Sets") && (
        <span>
          {exercise.sets.length} {exercise.sets.length === 1 ? "set" : "sets"}
        </span>
      )}
      {(include("Fixed reps") || include("Rep ranges")) &&
        exercise.sets.length > 0 && (
          <span>
            {exercise.sets
              .map((s) =>
                include("Rep ranges") && s.repsMax && s.repsMax > s.reps
                  ? `${s.reps}–${s.repsMax}`
                  : s.reps,
              )
              .join(" / ")}{" "}
            reps
          </span>
        )}
      {include("Tempo") && exercise.sets.some((s) => s.tempo) && (
        <span>
          Tempo {exercise.sets.map((s) => s.tempo || "—").join(" / ")}
        </span>
      )}
      {include("Set type") && exercise.sets.some((s) => s.type) && (
        <span>
          {Array.from(
            new Set(exercise.sets.map((s) => s.type).filter(Boolean)),
          ).join(", ")}
        </span>
      )}
      {include("Rest / pause") && exercise.sets.some((s) => s.rest) && (
        <span>
          Rest{" "}
          {Array.from(
            new Set(exercise.sets.map((s) => s.rest).filter(Boolean)),
          ).join(" / ")}
        </span>
      )}
      {include("Progression notes") && exercise.progression && (
        <p>{exercise.progression}</p>
      )}
      {include("Detailed instructions") &&
        (exercise.instructions ||
          exercise.generalNotes ||
          exercise.sets.some((s) => s.instructions)) && (
          <p>
            {[
              exercise.generalNotes
                ? `General cue: ${exercise.generalNotes}`
                : "",
              exercise.instructions,
              ...exercise.sets.map((s) => s.instructions).filter(Boolean),
            ].join(" · ")}
          </p>
        )}
    </>
  );
}

export function TrainingPrescription({
  value,
  week = 1,
  configuration,
}: {
  value: TrainingPlan;
  week?: number;
  configuration: Variant;
}) {
  const selected = Math.min(
    Math.max(1, week),
    value.program === "Evergreen" ? 1 : value.weeks,
  );
  const sessions = effectiveSessions(value, selected);
  return (
    <div className="te-preview">
      <div className="te-section-head">
        <h3>
          {value.program === "Evergreen"
            ? "Ongoing program"
            : `Week ${selected} prescription`}
        </h3>
        <span>
          {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
        </span>
      </div>
      {sessions.map((session) => (
        <section className="te-preview-session" key={session.id}>
          <h4>{session.name}</h4>
          {session.exercises.map((exercise) => (
            <article key={exercise.id}>
              <strong>{exercise.name}</strong>
              <div>{prescriptionLines(exercise, configuration)}</div>
            </article>
          ))}
        </section>
      ))}
      {!sessions.length && <p>No sessions prescribed for this program yet.</p>}
      <Volume plan={value} week={selected} configuration={configuration} />
    </div>
  );
}

export function TrainingEditor({
  value,
  onChange,
  configuration,
  onWeekChange,
}: {
  value: TrainingPlan;
  onChange: (value: TrainingPlan) => void;
  configuration: Variant;
  onWeekChange?: (week: number) => void;
}) {
  const { state, setState } = useCoach();
  const [week, setWeek] = useState(1);
  const library = state.exerciseLibrary ?? defaultExerciseLibrary();
  const defaults = configuredDefaults(configuration);
  const changeLibrary = (next: ExerciseDefinition[]) =>
    setState((current) => ({ ...current, exerciseLibrary: next }));
  const currentWeek =
    value.program === "Evergreen"
      ? 1
      : Math.min(Math.max(1, week), Math.max(1, value.weeks));
  const sessions = effectiveSessions(value, currentWeek);
  const write = (next: TrainingSession[]) =>
    onChange(writeTrainingWeek(value, currentWeek, next));
  const updateSession = (id: string, next: TrainingSession) =>
    write(sessions.map((session) => (session.id === id ? next : session)));
  const setProgram = (program: TrainingPlan["program"]) => {
    onChange({
      ...value,
      program,
      weeks:
        program === "Evergreen"
          ? 1
          : Math.max(1, Math.min(52, value.weeks || 8)),
    });
    setWeek(1);
    onWeekChange?.(1);
  };
  const changeProgramLength = (weeks: number) => {
    const nextWeeks = Math.max(1, Math.min(52, numberValue(String(weeks), 1)));
    onChange({ ...value, weeks: nextWeeks });
    if (week > nextWeeks) {
      setWeek(nextWeeks);
      onWeekChange?.(nextWeeks);
    }
  };
  const hiddenOverrideWeeks = Object.keys(value.overrides)
    .map(Number)
    .filter(
      (overrideWeek) =>
        overrideWeek > (value.program === "Evergreen" ? 1 : value.weeks),
    );
  return (
    <div className="te-editor">
      <section className="te-program-bar">
        <div>
          <label className="te-program-select">
            <span>Program structure</span>
            <select
              value={value.program}
              onChange={(e) =>
                setProgram(e.target.value as TrainingPlan["program"])
              }
            >
              <option>Evergreen</option>
              <option>Week-based</option>
            </select>
          </label>
          {value.program === "Evergreen" ? (
            <p>Ongoing plan · changes apply across the program</p>
          ) : (
            <label className="te-week-count">
              <span>Program length</span>
              <input
                aria-label="Program length in weeks"
                type="number"
                min="1"
                max="52"
                value={value.weeks}
                onChange={(e) =>
                  changeProgramLength(numberValue(e.target.value, 1))
                }
              />
              <span>weeks</span>
            </label>
          )}
        </div>
        <span className="te-plan-meta">
          {value.name || "Untitled program"}
          {validDate(value.startDate)
            ? ` · starts ${value.startDate}`
            : " · valid start date required"}
        </span>
      </section>
      <p className="te-option-source">
        Dropdown choices and starting values follow the template. Existing
        prescriptions stay unchanged.
      </p>
      {hiddenOverrideWeeks.length > 0 && (
        <p className="te-override-note">
          {value.program === "Evergreen"
            ? "Evergreen uses week 1. Later week overrides are retained if you switch back to a week-based program."
            : `Overrides after week ${value.weeks} are retained and inactive at this program length. Extend the program to bring them back.`}
        </p>
      )}
      {value.program === "Week-based" && (
        <nav className="te-week-nav" aria-label="Training program weeks">
          {Array.from(
            { length: Math.max(1, Math.min(52, value.weeks)) },
            (_, index) => index + 1,
          ).map((number) => (
            <button
              type="button"
              key={number}
              aria-current={currentWeek === number ? "step" : undefined}
              onClick={() => {
                setWeek(number);
                onWeekChange?.(number);
              }}
            >
              <span>Week</span>
              {number}
            </button>
          ))}
        </nav>
      )}
      <ExerciseLibraryManager library={library} onChange={changeLibrary} />
      <div className="te-workspace">
        <div className="te-edit-column">
          <header className="te-column-head">
            <div>
              <h2>
                {value.program === "Evergreen"
                  ? "Ongoing sessions"
                  : `Week ${currentWeek}`}
              </h2>
              <p>
                {value.program === "Evergreen"
                  ? "Edit the ongoing prescription. Saved drafts stay separate from active content."
                  : `Edits apply from week ${currentWeek} until the next override; earlier weeks stay unchanged.`}
              </p>
            </div>
            <button
              className="te-text-button"
              type="button"
              onClick={() =>
                write([...sessions, freshSession(sessions.length)])
              }
            >
              <Plus size={14} /> Add session
            </button>
          </header>
          {!sessions.length && (
            <div className="te-empty">
              <p>This week has no sessions yet.</p>
              <button
                className="te-text-button"
                type="button"
                onClick={() => write([freshSession(0)])}
              >
                <Plus size={14} /> Create first session
              </button>
            </div>
          )}
          <div className="te-sessions">
            {sessions.map((session, index) => (
              <SessionEditor
                key={session.id}
                session={session}
                position={index}
                configuration={configuration}
                library={library}
                defaults={defaults}
                onChange={(next) => updateSession(session.id, next)}
                onRemove={() =>
                  write(sessions.filter((item) => item.id !== session.id))
                }
                onDuplicate={() =>
                  write([
                    ...sessions.slice(0, index + 1),
                    cloneSession(session),
                    ...sessions.slice(index + 1),
                  ])
                }
                onMove={(direction) =>
                  write(reorder(sessions, index, index + direction))
                }
              />
            ))}
          </div>
        </div>
        <details className="te-preview-column">
          <summary>Preview prescription & muscle volume</summary>
          <TrainingPrescription
            value={value}
            week={currentWeek}
            configuration={configuration}
          />
        </details>
      </div>
      {configuration.training.volume && (
        <p className="te-volume-note">
          Volume is calculated from the prescribed sets in this week.
          Unallocated exercises remain unassigned.
        </p>
      )}
    </div>
  );
}
