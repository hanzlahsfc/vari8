import type { ClassDeclarations } from "./css";
import type {
  ExtractionCell,
  ThemeArtifact,
  ThemeCombination,
} from "./contracts";

/** Minimal per-sheet input needed to aggregate theme combinations. */
export type SheetClasses = {
  slug: string;
  cells: ExtractionCell[];
  classes: Record<string, ClassDeclarations>;
};

type Accumulator = {
  background: string | null;
  text: string | null;
  border: string | null;
  font: string | null;
  sheets: Set<string>;
  count: number;
};

/**
 * Build the theme artifact from the distinct (background, text, border, font)
 * combinations actually used across the exports. Only CSS declaration values are
 * emitted — never cell text — so the artifact is safe.
 */
export function buildThemeArtifact(sheets: SheetClasses[]): ThemeArtifact {
  const combinations = new Map<string, Accumulator>();

  for (const sheet of sheets) {
    for (const cell of sheet.cells) {
      const tokens = (cell.class ?? "")
        .split(/\s+/)
        .filter((token) => token.length > 0);
      const token = tokens.find(
        (candidate) => sheet.classes[candidate] !== undefined,
      );
      if (token === undefined) continue;
      const declarations = sheet.classes[token];
      const background = declarations["background-color"] ?? null;
      const text = declarations["color"] ?? null;
      const border =
        declarations["border-bottom"] ?? declarations["border"] ?? null;
      const font = declarations["font-family"] ?? null;
      const key = JSON.stringify([background, text, border, font]);
      const entry = combinations.get(key) ?? {
        background,
        text,
        border,
        font,
        sheets: new Set<string>(),
        count: 0,
      };
      entry.count += 1;
      entry.sheets.add(sheet.slug);
      combinations.set(key, entry);
    }
  }

  const list: ThemeCombination[] = [...combinations.values()].map((entry) => ({
    background: entry.background,
    text: entry.text,
    border: entry.border,
    font: entry.font,
    seenIn: [...entry.sheets].sort(),
    count: entry.count,
  }));

  list.sort(
    (a, b) =>
      (a.background ?? "").localeCompare(b.background ?? "") ||
      (a.text ?? "").localeCompare(b.text ?? "") ||
      (a.border ?? "").localeCompare(b.border ?? "") ||
      (a.font ?? "").localeCompare(b.font ?? ""),
  );

  return {
    version: 1,
    derivation:
      "Distinct (background, text, border, font) declaration combinations from each export's per-cell classes in the inline <style> block and resources/sheet.css. No cell text is included.",
    combinations: list,
  };
}
