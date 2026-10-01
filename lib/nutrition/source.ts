import { createHash } from "node:crypto";

import type { ExtractionCell } from "../extraction/contracts";
import {
  FOOD_ALIASES,
  normalizeHeader,
  type FoodField,
} from "../extraction/databases";
import { normalizeNumeric } from "../extraction/normalize";
import { parseSheetHtml } from "../extraction/parse";

/**
 * Phase 2.1 — Nutrition Database source mapping and per-row classification.
 *
 * Parsing reuses the repo's Google-Sheets HTML parser (`parseSheetHtml`) and the
 * Nutrition header aliases from `lib/extraction/databases.ts`. The source is a
 * values-only HTML export: there are no formulas, validations, or hidden data to
 * recover, so only verbatim headers/values are mapped. Every candidate row is
 * classified with a machine-readable reason code — rows are never silently
 * dropped, and empty padding rows are counted explicitly.
 */

export const NUTRITION_SOURCE_FIELDS = [
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

export type NutritionSourceField = (typeof NUTRITION_SOURCE_FIELDS)[number];

/** Verbatim source headers (spreadsheet row 2). */
export const NUTRITION_SOURCE_HEADERS: Record<NutritionSourceField, string> = {
  no: "NO.",
  food: "FOOD",
  amount: "AMOUNT",
  unit: "UNIT",
  calories: "CALORIES (kcal)",
  protein: "PROTEIN (g)",
  carbs: "CARBS (g)",
  fats: "FATS (g)",
  state: "COOKED/RAW/DRY",
  category: "CAT",
};

export type NutritionRejectionReason =
  | "missing_food"
  | "non_data_row"
  | "invalid_source_number"
  | "invalid_numeric"
  | "duplicate_source_number";

export type NutritionSourceRecord = {
  sourceRow: number;
  sourceNo: number;
  name: string;
  amount: number | null;
  unit: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  state: string | null;
  category: string | null;
  rowFingerprint: string;
};

export type NutritionRejectedRow = {
  sourceRow: number;
  sourceNo: number | null;
  reasonCode: NutritionRejectionReason;
  reasonField?: NutritionSourceField;
};

export type NutritionSource = {
  sourceName: string;
  sourceFingerprint: string;
  headerRow: number;
  columns: Record<NutritionSourceField, number>;
  scannedRowCount: number;
  ignoredEmptyRowCount: number;
  sourceRowCount: number;
  accepted: NutritionSourceRecord[];
  rejected: NutritionRejectedRow[];
  duplicates: NutritionRejectedRow[];
};

export class NutritionSourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NutritionSourceError";
  }
}

const NUTRIENT_FIELDS = [
  "amount",
  "calories",
  "protein",
  "carbs",
  "fats",
] as const;

function groupByRow(cells: ExtractionCell[]): Map<number, ExtractionCell[]> {
  const rows = new Map<number, ExtractionCell[]>();
  for (const cell of cells) {
    const list = rows.get(cell.row) ?? [];
    list.push(cell);
    rows.set(cell.row, list);
  }
  return rows;
}

function valueAt(rowCells: ExtractionCell[], col: number): string {
  return rowCells.find((cell) => cell.col === col)?.text ?? "";
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function numericOrNull(
  value: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  const parsed = normalizeNumeric(trimmed);
  if (parsed === undefined) return { ok: false };
  return { ok: true, value: parsed };
}

function rowFingerprint(
  record: Omit<NutritionSourceRecord, "rowFingerprint">,
): string {
  return createHash("sha256")
    .update(
      [
        record.sourceNo,
        record.name,
        record.amount,
        record.unit,
        record.calories,
        record.protein,
        record.carbs,
        record.fats,
        record.state,
        record.category,
      ]
        .map((value) => (value === null ? "" : String(value)))
        .join("\u0001"),
    )
    .digest("hex");
}

function findHeader(rows: Map<number, ExtractionCell[]>): {
  headerRow: number;
  columns: Record<NutritionSourceField, number>;
} {
  const index = new Map<string, FoodField>();
  for (const field of Object.keys(FOOD_ALIASES) as FoodField[]) {
    for (const alias of FOOD_ALIASES[field]) {
      index.set(normalizeHeader(alias), field);
    }
  }
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    const columns = new Map<FoodField, number>();
    for (const cell of rows.get(row) ?? []) {
      const field = index.get(normalizeHeader(cell.text));
      if (field !== undefined && !columns.has(field))
        columns.set(field, cell.col);
    }
    if (columns.has("no") && columns.has("food")) {
      const resolved = {} as Record<NutritionSourceField, number>;
      for (const field of NUTRITION_SOURCE_FIELDS) {
        const col = columns.get(field);
        if (col === undefined) {
          throw new NutritionSourceError(
            "header_mismatch",
            `Nutrition source is missing required header for "${field}"`,
          );
        }
        resolved[field] = col;
      }
      return { headerRow: row, columns: resolved };
    }
  }
  throw new NutritionSourceError(
    "header_not_found",
    "Nutrition source has no header row containing NO. and FOOD",
  );
}

