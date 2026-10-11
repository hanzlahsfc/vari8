/**
 * P-025-D2 — Check-In calendar (decision decision 104). Pure display helpers
 * for the viewer-local (browser timezone) day placement. Timezone use
 * here is DISPLAY ONLY — it establishes no timezone authority, DST, or
 * recurrence policy. The bounded range parser lives in `instances.ts`
 * next to the list services (no import cycle).
 */

/**
 * Viewer-local calendar day key (`YYYY-MM-DD`) of an instant under an
 * IANA timezone — the decision 104 display-only placement rule.
 */
export function checkInCalendarDayKey(
  instantIso: string,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instantIso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export type CheckInCalendarCell = {
  key: string;
  /** ISO weekday (1=Mon … 7=Sun). */
  weekday: number;
  inMonth: boolean;
};

/**
 * Monday-start 6-week (42-cell) grid for the given proleptic month.
 * `month` is zero-based like `Date` (0 = January). Day keys are pure
 * Gregorian — the viewer's timezone decides WHICH month is shown and
 * which day an instant lands on, never the arithmetic.
 */
export function checkInCalendarMonthCells(
  year: number,
  month: number,
): CheckInCalendarCell[] {
  // Weekday of the 1st (UTC-day arithmetic is exact for civil dates):
  // Date.getUTCDay → 0=Sun…6=Sat → ISO → (d + 6) % 7 + 1.
  const firstWeekday =
    ((new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7) + 1;
  const cells: CheckInCalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const offset = i - (firstWeekday - 1);
    const d = new Date(Date.UTC(year, month, 1 + offset));
    const key = d.toISOString().slice(0, 10);
    cells.push({
      key,
      weekday: (i % 7) + 1,
      inMonth: offset >= 0 && d.getUTCMonth() === month,
    });
  }
  return cells;
}
