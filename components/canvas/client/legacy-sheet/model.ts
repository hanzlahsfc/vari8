// Workbook structure for the legacy sheets view. Every constant in this
// file is transcribed from R3b (01-recon/R3b-xlsx-structure.json), the
// measured export of the team workbook. Imported cell values live in
// imported.ts; bound cells come from bind.ts. This module carries structure
// and selection/navigation helpers only.

import { sheetGeom } from "./styles";

export const LEGACY_SHEET_BANNER =
  "Emulation of PRGRSS 2.0. Tab order, frozen bands, column widths, row heights, hidden rows and columns, merged regions, number formats and conditional formatting kinds are read from the team workbook structure; cell text, numbers, dates and formula text are extracted from the workbook content. Bound cells read and write the client store; imported cells keep their exported value.";

export const FORMULA_SHAPE_BADGE = "Workbook formula";
export const UDF_SHAPE_BADGE = "Google only formula, not evaluated";
export const SYNTHETIC_VALUE_BADGE = "Synthetic value";
export const IMPORTED_VALUE_BADGE = "Imported value";
export const STORE_VALUE_BADGE = "Store value";
export const COMPUTED_VALUE_BADGE = "Computed from store";
export const NOT_CALCULATED_BADGE =
  "Array formula shape, not calculated, last imported value";

export function provenanceBadge(cell: {
  valueSource?: string;
  notCalculated?: boolean;
}): string {
  switch (cell.valueSource) {
    case "store":
      return STORE_VALUE_BADGE;
    case "computed":
      return COMPUTED_VALUE_BADGE;
    case "imported":
      return IMPORTED_VALUE_BADGE;
    default:
      return SYNTHETIC_VALUE_BADGE;
  }
}

export type CellPos = { row: number; col: number };
export type RangeRef = { r1: number; c1: number; r2: number; c2: number };
export type ConditionalKind =
  | "cellIs"
  | "expression"
  | "colorScale"
  | "containsText";

export type ConditionalRule = {
  kind: ConditionalKind;
  ranges: RangeRef[];
};

export type SheetTab = {
  slug: string;
  name: string;
  order: number;
  usedRange: string;
  freezePanes: string | null;
  gridlines: boolean;
  windowRows: number;
  windowCols: number;
  /** xlsx width units for columns without a declared width (R3b default_guess). */
  defaultColWidth: number;
  /** R3b column_widths.by_column, declared widths only, xlsx width units. */
  colWidths: Record<number, number>;
  /** R3b row_heights.by_row, declared heights only, points. */
  rowHeights: Record<number, number>;
  /** R3b hidden_rows compressed to [first, last] ranges. */
  hiddenRows: [number, number][];
  /** R3b hidden_columns compressed to [first, last] column-index ranges. */
  hiddenCols: [number, number][];
  /** R3b merged.ranges whose anchor lies inside the rendered window, clipped to it. */
  merges: RangeRef[];
  /** R3b merged.count for the whole tab. */
  mergeTotal: number;
  /** R3b number_formats, the declared format strings for this tab. */
  numberFormats: string[];
  /** R3b conditional_formatting rules clipped to the rendered window. */
  conditionalRules: ConditionalRule[];
  /** R3b data_validations ranges clipped to the rendered window. */
  validations: RangeRef[];
};

type RawRange = [number, number, number, number];
type RawTab = Omit<SheetTab, "merges" | "conditionalRules" | "validations"> & {
  merges: RawRange[];
  conditionalRules: (Omit<ConditionalRule, "ranges"> & {
    ranges: RawRange[];
  })[];
  validations: RawRange[];
};

const raw = (rows: RawRange[]): RangeRef[] =>
  rows.map(([r1, c1, r2, c2]) => ({ r1, c1, r2, c2 }));