export function extractNutritionSource(
  html: string,
  meta: { sourceName: string; sourceFingerprint: string },
): NutritionSource {
  const { cells } = parseSheetHtml(html);
  const rows = groupByRow(cells);
  const { headerRow, columns } = findHeader(rows);

  const accepted: NutritionSourceRecord[] = [];
  const rejected: NutritionRejectedRow[] = [];
  const duplicates: NutritionRejectedRow[] = [];
  const seenSourceNos = new Set<number>();
  let ignoredEmptyRowCount = 0;

  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    if (row <= headerRow) continue;
    const rowCells = rows.get(row) ?? [];
    const raw = {} as Record<NutritionSourceField, string>;
    for (const field of NUTRITION_SOURCE_FIELDS) {
      raw[field] = valueAt(rowCells, columns[field]);
    }

    const isCandidate = NUTRITION_SOURCE_FIELDS.some(
      (field) => raw[field].trim() !== "",
    );
    if (!isCandidate) {
      ignoredEmptyRowCount += 1;
      continue;
    }

    const no = raw.no.trim();
    const food = raw.food.trim();

    if (food === "") {
      if (/^\d+$/.test(no)) {
        rejected.push({
          sourceRow: row,
          sourceNo: Number(no),
          reasonCode: "missing_food",
        });
      } else {
        rejected.push({
          sourceRow: row,
          sourceNo: null,
          reasonCode: "non_data_row",
        });
      }
      continue;
    }

    if (!/^\d+$/.test(no)) {
      rejected.push({
        sourceRow: row,
        sourceNo: null,
        reasonCode: "invalid_source_number",
      });
      continue;
    }

    const sourceNo = Number(no);
    if (seenSourceNos.has(sourceNo)) {
      duplicates.push({
        sourceRow: row,
        sourceNo,
        reasonCode: "duplicate_source_number",
      });
      continue;
    }
    seenSourceNos.add(sourceNo);

    const numericErrors: { field: NutritionSourceField } | null = (() => {
      for (const field of NUTRIENT_FIELDS) {
        if (!numericOrNull(raw[field]).ok) return { field };
      }
      return null;
    })();
    if (numericErrors) {
      rejected.push({
        sourceRow: row,
        sourceNo,
        reasonCode: "invalid_numeric",
        reasonField: numericErrors.field,
      });
      continue;
    }

    const numerics = {} as Record<
      (typeof NUTRIENT_FIELDS)[number],
      number | null
    >;
    for (const field of NUTRIENT_FIELDS) {
      const parsed = numericOrNull(raw[field]);
      numerics[field] = parsed.ok ? parsed.value : null;
    }

    const partial: Omit<NutritionSourceRecord, "rowFingerprint"> = {
      sourceRow: row,
      sourceNo,
      name: food,
      amount: numerics.amount,
      unit: textOrNull(raw.unit),
      calories: numerics.calories,
      protein: numerics.protein,
      carbs: numerics.carbs,
      fats: numerics.fats,
      state: textOrNull(raw.state),
      category: textOrNull(raw.category),
    };
    accepted.push({ ...partial, rowFingerprint: rowFingerprint(partial) });
  }

  const sourceRowCount = accepted.length + rejected.length + duplicates.length;
  return {
    sourceName: meta.sourceName,
    sourceFingerprint: meta.sourceFingerprint,
    headerRow,
    columns,
    scannedRowCount: sourceRowCount + ignoredEmptyRowCount,
    ignoredEmptyRowCount,
    sourceRowCount,
    accepted,
    rejected,
    duplicates,
  };
}
