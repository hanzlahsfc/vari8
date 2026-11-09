"use client";

import { type FormEvent, Fragment, useState } from "react";
import {
  Input as SharedInput,
  Select as ThemedSelect,
} from "@/components/vari8/components";
import {
  MultiSelect,
  TextArea as SharedTextArea,
} from "@/components/vari8/inputs";
import { FormGrid } from "@/components/vari8/layouts";
import { LIBRARY_MUSCLE_GROUPS, VOLUME_TARGETS } from "../../muscle-volume";
import { Button, Dialog, SearchBox } from "../../ui";
import type { ExerciseDefinition } from "../types";
import { makeId } from "./training-model";
import "./library-dialog.css";

const CHOOSE_MUSCLE = "__choose_muscle__";

type LibraryMode = "pick" | "manage";

type ExerciseLibraryDialogProps = {
  library: ExerciseDefinition[];
  onChange: (next: ExerciseDefinition[]) => void;
  onPick: (exercise: ExerciseDefinition) => void;
  onClose: () => void;
  mode?: LibraryMode;
  title?: string;
  pickActionLabel?: string;
};

export function ExerciseLibraryDialog({
  library,
  onChange,
  onPick,
  onClose,
  mode = "pick",
  title: titleOverride,
  pickActionLabel = "Add",
}: ExerciseLibraryDialogProps) {
  const [view, setView] = useState<LibraryMode>(mode);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ExerciseDefinition | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("");
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [equipment, setEquipment] = useState("");
  const [movementPattern, setMovementPattern] = useState("");
  const [position, setPosition] = useState("");
  const [primaryTarget, setPrimaryTarget] = useState("");
  const [additionalTargets, setAdditionalTargets] = useState<string[]>([]);
  const [muscleMissing, setMuscleMissing] = useState(false);
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [shown, setShown] = useState(60);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const equipmentOptions = Object.entries(
    library.reduce<Record<string, number>>((acc, item) => {
      if (item.equipment) acc[item.equipment] = (acc[item.equipment] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([eq]) => eq);
  const patternOptions = [
    ...new Set(library.map((i) => i.movementPattern).filter(Boolean)),
  ] as string[];
  const positionOptions = [
    ...new Set(library.map((i) => i.position).filter(Boolean)),
  ] as string[];
  const matches = library.filter((item) => {
    const haystack =
      `${item.name} ${item.muscle} ${item.secondaryMuscles.join(" ")} ` +
      `${item.equipment ?? ""} ${item.movementPattern ?? ""} ` +
      `${item.position ?? ""} ${item.primaryTarget ?? ""} ${item.notes}`;
    const qok =
      !normalizedQuery ||
      haystack.toLocaleLowerCase().includes(normalizedQuery);
    const mok = muscleFilter === "all" || item.muscle === muscleFilter;
    const eok = equipmentFilter === "all" || item.equipment === equipmentFilter;
    return qok && mok && eok;
  });
  const visible = matches.slice(0, shown);

  const resetForm = () => {
    setEditing(null);
    setFormOpen(false);
    setName("");
    setMuscle("");
    setSecondaryMuscles([]);
    setNotes("");
    setEquipment("");
    setMovementPattern("");
    setPosition("");
    setMuscleMissing(false);
  };

  const beginEdit = (item?: ExerciseDefinition) => {
    setEditing(item ?? null);
    setName(item?.name ?? "");
    setMuscle(item?.muscle ?? "");
    setSecondaryMuscles(item?.secondaryMuscles ?? []);
    setNotes(item?.notes ?? "");
    setEquipment(item?.equipment ?? "");
    setMovementPattern(item?.movementPattern ?? "");
    setPosition(item?.position ?? "");
    setPrimaryTarget(item?.primaryTarget ?? "");
    setAdditionalTargets(item?.additionalTargets ?? []);
    setFormOpen(true);
  };

  const saveExercise = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    if (!muscle) {
      setMuscleMissing(true);
      return;
    }

    const definition: ExerciseDefinition = {
      ...editing,
      id: editing?.id ?? makeId("library-exercise"),
      name: cleanName,
      muscle,
      secondaryMuscles: secondaryMuscles.filter((group) => group !== muscle),
      notes: notes.trim(),
      equipment: equipment.trim() || undefined,
      movementPattern: movementPattern.trim() || undefined,
      position: position.trim() || undefined,
      primaryTarget: primaryTarget.trim() || undefined,
      additionalTargets:
        additionalTargets.length > 0 ? additionalTargets : undefined,
    };

    onChange(
      editing
        ? library.map((item) => (item.id === editing.id ? definition : item))
        : [...library, definition],
    );
    resetForm();
  };

  const title =
    view === "pick" ? (titleOverride ?? "Add exercise") : "Exercise library";

  return (
    <Dialog title={title} onClose={onClose} wide>
      <div className="tr-library-dialog">
        {view === "pick" ? (
          <>
            <div className="tr-library-toolbar">
              <SearchBox
                value={query}
                onChange={(v) => {
                  setQuery(v);
                  setShown(60);
                }}
                placeholder="Search exercises"
                label="Search exercise library"
              />
              <select
                className="v8-input tr-library-filter"
                aria-label="Muscle group"
                value={muscleFilter}
                onChange={(e) => {
                  setMuscleFilter(e.currentTarget.value);
                  setShown(60);
                }}
              >
                <option value="all">All muscles</option>
                {LIBRARY_MUSCLE_GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
              <select
                className="v8-input tr-library-filter"
                aria-label="Equipment"
                value={equipmentFilter}
                onChange={(e) => {
                  setEquipmentFilter(e.currentTarget.value);
                  setShown(60);
                }}
              >
                <option value="all">All equipment</option>
                {equipmentOptions.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq}
                  </option>
                ))}
              </select>
              <Button type="button" onClick={() => setView("manage")}>
                Manage
              </Button>
            </div>
            <div className="tr-library-results">
              {visible.map((item, at) => {
                const flat = query.trim() !== "" || muscleFilter !== "all";
                const prev = at > 0 ? visible[at - 1] : undefined;
                const showHeader =
                  !flat && (!prev || prev.muscle !== item.muscle);
                return (
                  <Fragment key={item.id}>
                    {showHeader && (
                      <span className="tr-library-group">
                        {LIBRARY_MUSCLE_GROUPS.find((g) => g.id === item.muscle)
                          ?.label ?? item.muscle}{" "}
                        ·{" "}
                        {visible.filter((x) => x.muscle === item.muscle).length}
                      </span>
                    )}
                    <button
                      className="tr-library-result"
                      type="button"
                      onClick={() => onPick(item)}
                    >
                      <span className="tr-library-item-copy">
                        <strong>{item.name}</strong>
                        <small>
                          {[item.equipment, item.movementPattern]
                            .filter(Boolean)
                            .join(" · ") || muscleSummary(item)}
                        </small>
                      </span>
                      <span className="tr-library-tag" aria-hidden="true">
                        {LIBRARY_MUSCLE_GROUPS.find((g) => g.id === item.muscle)
                          ?.label ?? item.muscle}
                      </span>
                      <span className="tr-library-add" aria-hidden="true">
                        + {pickActionLabel}
                      </span>
                    </button>
                  </Fragment>
                );
              })}
              {matches.length > visible.length && (
                <button
                  type="button"
                  className="tr-library-more"
                  onClick={() => setShown((n) => n + 60)}
                >
                  Show 60 more ({matches.length - visible.length} left)
                </button>
              )}
              {matches.length === 0 && (
                <p className="tr-library-empty">
                  {library.length === 0
                    ? "Your exercise library is empty. Add a custom exercise to get started."
                    : "No exercises match that search. Try another name or muscle group."}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="tr-library-toolbar tr-library-manage-toolbar">
              {mode === "pick" && (
                <button
                  type="button"
                  className="v8-editor-header__back tr-library-back"
                  onClick={() => setView("pick")}
                >
                  Back to exercises
                </button>
              )}
              <p>
                Keep reusable exercises and their shared coaching notes here.
              </p>
              <div className="tr-library-toolbar-actions">
                {!formOpen && (
                  <Button primary type="button" onClick={() => beginEdit()}>
                    Add exercise
                  </Button>
                )}
              </div>
            </div>

            {formOpen && (
              <form className="tr-library-form" onSubmit={saveExercise}>
                <h3>{editing ? "Edit exercise" : "New exercise"}</h3>
                <SharedInput
                  label="Exercise name"
                  required
                  autoFocus
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Single-arm cable row"
                  size="md"
                />
                <FormGrid columns={2} className="tr-library-form-row">
                  <ThemedSelect
                    label="Primary muscle"
                    value={muscle || CHOOSE_MUSCLE}
                    onValueChange={(value) => {
                      setMuscle(value === CHOOSE_MUSCLE ? "" : value);
                      setMuscleMissing(false);
                    }}
                    options={[
                      { value: CHOOSE_MUSCLE, label: "Choose a muscle group" },
                      ...LIBRARY_MUSCLE_GROUPS.map(({ id, label }) => ({
                        value: id,
                        label,
                      })),
                    ]}
                    className="tr-themed-select"
                  />
                  {muscleMissing && (
                    <small className="tr-library-field-error">
                      Choose a primary muscle group.
                    </small>
                  )}
                  <MultiSelect
                    label="Secondary muscles"
                    value={secondaryMuscles}
                    options={LIBRARY_MUSCLE_GROUPS.filter(
                      (group) => group.id !== muscle,
                    ).map(({ id, label }) => ({ value: id, label }))}
                    onValueChange={setSecondaryMuscles}
                  />
                </FormGrid>
                <div className="tr-library-info-grid">
                  <SharedInput
                    label="Equipment"
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                    list="lib-equip"
                    placeholder="e.g. Dumbbell"
                    size="md"
                  />
                  <SharedInput
                    label="Movement pattern"
                    value={movementPattern}
                    onChange={(e) => setMovementPattern(e.target.value)}
                    list="lib-pattern"
                    placeholder="e.g. Hinge"
                    size="md"
                  />
                  <SharedInput
                    label="Position / setup"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    list="lib-position"
                    placeholder="e.g. Seated"
                    size="md"
                  />
                </div>
                <div className="tr-library-targets">
                  <label className="tr-library-field">
                    <span>Primary target</span>
                    <select
                      className="v8-input"
                      value={primaryTarget}
                      onChange={(e) => setPrimaryTarget(e.currentTarget.value)}
                      aria-label="Primary target"
                    >
                      <option value="">None</option>
                      {VOLUME_TARGETS.map((t) => (
                        <option key={t.id} value={t.label}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <MultiSelect
                    label="Additional target(s)"
                    value={additionalTargets}
                    onValueChange={setAdditionalTargets}
                    options={VOLUME_TARGETS.filter(
                      (t) => t.label !== primaryTarget,
                    ).map((t) => ({ value: t.label, label: t.label }))}
                  />
                </div>
                <datalist id="lib-equip">
                  {equipmentOptions.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
                <datalist id="lib-pattern">
                  {patternOptions.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
                <datalist id="lib-position">
                  {positionOptions.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
                <SharedTextArea
                  label="Default cues"
                  rows={3}
                  maxLength={1000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Shared cues for this movement"
                />
                <div className="tr-library-form-actions">
                  <Button primary type="submit">
                    Save exercise
                  </Button>
                  <Button type="button" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            <div className="tr-library-manage-list">
              {library.map((item) => (
                <article className="tr-library-manage-item" key={item.id}>
                  <div className="tr-library-item-copy">
                    <strong>{item.name}</strong>
                    <small>{muscleSummary(item)}</small>
                    {item.notes && <p>{item.notes}</p>}
                  </div>
                  <div className="tr-library-item-actions">
                    <Button type="button" onClick={() => beginEdit(item)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        onChange(
                          library.filter((entry) => entry.id !== item.id),
                        );
                        if (editing?.id === item.id) resetForm();
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
              {library.length === 0 && (
                <p className="tr-library-empty">
                  No saved exercises yet. Add an exercise to build your library.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function muscleSummary(item: ExerciseDefinition): string {
  const primary =
    LIBRARY_MUSCLE_GROUPS.find((group) => group.id === item.muscle)?.label ??
    (item.muscle || "Unassigned");
  const secondary = item.secondaryMuscles
    .map(
      (id) =>
        LIBRARY_MUSCLE_GROUPS.find((group) => group.id === id)?.label ?? id,
    )
    .join(", ");
  return secondary ? `${primary} · ${secondary}` : primary;
}
