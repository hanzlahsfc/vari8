"use client";

import { useMemo, useState } from "react";

import { EXERCISE_FIELDS, searchExercises } from "@/lib/catalog";
import type { ExerciseRecord } from "@/lib/extraction/contracts";

export function ExerciseLibrary({
  records,
  muscleGroups,
  equipment,
}: {
  records: ExerciseRecord[];
  muscleGroups: string[];
  equipment: string[];
}) {
  const [query, setQuery] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState("");
  const results = useMemo(
    () =>
      searchExercises(records, query, {
        muscleGroup,
        equipment: equipmentFilter,
      }),
    [records, query, muscleGroup, equipmentFilter],
  );

  return (
    <>
      <form
        className="library-form"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="library-field">
          <span>Search</span>
          <input
            className="auth-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, target, equipment, pattern"
          />
        </label>
        <label className="library-field">
          <span>Muscle group</span>
          <select
            className="auth-input"
            value={muscleGroup}
            onChange={(event) => setMuscleGroup(event.target.value)}
          >
            <option value="">All</option>
            {muscleGroups.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="library-field">
          <span>Equipment</span>
          <select
            className="auth-input"
            value={equipmentFilter}
            onChange={(event) => setEquipmentFilter(event.target.value)}
          >
            <option value="">All</option>
            {equipment.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </form>
      <p className="library-count" aria-live="polite">
        {results.length} of {records.length} rows
      </p>
      <div className="library-scroll">
        <table className="library-table">
          <thead>
            <tr>
              {EXERCISE_FIELDS.map((field) => (
                <th key={field} scope="col">
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((record) => (
              <tr key={record.sourceRow}>
                {EXERCISE_FIELDS.map((field) => (
                  <td key={field}>{record[field]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
