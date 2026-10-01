import { createHash } from "node:crypto";

import type { ExtractionCell } from "../extraction/contracts";
import {
  EXERCISE_ALIASES,
  normalizeHeader,
  type ExerciseField,
} from "../extraction/databases";
import { parseSheetHtml } from "../extraction/parse";

/**
 * Phase 2.2 — Exercise Database source mapping and per-row classification.
 *
 * Parsing reuses the repo's Google-Sheets HTML parser (`parseSheetHtml`) and
 * the Exercise header aliases from `lib/extraction/databases.ts`. The source is
 * a values-only HTML export: there are no formulas, validations, or hidden
 * data to recover, so only verbatim headers/values are mapped. Every candidate
 * row is classified with a machine-readable reason code — rows are never
 * silently dropped, and empty padding rows are counted explicitly.
 */

export const EXERCISE_SOURCE_FIELDS = [
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

export type ExerciseSourceField = (typeof EXERCISE_SOURCE_FIELDS)[number];

/** Verbatim source headers (spreadsheet row 2). */
export const EXERCISE_SOURCE_HEADERS: Record<ExerciseSourceField, string> = {
  id: "ID",
  name: "Exercise Name",
  muscleGroup: "Muscle Group",
  primaryTarget: "Primary Target",
  additionalTargets: "Additional Target(s)",
  equipment: "Equipment",
  movementPattern: "Movement Pattern",
  positionSetup: "Position / Setup",
  cues: "Coaching Notes / Cues",
  videoLink: "Video Link",
};

export type ExerciseRejectionReason =
  "missing_name" | "non_data_row" | "invalid_source_id" | "duplicate_source_id";

export type ExerciseSourceRecord = {
  sourceRow: number;
  sourceId: number;
  name: string;
  muscleGroup: string | null;
  primaryTarget: string | null;
  additionalTargets: string | null;
  equipment: string | null;
  movementPattern: string | null;
  positionSetup: string | null;
  cues: string | null;
  videoLink: string | null;
  rowFingerprint: string;
};

export type ExerciseRejectedRow = {
  sourceRow: number;
  sourceId: number | null;
  reasonCode: ExerciseRejectionReason;
  reasonField?: ExerciseSourceField;
};

export type ExerciseSource = {
  sourceName: string;
  sourceFingerprint: string;
  headerRow: number;
  columns: Record<ExerciseSourceField, number>;
  scannedRowCount: number;
  ignoredEmptyRowCount: number;
  sourceRowCount: number;
  accepted: ExerciseSourceRecord[];
  rejected: ExerciseRejectedRow[];
  duplicates: ExerciseRejectedRow[];
};

export class ExerciseSourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExerciseSourceError";
  }
}

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

function rowFingerprint(
  record: Omit<ExerciseSourceRecord, "rowFingerprint">,
): string {
  return createHash("sha256")
    .update(
      [
        record.sourceId,
        record.name,
        record.muscleGroup,
        record.primaryTarget,
        record.additionalTargets,
        record.equipment,
        record.movementPattern,
        record.positionSetup,
        record.cues,
        record.videoLink,
      ]
        .map((value) => (value === null ? "" : String(value)))
        .join("\u0001"),
    )
    .digest("hex");
}

function findHeader(rows: Map<number, ExtractionCell[]>): {
  headerRow: number;
  columns: Record<ExerciseSourceField, number>;
} {
  const index = new Map<string, ExerciseField>();
  for (const field of Object.keys(EXERCISE_ALIASES) as ExerciseField[]) {
    for (const alias of EXERCISE_ALIASES[field]) {
      index.set(normalizeHeader(alias), field);
    }
  }
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    const columns = new Map<ExerciseField, number>();
    for (const cell of rows.get(row) ?? []) {
      const field = index.get(normalizeHeader(cell.text));
      if (field !== undefined && !columns.has(field))
        columns.set(field, cell.col);
    }
    if (columns.has("id") && columns.has("name")) {
      const resolved = {} as Record<ExerciseSourceField, number>;
      for (const field of EXERCISE_SOURCE_FIELDS) {
        const col = columns.get(field);
        if (col === undefined) {
          throw new ExerciseSourceError(
            "header_mismatch",
            `Exercise source is missing required header for "${field}"`,
          );
        }
        resolved[field] = col;
      }
      return { headerRow: row, columns: resolved };
    }
  }
  throw new ExerciseSourceError(
    "header_not_found",
    "Exercise source has no header row containing ID and Exercise Name",
  );
}

export function extractExerciseSource(
  html: string,
  meta: { sourceName: string; sourceFingerprint: string },
): ExerciseSource {
  const { cells } = parseSheetHtml(html);
  const rows = groupByRow(cells);
  const { headerRow, columns } = findHeader(rows);

  const accepted: ExerciseSourceRecord[] = [];
  const rejected: ExerciseRejectedRow[] = [];
  const duplicates: ExerciseRejectedRow[] = [];
  const seenSourceIds = new Set<number>();
  let ignoredEmptyRowCount = 0;

  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    if (row <= headerRow) continue;
    const rowCells = rows.get(row) ?? [];
    const raw = {} as Record<ExerciseSourceField, string>;
    for (const field of EXERCISE_SOURCE_FIELDS) {
      raw[field] = valueAt(rowCells, columns[field]);
    }

    const isCandidate = EXERCISE_SOURCE_FIELDS.some(
      (field) => raw[field].trim() !== "",
    );
    if (!isCandidate) {
      ignoredEmptyRowCount += 1;
      continue;
    }

    const id = raw.id.trim();
    const name = raw.name.trim();

    if (name === "") {
      if (/^\d+$/.test(id)) {
        rejected.push({
          sourceRow: row,
          sourceId: Number(id),
          reasonCode: "missing_name",
        });
      } else {
        rejected.push({
          sourceRow: row,
          sourceId: null,
          reasonCode: "non_data_row",
        });
      }
      continue;
    }

    if (!/^\d+$/.test(id)) {
      rejected.push({
        sourceRow: row,
        sourceId: null,
        reasonCode: "invalid_source_id",
      });
      continue;
    }

    const sourceId = Number(id);
    if (seenSourceIds.has(sourceId)) {
      duplicates.push({
        sourceRow: row,
        sourceId,
        reasonCode: "duplicate_source_id",
      });
      continue;
    }
    seenSourceIds.add(sourceId);

    const partial: Omit<ExerciseSourceRecord, "rowFingerprint"> = {
      sourceRow: row,
      sourceId,
      name,
      muscleGroup: textOrNull(raw.muscleGroup),
      primaryTarget: textOrNull(raw.primaryTarget),
      additionalTargets: textOrNull(raw.additionalTargets),
      equipment: textOrNull(raw.equipment),
      movementPattern: textOrNull(raw.movementPattern),
      positionSetup: textOrNull(raw.positionSetup),
      cues: textOrNull(raw.cues),
      videoLink: textOrNull(raw.videoLink),
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
