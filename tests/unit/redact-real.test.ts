// Real-export redaction coverage. Skips when the external source folder is
// absent (it is never committed).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { EXPECTED_SHEETS } from "../../lib/extraction/contracts";
import { parseCssDeclarations } from "../../lib/extraction/css";
import { parseSheetHtml } from "../../lib/extraction/parse";
import { redactSheet } from "../../lib/extraction/redact";
import { DEFAULT_SHEETS_SOURCE_DIR } from "../../lib/extraction/source";

const SOURCE_EXISTS = existsSync(DEFAULT_SHEETS_SOURCE_DIR);
const SPEC = process.cwd();

type Result = ReturnType<typeof redactSheet>;
let results: Array<{ slug: string; result: Result }> = [];
let totalRedacted = 0;

beforeAll(() => {
  const baseClasses = parseCssDeclarations(
    readFileSync(
      join(DEFAULT_SHEETS_SOURCE_DIR, "resources", "sheet.css"),
      "utf8",
    ),
  );
  results = EXPECTED_SHEETS.map((sheet) => {
    const parsed = parseSheetHtml(
      readFileSync(join(DEFAULT_SHEETS_SOURCE_DIR, sheet.file), "utf8"),
      {
        baseClasses,
      },
    );
    return {
      slug: sheet.slug,
      result: redactSheet(
        sheet.slug,
        sheet.file,
        parsed.cells,
        parsed.classes,
        parsed.todos,
      ),
    };
  });
  totalRedacted = results.reduce(
    (sum, item) => sum + item.result.redactedCells,
    0,
  );
}, 300_000);

describe.skipIf(!SOURCE_EXISTS)("phase 11 redaction over real exports", () => {
  it("redacts a substantial number of client-bearing cells", () => {
    expect(totalRedacted).toBeGreaterThan(15_000);
    expect(
      results.find((r) => r.slug === "nutrition-database")?.result
        .redactedCells,
    ).toBeGreaterThanOrEqual(1);
  });

  it("never leaves a normalized value on a redacted cell", () => {
    for (const { result } of results) {
      for (const cell of result.artifact.cells) {
        if (cell.text.startsWith("[REDACTED:")) {
          expect(cell.normalized).toBeUndefined();
          expect(cell.todo).toBeUndefined();
        }
      }
    }
  });

  it("keeps contact-like values out of every artifact", () => {
    for (const { result } of results) {
      for (const cell of result.artifact.cells) {
        expect(cell.text.includes("@")).toBe(false);
      }
    }
  });

  it("records exactly one manifest entry per redacted cell and matches the committed manifest", () => {
    const generated = new Set(
      results.flatMap(({ slug, result }) =>
        result.redactions.map(
          (entry) => `${slug}:${entry.cell?.row}:${entry.cell?.col}`,
        ),
      ),
    );
    const manifest = JSON.parse(
      readFileSync(join(SPEC, "spec", "redaction-manifest.json"), "utf8"),
    );
    const cellEntries = manifest.redactions.filter(
      (entry: { artifact: string }) =>
        entry.artifact.startsWith("spec/sheets/"),
    );
    const fromManifest = new Set(
      cellEntries.map(
        (entry: { sheet: string; cell: { row: number; col: number } }) =>
          `${entry.sheet}:${entry.cell.row}:${entry.cell.col}`,
      ),
    );
    expect(fromManifest).toEqual(generated);
    expect(JSON.stringify(manifest)).not.toContain("@");
    for (const entry of cellEntries) {
      expect(entry.placeholder).toMatch(/^\[REDACTED:/);
      expect(entry).not.toHaveProperty("value");
    }
  });

  it("matches the committed redacted artifacts byte-for-byte (determinism lock)", () => {
    // The Nutrition/Exercise catalog grids are NOT committed as source dumps:
    // they are synthetic fixtures (see tests/unit/source-data-policy.test.ts).
    // Every other redacted health sheet must still round-trip exactly.
    const syntheticCatalogSlugs = new Set([
      "nutrition-database",
      "exercise-database",
    ]);
    for (const { slug, result } of results) {
      if (syntheticCatalogSlugs.has(slug)) {
        const committed = JSON.parse(
          readFileSync(join(SPEC, "spec", "sheets", `${slug}.json`), "utf8"),
        ) as { sourceFile: string };
        expect(committed.sourceFile).toMatch(/SYNTHETIC/);
        continue;
      }
      const committed = readFileSync(
        join(SPEC, "spec", "sheets", `${slug}.json`),
        "utf8",
      );
      expect(`${JSON.stringify(result.artifact, null, 2)}\n`).toBe(committed);
    }
  });
});
