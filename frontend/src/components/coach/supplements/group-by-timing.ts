export type TimingGroup<T> = {
  /** Normalized timing key. Empty string is the "No timing set" group. */
  key: string;
  /** First-seen original timing text, or "No timing set". */
  label: string;
  items: T[];
};

const TIMING_RANKS: readonly [RegExp, number][] = [
  [/wak|morning|fasted/, 0],
  [/breakfast/, 1],
  [/pre[\s-]*workout|before training/, 2],
  [/intra/, 3],
  [/post[\s-]*workout|after training/, 4],
  [/lunch/, 5],
  [/afternoon|snack/, 6],
  [/dinner|evening/, 7],
  [/bed|night|sleep/, 8],
];

export const timingKey = (timing: string) => timing.trim().toLowerCase();

export function timingRank(timing: string): number | null {
  const key = timingKey(timing);
  if (!key) return null;
  for (const [pattern, rank] of TIMING_RANKS)
    if (pattern.test(key)) return rank;
  return null;
}

/**
 * Group supplement items by their free-text timing.
 *
 * Known times of day come first in waking → bed order, unknown timings follow
 * in first-appearance order, and the empty timing group stays last. Labels are
 * the first original spelling seen for each normalized key, so a plan keeps
 * the coach's wording while case/whitespace variants merge.
 */
export function groupByTiming<T extends { timing: string }>(
  items: readonly T[],
): TimingGroup<T>[] {
  const groups = new Map<
    string,
    TimingGroup<T> & { first: number; rank: number | null }
  >();
  items.forEach((item, index) => {
    const key = timingKey(item.timing);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      return;
    }
    const label = key ? item.timing.trim() : "No timing set";
    groups.set(key, {
      key,
      label,
      items: [item],
      first: index,
      rank: key ? timingRank(key) : null,
    });
  });
  return [...groups.values()]
    .sort((a, b) => {
      if (a.key === "") return 1;
      if (b.key === "") return -1;
      if (a.rank !== null && b.rank !== null)
        return a.rank - b.rank || a.first - b.first;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return a.first - b.first;
    })
    .map(({ key, label, items: grouped }) => ({
      key,
      label,
      items: grouped,
    }));
}
