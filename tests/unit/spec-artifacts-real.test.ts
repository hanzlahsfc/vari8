// Real-export structural/theme/cross-sheet coverage. Skips when the external
// source folder is absent (it is never committed). See parse-real-sheets.test.ts.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  EXPECTED_SHEETS,
  type SheetSlug,
} from "../../lib/extraction/contracts";
import { parseCssDeclarations } from "../../lib/extraction/css";
import {
  buildCrossSheetData,
  renderCrossSheetMarkdown,
} from "../../lib/extraction/crosssheet";
import { extractExercises, extractFoods } from "../../lib/extraction/databases";
import { parseSheetHtml } from "../../lib/extraction/parse";
import { DEFAULT_SHEETS_SOURCE_DIR } from "../../lib/extraction/source";
import {
  buildSheetSummary,
  SUMMARY_CONFIG,
} from "../../lib/extraction/summaries";
import { buildThemeArtifact } from "../../lib/extraction/theme";

const SOURCE_EXISTS = existsSync(DEFAULT_SHEETS_SOURCE_DIR);
const SPEC = process.cwd();

type Item = {
  slug: SheetSlug;
  file: string;
  parsed: ReturnType<typeof parseSheetHtml>;
};
let items: Item[] = [];
let summaries: Record<string, ReturnType<typeof buildSheetSummary>> = {};
let theme: ReturnType<typeof buildThemeArtifact>;
let crossSheet: ReturnType<typeof buildCrossSheetData>;
let crossMarkdown = "";

beforeAll(() => {
  const baseClasses = parseCssDeclarations(
    readFileSync(
      join(DEFAULT_SHEETS_SOURCE_DIR, "resources", "sheet.css"),
      "utf8",
    ),
  );
  items = EXPECTED_SHEETS.map((sheet) => ({
    slug: sheet.slug,
    file: sheet.file,
    parsed: parseSheetHtml(
      readFileSync(join(DEFAULT_SHEETS_SOURCE_DIR, sheet.file), "utf8"),
      {
        baseClasses,
      },
    ),
  }));
  summaries = Object.fromEntries(
    items.map((item) => [
      item.slug,
      buildSheetSummary(item.slug, item.file, item.parsed.cells),
    ]),
  );
  theme = buildThemeArtifact(
    items.map((item) => ({
      slug: item.slug,
      cells: item.parsed.cells,
      classes: item.parsed.classes,
    })),
  );
  const foods = extractFoods(
    readFileSync(
      join(DEFAULT_SHEETS_SOURCE_DIR, "Nutrition Database.html"),
      "utf8",
    ),
  );
  const exercises = extractExercises(
    readFileSync(
      join(DEFAULT_SHEETS_SOURCE_DIR, "Exercise Database.html"),
      "utf8",
    ),
  );
  crossSheet = buildCrossSheetData({
    sheets: items.map((item) => ({
      slug: item.slug,
      cells: item.parsed.cells,
    })),
    foodNames: new Set(foods.records.map((r) => r.food)),
    exerciseNames: new Set(exercises.records.map((r) => r.name)),
    safeLabels: new Set(
      Object.values(SUMMARY_CONFIG).flatMap((config) => config.labels),
    ),
  });
  crossMarkdown = renderCrossSheetMarkdown(crossSheet);
}, 180_000);

describe.skipIf(!SOURCE_EXISTS)("phase 10 real artifacts", () => {
  it("verifies the expected repeated blocks", () => {
    const block = (slug: string, kind: string) =>
      summaries[slug].repeatedBlocks.find((b) => b.kind === kind);
    expect(block("daily-tracker", "week-block")?.count).toBe(82);
    expect(block("peaking", "week-block")?.count).toBe(40);
    expect(block("training", "week-column-group")?.distinctValues).toBe(17);
    expect(block("training", "day-block")?.distinctValues).toBe(10);
    expect(block("mealplan", "day-type-table")?.count).toBe(3);
    expect(block("mealplan", "meal")?.distinctValues).toBe(9);
  });

  it("extracts theme combinations with provenance", () => {
    expect(theme.combinations.length).toBeGreaterThan(20);
    expect(theme.combinations.some((c) => c.background === "#191919")).toBe(
      true,
    );
    expect(
      theme.combinations.every((c) => c.seenIn.length >= 1 && c.count >= 1),
    ).toBe(true);
  });

  it("finds safe cross-sheet reference links and labels", () => {
    expect(crossSheet.totals.foods).toBeGreaterThanOrEqual(1);
    expect(crossSheet.totals.exercises).toBeGreaterThanOrEqual(1);
    expect(crossSheet.totals.labels).toBeGreaterThanOrEqual(1);
  });

  it("contains only safe values (privacy)", () => {
    const allowedLabels = new Set(
      Object.values(SUMMARY_CONFIG).flatMap((c) => c.labels),
    );
    for (const slug of Object.keys(summaries)) {
      for (const section of summaries[slug].sections) {
        expect(allowedLabels.has(section.label)).toBe(true);
      }
    }
    expect(crossMarkdown.includes("@")).toBe(false);
    expect(JSON.stringify(theme).includes("@")).toBe(false);
  });

  it("matches the committed spec artifacts byte-for-byte (determinism lock)", () => {
    for (const item of items) {
      const committed = JSON.parse(
        readFileSync(
          join(SPEC, "spec", "sheets", `${item.slug}.summary.json`),
          "utf8",
        ),
      );
      expect(JSON.parse(JSON.stringify(summaries[item.slug]))).toEqual(
        committed,
      );
    }
    expect(JSON.parse(JSON.stringify(theme))).toEqual(
      JSON.parse(readFileSync(join(SPEC, "spec", "theme.json"), "utf8")),
    );
    expect(crossMarkdown).toBe(
      readFileSync(join(SPEC, "spec", "cross-sheet.md"), "utf8"),
    );
  });
});
