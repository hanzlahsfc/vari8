import type {
  ExerciseRecord,
  ExtractionCell,
  FoodRecord,
  NormalizedMacros,
} from "./contracts";
import { normalizeNumeric } from "./normalize";
import { parseSheetHtml } from "./parse";

/**
 * Header-driven extraction of the two reference databases (Nutrition, Exercise).
 *
 * Column positions are resolved from the real header labels, not assumed. Source
 * text is preserved exactly (German decimal commas included) and numeric values
 * are only added, additively, when unambiguous. Numbered-but-empty placeholder
 * rows and non-numeric footer rows are skipped.
 */

export type FoodField =
  | "no"
  | "food"
  | "amount"
  | "unit"
  | "calories"
  | "protein"
  | "carbs"
  | "fats"
  | "state"
  | "category";

export type ExerciseField =
  | "id"
  | "name"
  | "muscleGroup"
  | "primaryTarget"
  | "additionalTargets"
  | "equipment"
  | "movementPattern"
  | "positionSetup"
  | "cues"
  | "videoLink";

export function normalizeHeader(text: string): string {
  return text
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const FOOD_ALIASES: Record<FoodField, string[]> = {
  no: ["no"],
  food: ["food"],
  amount: ["amount"],
  unit: ["unit"],
  calories: ["calories"],
  protein: ["protein"],
  carbs: ["carbs"],
  fats: ["fats"],
  state: ["cooked/raw/dry"],
  category: ["cat", "category"],
};

export const EXERCISE_ALIASES: Record<ExerciseField, string[]> = {
  id: ["id"],
  name: ["exercise name", "name"],
  muscleGroup: ["muscle group"],
  primaryTarget: ["primary target"],
  additionalTargets: ["additional target", "additional targets"],
  equipment: ["equipment"],
  movementPattern: ["movement pattern"],
  positionSetup: ["position / setup", "position/setup"],
  cues: ["coaching notes / cues", "coaching notes", "cues"],
  videoLink: ["video link"],
};

function groupByRow(cells: ExtractionCell[]): Map<number, ExtractionCell[]> {
  const rows = new Map<number, ExtractionCell[]>();
  for (const cell of cells) {
    const list = rows.get(cell.row) ?? [];
    list.push(cell);
    rows.set(cell.row, list);
  }
  return rows;
}

function headerIndex<Field extends string>(
  aliases: Record<Field, string[]>,
): Map<string, Field> {
  const index = new Map<string, Field>();
  for (const field of Object.keys(aliases) as Field[]) {
    for (const alias of aliases[field])
      index.set(normalizeHeader(alias), field);
  }
  return index;
}

function mapRow<Field extends string>(
  rowCells: ExtractionCell[],
  index: Map<string, Field>,
): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  for (const cell of rowCells) {
    const field = index.get(normalizeHeader(cell.text));
    if (field !== undefined && map[field] === undefined) map[field] = cell.col;
  }
  return map;
}

function findHeader<Field extends string>(
  rows: Map<number, ExtractionCell[]>,
  aliases: Record<Field, string[]>,
  required: Field[],
): { row: number; columns: Partial<Record<Field, number>> } {
  const index = headerIndex(aliases);
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    const columns = mapRow(rows.get(row) ?? [], index);
    if (required.every((field) => columns[field] !== undefined)) {
      return { row, columns };
    }
  }
  throw new Error(`databases: no header row containing ${required.join(", ")}`);
}

function valueAt(rowCells: ExtractionCell[], col: number | undefined): string {
  if (col === undefined) return "";
  const cell = rowCells.find((c) => c.col === col);
  return cell ? cell.text : "";
}

function normalizeFields(
  raw: Partial<Record<string, string>>,
): NormalizedMacros | undefined {
  const normalized: NormalizedMacros = {};
  let any = false;
  for (const key of ["calories", "protein", "carbs", "fats"] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    const parsed = normalizeNumeric(value);
    if (parsed !== undefined) {
      normalized[key] = parsed;
      any = true;
    }
  }
  return any ? normalized : undefined;
}

