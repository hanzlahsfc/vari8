"use client";

import {
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  Checkbox as SharedCheckbox,
  Input as SharedInput,
  Select as ThemedSelect,
} from "@/components/canvas/vari8/components";
import {
  MultiSelect,
  TextArea as SharedTextArea,
} from "@/components/canvas/vari8/inputs";
import { Section } from "@/components/canvas/vari8/layouts";
import type { Variant } from "../../model";
import { MuscleHeatmap } from "../../muscle-heatmap";
import { MUSCLE_GROUPS } from "../../muscle-volume";
import { useCoach } from "../../store";
import { Button, Dialog, IconButton } from "../../ui";
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
import { ExerciseLibraryDialog } from "./library-dialog";
import { defaultExerciseLibrary } from "./library-model";
import {
  cloneExercise,
  cloneSession,
  commitExerciseDraft,
  deleteTrainingSession,
  effectiveSessions,
  freshExercise,
  freshSession,
  freshSet,
  groupConsecutiveSetPrescriptions,
  prescribedTrainingVolume,
  reorder,
  resizeExerciseSets,
  type TrainingDefaults,
  trainingRotationSchedule,
  writeTrainingWeek,
} from "./training-model";
import {
  applySharedSetPrescription,
  hasUniformSetPrescriptions,
  parseTrainingNumberDraft,
  replaceTrainingExerciseDefinition,
} from "./training-prescriptions";
import "./editor.css";

const hasField = (configuration: Variant, label: string) =>
  configuration.training.fields.includes(label);
