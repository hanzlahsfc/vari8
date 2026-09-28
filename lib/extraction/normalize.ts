/**
 * Safe, additive numeric normalization.
 *
 * The original text is never altered; `normalized` is only produced when the
 * trimmed value is unambiguously numeric. The exports mix conventions (German
 * comma decimals and English-style thousands groups), so genuinely ambiguous
 * strings (e.g. `"1.234"` / `"1,234"`) return `undefined`.
 */

export function normalizeNumeric(raw: string): number | undefined {
  const text = raw.trim();
  if (text.length === 0) return undefined;
  if (!/^[+-]?[\d.,]+$/.test(text)) return undefined;

  // Plain integer, e.g. "2485", "-3".
  if (/^[+-]?\d+$/.test(text)) return Number(text);

  // Decimal with a comma and 1-2 fractional digits, e.g. "4,5".
  if (/^[+-]?\d+,\d{1,2}$/.test(text)) return Number(text.replace(",", "."));

  // Decimal with a dot and 1-2 fractional digits, e.g. "66.9", "36.5".
  if (/^[+-]?\d+\.\d{1,2}$/.test(text)) return Number(text);

  // Grouped thousands with dots, e.g. "14.000" or "1.234.567". A single group
  // after a 1-digit integer part ("1.234") is ambiguous with a decimal.
  const dotGroups = /^([+-]?\d{1,3})((?:\.\d{3})+)$/.exec(text);
  if (dotGroups) {
    const groups = dotGroups[2].split(".").length - 1;
    if (groups >= 2 || dotGroups[1].replace(/[+-]/, "").length >= 2) {
      return Number(text.replace(/\./g, ""));
    }
    return undefined;
  }

  // Grouped thousands with commas, e.g. "12,000" or "1,234,567". Same
  // ambiguity rule as above.
  const commaGroups = /^([+-]?\d{1,3})((?:,\d{3})+)$/.exec(text);
  if (commaGroups) {
    const groups = commaGroups[2].split(",").length - 1;
    if (groups >= 2 || commaGroups[1].replace(/[+-]/, "").length >= 2) {
      return Number(text.replace(/,/g, ""));
    }
    return undefined;
  }

  return undefined;
}
