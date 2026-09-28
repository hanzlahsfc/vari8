// Real-export coverage. The source exports are external and never committed
// (they contain real client data), so these tests skip when the folder is
// absent — e.g. CI without the local source. Parser logic is still covered on
// every machine by the synthetic tests in parse.test.ts / normalize.test.ts.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { EXPECTED_SHEETS } from "../../lib/extraction/contracts";
import { parseSheetHtml, type ParsedSheet } from "../../lib/extraction/parse";
import { DEFAULT_SHEETS_SOURCE_DIR } from "../../lib/extraction/source";

const SOURCE_EXISTS = existsSync(DEFAULT_SHEETS_SOURCE_DIR);
const parsed = new Map<string, ParsedSheet>();

beforeAll(
  () => {
    for (const sheet of EXPECTED_SHEETS) {
      const html = readFileSync(join(DEFAULT_SHEETS_SOURCE_DIR, sheet.file), "utf8");
      parsed.set(sheet.slug, parseSheetHtml(html));
    }
  },
  180_000,
);

function sheet(slug: string): ParsedSheet {
  const value = parsed.get(slug);
  if (!value) throw new Error(`sheet ${slug} was not parsed`);
  return value;
}

describe.skipIf(!SOURCE_EXISTS)("real sheet parsing coverage", () => {
  it(
    "parses all 11 sheets with valid coordinates and spans",
    () => {
      expect(parsed.size).toBe(11);
      let violations = 0;
      let cells = 0;
      for (const s of EXPECTED_SHEETS) {
        const result = sheet(s.slug);
        if (result.cells.length === 0) violations += 1;
        for (const cell of result.cells) {
          cells += 1;
          const ok =
            Number.isInteger(cell.row) &&
            Number.isInteger(cell.col) &&
            cell.row >= 1 &&
            cell.col >= 1 &&
            cell.rowSpan >= 1 &&
            cell.colSpan >= 1 &&
            typeof cell.text === "string";
          if (!ok) violations += 1;
        }
      }
      expect({ violations, cells }).toEqual({ violations: 0, cells });
      expect(cells).toBeGreaterThan(800_000);
    },
    120_000,
  );

  it("captures source classes and their CSS declarations", () => {
    expect(Object.keys(sheet("dashboard").classes).length).toBeGreaterThan(0);
    expect(sheet("daily-tracker").classes.s0?.color).toBeTruthy();
  });

  it("decodes checkbox states in the sheets that contain them", () => {
    const daily = sheet("daily-tracker").cells;
    expect(daily.filter((c) => c.checkbox === "checked").length).toBe(2);
    expect(daily.filter((c) => c.checkbox === "unchecked").length).toBe(572);

    const timeline = sheet("timeline").cells;
    expect(timeline.filter((c) => c.checkbox === "checked").length).toBe(2);
    expect(timeline.filter((c) => c.checkbox === "unchecked").length).toBe(373);
  });

  it("preserves German decimal-comma text and normalizes it additively", () => {
    // Do not hardcode a specific source value; assert the property generally.
    const cell = sheet("daily-tracker").cells.find((c) => /^\d+,\d$/.test(c.text));
    expect(cell).toBeDefined();
    expect(cell?.text).toContain(",");
    expect(cell?.normalized).toBe(Number(cell?.text.replace(",", ".")));
  });

  it("finds known DASHBOARD content from the real export", () => {
    const texts = sheet("dashboard").cells.map((c) => c.text);
    expect(texts).toContain("WEEK 11");
    expect(
      texts.some((t) => t.includes("not a doctor or registered dietitian")),
    ).toBe(true);
    expect(
      texts.some((t) => t.includes("educational and entertainment purposes only")),
    ).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const html = readFileSync(join(DEFAULT_SHEETS_SOURCE_DIR, "DASHBOARD.html"), "utf8");
    expect(JSON.stringify(parseSheetHtml(html))).toBe(JSON.stringify(parseSheetHtml(html)));
  });
});