const TABS: RawTab[] = [
  {
    // R3b: tab 1 "DASHBOARD", used range A1:DA1002.
    slug: "dashboard",
    name: "DASHBOARD",
    order: 1,
    usedRange: "A1:DA1002",
    freezePanes: null,
    gridlines: false,
    windowRows: 60,
    windowCols: 32,
    defaultColWidth: 8.43,
    colWidths: { "1": 2.75 },
    rowHeights: {
      "2": 18.75,
      "3": 18.75,
      "4": 8.25,
      "5": 18.75,
      "6": 18.75,
      "8": 7.5,
      "9": 11.25,
      "10": 18.75,
      "11": 18.75,
      "12": 18.75,
      "13": 18.75,
      "14": 11.25,
      "15": 18.75,
      "16": 18.75,
      "17": 7.5,
      "18": 11.25,
      "19": 18.75,
      "20": 18.75,
      "21": 18.75,
      "22": 18.75,
      "23": 18.75,
      "24": 18.75,
      "25": 11.25,
      "26": 18.75,
      "27": 18.75,
      "28": 7.5,
      "29": 11.25,
      "30": 18.75,
      "31": 18.75,
      "32": 18.75,
      "33": 18.75,
      "34": 18.75,
      "35": 18.75,
      "36": 18.75,
      "37": 18.75,
      "38": 18.75,
      "39": 11.25,
      "40": 13.5,
      "41": 18.75,
      "42": 18.75,
      "43": 11.25,
    },
    hiddenRows: [[46, 500]],
    hiddenCols: [[58, 58]],
    merges: [
      [10, 3, 10, 7],
      [10, 8, 10, 14],
      [11, 3, 11, 7],
      [11, 8, 11, 12],
      [11, 13, 11, 14],
      [12, 3, 12, 7],
      [12, 8, 12, 14],
      [13, 3, 13, 7],
      [13, 8, 13, 14],
      [30, 3, 30, 9],
      [30, 10, 30, 14],
      [31, 3, 31, 9],
      [31, 10, 31, 14],
      [32, 3, 32, 9],
      [32, 10, 32, 14],
      [33, 3, 33, 9],
      [33, 10, 33, 14],
      [34, 3, 34, 9],
      [34, 10, 34, 14],
      [35, 3, 35, 9],
      [35, 10, 35, 14],
      [36, 3, 36, 9],
      [36, 10, 36, 14],
      [37, 3, 37, 9],
      [37, 10, 37, 14],
      [38, 3, 38, 9],
      [38, 10, 38, 14],
      [41, 2, 43, 14],
    ],
    mergeTotal: 92,
    numberFormats: [
      "General",
      "0.0",
      "0,0",
      '0" g"',
      'dd"."mm"."yyyy',
      '0.0" L"',
      "0%",
      '"WEEK "0',
      "dd.mm.yyyy",
      '"⌀ "0',
      '0" min"',
      'dd". "mmmm" "yyyy',
    ],
    conditionalRules: [{ kind: "expression", ranges: [[31, 3, 38, 14]] }],
    validations: [],
  },
  {
    // R3b: tab 2 "DAILY TRACKER", used range A1:BB1002.
    slug: "daily-tracker",
    name: "DAILY TRACKER",
    order: 2,
    usedRange: "A1:BB1002",
    freezePanes: "G8",
    gridlines: false,
    windowRows: 45,
    windowCols: 54,
    defaultColWidth: 8.43,
    colWidths: {
      "1": 2.75,
      "2": 4.5,
      "3": 1.13,
      "4": 2.38,
      "5": 5.38,
      "6": 10.13,
      "7": 3.88,
      "8": 11.38,
      "9": 5.75,
      "11": 3.88,
      "12": 11.5,
      "13": 13.5,
      "14": 10.5,
      "15": 7,
      "16": 8.63,
      "17": 3.88,
      "18": 11.38,
      "22": 3.88,
      "23": 11.38,
      "30": 3.88,
      "31": 11.38,
      "36": 3.88,
      "37": 11.38,
      "40": 3.88,
      "41": 11.13,
      "42": 7.63,
      "45": 11.38,
      "46": 7.63,
      "48": 11.38,
      "50": 3.88,
      "51": 25.25,
    },
    rowHeights: {
      "8": 18.75,
      "9": 18.75,
      "10": 21.75,
      "18": 23.25,
      "20": 18.75,
      "21": 18.75,
      "22": 21.75,
      "30": 23.25,
    },
    hiddenRows: [[1, 1]],
    hiddenCols: [],
    merges: [
      [3, 2, 3, 6],
      [3, 13, 6, 18],
      [4, 2, 5, 6],
      [6, 2, 6, 6],
      [8, 2, 18, 2],
      [8, 3, 8, 6],
      [8, 7, 18, 7],
      [8, 8, 9, 8],
      [8, 9, 9, 10],
      [8, 11, 18, 11],
      [8, 12, 9, 12],
      [8, 13, 9, 13],
      [8, 14, 9, 14],
      [8, 15, 9, 15],
      [8, 16, 9, 16],
      [8, 17, 18, 17],
      [8, 18, 9, 18],
      [8, 19, 9, 19],
      [8, 20, 9, 20],
      [8, 21, 9, 21],
      [8, 22, 18, 22],
      [8, 23, 9, 23],
      [8, 24, 9, 24],
      [8, 25, 9, 25],
      [8, 26, 9, 26],
      [8, 27, 9, 27],
      [8, 28, 9, 28],
      [8, 29, 9, 29],
      [8, 30, 18, 30],
      [8, 31, 9, 31],
      [8, 32, 9, 32],
      [8, 33, 9, 33],
      [8, 34, 9, 34],
      [8, 35, 9, 35],
      [8, 36, 18, 36],
      [8, 37, 9, 37],
      [8, 38, 9, 38],
      [8, 39, 9, 39],
      [8, 40, 18, 40],
      [8, 41, 9, 41],
      [8, 42, 9, 42],
      [8, 43, 9, 43],
      [8, 44, 9, 44],
      [8, 45, 9, 45],
      [8, 46, 9, 46],
      [8, 47, 9, 47],
      [8, 48, 9, 48],
      [8, 49, 9, 49],
      [8, 50, 18, 50],
      [8, 51, 9, 52],
      [8, 53, 17, 53],
      [8, 54, 17, 54],
      [9, 3, 9, 6],
      [10, 3, 10, 6],
      [10, 8, 10, 10],
      [10, 19, 10, 21],
      [10, 25, 10, 29],
      [10, 31, 10, 35],
      [10, 42, 10, 44],
      [11, 9, 11, 10],
      [12, 9, 12, 10],
      [13, 9, 13, 10],
      [14, 9, 14, 10],
      [15, 9, 15, 10],
      [16, 9, 16, 10],
      [17, 9, 17, 10],
      [18, 3, 18, 6],
      [18, 12, 18, 16],
      [18, 51, 18, 52],
      [20, 2, 30, 2],
      [20, 3, 20, 6],
      [20, 7, 30, 7],
      [20, 8, 21, 8],
      [20, 9, 21, 10],
      [20, 11, 30, 11],
      [20, 12, 21, 12],
      [20, 13, 21, 13],
      [20, 14, 21, 14],
      [20, 15, 21, 15],
      [20, 16, 21, 16],
      [20, 17, 30, 17],
      [20, 18, 21, 18],
      [20, 19, 21, 19],
      [20, 20, 21, 20],
      [20, 21, 21, 21],
      [20, 22, 30, 22],
      [20, 23, 21, 23],
      [20, 24, 21, 24],
      [20, 25, 21, 25],
      [20, 26, 21, 26],
      [20, 27, 21, 27],
      [20, 28, 21, 28],
      [20, 29, 21, 29],
      [20, 30, 30, 30],
      [20, 31, 21, 31],
      [20, 32, 21, 32],
      [20, 33, 21, 33],
      [20, 34, 21, 34],
      [20, 35, 21, 35],
      [20, 36, 30, 36],
      [20, 37, 21, 37],
      [20, 38, 21, 38],
      [20, 39, 21, 39],
      [20, 40, 30, 40],
      [20, 41, 21, 41],
      [20, 42, 21, 42],
      [20, 43, 21, 43],
      [20, 44, 21, 44],
      [20, 45, 21, 45],
      [20, 46, 21, 46],
      [20, 47, 21, 47],
      [20, 48, 21, 48],
      [20, 49, 21, 49],
      [20, 50, 30, 50],
      [20, 51, 21, 52],
      [20, 53, 29, 53],
      [20, 54, 29, 54],
      [21, 3, 21, 6],
      [22, 3, 22, 6],
      [22, 8, 22, 10],
      [22, 19, 22, 21],
      [22, 25, 22, 29],
      [22, 31, 22, 35],
      [22, 42, 22, 44],
      [23, 9, 23, 10],
      [24, 9, 24, 10],
      [25, 9, 25, 10],
      [26, 9, 26, 10],
      [27, 9, 27, 10],
      [28, 9, 28, 10],
      [29, 9, 29, 10],
      [30, 3, 30, 6],
      [30, 12, 30, 16],
      [30, 51, 30, 52],
    ],
    mergeTotal: 5334,
    numberFormats: [
      "General",
      'hh":"mm',
      '"WEEK "0',
      "ddd",
      "dd.mm.yyyy",
      "0.0",
      '0.0"°C"',
      "#,##0",
      '0" g"',
      '0" L"',
      "0.0%",
      "h:mm",
    ],
    conditionalRules: [
      {
        kind: "colorScale",
        ranges: [
          [11, 27, 17, 29],
          [23, 27, 29, 29],
          [11, 31, 17, 32],
          [23, 31, 29, 32],
          [11, 35, 17, 35],
          [23, 35, 29, 35],
        ],
      },
      {
        kind: "colorScale",
        ranges: [
          [11, 33, 17, 34],
          [23, 33, 29, 34],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [18, 1, 18, 54],
          [30, 1, 30, 1],
          [30, 3, 30, 6],
          [30, 8, 30, 10],
          [30, 12, 30, 16],
          [30, 18, 30, 21],
          [30, 23, 30, 29],
          [30, 31, 30, 35],
          [30, 37, 30, 39],
          [30, 41, 30, 49],
          [30, 51, 30, 54],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [18, 1, 18, 54],
          [30, 1, 30, 1],
          [30, 3, 30, 6],
          [30, 8, 30, 10],
          [30, 12, 30, 16],
          [30, 18, 30, 21],
          [30, 23, 30, 29],
          [30, 31, 30, 35],
          [30, 37, 30, 39],
          [30, 41, 30, 49],
          [30, 51, 30, 54],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [18, 1, 18, 54],
          [30, 1, 30, 1],
          [30, 3, 30, 6],
          [30, 8, 30, 10],
          [30, 12, 30, 16],
          [30, 18, 30, 21],
          [30, 23, 30, 29],
          [30, 31, 30, 35],
          [30, 37, 30, 39],
          [30, 41, 30, 49],
          [30, 51, 30, 54],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [11, 48, 17, 48],
          [23, 48, 29, 48],
        ],
      },
      {
        kind: "expression",
        ranges: [
          [18, 24, 18, 24],
          [30, 24, 30, 24],
        ],
      },
      {
        kind: "expression",
        ranges: [
          [18, 38, 18, 38],
          [30, 38, 30, 38],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [11, 45, 17, 45],
          [23, 45, 29, 45],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [18, 48, 18, 48],
          [30, 48, 30, 48],
        ],
      },
      {
        kind: "expression",
        ranges: [
          [11, 3, 20, 6],
          [23, 3, 30, 6],
        ],
      },
    ],
    validations: [
      [11, 41, 17, 41],
      [23, 41, 29, 41],
      [11, 49, 17, 49],
      [23, 49, 29, 49],
      [11, 27, 17, 29],
      [23, 27, 29, 29],
      [11, 31, 17, 35],
      [23, 31, 29, 35],
    ],
  },
  {
    // R3b: tab 3 "TIMELINE", used range A1:CS1000.
    slug: "timeline",
    name: "TIMELINE",
    order: 3,
    usedRange: "A1:CS1000",
    freezePanes: "A10",
    gridlines: false,
    windowRows: 45,
    windowCols: 32,
    defaultColWidth: 8.43,
    colWidths: {
      "1": 1.5,
      "3": 4.5,
      "4": 5.63,
      "5": 2.13,
      "6": 5.63,
      "8": 15.88,
      "10": 28.75,
      "11": 2.63,
      "12": 3.88,
      "13": 17,
      "14": 0.88,
      "15": 2.63,
      "16": 0.88,
      "17": 2.63,
      "18": 9.5,
      "19": 4.5,
      "21": 11.38,
      "22": 2.63,
      "23": 9.5,
      "26": 11.38,
      "27": 2.63,
      "28": 2.13,
    },
    rowHeights: {
      "2": 21,
      "3": 12.75,
      "4": 12.75,
      "7": 18.75,
      "8": 7.5,
      "9": 26.25,
      "10": 22.5,
      "11": 22.5,
      "12": 22.5,
      "13": 22.5,
      "14": 22.5,
      "15": 22.5,
      "16": 22.5,
      "17": 22.5,
      "18": 22.5,
      "19": 22.5,
      "20": 22.5,
      "21": 22.5,
      "22": 22.5,
      "23": 22.5,
      "24": 22.5,
      "25": 22.5,
      "26": 22.5,
      "27": 22.5,
      "28": 22.5,
      "29": 22.5,
      "30": 22.5,
    },
    hiddenRows: [],
    hiddenCols: [],
    merges: [
      [2, 8, 5, 10],
      [3, 13, 5, 13],
      [9, 4, 9, 6],
      [9, 14, 9, 16],
      [9, 19, 9, 20],
      [9, 27, 9, 28],
    ],
    mergeTotal: 6,
    numberFormats: ["General", 'dd"."mm', "0,0", "0.0%"],
    conditionalRules: [
      { kind: "cellIs", ranges: [[10, 12, 30, 12]] },
      { kind: "cellIs", ranges: [[10, 7, 30, 7]] },
      { kind: "cellIs", ranges: [[10, 7, 30, 7]] },
      { kind: "cellIs", ranges: [[10, 7, 30, 7]] },
      { kind: "cellIs", ranges: [[10, 7, 30, 7]] },
      { kind: "cellIs", ranges: [[10, 7, 30, 7]] },
      { kind: "cellIs", ranges: [[10, 7, 30, 7]] },
      { kind: "cellIs", ranges: [[10, 7, 30, 7]] },
      { kind: "cellIs", ranges: [[10, 8, 30, 8]] },
      { kind: "cellIs", ranges: [[10, 8, 30, 8]] },
      { kind: "cellIs", ranges: [[10, 8, 30, 8]] },
      { kind: "cellIs", ranges: [[10, 9, 30, 9]] },
      { kind: "cellIs", ranges: [[10, 9, 30, 9]] },
      { kind: "cellIs", ranges: [[10, 9, 30, 9]] },
      { kind: "cellIs", ranges: [[10, 9, 30, 9]] },
      { kind: "cellIs", ranges: [[10, 9, 30, 9]] },
      {
        kind: "expression",
        ranges: [
          [10, 3, 30, 6],
          [10, 10, 30, 10],
          [10, 12, 30, 16],
          [10, 18, 30, 21],
          [10, 23, 30, 28],
        ],
      },
    ],
    validations: [
      [10, 7, 30, 7],
      [10, 8, 30, 8],
      [10, 9, 30, 9],
    ],
  },
  {
    // R3b: tab 4 "MEALPLAN", used range A1:CQ1004.
    slug: "mealplan",
    name: "MEALPLAN",
    order: 4,
    usedRange: "A1:CQ1004",
    freezePanes: null,
    gridlines: false,
    windowRows: 45,
    windowCols: 32,
    defaultColWidth: 8.43,
    colWidths: { "1": 2.75 },
    rowHeights: { "7": 18.75, "8": 7.5, "9": 26.25, "19": 22.5, "29": 22.5 },
    hiddenRows: [],
    hiddenCols: [],
    merges: [
      [2, 14, 5, 20],
      [9, 6, 9, 8],
      [9, 9, 9, 11],
      [9, 12, 9, 14],
      [9, 15, 9, 17],
      [9, 18, 9, 20],
      [10, 3, 10, 5],
      [10, 6, 10, 8],
      [10, 9, 10, 11],
      [10, 12, 10, 14],
      [10, 15, 10, 17],
      [10, 18, 10, 20],
      [11, 3, 11, 5],
      [11, 6, 11, 8],
      [11, 9, 11, 11],
      [11, 12, 11, 14],
      [11, 15, 11, 17],
      [11, 18, 11, 20],
      [12, 3, 12, 5],
      [12, 6, 12, 8],
      [12, 9, 12, 11],
      [12, 12, 12, 14],
      [12, 15, 12, 17],
      [12, 18, 12, 20],
    ],
    mergeTotal: 78,
    numberFormats: [
      "0",
      "General",
      '0 "C"',
      '0 "P"',
      '0 "F"',
      '0 "kcal"',
      '0" g"',
      '0.0" L"',
    ],
    conditionalRules: [],
    validations: [],
  },
  {
    // R3b: tab 5 "SUPPLEMENTATION", used range A1:Z1000.
    slug: "supplementation",
    name: "SUPPLEMENTATION",
    order: 5,
    usedRange: "A1:Z1000",
    freezePanes: null,
    gridlines: false,
    windowRows: 45,
    windowCols: 32,
    defaultColWidth: 8.43,
    colWidths: { "1": 2.75, "2": 10.13, "3": 20.63, "5": 15 },
    rowHeights: { "7": 22.5 },
    hiddenRows: [],
    hiddenCols: [],
    merges: [[2, 4, 5, 8]],
    mergeTotal: 1,
    numberFormats: ["General"],
    conditionalRules: [],
    validations: [[8, 5, 30, 5]],
  },
  {
    // R3b: tab 6 "MENSES", used range A1:EB1002.
    slug: "menses",
    name: "MENSES",
    order: 6,
    usedRange: "A1:EB1002",
    freezePanes: null,
    gridlines: false,
    windowRows: 45,
    windowCols: 32,
    defaultColWidth: 8.43,
    colWidths: { "1": 2.75 },
    rowHeights: {
      "7": 18.75,
      "8": 7.5,
      "9": 7.5,
      "10": 7.5,
      "11": 7.5,
      "15": 7.5,
      "16": 11.25,
      "18": 20.25,
      "24": 11.25,
      "27": 7.5,
      "28": 22.5,
      "29": 18.75,
      "30": 18.75,
    },
    hiddenRows: [],
    hiddenCols: [
      [47, 47],
      [49, 49],
    ],
    merges: [
      [2, 17, 5, 18],
      [7, 2, 7, 9],
      [7, 11, 7, 18],
      [8, 3, 10, 8],
      [8, 12, 11, 17],
      [11, 3, 11, 8],
      [12, 3, 12, 8],
      [12, 12, 12, 17],
      [28, 2, 28, 6],
      [28, 7, 28, 11],
      [29, 2, 29, 6],
      [29, 7, 29, 11],
      [30, 2, 30, 6],
      [30, 7, 30, 11],
    ],
    mergeTotal: 72,
    numberFormats: [
      "General",
      '0" Days"',
      'dd". "mmmm" "yyyy',
      "#,##0",
      "d. mmmm",
      '0" Hub"',
    ],
    conditionalRules: [],
    validations: [],
  },
  {
    // R3b: tab 7 "TRAINING", used range A1:QH780.
    slug: "training",
    name: "TRAINING",
    order: 7,
    usedRange: "A1:QH780",
    freezePanes: "P1",
    gridlines: false,
    windowRows: 45,
    windowCols: 32,
    defaultColWidth: 8.43,
    colWidths: { "1": 2.75 },
    rowHeights: {
      "2": 12.75,
      "3": 12.75,
      "4": 12.75,
      "5": 12.75,
      "7": 15.75,
      "8": 15.75,
      "9": 15.75,
      "10": 15.75,
      "11": 18.75,
      "12": 15.75,
      "13": 15.75,
      "14": 15.75,
      "15": 15.75,
      "17": 15.75,
      "18": 15.75,
      "19": 15.75,
      "20": 15.75,
      "21": 15.75,
      "22": 15.75,
      "23": 15.75,
      "26": 11.25,
      "27": 26.25,
      "28": 15.75,
      "29": 15.75,
      "30": 15.75,
      "31": 15.75,
    },
    hiddenRows: [],
    hiddenCols: [],
    merges: [
      [2, 17, 5, 22],
      [7, 2, 8, 14],
      [9, 17, 9, 22],
      [10, 2, 13, 4],
      [10, 5, 11, 10],
      [10, 17, 11, 22],
      [12, 5, 13, 13],
      [12, 17, 12, 22],
      [15, 2, 18, 4],
      [15, 5, 16, 14],
      [16, 17, 17, 21],
      [16, 22, 17, 22],
      [17, 5, 18, 12],
      [18, 17, 19, 21],
      [18, 22, 19, 22],
      [20, 2, 23, 4],
      [20, 5, 21, 13],
      [20, 17, 21, 21],
      [20, 22, 21, 22],
      [22, 5, 23, 13],
      [22, 17, 23, 21],
      [22, 22, 23, 22],
      [27, 2, 27, 3],
      [27, 4, 27, 15],
      [27, 16, 27, 21],
      [28, 2, 29, 3],
      [28, 4, 29, 15],
      [28, 16, 29, 21],
      [28, 22, 29, 22],
      [30, 2, 31, 3],
      [30, 4, 31, 15],
      [30, 16, 31, 21],
      [30, 22, 31, 22],
    ],
    mergeTotal: 28719,
    numberFormats: ["General", '"   WEEK "0', "m-d", '"    "0" DAYS"'],
    conditionalRules: [
      { kind: "cellIs", ranges: [[28, 22, 31, 22]] },
      { kind: "expression", ranges: [[9, 17, 12, 22]] },
    ],
    validations: [
      [28, 16, 28, 16],
      [30, 16, 30, 16],
      [17, 5, 17, 5],
      [28, 4, 28, 4],
      [30, 4, 30, 4],
      [28, 22, 28, 22],
      [30, 22, 30, 22],
    ],
  },
  {
    // R3b: tab 8 "PEAKING", used range A1:AF973.
    slug: "peaking",
    name: "PEAKING",
    order: 8,
    usedRange: "A1:AF973",
    freezePanes: null,
    gridlines: false,
    windowRows: 45,
    windowCols: 32,
    defaultColWidth: 8.43,
    colWidths: {
      "1": 2.75,
      "2": 4.5,
      "3": 5.38,
      "4": 10.13,
      "5": 25.25,
      "7": 3.88,
      "8": 16.5,
      "9": 11.38,
      "12": 7.63,
      "14": 3.88,
      "15": 11.38,
      "19": 3.88,
      "20": 11.38,
      "22": 3.88,
      "23": 7.63,
      "26": 11.38,
      "28": 3.88,
    },
    rowHeights: {
      "7": 18.75,
      "8": 18.75,
      "16": 23.25,
      "18": 18.75,
      "19": 18.75,
      "27": 23.25,
      "29": 18.75,
      "30": 18.75,
      "38": 23.25,
    },
    hiddenRows: [],
    hiddenCols: [],
    merges: [
      [2, 5, 5, 7],
      [7, 2, 16, 2],
      [7, 3, 8, 4],
      [7, 5, 8, 6],
      [7, 7, 16, 7],
      [7, 8, 8, 8],
      [7, 9, 8, 9],
      [7, 10, 8, 10],
      [7, 11, 8, 11],
      [7, 12, 8, 12],
      [7, 13, 8, 13],
      [7, 14, 16, 14],
      [7, 15, 8, 15],
      [7, 16, 8, 16],
      [7, 17, 8, 17],
      [7, 18, 8, 18],
      [7, 19, 16, 19],
      [7, 20, 8, 20],
      [7, 21, 8, 21],
      [7, 22, 16, 22],
      [7, 23, 8, 23],
      [7, 24, 8, 24],
      [7, 25, 8, 25],
      [7, 26, 8, 26],
      [7, 27, 8, 27],
      [7, 28, 16, 28],
      [7, 29, 15, 29],
      [7, 30, 15, 30],
      [7, 31, 15, 31],
      [7, 32, 15, 32],
      [16, 3, 16, 4],
      [16, 5, 16, 6],
      [18, 2, 27, 2],
      [18, 3, 19, 4],
      [18, 5, 19, 6],
      [18, 7, 27, 7],
      [18, 8, 19, 8],
      [18, 9, 19, 9],
      [18, 10, 19, 10],
      [18, 11, 19, 11],
      [18, 12, 19, 12],
      [18, 13, 19, 13],
      [18, 14, 27, 14],
      [18, 15, 19, 15],
      [18, 16, 19, 16],
      [18, 17, 19, 17],
      [18, 18, 19, 18],
      [18, 19, 27, 19],
      [18, 20, 19, 20],
      [18, 21, 19, 21],
      [18, 22, 27, 22],
      [18, 23, 19, 23],
      [18, 24, 19, 24],
      [18, 25, 19, 25],
      [18, 26, 19, 26],
      [18, 27, 19, 27],
      [18, 28, 27, 28],
      [18, 29, 26, 29],
      [18, 30, 26, 30],
      [18, 31, 26, 31],
      [18, 32, 26, 32],
      [27, 3, 27, 4],
      [27, 5, 27, 6],
      [29, 2, 38, 2],
      [29, 3, 30, 4],
      [29, 5, 30, 6],
      [29, 7, 38, 7],
      [29, 8, 30, 8],
      [29, 9, 30, 9],
      [29, 10, 30, 10],
      [29, 11, 30, 11],
      [29, 12, 30, 12],
      [29, 13, 30, 13],
      [29, 14, 38, 14],
      [29, 15, 30, 15],
      [29, 16, 30, 16],
      [29, 17, 30, 17],
      [29, 18, 30, 18],
      [29, 19, 38, 19],
      [29, 20, 30, 20],
      [29, 21, 30, 21],
      [29, 22, 38, 22],
      [29, 23, 30, 23],
      [29, 24, 30, 24],
      [29, 25, 30, 25],
      [29, 26, 30, 26],
      [29, 27, 30, 27],
      [29, 28, 38, 28],
      [29, 29, 37, 29],
      [29, 30, 37, 30],
      [29, 31, 37, 31],
      [29, 32, 37, 32],
      [38, 3, 38, 4],
      [38, 5, 38, 6],
    ],
    mergeTotal: 1241,
    numberFormats: [
      "General",
      "0.0",
      '"WEEK "0',
      "ddd",
      "dd.mm.yyyy",
      '0" g"',
      '0" L"',
    ],
    conditionalRules: [
      {
        kind: "cellIs",
        ranges: [
          [9, 8, 15, 8],
          [20, 8, 26, 8],
          [31, 8, 37, 8],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [9, 8, 15, 8],
          [20, 8, 26, 8],
          [31, 8, 37, 8],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [9, 8, 15, 8],
          [20, 8, 26, 8],
          [31, 8, 37, 8],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [9, 8, 15, 8],
          [20, 8, 26, 8],
          [31, 8, 37, 8],
        ],
      },
      {
        kind: "colorScale",
        ranges: [
          [9, 20, 15, 21],
          [20, 20, 26, 21],
          [31, 20, 37, 21],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [16, 1, 16, 32],
          [27, 1, 27, 1],
          [38, 1, 38, 1],
          [27, 3, 27, 6],
          [38, 3, 38, 6],
          [27, 8, 27, 13],
          [38, 8, 38, 13],
          [27, 15, 27, 18],
          [38, 15, 38, 18],
          [27, 20, 27, 21],
          [38, 20, 38, 21],
          [27, 23, 27, 27],
          [38, 23, 38, 27],
          [27, 29, 27, 32],
          [38, 29, 38, 32],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [16, 1, 16, 32],
          [27, 1, 27, 1],
          [38, 1, 38, 1],
          [27, 3, 27, 6],
          [38, 3, 38, 6],
          [27, 8, 27, 13],
          [38, 8, 38, 13],
          [27, 15, 27, 18],
          [38, 15, 38, 18],
          [27, 20, 27, 21],
          [38, 20, 38, 21],
          [27, 23, 27, 27],
          [38, 23, 38, 27],
          [27, 29, 27, 32],
          [38, 29, 38, 32],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [16, 1, 16, 32],
          [27, 1, 27, 1],
          [38, 1, 38, 1],
          [27, 3, 27, 6],
          [38, 3, 38, 6],
          [27, 8, 27, 13],
          [38, 8, 38, 13],
          [27, 15, 27, 18],
          [38, 15, 38, 18],
          [27, 20, 27, 21],
          [38, 20, 38, 21],
          [27, 23, 27, 27],
          [38, 23, 38, 27],
          [27, 29, 27, 32],
          [38, 29, 38, 32],
        ],
      },
      {
        kind: "expression",
        ranges: [
          [16, 16, 16, 16],
          [27, 16, 27, 16],
          [38, 16, 38, 16],
        ],
      },
      {
        kind: "cellIs",
        ranges: [
          [9, 26, 15, 26],
          [20, 26, 26, 26],
          [31, 26, 37, 26],
        ],
      },
      { kind: "expression", ranges: [[9, 3, 38, 4]] },
    ],
    validations: [
      [9, 27, 15, 27],
      [20, 27, 26, 27],
      [31, 27, 37, 27],
      [9, 8, 15, 8],
      [20, 8, 26, 8],
      [31, 8, 37, 8],
      [9, 20, 15, 21],
      [20, 20, 26, 21],
      [31, 20, 37, 21],
    ],
  },
  {
    // R3b: tab 9 "SHOWDAY", used range A1:AB996.
    slug: "showday",
    name: "SHOWDAY",
    order: 9,
    usedRange: "A1:AB996",
    freezePanes: null,
    gridlines: false,
    windowRows: 45,
    windowCols: 32,
    defaultColWidth: 8.43,
    colWidths: {
      "1": 2.75,
      "3": 3.25,
      "5": 9.88,
      "8": 2.75,
      "11": 40.38,
      "12": 2.75,
    },
    rowHeights: {
      "8": 7.5,
      "10": 18.75,
      "11": 18.75,
      "12": 18.75,
      "13": 18.75,
      "14": 18.75,
      "15": 18.75,
      "18": 22.5,
      "19": 18.75,
      "20": 18.75,
      "21": 18.75,
      "22": 18.75,
      "23": 18.75,
      "24": 18.75,
      "25": 18.75,
      "26": 18.75,
      "27": 18.75,
      "28": 18.75,
      "29": 18.75,
      "30": 18.75,
    },
    hiddenRows: [],
    hiddenCols: [],
    merges: [
      [10, 6, 10, 7],
      [10, 11, 15, 11],
      [11, 6, 11, 7],
      [12, 6, 12, 7],
      [13, 6, 13, 7],
      [14, 6, 14, 7],
      [15, 6, 15, 7],
      [18, 2, 18, 3],
      [18, 5, 18, 8],
      [19, 2, 19, 3],
      [19, 5, 19, 8],
      [20, 2, 20, 3],
      [20, 5, 20, 8],
      [21, 2, 21, 3],
      [21, 5, 21, 8],
      [22, 2, 22, 3],
      [22, 5, 22, 8],
      [23, 2, 23, 3],
      [23, 5, 23, 8],
      [24, 2, 24, 3],
      [24, 5, 24, 8],
      [25, 2, 25, 3],
      [25, 5, 25, 8],
      [26, 2, 26, 3],
      [26, 5, 26, 8],
      [27, 2, 27, 3],
      [27, 5, 27, 8],
      [28, 2, 28, 3],
      [28, 5, 28, 8],
      [29, 2, 29, 3],
      [29, 5, 29, 8],
      [30, 2, 30, 3],
      [30, 5, 30, 8],
    ],
    mergeTotal: 87,
    numberFormats: ["General", 'hh":"mm', "hh:mm", "dd.mm.yyyy"],
    conditionalRules: [{ kind: "expression", ranges: [[19, 2, 30, 8]] }],
    validations: [],
  },
  {
    // R3b: tab 10 "Exercise Database", used range A1:V996.
    slug: "exercise-database",
    name: "Exercise Database",
    order: 10,
    usedRange: "A1:V996",
    freezePanes: "A3",
    gridlines: false,
    windowRows: 45,
    windowCols: 32,
    defaultColWidth: 8.43,
    colWidths: {
      "1": 2.75,
      "2": 7.25,
      "3": 30.5,
      "5": 15.5,
      "6": 16.38,
      "7": 21.5,
      "8": 29,
      "9": 23.25,
      "10": 34.63,
      "11": 30.5,
    },
    rowHeights: { "2": 22.5 },
    hiddenRows: [],
    hiddenCols: [],
    merges: [],
    mergeTotal: 0,
    numberFormats: ["General"],
    conditionalRules: [],
    validations: [],
  },
  {
    // R3b: tab 11 "Nutrition Database", used range A1:U1171.
    slug: "nutrition-database",
    name: "Nutrition Database",
    order: 11,
    usedRange: "A1:U1171",
    freezePanes: "A3",
    gridlines: false,
    windowRows: 45,
    windowCols: 32,
    defaultColWidth: 8.43,
    colWidths: {
      "1": 5.13,
      "2": 7.63,
      "3": 30.63,
      "4": 12.63,
      "6": 15.13,
      "7": 13.88,
      "10": 20.13,
      "11": 10.13,
      "13": 12.63,
    },
    rowHeights: {},
    hiddenRows: [],
    hiddenCols: [],
    merges: [],
    mergeTotal: 1,
    numberFormats: ["General"],
    conditionalRules: [],
    validations: [],
  },
];

