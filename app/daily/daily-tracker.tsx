"use client";

import { useState, type FormEvent } from "react";

import {
  COMPUTED_COLUMNS,
  DAILY_FIELDS,
  type DailyField,
  validateDailyEntry,
} from "@/lib/daily-prototype";

type Values = Record<string, string>;

const GROUPS = [...new Set(DAILY_FIELDS.map((field) => field.group))];

function emptyValues(): Values {
  return Object.fromEntries(DAILY_FIELDS.map((field) => [field.key, ""]));
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: DailyField;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = field.unit ? `${field.label} (${field.unit})` : field.label;
  const common = { id: `f-${field.key}`, className: "auth-input", value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };

  return (
    <label className="daily-field" htmlFor={`f-${field.key}`}>
      <span>{label}</span>
      {field.type === "enum" ? (
        <select {...common}>
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea {...common} rows={2} />
      ) : (
        <input
          {...common}
          type={field.type === "number" ? "number" : field.type === "time" ? "time" : field.type === "date" ? "date" : "text"}
          min={field.min}
          max={field.max}
        />
      )}
    </label>
  );
}

export function DailyTrackerPrototype() {
  const [values, setValues] = useState<Values>(emptyValues);
  const [entries, setEntries] = useState<Record<string, Values>>({});
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);

  function setField(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function addEntry(event: FormEvent) {
    event.preventDefault();
    const found = validateDailyEntry(values);
    setErrors(found);
    if (found.length > 0) return;
    const date = values.date.trim();
    setEntries((current) => ({ ...current, [date]: { ...values } }));
  }

  const rows = Object.keys(entries).sort();

  return (
    <>
      <form
        className="daily-form"
        onSubmit={addEntry}
        aria-label="Daily entry (prototype)"
        noValidate
      >
        {GROUPS.map((group) => (
          <fieldset key={group} className="daily-group">
            <legend>{group}</legend>
            <div className="daily-grid">
              {DAILY_FIELDS.filter((field) => field.group === group).map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ""}
                  onChange={(value) => setField(field.key, value)}
                />
              ))}
            </div>
          </fieldset>
        ))}

        {errors.length > 0 ? (
          <ul className="daily-errors" role="alert">
            {errors.map((error) => (
              <li key={error.field}>{error.message}</li>
            ))}
          </ul>
        ) : null}

        <div className="daily-actions">
          <button type="submit" className="auth-button">
            Add to week view
          </button>
          <button
            type="button"
            className="auth-button"
            onClick={() => {
              setEntries({});
              setErrors([]);
            }}
          >
            Clear entries
          </button>
        </div>
      </form>

      <h2 className="app-title">Week view (in memory)</h2>
      {rows.length === 0 ? (
        <p className="app-lede">No entries yet. Add a day above — nothing is saved.</p>
      ) : (
        <div className="library-scroll" role="region" aria-label="In-memory week view">
          <table className="library-table">
            <thead>
              <tr>
                {DAILY_FIELDS.map((field) => (
                  <th key={field.key} scope="col">
                    {field.unit ? `${field.label} (${field.unit})` : field.label}
                  </th>
                ))}
                {COMPUTED_COLUMNS.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((date) => (
                <tr key={date}>
                  {DAILY_FIELDS.map((field) => (
                    <td key={field.key}>{entries[date][field.key] ?? ""}</td>
                  ))}
                  {COMPUTED_COLUMNS.map((column) => (
                    <td key={column.key} className="daily-todo">
                      {column.marker}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
