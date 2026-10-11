/**
 * FRONTEND-INTEGRATION-P1 (owner choice 4) — presentation-only weekly
 * grouping of the bounded `DailyEntrySurface.history` array. Declared
 * dates (`YYYY-MM-DD`) are treated as plain calendar dates — UTC-naive
 * math, no timezone conversion. Monday start mirrors the Check-In
 * calendar's week convention; grouping adds no reads and invents no
 * records — it only regroups the sanitized response the server sent.
 */

import type { DailyEntryHistoryEntry } from "./service";

export type DailyEntryHistoryWeek = {
  /** Declared-date key of the week's Monday (`YYYY-MM-DD`). */
  weekStart: string;
  /** Human caption, e.g. "Week of Mon 12 Oct – Sun 18 Oct". */
  label: string;
  /** Entries inside the week, preserving the server's order. */
  entries: DailyEntryHistoryEntry[];
};

const DAY_MS = 86_400_000;

/** Monday of the declared date's week — UTC-naive, no timezone shift. */
function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Week of ${fmt.format(start)} – ${fmt.format(end)}`;
}

export function groupDailyHistoryByWeek(
  history: DailyEntryHistoryEntry[],
): DailyEntryHistoryWeek[] {
  const byWeek = new Map<string, DailyEntryHistoryEntry[]>();
  for (const entry of history) {
    const key = mondayOf(entry.entryDate);
    const bucket = byWeek.get(key);
    if (bucket) bucket.push(entry);
    else byWeek.set(key, [entry]);
  }
  return [...byWeek.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((weekStart) => {
      const entries = byWeek.get(weekStart) ?? [];
      return { weekStart, label: weekLabel(weekStart), entries };
    });
}
