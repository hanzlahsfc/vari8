import type {
  ExtractionCell,
  SheetSlug,
  SheetSummaryArtifact,
  SummaryBlock,
  SummarySection,
} from "./contracts";

/**
 * Evidence-based, privacy-safe structural summaries.
 *
 * Only coordinates, counts, repeated-block markers, and a CURATED set of static
 * template labels are emitted. Arbitrary cell text (which may be client data) is
 * never copied. Week/meal/day markers are reported as counts (and, where useful,
 * distinct-value counts) rather than individual labels.
 */

type BlockRule = {
  kind: string;
  marker: string;
  pattern: RegExp;
  /** Capture group index used to count distinct values (e.g. week numbers). */
  distinctGroup?: number;
};

type SheetConfig = {
  labels: string[];
  blocks: BlockRule[];
};

const WEEK = String.raw`^WEEK\s+(\d+)$`;

export const SUMMARY_CONFIG: Record<SheetSlug, SheetConfig> = {
  "daily-tracker": {
    labels: [
      "DATE & PHASE",
      "BODYWEIGHT",
      "MENSES",
      "SLEEP",
      "ACTIVITY",
      "BIOFEEDBACK",
      "BIOMETRICS",
      "NUTRITION",
      "NOTES",
    ],
    blocks: [
      { kind: "week-block", marker: "Averages", pattern: /^Averages$/ },
      {
        kind: "week-header",
        marker: "WEEK n",
        pattern: new RegExp(WEEK),
        distinctGroup: 1,
      },
    ],
  },
  dashboard: {
    labels: [
      "CURRENT WEEK",
      "CURRENT PHASE",
      "CHECK-IN",
      "CLIENT & COACHING INFORMATION",
      "NUTRITION",
      "EXPENDITURE",
      "BODY COMPOSITION",
      "COMPETITION SETUP",
      "HOW TO USE",
    ],
    blocks: [],
  },
  timeline: {
    labels: [
      "DATE & PHASE MAPPING",
      "COMP SETUP",
      "BODYWEIGHT",
      "TARGETS",
      "CHANGES",
      "PED'S",
    ],
    blocks: [],
  },
  mealplan: {
    labels: ["OVERVIEW", "LOW DAY", "MEDIUM DAY", "HIGH DAY"],
    blocks: [
      {
        kind: "meal",
        marker: "MEAL n",
        pattern: new RegExp(String.raw`^MEAL\s+(\d+)$`),
        distinctGroup: 1,
      },
      {
        kind: "day-type-table",
        marker: "LOW/MEDIUM/HIGH DAY",
        pattern: /^(LOW|MEDIUM|HIGH) DAY$/,
      },
      { kind: "pre-slot", marker: "PRE", pattern: /^PRE$/ },
    ],
  },
  supplementation: {
    labels: ["TIME", "SUPPLEMENT", "DOSAGE", "STATUS"],
    blocks: [],
  },
  menses: {
    labels: [
      "CURRENT CYCLE DAY",
      "CURRENT PHASE",
      "AVG CYCLE LENGTH",
      "NEXT PERIOD EST.",
      "EST. OVULATION",
      "CYCLE PHASE GUIDE",
      "LAST CYCLES",
      "HRT SETUP",
    ],
    blocks: [
      {
        kind: "phase-guide-day",
        marker: "Day n",
        pattern: new RegExp(String.raw`^Day\s+(\d+)$`),
        distinctGroup: 1,
      },
    ],
  },
  training: {
    labels: [
      "PROGRAMMING",
      "SCHEDULE",
      "SPLIT",
      "ROTATION LENGTH",
      "GOAL",
      "ADDITIONAL INFO",
    ],
    blocks: [
      {
        kind: "week-column-group",
        marker: "WEEK n",
        pattern: new RegExp(WEEK),
        distinctGroup: 1,
      },
      {
        kind: "day-block",
        marker: "DAY n",
        pattern: new RegExp(String.raw`^DAY\s+(\d+)$`),
        distinctGroup: 1,
      },
    ],
  },
  peaking: {
    labels: [
      "DATE",
      "NOTES",
      "BODYWEIGHT",
      "CHECK-IN AM / PW / PM",
      "AM WEIGHT",
      "PM WEIGHT",
      "WATER",
      "SALT",
      "STEPS",
      "CARDIO",
      "TRAINING",
      "INTENSITY %",
    ],
    blocks: [
      { kind: "week-block", marker: "Averages", pattern: /^Averages$/ },
      {
        kind: "week-header",
        marker: "WEEK n",
        pattern: new RegExp(WEEK),
        distinctGroup: 1,
      },
    ],
  },
  showday: {
    labels: ["SHOW DAY INFO", "TIME", "INSTRUCTIONS"],
    blocks: [],
  },
  "exercise-database": {
    labels: [
      "ID",
      "Exercise Name",
      "Muscle Group",
      "Primary Target",
      "Additional Target(s)",
      "Equipment",
      "Movement Pattern",
      "Position / Setup",
      "Coaching Notes / Cues",
      "Video Link",
    ],
    blocks: [],
  },
  "nutrition-database": {
    labels: [
      "NO.",
      "FOOD",
      "AMOUNT",
      "UNIT",
      "CALORIES (kcal)",
      "PROTEIN (g)",
      "CARBS (g)",
      "FATS (g)",
      "COOKED/RAW/DRY",
      "CAT",
    ],
    blocks: [],
  },
};

const BASE_TODOS = [
  "TODO(product): formulas, data validations, hidden rows/sheets, and named ranges are not present in the HTML export",
];

export function buildSheetSummary(
  slug: SheetSlug,
  sourceFile: string,
  cells: ExtractionCell[],
): SheetSummaryArtifact {
  const config = SUMMARY_CONFIG[slug];
  const rowCount = cells.reduce((max, cell) => Math.max(max, cell.row), 0);
  const colCount = cells.reduce((max, cell) => Math.max(max, cell.col), 0);
  const spannedCellCount = cells.filter(
    (cell) => cell.rowSpan > 1 || cell.colSpan > 1,
  ).length;

  const sections: SummarySection[] = [];
  for (const label of config.labels) {
    const match = cells.find((cell) => cell.text.trim() === label);
    if (match) sections.push({ label, row: match.row, col: match.col });
  }
  sections.sort((a, b) => a.row - b.row || a.col - b.col);

  const repeatedBlocks: SummaryBlock[] = config.blocks.map((rule) => {
    const matches = cells.filter((cell) => rule.pattern.test(cell.text.trim()));
    const distinct =
      rule.distinctGroup !== undefined
        ? new Set(
            matches
              .map(
                (cell) =>
                  rule.pattern.exec(cell.text.trim())?.[
                    rule.distinctGroup as number
                  ],
              )
              .filter((value): value is string => value !== undefined),
          ).size
        : undefined;
    const rows = matches.map((cell) => cell.row);
    return {
      kind: rule.kind,
      marker: rule.marker,
      count: matches.length,
      ...(distinct !== undefined ? { distinctValues: distinct } : {}),
      firstRow: rows.length > 0 ? Math.min(...rows) : null,
      lastRow: rows.length > 0 ? Math.max(...rows) : null,
    };
  });

  const todos = [...BASE_TODOS];
  if (config.blocks.some((rule) => rule.kind.includes("week"))) {
    todos.push(
      "TODO(product): week-block boundaries are inferred from 'WEEK'/'Averages' markers and are not confirmed against the xlsx",
    );
  }

  return {
    slug,
    sourceFile,
    cellCount: cells.length,
    rowCount,
    colCount,
    spannedCellCount,
    sections,
    repeatedBlocks,
    todos,
  };
}
