import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  ExerciseArtifact,
  FoodArtifact,
  SheetArtifact,
  SheetSummaryArtifact,
} from "./extraction/contracts";
import { EXPECTED_SHEETS, type SheetSlug } from "./extraction/contracts";

/**
 * Server-only loaders for the committed, redacted extraction artifacts.
 * Read-only; results are cached per server process. Never used in client code.
 */

const SPEC_DIR = join(process.cwd(), "spec");
const cache = new Map<string, unknown>();

function load<T>(relativePath: string): T {
  const cached = cache.get(relativePath);
  if (cached !== undefined) return cached as T;
  const value = JSON.parse(readFileSync(join(SPEC_DIR, relativePath), "utf8")) as T;
  cache.set(relativePath, value);
  return value;
}

export type SheetListItem = { slug: SheetSlug; file: string; name: string };

export function sheetDisplayName(file: string): string {
  return file.replace(/\.html?$/i, "");
}

export function listSheets(): SheetListItem[] {
  return EXPECTED_SHEETS.map((sheet) => ({
    slug: sheet.slug,
    file: sheet.file,
    name: sheetDisplayName(sheet.file),
  }));
}

export function isSheetSlug(value: string): value is SheetSlug {
  return EXPECTED_SHEETS.some((sheet) => sheet.slug === value);
}

export function getFoods(): FoodArtifact {
  return load<FoodArtifact>("data/foods.json");
}

export function getExercises(): ExerciseArtifact {
  return load<ExerciseArtifact>("data/exercises.json");
}

export function getSheetArtifact(slug: SheetSlug): SheetArtifact {
  return load<SheetArtifact>(`sheets/${slug}.json`);
}

export function getSheetSummary(slug: SheetSlug): SheetSummaryArtifact {
  return load<SheetSummaryArtifact>(`sheets/${slug}.summary.json`);
}
