/**
 * Extraction contract: deterministic types and sheet-slug mapping for the
 * PRGRSS 2.0 HTML exports. See docs/extraction-contract.md.
 *
 * The contract is defined in Phase 7 but no sheet/data artifacts are emitted
 * until Phase 8+.
 */

// ---------------------------------------------------------------------------
// Sheet identity / slug mapping
// ---------------------------------------------------------------------------

export type SheetSlug =
  | "daily-tracker"
  | "dashboard"
  | "timeline"
  | "mealplan"
  | "supplementation"
  | "menses"
  | "training"
  | "peaking"
  | "showday"
  | "exercise-database"
  | "nutrition-database";

/**
 * Deterministic file-name -> slug: drop the extension, trim, lowercase, and
 * collapse every run of non-alphanumeric characters to a single hyphen.
 */
export function slugifySheetFileName(fileName: string): string {
  return fileName
    .trim()
    .replace(/\.html?$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ExpectedSheet = {
  file: string;
  slug: SheetSlug;
};

export const EXPECTED_SHEETS: readonly ExpectedSheet[] = [
  { file: "DAILY TRACKER.html", slug: "daily-tracker" },
  { file: "DASHBOARD.html", slug: "dashboard" },
  { file: "TIMELINE.html", slug: "timeline" },
  { file: "MEALPLAN.html", slug: "mealplan" },
  { file: "SUPPLEMENTATION.html", slug: "supplementation" },
  { file: "MENSES.html", slug: "menses" },
  { file: "TRAINING.html", slug: "training" },
  { file: "PEAKING.html", slug: "peaking" },
  { file: "SHOWDAY.html", slug: "showday" },
  { file: "Exercise Database.html", slug: "exercise-database" },
  { file: "Nutrition Database.html", slug: "nutrition-database" },
] as const;

export const SHEET_SLUGS: Record<string, SheetSlug> = Object.fromEntries(
  EXPECTED_SHEETS.map((sheet) => [sheet.file, sheet.slug]),
) as Record<string, SheetSlug>;

// ---------------------------------------------------------------------------
// Cell / sheet artifacts
// ---------------------------------------------------------------------------

/**
 * A single resolved grid cell. `row`/`col` are 1-based and refer to the top-left
 * anchor of the cell. Spans are preserved; a merged region is represented once,
 * at its anchor, and does NOT fabricate cells for the area it covers.
 */
export type ExtractionCell = {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  /** Source class attribute (or null when absent). */
  class: string | null;
  /** Original source text, preserved exactly (including German decimal commas). */
  text: string;
  /** Additive numeric value, present ONLY when the text is unambiguously numeric. */
  normalized?: number;
  /** Present ONLY when checkbox state is reliably derived from the SVG markup. */
  checkbox?: "checked" | "unchecked";
  /** `TODO(product)` note when state/shape is ambiguous rather than guessed. */
  todo?: string;
};

/** CSS declarations keyed by property, for each source class name. */
export type ClassDeclarations = Record<string, string>;

export type SheetArtifact = {
  slug: string;
  sourceFile: string;
  cells: ExtractionCell[];
  classes: Record<string, ClassDeclarations>;
  todos: string[];
};

export type SummarySection = {
  label: string;
  kind: string;
  startRow: number;
  endRow: number | null;
  evidence: string;
};

export type SheetSummaryArtifact = {
  slug: string;
  sourceFile: string;
  sections: SummarySection[];
  todos: string[];
};

// ---------------------------------------------------------------------------
// Data artifacts
// ---------------------------------------------------------------------------

export type NormalizedMacros = {
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
};

export type FoodRecord = {
  no: string;
  food: string;
  amount: string;
  unit: string;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  state: string;
  category: string;
  normalized?: NormalizedMacros;
  sourceRow: number;
};

export type ExerciseRecord = {
  id: string;
  name: string;
  muscleGroup: string;
  primaryTarget: string;
  additionalTargets: string;
  equipment: string;
  movementPattern: string;
  positionSetup: string;
  cues: string;
  videoLink: string;
  sourceRow: number;
};

// ---------------------------------------------------------------------------
// Theme artifact
// ---------------------------------------------------------------------------

export type ThemeCombination = {
  background: string;
  text: string;
  border: string | null;
  font: string | null;
  seenIn: string[];
  count: number;
};

export type ThemeArtifact = {
  version: number;
  derivation: string;
  combinations: ThemeCombination[];
};

// ---------------------------------------------------------------------------
// Cross-sheet candidate links
// ---------------------------------------------------------------------------

export type CrossSheetLink = {
  value: string;
  sheets: string[];
  count: number;
};

// ---------------------------------------------------------------------------
// Redaction / TODO contracts
// ---------------------------------------------------------------------------

export const REDACTED_PREFIX = "[REDACTED:";

export function redactedPlaceholder(category: string): string {
  return `${REDACTED_PREFIX}${category}]`;
}

export type RedactionEntry = {
  artifact: string;
  sheet?: string;
  cell?: { row: number; col: number };
  section?: string;
  fieldCategory: string;
  placeholder: string;
  reason: string;
};

export type RedactionManifest = {
  version: number;
  policy: string;
  placeholderConvention: string;
  redactions: RedactionEntry[];
};

export type TodoEntry = {
  scope: string;
  message: string;
};