export type FoodExtraction = {
  headerRow: number;
  columns: Partial<Record<FoodField, number>>;
  records: FoodRecord[];
  skippedNumberedRows: number;
  missingHeaders: FoodField[];
};

export function extractFoods(html: string): FoodExtraction {
  const { cells } = parseSheetHtml(html);
  const rows = groupByRow(cells);
  const { row: headerRow, columns } = findHeader<FoodField>(
    rows,
    FOOD_ALIASES,
    ["no", "food"],
  );

  const missingHeaders = (Object.keys(FOOD_ALIASES) as FoodField[]).filter(
    (field) => columns[field] === undefined,
  );
  const todo =
    missingHeaders.length > 0
      ? `TODO(product): source is missing column(s): ${missingHeaders.join(", ")}`
      : undefined;

  const records: FoodRecord[] = [];
  let skippedNumberedRows = 0;

  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    if (row <= headerRow) continue;
    const rowCells = rows.get(row) ?? [];
    const no = valueAt(rowCells, columns.no);
    if (!/^\d+$/.test(no.trim())) continue;

    const food = valueAt(rowCells, columns.food);
    if (food === "") {
      skippedNumberedRows += 1;
      continue;
    }

    const raw = {
      calories: valueAt(rowCells, columns.calories),
      protein: valueAt(rowCells, columns.protein),
      carbs: valueAt(rowCells, columns.carbs),
      fats: valueAt(rowCells, columns.fats),
    };
    const record: FoodRecord = {
      no,
      food,
      amount: valueAt(rowCells, columns.amount),
      unit: valueAt(rowCells, columns.unit),
      calories: raw.calories,
      protein: raw.protein,
      carbs: raw.carbs,
      fats: raw.fats,
      state: valueAt(rowCells, columns.state),
      category: valueAt(rowCells, columns.category),
      sourceRow: row,
    };
    const normalized = normalizeFields(raw);
    if (normalized) record.normalized = normalized;
    if (todo) record.todo = todo;
    records.push(record);
  }

  return { headerRow, columns, records, skippedNumberedRows, missingHeaders };
}

export type ExerciseExtraction = {
  headerRow: number;
  columns: Partial<Record<ExerciseField, number>>;
  records: ExerciseRecord[];
  skippedNumberedRows: number;
  missingHeaders: ExerciseField[];
};

export function extractExercises(html: string): ExerciseExtraction {
  const { cells } = parseSheetHtml(html);
  const rows = groupByRow(cells);
  const { row: headerRow, columns } = findHeader<ExerciseField>(
    rows,
    EXERCISE_ALIASES,
    ["id", "name"],
  );

  const missingHeaders = (
    Object.keys(EXERCISE_ALIASES) as ExerciseField[]
  ).filter((field) => columns[field] === undefined);
  const todo =
    missingHeaders.length > 0
      ? `TODO(product): source is missing column(s): ${missingHeaders.join(", ")}`
      : undefined;

  const records: ExerciseRecord[] = [];
  let skippedNumberedRows = 0;

  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    if (row <= headerRow) continue;
    const rowCells = rows.get(row) ?? [];
    const id = valueAt(rowCells, columns.id);
    if (!/^\d+$/.test(id.trim())) continue;

    const name = valueAt(rowCells, columns.name);
    if (name === "") {
      skippedNumberedRows += 1;
      continue;
    }

    const record: ExerciseRecord = {
      id,
      name,
      muscleGroup: valueAt(rowCells, columns.muscleGroup),
      primaryTarget: valueAt(rowCells, columns.primaryTarget),
      additionalTargets: valueAt(rowCells, columns.additionalTargets),
      equipment: valueAt(rowCells, columns.equipment),
      movementPattern: valueAt(rowCells, columns.movementPattern),
      positionSetup: valueAt(rowCells, columns.positionSetup),
      cues: valueAt(rowCells, columns.cues),
      videoLink: valueAt(rowCells, columns.videoLink),
      sourceRow: row,
    };
    if (todo) record.todo = todo;
    records.push(record);
  }

  return { headerRow, columns, records, skippedNumberedRows, missingHeaders };
}