const numberValue = (raw: string, min = 0) => Math.max(min, Number(raw) || min);
const EMPTY_SELECT_VALUE = "__empty__";
const REST_DAY_VALUE = "__rest_day__";
const CYCLE_OFF_VALUE = "__cycle_off__";
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

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
  context,
}: {
  id: string;
  value: string;
  options: string[];
  label: string;
  onChange: (value: string) => void;
  context: string;
}) {
  const choices = [
    ...new Set([
      ...options,
      ...(value && !options.includes(value) ? [value] : []),
    ]),
  ];
  const selectValue = value || EMPTY_SELECT_VALUE;
  const contextId = `${id}-context`;
  return (
    <div className="tr-option-select">
      <ThemedSelect
        id={id}
        label={label}
        value={selectValue}
        options={[
          ...(value ? [] : [{ value: EMPTY_SELECT_VALUE, label: "Not set" }]),
          ...choices.map((choice) => ({
            value: choice || EMPTY_SELECT_VALUE,
            label: choice || "Not set",
          })),
        ]}
        onValueChange={(next) =>
          onChange(next === EMPTY_SELECT_VALUE ? "" : next)
        }
        className="tr-themed-select"
        aria-describedby={contextId}
      />
      <span className="tr-sr-only" id={contextId}>
        {context}
      </span>
      {!options.length && (
        <small className="tr-option-hint">
          No options configured in the template.
        </small>
      )}
    </div>
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
  const result = prescribedTrainingVolume(plan, week);
  return (
    <section
      className="tr-volume"
      aria-label={
        result.mode === "cycle"
          ? "Prescribed volume per rotation"
          : "Prescribed weekly volume"
      }
    >
      <div className="tr-section-head">
        <h3>
          {result.mode === "cycle" ? "Volume per rotation" : "Weekly volume"}
        </h3>
        <span>
          {result.totalSets} prescribed sets · {result.periodLabel}
        </span>
      </div>
      {configuration.training.presentation === "Heatmap" ? (
        <MuscleHeatmap
          muscles={result.groups}
          unassignedSets={result.unassignedSets}
        />
      ) : (
        <div className="tr-volume-list">
          {result.groups.map((group) => (
            <div key={group.id}>
              <span>{group.label}</span>
              <span className="tr-volume-bar" aria-hidden="true">
                <i style={{ transform: `scaleX(${group.intensity})` }} />
              </span>
              <b>{group.sets}</b>
            </div>
          ))}
          {result.unassignedSets > 0 && (
            <p>{result.unassignedSets} unassigned sets</p>
          )}
        </div>
      )}
    </section>
  );
}

function NumericDraftInput({
  id,
  value,
  min,
  max,
  label,
  visibleLabel = label,
  externalError,
  onChange,
  onValidityChange,
}: {
  id: string;
  value: number;
  min: number;
  max?: number;
  label: string;
  visibleLabel?: string;
  externalError?: string;
  onChange: (value: number) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");
  const commit = () => {
    const parsed = parseTrainingNumberDraft(draft, min, max);
    if (parsed === undefined) {
      const message = `Enter a whole number from ${min}${max === undefined ? "" : ` to ${max}`}.`;
      setError(message);
      onValidityChange(false);
      return;
    }
    setError("");
    onValidityChange(true);
    onChange(parsed);
  };
  return (
    <SharedInput
      id={id}
      label={visibleLabel}
      aria-label={label}
      type="text"
      inputMode="numeric"
      value={draft}
      error={error || externalError}
      size="md"
      onChange={(event) => {
        setDraft(event.currentTarget.value);
        const raw = event.currentTarget.value;
        const parsed = parseTrainingNumberDraft(raw, min, max);
        const valid = parsed !== undefined;
        setError("");
        onValidityChange(valid);
        if (valid) onChange(parsed);
      }}
      onBlur={commit}
    />
  );
}

function SetFields({
  set,
  index,
  configuration,
  onChange,
  onRemove,
  canRemove,
  repRangeError,
  onValidityChange,
  grouped = false,
}: {
  set: TrainingSet;
  index: number;
  configuration: Variant;
  onChange: (next: TrainingSet) => void;
  onRemove: () => void;
  canRemove: boolean;
  repRangeError?: string;
  onValidityChange: (fieldId: string, valid: boolean) => void;
  grouped?: boolean;
}) {
  const setPatch = (patch: Partial<TrainingSet>) =>
    onChange({ ...set, ...patch });
  const scope = grouped ? "All sets" : `Set ${index + 1}`;
  const numberField = (
    label: string,
    ariaLabel: string,
    value: number,
    min: number,
    change: (value: number) => void,
    max?: number,
  ) => {
    const fieldId = `${set.id}-${ariaLabel.replaceAll(" ", "-")}`;
    return (
      <NumericDraftInput
        key={fieldId}
        id={fieldId}
        value={value}
        min={min}
        max={max}
        label={ariaLabel}
        visibleLabel={label}
        externalError={repRangeError}
        onChange={change}
        onValidityChange={(valid) =>
          onValidityChange(`${set.id}:${ariaLabel}`, valid)
        }
      />
    );
  };
  return (
    <div className={`tr-set-row${grouped ? " tr-set-row--grouped" : ""}`}>
      {!grouped && <span className="tr-set-index">Set {index + 1}</span>}
      {(hasField(configuration, "Fixed reps") ||
        hasField(configuration, "Rep ranges")) &&
        numberField(
          hasField(configuration, "Fixed reps") ? "Reps" : "From",
          `${scope} reps`,
          set.reps,
          1,
          (reps) => setPatch({ reps }),
        )}
      {hasField(configuration, "Rep ranges") &&
        numberField(
          "Up to",
          `${scope} maximum reps`,
          set.repsMax ?? set.reps,
          set.reps,
          (repsMax) => setPatch({ repsMax }),
          999,
        )}
      {hasField(configuration, "Tempo") && (
        <OptionSelect
          id={`${set.id}-tempo`}
          value={set.tempo}
          options={optionChoices("tempo", configuration)}
          label="Tempo"
          context={scope}
          onChange={(tempo) => setPatch({ tempo })}
        />
      )}
      {hasField(configuration, "Set type") && (
        <OptionSelect
          id={`${set.id}-type`}
          value={set.type}
          options={optionChoices("setType", configuration)}
          label="Set type"
          context={scope}
          onChange={(type) => setPatch({ type })}
        />
      )}
      {hasField(configuration, "Rest / pause") && (
        <OptionSelect
          id={`${set.id}-rest`}
          value={set.rest}
          options={optionChoices("rest", configuration)}
          label="Rest"
          context={scope}
          onChange={(rest) => setPatch({ rest })}
        />
      )}
      {hasField(configuration, "Detailed instructions") && (
        <div className="tr-set-note">
          <SharedInput
            label={grouped ? "Instructions for all sets" : "Instructions"}
            aria-label={`${scope} instructions`}
            value={set.instructions}
            size="md"
            onChange={(e) => setPatch({ instructions: e.currentTarget.value })}
          />
        </div>
      )}
      {!grouped && (
        <IconButton
          label={`Remove set ${index + 1}`}
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </IconButton>
      )}
    </div>
  );
}

function ExerciseEditorDialog({
  exercise,
  configuration,
  onChange,
  onSave,
  onClose,
  defaults,
}: {
  exercise: TrainingExercise;
  configuration: Variant;
  onChange: (next: TrainingExercise) => void;
  onSave: () => void;
  onClose: () => void;
  defaults: TrainingDefaults;
}) {
  const [individualSets, setIndividualSets] = useState(
    () => !hasUniformSetPrescriptions(exercise.sets),
  );
  const [pendingUnify, setPendingUnify] = useState(false);
  const [invalidDraftFields, setInvalidDraftFields] = useState<Set<string>>(
    () => new Set(),
  );
  const patch = (next: Partial<TrainingExercise>) =>
    onChange({ ...exercise, ...next });
  const setDraftValidity = (fieldId: string, valid: boolean) =>
    setInvalidDraftFields((current) => {
      const next = new Set(current);
      if (valid) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  const clearSetDraftValidity = (setId?: string) =>
    setInvalidDraftFields(
      (current) =>
        new Set(
          [...current].filter(
            (fieldId) =>
              fieldId === "set-count" ||
              (setId
                ? !fieldId.startsWith(`${setId}:`)
                : !fieldId.includes(":")),
          ),
        ),
    );
  const retainSetDrafts = (sets: TrainingSet[]) =>
    setInvalidDraftFields(
      (current) =>
        new Set(
          [...current].filter(
            (fieldId) =>
              fieldId === "set-count" ||
              sets.some((set) => fieldId.startsWith(`${set.id}:`)),
          ),
        ),
    );
  const setFieldEnabled = [
    "Sets",
    "Fixed reps",
    "Rep ranges",
    "Tempo",
    "Set type",
    "Rest / pause",
    "Detailed instructions",
  ].some((field) => hasField(configuration, field));
  const nameError = exercise.name.trim()
    ? undefined
    : "Enter an exercise name.";
  const invalidRanges = new Map(
    hasField(configuration, "Rep ranges")
      ? exercise.sets
          .filter((set) => set.repsMax !== undefined && set.repsMax < set.reps)
          .map((set) => [
            set.id,
            "Maximum reps must be at least the starting reps.",
          ])
      : [],
  );
  const canSave =
    !nameError && invalidRanges.size === 0 && invalidDraftFields.size === 0;
  const sharedSet = exercise.sets[0];
  return (
    <Dialog
      title={`Configure ${exercise.name || "exercise"}`}
      onClose={onClose}
      wide
    >
      <div className="tr-dialog-form">
        <SharedInput
          label="Exercise name"
          value={exercise.name}
          error={nameError}
          size="md"
          onChange={(e) => patch({ name: e.currentTarget.value })}
        />
        {setFieldEnabled && (
          <section className="tr-modal-sets" aria-label="Set prescriptions">
            <header className="tr-modal-section-head">
              <h3>Sets</h3>
              <div className="tr-set-count">
                <NumericDraftInput
                  id="training-set-count"
                  value={exercise.sets.length}
                  min={1}
                  max={20}
                  label={`Sets for ${exercise.name}`}
                  visibleLabel="Set count"
                  onValidityChange={(valid) =>
                    setDraftValidity("set-count", valid)
                  }
                  onChange={(count) => {
                    const resized = resizeExerciseSets(
                      exercise,
                      count,
                      defaults,
                    );
                    retainSetDrafts(resized.sets);
                    patch({
                      sets:
                        !individualSets && resized.sets[0]
                          ? applySharedSetPrescription(
                              resized.sets,
                              resized.sets[0],
                            )
                          : resized.sets,
                    });
                  }}
                />
              </div>
            </header>
            <div className="tr-individual-controls">
              <SharedCheckbox
                className="tr-individual-toggle"
                label="Configure sets individually"
                checked={individualSets}
                onCheckedChange={(checked) => {
                  if (checked) {
                    clearSetDraftValidity();
                    setPendingUnify(false);
                    setIndividualSets(true);
                  } else if (hasUniformSetPrescriptions(exercise.sets)) {
                    clearSetDraftValidity();
                    setIndividualSets(false);
                    setPendingUnify(false);
                  } else {
                    setPendingUnify(true);
                  }
                }}
              />
              {pendingUnify && (
                <fieldset className="tr-unify-prompt">
                  <legend>These sets have different prescriptions.</legend>
                  <button
                    type="button"
                    onClick={() => {
                      const first = exercise.sets[0];
                      if (first)
                        patch({
                          sets: applySharedSetPrescription(
                            exercise.sets,
                            first,
                          ),
                        });
                      clearSetDraftValidity();
                      setIndividualSets(false);
                      setPendingUnify(false);
                    }}
                  >
                    Use set 1 for all
                  </button>
                  <button type="button" onClick={() => setPendingUnify(false)}>
                    Keep individual settings
                  </button>
                </fieldset>
              )}
            </div>
            <div className="tr-set-list">
              {(individualSets
                ? exercise.sets
                : sharedSet
                  ? [sharedSet]
                  : []
              ).map((set, index) => (
                <SetFields
                  key={set.id}
                  set={set}
                  index={index}
                  configuration={configuration}
                  repRangeError={invalidRanges.get(set.id)}
                  grouped={!individualSets}
                  onValidityChange={setDraftValidity}
                  onChange={(next) =>
                    patch({
                      sets: individualSets
                        ? exercise.sets.map((item) =>
                            item.id === set.id ? next : item,
                          )
                        : applySharedSetPrescription(exercise.sets, next),
                    })
                  }
                  onRemove={() => {
                    clearSetDraftValidity(set.id);
                    patch({
                      sets: exercise.sets.filter((item) => item.id !== set.id),
                    });
                  }}
                  canRemove={individualSets && exercise.sets.length > 1}
                />
              ))}
            </div>
            <Button
              disabled={exercise.sets.length >= 20}
              onClick={() => {
                const added = freshSet(defaults);
                patch({
                  sets: [
                    ...exercise.sets,
                    !individualSets && sharedSet
                      ? applySharedSetPrescription([added], sharedSet)[0]
                      : added,
                  ],
                });
              }}
            >
              <Plus size={15} /> Add set
            </Button>
          </section>
        )}
        <details className="tr-supporting-details">
          <summary>Exercise details</summary>
          <div className="tr-supporting-fields">
            <ThemedSelect
              label="Primary muscle"
              value={exercise.muscle || EMPTY_SELECT_VALUE}
              options={[
                { value: EMPTY_SELECT_VALUE, label: "Unassigned" },
                ...MUSCLE_GROUPS.map((muscle) => ({
                  value: muscle.id,
                  label: muscle.label,
                })),
              ]}
              onValueChange={(muscle) =>
                patch({
                  muscle: muscle === EMPTY_SELECT_VALUE ? undefined : muscle,
                })
              }
              className="tr-themed-select"
            />
            <MultiSelect
              label="Secondary muscles"
              value={exercise.secondaryMuscles ?? []}
              options={MUSCLE_GROUPS.map((muscle) => ({
                value: muscle.id,
                label: muscle.label,
              }))}
              onValueChange={(secondaryMuscles) => patch({ secondaryMuscles })}
            />
            {hasField(configuration, "Progression notes") && (
              <OptionSelect
                id={`${exercise.id}-progression`}
                value={exercise.progression}
                options={optionChoices("progression", configuration)}
                label="Progression"
                context="Exercise progression"
                onChange={(progression) => patch({ progression })}
              />
            )}
            {hasField(configuration, "Detailed instructions") && (
              <SharedTextArea
                label="General coaching notes"
                rows={2}
                value={exercise.generalNotes ?? ""}
                onChange={(e) => patch({ generalNotes: e.currentTarget.value })}
              />
            )}
            {hasField(configuration, "Detailed instructions") && (
              <SharedTextArea
                label="Exercise instructions"
                rows={2}
                value={exercise.instructions}
                onChange={(e) => patch({ instructions: e.currentTarget.value })}
              />
            )}
          </div>
        </details>
        <footer className="tr-dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!canSave} onClick={onSave}>
            Save changes
          </Button>
        </footer>
      </div>
    </Dialog>
  );
}

function ActionMenu({
  label,
  items,
  className = "",
}: {
  label: string;
  className?: string;
  items: { label: string; disabled?: boolean; onSelect: () => void }[];
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (!menuRef.current) return;
    menuRef.current.open = false;
    menuRef.current.querySelector("summary")?.focus();
  };
  return (
    <details
      className={`tr-menu ${className}`}
      ref={menuRef}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        close();
      }}
    >
      <summary aria-label={label}>
        <MoreHorizontal size={18} />
        <span>More</span>
      </summary>
      <div className="tr-menu-items">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              close();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function SessionEditor({
  session,
  tabId,
  index,
  count,
  configuration,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  library,
  onLibraryChange,
  defaults,
}: {
  session: TrainingSession;
  tabId: string;
  index: number;
  count: number;
  configuration: Variant;
  onChange: (next: TrainingSession) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  library: ExerciseDefinition[];
  onLibraryChange: (next: ExerciseDefinition[]) => void;
  defaults: TrainingDefaults;
}) {
  const [libraryMode, setLibraryMode] = useState<
    "pick" | "manage" | "swap" | null
  >(null);
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null);
  const [exerciseDraft, setExerciseDraft] = useState<TrainingExercise | null>(
    null,
  );
  const patch = (next: Partial<TrainingSession>) =>
    onChange({ ...session, ...next });
  const moveExercise = (at: number, direction: -1 | 1) =>
    patch({ exercises: reorder(session.exercises, at, at + direction) });
  const editExercise = (exercise: TrainingExercise) =>
    setExerciseDraft(structuredClone(exercise));
  const saveExerciseDraft = () => {
    if (exerciseDraft) onChange(commitExerciseDraft(session, exerciseDraft));
    setExerciseDraft(null);
  };
  const addFromLibrary = (item: ExerciseDefinition) => {
    if (libraryMode === "swap" && swapExerciseId) {
      patch({
        exercises: session.exercises.map((exercise) =>
          exercise.id === swapExerciseId
            ? replaceTrainingExerciseDefinition(exercise, item)
            : exercise,
        ),
      });
      setSwapExerciseId(null);
      setLibraryMode(null);
      return;
    }
    const blank = freshExercise(defaults);
    const added = {
      ...blank,
      name: item.name,
      muscle: item.muscle,
      libraryId: item.id,
      secondaryMuscles: [...item.secondaryMuscles],
      generalNotes: item.notes,
    };
    patch({ exercises: [...session.exercises, added] });
    setExerciseDraft(added);
    setLibraryMode(null);
  };
  return (
    <section
      className="tr-session"
      id="training-session-panel"
      role="tabpanel"
      aria-labelledby={tabId}
    >
      <header className="tr-session-head">
        <div className="tr-session-name">
          <SharedInput
            label="Session name"
            value={session.name}
            size="md"
            onChange={(e) => patch({ name: e.currentTarget.value })}
          />
        </div>
        <ActionMenu
          label="Session actions"
          items={[
            {
              label: "Move session up",
              disabled: index === 0,
              onSelect: () => onMove(-1),
            },
            {
              label: "Move session down",
              disabled: index === count - 1,
              onSelect: () => onMove(1),
            },
            { label: "Duplicate session", onSelect: onDuplicate },
            { label: "Remove session", onSelect: onRemove },
          ]}
        />
      </header>
      <div className="tr-exercise-head" aria-hidden="true">
        <span></span>
        <span>Exercise</span>
        <span className="tr-prescription-head">
          <i>Sets</i>
          <i>Reps</i>
          <i>Tempo</i>
          <i>Details</i>
        </span>
        <span></span>
        <span></span>
      </div>
      <ol className="tr-exercise-list" aria-label={`${session.name} exercises`}>
        {session.exercises.map((exercise, at) => (
          <li className="tr-exercise-row" key={exercise.id}>
            <span className="tr-index" aria-hidden="true">
              {String(at + 1).padStart(2, "0")}
            </span>
            <div className="tr-exercise-copy">
              <strong className="tr-exercise-name">{exercise.name}</strong>
              {exerciseCues(exercise, configuration).map((cue) => (
                <small className="tr-exercise-cue" key={cue}>
                  {cue}
                </small>
              ))}
            </div>
            <ExerciseSummary
              exercise={exercise}
              configuration={configuration}
            />
            <div className="tr-exercise-actions">
              <button
                className="cn-text-button"
                type="button"
                onClick={() => editExercise(exercise)}
              >
                Configure exercise
              </button>
              <button
                className="cn-text-button"
                type="button"
                onClick={() => {
                  setSwapExerciseId(exercise.id);
                  setLibraryMode("swap");
                }}
              >
                Swap
              </button>
            </div>
            <ActionMenu
              className="tr-row-menu"
              label={`Actions for ${exercise.name}`}
              items={[
                {
                  label: "Move up",
                  disabled: at === 0,
                  onSelect: () => moveExercise(at, -1),
                },
                {
                  label: "Move down",
                  disabled: at === session.exercises.length - 1,
                  onSelect: () => moveExercise(at, 1),
                },
                {
                  label: "Duplicate exercise",
                  onSelect: () =>
                    patch({
                      exercises: [
                        ...session.exercises.slice(0, at + 1),
                        cloneExercise(exercise),
                        ...session.exercises.slice(at + 1),
                      ],
                    }),
                },
                {
                  label: "Remove exercise",
                  onSelect: () =>
                    patch({
                      exercises: session.exercises.filter(
                        (item) => item.id !== exercise.id,
                      ),
                    }),
                },
              ]}
            />
          </li>
        ))}
        {!session.exercises.length && (
          <li className="tr-empty">No exercises in this session yet.</li>
        )}
      </ol>
      <div className="tr-session-tools">
        <Button onClick={() => setLibraryMode("pick")}>
          <Plus size={15} /> Add exercise
        </Button>
      </div>
      {libraryMode && (
        <ExerciseLibraryDialog
          library={library}
          onChange={onLibraryChange}
          onPick={addFromLibrary}
          onClose={() => setLibraryMode(null)}
          mode={libraryMode === "manage" ? "manage" : "pick"}
          title={libraryMode === "swap" ? "Swap exercise" : undefined}
          pickActionLabel={libraryMode === "swap" ? "Replace" : "Add"}
        />
      )}
      {exerciseDraft && (
        <ExerciseEditorDialog
          exercise={exerciseDraft}
          configuration={configuration}
          defaults={defaults}
          onChange={setExerciseDraft}
          onSave={saveExerciseDraft}
          onClose={() => setExerciseDraft(null)}
        />
      )}
    </section>
  );
}

function ExerciseSummary({
  exercise,
  configuration,
}: {
  exercise: TrainingExercise;
  configuration: Variant;
}) {
  const groups = groupConsecutiveSetPrescriptions(exercise.sets);
  const visibleGroups = groups.length
    ? groups
    : [
        {
          count: 0,
          firstSetId: "empty",
          prescription: {
            reps: 0,
            tempo: "",
            type: "",
            rest: "",
            instructions: "",
          },
        },
      ];
  return (
    <div className="tr-prescription-groups">
      {visibleGroups.map(({ count, prescription, firstSetId }) => {
        const detail = [
          hasField(configuration, "Set type") ? prescription.type : "",
          hasField(configuration, "Rest / pause") && prescription.rest
            ? `${prescription.rest} rest`
            : "",
          hasField(configuration, "Detailed instructions")
            ? prescription.instructions
            : "",
        ]
          .filter(Boolean)
          .join(" · ");
        const reps =
          hasField(configuration, "Fixed reps") ||
          hasField(configuration, "Rep ranges")
            ? `${
                hasField(configuration, "Rep ranges") &&
                prescription.repsMax !== undefined &&
                prescription.repsMax > prescription.reps
                  ? `${prescription.reps}–${prescription.repsMax}`
                  : prescription.reps
              } reps`
            : "—";
        return (
          <div
            className="tr-prescription-group"
            key={`${exercise.id}-${firstSetId}`}
          >
            <span
              className="tr-prescription-cell tr-prescription-sets"
              data-label="Sets"
            >
              <span className="tr-prescription-label">Sets</span>
              <span className="tr-prescription-value">
                {count
                  ? hasField(configuration, "Sets")
                    ? `${count} ${count === 1 ? "set" : "sets"}`
                    : `${count}×`
                  : "—"}
              </span>
            </span>
            <span
              className="tr-prescription-cell tr-prescription-reps"
              data-label="Reps"
            >
              <span className="tr-prescription-label">Reps</span>
              <span className="tr-prescription-value">{reps}</span>
            </span>
            <span
              className="tr-prescription-cell tr-prescription-tempo"
              data-label="Tempo"
            >
              <span className="tr-prescription-label">Tempo</span>
              <span className="tr-prescription-value">
                {hasField(configuration, "Tempo")
                  ? prescription.tempo || "—"
                  : "—"}
              </span>
            </span>
            <span
              className="tr-prescription-cell tr-prescription-detail"
              data-label="Details"
              title={detail}
            >
              <span className="tr-prescription-label">Details</span>
              <span className="tr-prescription-value" title={detail}>
                {detail || "—"}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function exerciseCues(exercise: TrainingExercise, configuration: Variant) {
  if (!hasField(configuration, "Detailed instructions")) return [];
  return Array.from(
    new Set(
      [
        exercise.instructions,
        exercise.generalNotes,
        ...exercise.sets.map((set) => set.instructions),
      ]
        .map((cue) => cue?.trim())
        .filter((cue): cue is string => Boolean(cue)),
    ),
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
  const schedule = trainingRotationSchedule(value, selected);
  const cycleOrder =
    schedule.mode === "cycle"
      ? schedule.entries.map((entry) =>
          entry.kind === "rest" ? "Off" : entry.session.name,
        )
      : [];
  return (
    <div className="tr-preview">
      <div className="tr-section-head">
        <h3>
          {value.program === "Evergreen"
            ? "Ongoing program"
            : `Week ${selected} prescription`}
        </h3>
        <span>
          {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
        </span>
      </div>
      {schedule.mode === "weekly" ? (
        <section
          className="tr-prescription-rotation"
          aria-label="Assigned training days"
        >
          <strong>Weekly schedule</strong>
          {schedule.entries.length ? (
            schedule.entries.map((entry) => (
              <span key={entry.key}>
                {entry.kind === "session"
                  ? `${entry.label} · ${entry.session.name}`
                  : `${entry.label} · Off`}
              </span>
            ))
          ) : (
            <span>No sessions assigned to weekdays.</span>
          )}
        </section>
      ) : schedule.mode === "cycle" ? (
        <section
          className="tr-prescription-rotation"
          aria-label="Custom training rotation"
        >
          <strong>Custom rotation · per rotation</strong>
          <span>
            {cycleOrder.length
              ? [...cycleOrder, "Repeat"].join(" → ")
              : "No sessions in this rotation."}
          </span>
        </section>
      ) : null}
      {sessions.map((session) => (
        <section className="tr-preview-session" key={session.id}>
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
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const library = state.exerciseLibrary ?? defaultExerciseLibrary();
  const defaults = configuredDefaults(configuration);
  const changeLibrary = (next: ExerciseDefinition[]) =>
    setState((current) => ({ ...current, exerciseLibrary: next }));
  const currentWeek =
    value.program === "Evergreen"
      ? 1
      : Math.min(Math.max(1, week), Math.max(1, value.weeks));
  const sessions = effectiveSessions(value, currentWeek);
  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const rotation = value.rotation ?? {
    mode: "weekly" as const,
    weekdays: Object.fromEntries(WEEKDAYS.map((day) => [day, [] as string[]])),
  };
  const cycleDayOccurrences = new Map<string, number>();
  const updateRotation = (next: TrainingPlan["rotation"]) =>
    onChange({ ...value, rotation: next });
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
    <div className="tr-editor">
      <Section className="tr-program-bar" title="Program structure">
        <div className="tr-program-controls">
          <ThemedSelect
            label="Program structure"
            value={value.program}
            options={["Evergreen", "Week-based"].map((program) => ({
              value: program,
              label: program,
            }))}
            onValueChange={(program) =>
              setProgram(program as TrainingPlan["program"])
            }
            className="tr-themed-select tr-program-structure-field"
          />
          {value.program === "Evergreen" ? (
            <p className="tr-evergreen-note">
              Ongoing plan · changes apply across the program
            </p>
          ) : (
            <div className="tr-week-count">
              <span className="tr-week-count-control">
                <span className="tr-program-length-input">
                  <NumericDraftInput
                    id="training-program-length"
                    label="Program length in weeks"
                    visibleLabel="Program length"
                    value={value.weeks}
                    min={1}
                    max={52}
                    onValidityChange={() => {}}
                    onChange={changeProgramLength}
                  />
                </span>
                <span>weeks</span>
              </span>
            </div>
          )}
        </div>
      </Section>
      {hiddenOverrideWeeks.length > 0 && (
        <p className="tr-override-note">
          {value.program === "Evergreen"
            ? "Evergreen uses week 1. Later week overrides are retained if you switch back to a week-based program."
            : `Overrides after week ${value.weeks} are retained and inactive at this program length. Extend the program to bring them back.`}
        </p>
      )}
      {value.program === "Week-based" && (
        <nav className="tr-week-nav" aria-label="Training program weeks">
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
              {`Week ${number}`}
            </button>
          ))}
        </nav>
      )}
      <div className="tr-secondary-controls">
        <section
          className="tr-rotation"
          aria-label={
            rotation.mode === "cycle"
              ? "Custom training rotation"
              : "Weekly training rotation"
          }
        >
          <div className="tr-section-head">
            <h3>
              {rotation.mode === "cycle"
                ? "Custom rotation"
                : "Weekly rotation"}
            </h3>
            <div className="tr-rotation-modes">
              <div
                className="tr-mode-tabs"
                role="tablist"
                aria-label="Training schedule type"
              >
                {(["weekly", "cycle"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={rotation.mode === mode}
                    tabIndex={rotation.mode === mode ? 0 : -1}
                    onClick={() =>
                      updateRotation(
                        mode === "cycle"
                          ? {
                              mode: "cycle",
                              sessionIds: sessions.map((session) => session.id),
                            }
                          : {
                              mode: "weekly",
                              weekdays: Object.fromEntries(
                                WEEKDAYS.map((day) => [day, []]),
                              ),
                            },
                      )
                    }
                  >
                    {mode === "weekly" ? "Weekly" : "Custom rotation"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {rotation.mode === "weekly" ? (
            <div className="tr-weekday-grid">
              {WEEKDAYS.map((day) => (
                <ThemedSelect
                  key={day}
                  label={day}
                  value={rotation.weekdays[day]?.[0] ?? REST_DAY_VALUE}
                  options={[
                    { value: REST_DAY_VALUE, label: "Rest day" },
                    ...sessions.map((session) => ({
                      value: session.id,
                      label: session.name,
                    })),
                  ]}
                  onValueChange={(selection) =>
                    updateRotation({
                      ...rotation,
                      weekdays: {
                        ...rotation.weekdays,
                        [day]: selection === REST_DAY_VALUE ? [] : [selection],
                      },
                    })
                  }
                  className="tr-themed-select"
                />
              ))}
            </div>
          ) : (
            <div className="tr-cycle-list">
              <div className="tr-cycle-days">
                {rotation.sessionIds.map((sessionId, index) => {
                  const dayValue = sessionId ?? CYCLE_OFF_VALUE;
                  const occurrence = cycleDayOccurrences.get(dayValue) ?? 0;
                  cycleDayOccurrences.set(dayValue, occurrence + 1);
                  return (
                    <div
                      className="tr-cycle-day"
                      key={`${dayValue}:${occurrence}`}
                    >
                      <ThemedSelect
                        label={`Day ${index + 1}`}
                        value={
                          sessionId &&
                          sessions.some((session) => session.id === sessionId)
                            ? sessionId
                            : CYCLE_OFF_VALUE
                        }
                        options={[
                          { value: CYCLE_OFF_VALUE, label: "Off" },
                          ...sessions.map((session) => ({
                            value: session.id,
                            label: session.name,
                          })),
                        ]}
                        onValueChange={(selection) => {
                          const next = [...rotation.sessionIds];
                          next[index] =
                            selection === CYCLE_OFF_VALUE ? null : selection;
                          updateRotation({ ...rotation, sessionIds: next });
                        }}
                        className="tr-themed-select"
                      />
                      <IconButton
                        label={`Move day ${index + 1} earlier`}
                        disabled={index === 0}
                        onClick={() =>
                          updateRotation({
                            ...rotation,
                            sessionIds: reorder(
                              rotation.sessionIds,
                              index,
                              index - 1,
                            ),
                          })
                        }
                      >
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton
                        label={`Move day ${index + 1} later`}
                        disabled={index === rotation.sessionIds.length - 1}
                        onClick={() =>
                          updateRotation({
                            ...rotation,
                            sessionIds: reorder(
                              rotation.sessionIds,
                              index,
                              index + 1,
                            ),
                          })
                        }
                      >
                        <ArrowDown size={14} />
                      </IconButton>
                      <IconButton
                        label={`Remove day ${index + 1}`}
                        onClick={() =>
                          updateRotation({
                            ...rotation,
                            sessionIds: rotation.sessionIds.filter(
                              (_, dayIndex) => dayIndex !== index,
                            ),
                          })
                        }
                      >
                        <X size={14} />
                      </IconButton>
                    </div>
                  );
                })}
              </div>
              <div className="tr-cycle-actions">
                <Button
                  onClick={() =>
                    updateRotation({
                      ...rotation,
                      sessionIds: [
                        ...rotation.sessionIds,
                        sessions[0]?.id ?? null,
                      ],
                    })
                  }
                >
                  Add day
                </Button>
                <Button
                  onClick={() =>
                    updateRotation({
                      ...rotation,
                      sessionIds: [...rotation.sessionIds, null],
                    })
                  }
                >
                  Add off day
                </Button>
                <span>
                  Repeats after the last day · {rotation.sessionIds.length} days
                </span>
              </div>
            </div>
          )}
        </section>
        <Volume plan={value} week={currentWeek} configuration={configuration} />
      </div>
      <div className="tr-workspace">
        <div className="tr-edit-column">
          <header className="tr-column-head">
            <div>
              <h2>Sessions</h2>
              <p>Select a session to edit or add another.</p>
            </div>
          </header>
          <div className="tr-session-toolbar">
            <div
              className="cn-option-tabs tr-session-tabs"
              role="tablist"
              aria-label="Training sessions"
            >
              {sessions.map((session, index) => (
                <button
                  id={`training-session-tab-${session.id}`}
                  key={session.id}
                  type="button"
                  role="tab"
                  aria-selected={session.id === selectedSession?.id}
                  aria-controls="training-session-panel"
                  tabIndex={session.id === selectedSession?.id ? 0 : -1}
                  onClick={() => setSelectedSessionId(session.id)}
                  onKeyDown={(event) => {
                    const delta =
                      event.key === "ArrowRight"
                        ? 1
                        : event.key === "ArrowLeft"
                          ? -1
                          : 0;
                    const current = sessions.findIndex(
                      (item) => item.id === session.id,
                    );
                    const target =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? sessions.length - 1
                          : delta
                            ? (current + delta + sessions.length) %
                              sessions.length
                            : -1;
                    if (target < 0) return;
                    event.preventDefault();
                    const next = sessions[target];
                    if (!next) return;
                    setSelectedSessionId(next.id);
                    event.currentTarget.parentElement
                      ?.querySelector<HTMLButtonElement>(
                        `#training-session-tab-${next.id}`,
                      )
                      ?.focus();
                  }}
                >
                  {session.name || `Session ${index + 1}`}
                </button>
              ))}
              <Button
                onClick={() => {
                  const next = freshSession(sessions.length);
                  write([...sessions, next]);
                  setSelectedSessionId(next.id);
                }}
              >
                <Plus size={15} /> Add session
              </Button>
            </div>
          </div>
          {selectedSession ? (
            <SessionEditor
              key={selectedSession.id}
              session={selectedSession}
              tabId={`training-session-tab-${selectedSession.id}`}
              index={sessions.findIndex(
                (item) => item.id === selectedSession.id,
              )}
              count={sessions.length}
              configuration={configuration}
              library={library}
              onLibraryChange={changeLibrary}
              defaults={defaults}
              onChange={(next) => updateSession(selectedSession.id, next)}
              onRemove={() => {
                onChange(
                  deleteTrainingSession(value, currentWeek, selectedSession.id),
                );
                setSelectedSessionId("");
              }}
              onDuplicate={() => {
                const next = cloneSession(selectedSession);
                write([...sessions, next]);
                setSelectedSessionId(next.id);
              }}
              onMove={(direction) =>
                write(
                  reorder(
                    sessions,
                    sessions.findIndex(
                      (item) => item.id === selectedSession.id,
                    ),
                    sessions.findIndex(
                      (item) => item.id === selectedSession.id,
                    ) + direction,
                  ),
                )
              }
            />
          ) : (
            <div className="tr-empty">
              No sessions yet. Add one to start building this week.
            </div>
          )}
        </div>
      </div>
      {configuration.training.volume && (
        <p className="tr-volume-note">
          {value.rotation?.mode === "cycle"
            ? "Volume counts each session occurrence in the custom cycle."
            : value.rotation?.mode === "weekly"
              ? "Volume counts weekday assignments only; unassigned weekdays are rest days."
              : "Legacy plans count each session once."}{" "}
          Exercises without a supported muscle allocation are included as
          unassigned sets.
        </p>
      )}
    </div>
  );
}
