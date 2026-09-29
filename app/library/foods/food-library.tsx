"use client";

import { useMemo, useState } from "react";

import { FOOD_FIELDS, searchFoods } from "@/lib/catalog";
import type { FoodRecord } from "@/lib/extraction/contracts";

export function FoodLibrary({
  records,
  categories,
}: {
  records: FoodRecord[];
  categories: string[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const results = useMemo(
    () => searchFoods(records, query, category),
    [records, query, category],
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
            placeholder="Name, category, state, unit"
          />
        </label>
        <label className="library-field">
          <span>Category</span>
          <select
            className="auth-input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All</option>
            {categories.map((value) => (
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
              {FOOD_FIELDS.map((field) => (
                <th key={field} scope="col">
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((record) => (
              <tr key={record.sourceRow}>
                {FOOD_FIELDS.map((field) => (
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
