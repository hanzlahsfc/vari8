"use client";

import type { HabitConsistencyResult } from "@/lib/habits/service";

/**
 * TL22 client adapter (HABITS-I1, decision 110) — count-based
 * consistency over the scheduled window: done / skipped / not logged of
 * scheduled opportunities. No percentages, streaks, or rates — an empty
 * denominator renders honestly as zeros, never an invented figure.
 */
export function ClientConsistencyWidget({
  result,
}: {
  result: HabitConsistencyResult | null;
}) {
  if (!result) {
    return (
      <p className="cc-empty" data-testid="consistency-error">
        Consistency couldn’t be loaded.
      </p>
    );
  }
  const { totals, rows } = result;
  return (
    <div data-testid="client-consistency">
      {rows.length === 0 ? (
        <p className="cc-empty" data-testid="consistency-empty">
          No habits in this period.
        </p>
      ) : (
        <>
          <p data-testid="consistency-total">
            {totals.done} of {totals.scheduled} done
            {totals.skipped > 0 ? ` · ${totals.skipped} skipped` : ""}
            {totals.missing > 0 ? ` · ${totals.missing} not logged` : ""}
          </p>
          <ul>
            {rows.map((r) => (
              <li key={r.habitId} data-testid={`consistency-row-${r.habitId}`}>
                <strong>{r.name}</strong> — {r.done}/{r.scheduled} done
                {r.skipped > 0 ? `, ${r.skipped} skipped` : ""}
                {r.missing > 0 ? `, ${r.missing} not logged` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
