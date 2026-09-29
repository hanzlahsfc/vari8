import type {
  ExtractionCell,
  RedactionEntry,
  SheetArtifact,
  SheetSlug,
} from "./contracts";
import { redactedPlaceholder } from "./contracts";
import { SUMMARY_CONFIG } from "./summaries";

/**
 * Fail-closed, source-aware redaction of person-specific values.
 *
 * Policy: the two reference databases and the empty supplementation template are
 * safe in full. For client-bearing sheets, a cell survives ONLY if its trimmed
 * text is a curated static label, a safe structural marker (WEEK/MEAL/DAY/PRE/
 * Averages), or safe product copy (disclaimer/license/HOW-TO-USE/phase guide).
 * Everything else is redacted, including genuinely ambiguous text.
 *
 * Redaction keeps the cell's coordinates/spans/class/checkbox state, replaces the
 * text with `[REDACTED:<category>]`, and drops any derived `normalized` value.
 */

const SAFE_SHEETS = new Set<SheetSlug>([
  "exercise-database",
  "nutrition-database",
  "supplementation",
]);

const SAFE_PATTERNS: RegExp[] = [
  /^WEEK\s+\d+$/i,
  /^MEAL\s+\d+$/i,
  /^DAY\s+\d+$/i,
  /^PRE$/i,
  /^Averages$/i,
];

/** Substrings of safe product copy, kept verbatim (never client values). */
const SAFE_COPY_MARKERS: string[] = [
  "how to use",
  "all sheets must be completed",
  "not a doctor or registered dietitian",
  "educational and entertainment purposes only",
  "private and confidential",
  "infinitycre8",
  "licensed to prgrss",
  "redistribution, resale",
  // NOTE: cycle-phase words (menstrual/follicular/ovulation/luteal) are NOT matched
  // globally: they also appear as DAILY TRACKER/TIMELINE client values. The MENSES
  // guide is instead kept via its source-located region (see mensesGuideRegion).
];

const CATEGORY: Record<SheetSlug, string> = {
  "daily-tracker": "client.daily-entry",
  dashboard: "client.profile",
  timeline: "client.plan",
  mealplan: "client.mealplan",
  supplementation: "client.supplementation",
  menses: "client.menses",
  training: "client.training",
  peaking: "client.peaking",
  showday: "client.show",
  "exercise-database": "reference.exercise",
  "nutrition-database": "reference.food",
};

const REDACTION_REASON =
  "fail-closed redaction of a person-specific value in a client-bearing sheet";
const CONTACT_REASON = "third-party contact credit (personal identifier)";

/** Personal-contact shapes are never safe, even inside reference sheets. */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const CREDIT_MARKER = "template and design by";

export type SafeLabels = ReadonlySet<string>;

export function safeLabelSet(slug: SheetSlug): SafeLabels {
  return new Set(SUMMARY_CONFIG[slug].labels);
}

type Region = { rowStart: number; rowEnd: number; colStart: number; colEnd: number };

/**
 * Source-aware bounds of the MENSES `CYCLE PHASE GUIDE` block, located from its
 * static label. This is generic product copy (phase names, day ranges, generic
 * descriptions) and is kept verbatim; client values (current phase, cycle
 * history, HRT) sit outside these bounds and stay redacted.
 */
function mensesGuideRegion(cells: ExtractionCell[]): Region | null {
  const label = cells.find((cell) => cell.row < 40 && cell.text.trim() === "CYCLE PHASE GUIDE");
  if (!label) return null;
  // The guide block spans ~10 rows and ~16 resolved columns from its label
  // (labels, day ranges, phase names, descriptions, glyphs).
  return { rowStart: label.row, rowEnd: label.row + 10, colStart: label.col, colEnd: label.col + 16 };
}

function inRegion(cell: ExtractionCell, region: Region): boolean {
  return (
    cell.row >= region.rowStart &&
    cell.row <= region.rowEnd &&
    cell.col >= region.colStart &&
    cell.col <= region.colEnd
  );
}

export function isSafeCellText(slug: SheetSlug, text: string, labels: SafeLabels): boolean {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (EMAIL_PATTERN.test(trimmed) || lower.includes(CREDIT_MARKER)) return false;
  if (SAFE_SHEETS.has(slug)) return true;
  if (trimmed === "") return true;
  if (labels.has(trimmed)) return true;
  if (SAFE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  return SAFE_COPY_MARKERS.some((marker) => lower.includes(marker));
}

export type RedactedSheet = {
  artifact: SheetArtifact;
  redactions: RedactionEntry[];
  keptCells: number;
  redactedCells: number;
  emptyCells: number;
};

export function redactSheet(
  slug: SheetSlug,
  sourceFile: string,
  cells: ExtractionCell[],
  classes: Record<string, Record<string, string>>,
  parserTodos: string[],
): RedactedSheet {
  const labels = safeLabelSet(slug);
  const isSafeSheet = SAFE_SHEETS.has(slug);
  const guideRegion = slug === "menses" ? mensesGuideRegion(cells) : null;
  const category = isSafeSheet ? "vendor.contact" : CATEGORY[slug];
  const reason = isSafeSheet ? CONTACT_REASON : REDACTION_REASON;
  const placeholder = redactedPlaceholder(category);

  const redactions: RedactionEntry[] = [];
  let redactedCells = 0;
  let keptCells = 0;
  let emptyCells = 0;

  const redactedCellsList: ExtractionCell[] = cells.map((cell) => {
    const isEmpty = cell.text.trim() === "";
    if (isEmpty) {
      emptyCells += 1;
      return { ...cell };
    }
    if ((guideRegion !== null && inRegion(cell, guideRegion)) || isSafeCellText(slug, cell.text, labels)) {
      keptCells += 1;
      return { ...cell };
    }
    redactedCells += 1;
    redactions.push({
      artifact: `spec/sheets/${slug}.json`,
      sheet: slug,
      cell: { row: cell.row, col: cell.col },
      fieldCategory: category,
      placeholder,
      reason,
    });
    const next: ExtractionCell = { ...cell, text: placeholder };
    delete next.normalized;
    delete next.todo;
    return next;
  });

  const artifact: SheetArtifact = {
    slug,
    sourceFile,
    cells: redactedCellsList,
    classes,
    todos: [
      ...parserTodos,
      `TODO(product): ${redactedCells} client-bearing cells redacted by fail-closed sheet policy; expand the safe-label/copy allowlist once the xlsx/backend schematic is available`,
    ],
  };

  return { artifact, redactions, keptCells, redactedCells, emptyCells };
}

export function sortRedactions(entries: RedactionEntry[]): RedactionEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.artifact.localeCompare(b.artifact) ||
      (a.cell?.row ?? 0) - (b.cell?.row ?? 0) ||
      (a.cell?.col ?? 0) - (b.cell?.col ?? 0) ||
      a.fieldCategory.localeCompare(b.fieldCategory),
  );
}
