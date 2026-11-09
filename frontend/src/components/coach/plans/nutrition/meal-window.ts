/**
 * Sliding-window math for the meal plan's side-by-side option columns.
 *
 * The window shows a contiguous run of options in plan order. A new window
 * start is clamped to the valid range after deletes and resizes, and a focus
 * index (the option just selected, added or focused) moves the window the
 * minimum amount needed to include it.
 */
export function mealWindowStart(
  prevStart: number,
  count: number,
  columns: number,
  focusIndex?: number | null,
): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const width = Math.max(1, Math.min(Math.trunc(columns) || 1, count));
  const maxStart = Math.max(0, count - width);
  const requested = Number.isFinite(prevStart) ? Math.trunc(prevStart) : 0;
  const start = Math.min(Math.max(0, requested), maxStart);
  if (focusIndex === undefined || focusIndex === null) return start;
  if (!Number.isFinite(focusIndex)) return start;
  const focus = Math.min(Math.max(0, Math.trunc(focusIndex)), count - 1);
  if (focus < start) return focus;
  if (focus >= start + width) return Math.min(maxStart, focus - width + 1);
  return start;
}