export const WORKBOOK: SheetTab[] = TABS.map((tab) => ({
  ...tab,
  merges: raw(tab.merges),
  conditionalRules: tab.conditionalRules.map((rule) => ({
    ...rule,
    ranges: raw(rule.ranges),
  })),
  validations: raw(tab.validations),
}));

export function tabBySlug(slug: string): SheetTab | undefined {
  return WORKBOOK.find((tab) => tab.slug === slug);
}

export function colLabel(col: number): string {
  let label = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function colIndex(label: string): number | null {
  if (!/^[A-Za-z]+$/.test(label)) return null;
  let n = 0;
  for (const ch of label.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function cellAddress(pos: CellPos): string {
  return `${colLabel(pos.col)}${pos.row}`;
}

export function rangeAddress(range: RangeRef): string {
  const a = `${colLabel(range.c1)}${range.r1}`;
  const b = `${colLabel(range.c2)}${range.r2}`;
  return a === b ? a : `${a}:${b}`;
}

export function parseAddress(text: string): RangeRef | null {
  const m = text.trim().match(/^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/);
  if (!m) return null;
  const c1 = colIndex(m[1]);
  const r1 = Number.parseInt(m[2], 10);
  const c2 = m[3] ? colIndex(m[3]) : c1;
  const r2 = m[4] ? Number.parseInt(m[4], 10) : r1;
  if (
    c1 === null ||
    c2 === null ||
    !Number.isFinite(r1) ||
    !Number.isFinite(r2)
  )
    return null;
  return {
    r1: Math.min(r1, r2),
    c1: Math.min(c1, c2),
    r2: Math.max(r1, r2),
    c2: Math.max(c1, c2),
  };
}

export function freezeSplit(tab: SheetTab): { rows: number; cols: number } {
  if (!tab.freezePanes) return { rows: 0, cols: 0 };
  const parsed = parseAddress(tab.freezePanes);
  if (!parsed) return { rows: 0, cols: 0 };
  return { rows: parsed.r1 - 1, cols: parsed.c1 - 1 };
}

function inRanges(ranges: [number, number][], n: number): boolean {
  return ranges.some(([a, b]) => n >= a && n <= b);
}

export function isRowHidden(tab: SheetTab, row: number): boolean {
  return inRanges(tab.hiddenRows, row);
}

export function isColHidden(tab: SheetTab, col: number): boolean {
  return inRanges(tab.hiddenCols, col);
}

export function visibleRows(tab: SheetTab): number[] {
  const g = sheetGeom(tab.slug);
  if (g) return g.visRows;
  const rows: number[] = [];
  for (let r = 1; r <= tab.windowRows; r += 1)
    if (!isRowHidden(tab, r)) rows.push(r);
  return rows;
}

export function visibleCols(tab: SheetTab): number[] {
  const g = sheetGeom(tab.slug);
  if (g) return g.visCols;
  const cols: number[] = [];
  for (let c = 1; c <= tab.windowCols; c += 1)
    if (!isColHidden(tab, c)) cols.push(c);
  return cols;
}

export function mergeCovering(
  tab: SheetTab,
  row: number,
  col: number,
): RangeRef | null {
  for (const merge of tab.merges) {
    if (
      row >= merge.r1 &&
      row <= merge.r2 &&
      col >= merge.c1 &&
      col <= merge.c2
    )
      return merge;
  }
  return null;
}

export function rangeTouchesMerge(tab: SheetTab, range: RangeRef): boolean {
  return tab.merges.some(
    (m) =>
      range.r1 <= m.r2 &&
      range.r2 >= m.r1 &&
      range.c1 <= m.c2 &&
      range.c2 >= m.c1,
  );
}

export function unionWithMerges(tab: SheetTab, range: RangeRef): RangeRef {
  let out = { ...range };
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of tab.merges) {
      const touches =
        out.r1 <= m.r2 && out.r2 >= m.r1 && out.c1 <= m.c2 && out.c2 >= m.c1;
      if (!touches) continue;
      const next = {
        r1: Math.min(out.r1, m.r1),
        c1: Math.min(out.c1, m.c1),
        r2: Math.max(out.r2, m.r2),
        c2: Math.max(out.c2, m.c2),
      };
      if (
        next.r1 !== out.r1 ||
        next.c1 !== out.c1 ||
        next.r2 !== out.r2 ||
        next.c2 !== out.c2
      ) {
        out = next;
        changed = true;
      }
    }
  }
  return out;
}

function clampRange(tab: SheetTab, range: RangeRef): RangeRef {
  return {
    r1: Math.min(Math.max(range.r1, 1), tab.windowRows),
    c1: Math.min(Math.max(range.c1, 1), tab.windowCols),
    r2: Math.min(Math.max(range.r2, 1), tab.windowRows),
    c2: Math.min(Math.max(range.c2, 1), tab.windowCols),
  };
}

// Resolve a name-box entry to the selection Sheets would apply: a single
// cell lands on the covering merge, a range unions intersecting merges.
export function nameBoxJump(tab: SheetTab, text: string): RangeRef | null {
  const parsed = parseAddress(text);
  if (!parsed) return null;
  return clampRange(tab, unionWithMerges(tab, parsed));
}

// Arrow-key movement in Sheets order: step from the selection edge facing
// the direction, skip hidden rows and columns, expand the landing cell to
// its merge.
export function moveSelection(
  tab: SheetTab,
  sel: RangeRef,
  dir: "up" | "down" | "left" | "right",
): RangeRef {
  let row = sel.r1;
  let col = sel.c1;
  const step = () => {
    if (dir === "right") {
      row = sel.r1;
      col = sel.c2 + 1;
    } else if (dir === "left") {
      row = sel.r1;
      col = sel.c1 - 1;
    } else if (dir === "down") {
      row = sel.r2 + 1;
      col = sel.c1;
    } else {
      row = sel.r1 - 1;
      col = sel.c1;
    }
  };
  step();
  // Skip over hidden tracks in the direction of travel.
  let guard = tab.windowRows + tab.windowCols + 4;
  while (guard-- > 0 && (isRowHidden(tab, row) || isColHidden(tab, col))) {
    if (dir === "right") col += 1;
    else if (dir === "left") col -= 1;
    else if (dir === "down") row += 1;
    else row -= 1;
  }
  if (
    row < 1 ||
    row > tab.windowRows ||
    col < 1 ||
    col > tab.windowCols ||
    isRowHidden(tab, row) ||
    isColHidden(tab, col)
  )
    return sel;
  const merge = mergeCovering(tab, row, col);
  if (merge) return { ...merge };
  return { r1: row, c1: col, r2: row, c2: col };
}

// Convert a declared xlsx column width (character units) to px. Tabs carry the
// LibreOffice-rendered track sizes in styles.ts (5.55pt per char, no padding);
// the chars*7+5 fallback matches Sheets for any column outside that window.
export function colWidthPx(tab: SheetTab, col: number): number {
  const g = sheetGeom(tab.slug);
  if (g) {
    const i = g.visCols.indexOf(col);
    if (i >= 0) return g.colPx[i];
  }
  const w = tab.colWidths[col] ?? tab.defaultColWidth;
  return Math.max(8, Math.round(w * 7.4));
}

// Declared row heights are points (R3b). Undeclared rows use the workbook's
// sheetFormatPr defaultRowHeight (15.75pt -> 21px) via the emitted table.
export function rowHeightPx(tab: SheetTab, row: number): number {
  const g = sheetGeom(tab.slug);
  if (g?.rowPx[row] != null) return g.rowPx[row];
  const pt = tab.rowHeights[row];
  if (pt == null) return 21;
  return Math.max(6, Math.round((pt * 4) / 3));
}
