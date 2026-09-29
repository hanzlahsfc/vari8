import type {
  ExerciseRecord,
  ExtractionCell,
  FoodRecord,
} from "./extraction/contracts";

/**
 * Pure, read-only catalog helpers shared by the reference libraries and the
 * sheet viewer. No I/O here so this is unit-testable. Source order is always
 * preserved (filter only).
 */

export const FOOD_FIELDS = [
  "no",
  "food",
  "amount",
  "unit",
  "calories",
  "protein",
  "carbs",
  "fats",
  "state",
  "category",
] as const;

export const EXERCISE_FIELDS = [
  "id",
  "name",
  "muscleGroup",
  "primaryTarget",
  "additionalTargets",
  "equipment",
  "movementPattern",
  "positionSetup",
  "cues",
  "videoLink",
] as const;

const includes = (value: string, query: string) =>
  value.toLowerCase().includes(query);

export function searchFoods(
  records: FoodRecord[],
  query: string,
  category = "",
): FoodRecord[] {
  const q = query.trim().toLowerCase();
  return records.filter((record) => {
    if (category && record.category !== category) return false;
    if (q === "") return true;
    return (
      includes(record.food, q) ||
      includes(record.category, q) ||
      includes(record.state, q) ||
      includes(record.unit, q)
    );
  });
}

export function foodCategories(records: FoodRecord[]): string[] {
  return [
    ...new Set(
      records.map((record) => record.category).filter((value) => value !== ""),
    ),
  ].sort();
}

export function searchExercises(
  records: ExerciseRecord[],
  query: string,
  filters: { muscleGroup?: string; equipment?: string } = {},
): ExerciseRecord[] {
  const q = query.trim().toLowerCase();
  return records.filter((record) => {
    if (filters.muscleGroup && record.muscleGroup !== filters.muscleGroup)
      return false;
    if (filters.equipment && record.equipment !== filters.equipment)
      return false;
    if (q === "") return true;
    return (
      includes(record.name, q) ||
      includes(record.muscleGroup, q) ||
      includes(record.primaryTarget, q) ||
      includes(record.equipment, q) ||
      includes(record.movementPattern, q)
    );
  });
}

export function exerciseFacets(records: ExerciseRecord[]): {
  muscleGroups: string[];
  equipment: string[];
} {
  const unique = (values: string[]) =>
    [...new Set(values.filter((value) => value !== ""))].sort();
  return {
    muscleGroups: unique(records.map((record) => record.muscleGroup)),
    equipment: unique(records.map((record) => record.equipment)),
  };
}

// --- Sparse sheet grid (viewer) ---------------------------------------------

export type SparseCellKind = "text" | "redacted" | "checkbox";

export type SparseCell = {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  className: string | null;
  kind: SparseCellKind;
  /** Empty for redacted cells (never carries an original value). */
  text: string;
  checkbox?: "checked" | "unchecked";
};

export type SparseGrid = {
  cells: SparseCell[];
  rows: number;
  cols: number;
  redactedCount: number;
  emptyOmitted: number;
};

const REDACTED_PREFIX = "[REDACTED:";

/**
 * Build a sparse grid: only cells with visible content (text or a checkbox) are
 * emitted — this avoids creating DOM nodes for hundreds of thousands of empty
 * cells while preserving each emitted cell's coordinates and merged spans. The
 * committed artifact is never altered.
 */
export function toSparseGrid(cells: ExtractionCell[]): SparseGrid {
  const sparse: SparseCell[] = [];
  let rows = 0;
  let cols = 0;
  let redactedCount = 0;
  let emptyOmitted = 0;

  for (const cell of cells) {
    // Extent includes the full span, so merged cells are never clipped.
    if (cell.row + cell.rowSpan - 1 > rows) rows = cell.row + cell.rowSpan - 1;
    if (cell.col + cell.colSpan - 1 > cols) cols = cell.col + cell.colSpan - 1;

    const isEmpty = cell.text.trim() === "";
    const hasCheckbox = cell.checkbox !== undefined;
    if (isEmpty && !hasCheckbox) {
      emptyOmitted += 1;
      continue;
    }

    const isRedacted = cell.text.startsWith(REDACTED_PREFIX);
    if (isRedacted) redactedCount += 1;

    sparse.push({
      row: cell.row,
      col: cell.col,
      rowSpan: cell.rowSpan,
      colSpan: cell.colSpan,
      className: cell.class,
      // Checkbox takes precedence over text so state is never dropped.
      kind: isRedacted ? "redacted" : hasCheckbox ? "checkbox" : "text",
      text: isRedacted ? "" : cell.text,
      ...(cell.checkbox ? { checkbox: cell.checkbox } : {}),
    });
  }

  return { cells: sparse, rows, cols, redactedCount, emptyOmitted };
}

export function sheetDisplayName(sourceFile: string): string {
  return sourceFile.replace(/\.html?$/i, "");
}
