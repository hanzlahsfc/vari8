"use client";

import { type FormEvent, useState } from "react";
import {
  Input as SharedInput,
  Select as ThemedSelect,
} from "@/components/vari8/components";
import {
  MultiSelect,
  TextArea as SharedTextArea,
} from "@/components/vari8/inputs";
import { FormGrid } from "@/components/vari8/layouts";
import { MUSCLE_GROUPS } from "../../muscle-volume";
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
  const [muscleMissing, setMuscleMissing] = useState(false);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = library.filter((item) =>
    `${item.name} ${item.muscle} ${item.secondaryMuscles.join(" ")} ${item.notes}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );

  const resetForm = () => {
    setEditing(null);
    setFormOpen(false);
    setName("");
    setMuscle("");
    setSecondaryMuscles([]);
    setNotes("");
    setMuscleMissing(false);
  };

  const beginEdit = (item?: ExerciseDefinition) => {
    setEditing(item ?? null);
    setName(item?.name ?? "");
    setMuscle(item?.muscle ?? "");
    setSecondaryMuscles(item?.secondaryMuscles ?? []);
    setNotes(item?.notes ?? "");
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
                onChange={setQuery}
                placeholder="Search exercises or muscle groups"
                label="Search exercise library"
              />
              <Button type="button" onClick={() => setView("manage")}>
                Manage library
              </Button>
            </div>
            <div className="tr-library-results">
              {matches.map((item) => (
                <button
                  className="tr-library-result"
                  key={item.id}
                  type="button"
                  onClick={() => onPick(item)}
                >
                  <span className="tr-library-item-copy">
                    <strong>{item.name}</strong>
                    <small>{muscleSummary(item)}</small>
                  </span>
                  <span className="tr-library-pill" aria-hidden="true">
                    {pickActionLabel}
                  </span>
                </button>
              ))}
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
              <p>
                Keep reusable exercises and their shared coaching notes here.
              </p>
              <div className="tr-library-toolbar-actions">
                {mode === "pick" && (
                  <Button type="button" onClick={() => setView("pick")}>
                    Back to exercises
                  </Button>
                )}
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
                      ...MUSCLE_GROUPS.map(({ id, label }) => ({
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
                    options={MUSCLE_GROUPS.filter(
                      (group) => group.id !== muscle,
                    ).map(({ id, label }) => ({ value: id, label }))}
                    onValueChange={setSecondaryMuscles}
                  />
                </FormGrid>
                <SharedTextArea
                  label="Coaching notes"
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
    MUSCLE_GROUPS.find((group) => group.id === item.muscle)?.label ??
    (item.muscle || "Unassigned");
  const secondary = item.secondaryMuscles
    .map((id) => MUSCLE_GROUPS.find((group) => group.id === id)?.label ?? id)
    .join(", ");
  return secondary ? `${primary} · ${secondary}` : primary;
}
