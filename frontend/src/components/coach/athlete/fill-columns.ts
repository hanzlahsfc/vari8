/**
 * Distribute the spare width of a table frame across its data columns.
 *
 * Tables keep every measured column width as a minimum. When the natural
 * widths do not fill the available frame, the spare pixels are shared
 * proportionally and any rounding remainder is handed out one pixel at a time
 * to the largest columns first, so the result always sums exactly to the
 * available width. When the natural table is already at least as wide as the
 * frame, the natural widths are returned unchanged and the table scrolls.
 */
export function fillColumns(
  natural: readonly number[],
  available: number,
): number[] {
  const total = natural.reduce((sum, width) => sum + width, 0);
  if (available <= 0 || natural.length === 0 || total >= available)
    return [...natural];

  const result = natural.map((width) =>
    Math.max(Math.floor((width * available) / total), Math.ceil(width)),
  );

  let used = result.reduce((sum, width) => sum + width, 0);
  if (used > available) {
    // Fractional naturals can round every column up. Reduce the columns with
    // the most slack above their natural width, never below the natural width.
    const order = result
      .map((width, index) => ({ index, slack: width - natural[index] }))
      .sort((a, b) => b.slack - a.slack || natural[b.index] - natural[a.index]);
    for (const { index } of order) {
      if (used <= available) break;
      while (used > available && result[index] > natural[index]) {
        result[index] -= 1;
        used -= 1;
      }
    }
  }

  const leftover = available - used;
  if (leftover > 0) {
    const order = natural
      .map((width, index) => ({ index, width }))
      .sort((a, b) => b.width - a.width || a.index - b.index)
      .map(({ index }) => index);
    let cursor = 0;
    while (used < available) {
      result[order[cursor % order.length]] += 1;
      used += 1;
      cursor += 1;
    }
  }

  return result;
}
