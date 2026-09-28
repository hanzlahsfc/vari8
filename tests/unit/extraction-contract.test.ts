import { describe, expect, it } from "vitest";

import {
  EXPECTED_SHEETS,
  redactedPlaceholder,
  SHEET_SLUGS,
  slugifySheetFileName,
} from "../../lib/extraction/contracts";

describe("sheet slug mapping", () => {
  it("covers exactly the 11 expected sheets with unique slugs", () => {
    expect(EXPECTED_SHEETS).toHaveLength(11);
    const slugs = EXPECTED_SHEETS.map((sheet) => sheet.slug);
    expect(new Set(slugs).size).toBe(11);
  });

  it("maps each export file name to the documented slug", () => {
    const expected: Record<string, string> = {
      "DAILY TRACKER.html": "daily-tracker",
      "DASHBOARD.html": "dashboard",
      "TIMELINE.html": "timeline",
      "MEALPLAN.html": "mealplan",
      "SUPPLEMENTATION.html": "supplementation",
      "MENSES.html": "menses",
      "TRAINING.html": "training",
      "PEAKING.html": "peaking",
      "SHOWDAY.html": "showday",
      "Exercise Database.html": "exercise-database",
      "Nutrition Database.html": "nutrition-database",
    };
    for (const [file, slug] of Object.entries(expected)) {
      expect(SHEET_SLUGS[file]).toBe(slug);
      expect(slugifySheetFileName(file)).toBe(slug);
    }
  });

  it("normalizes case, spaces, and punctuation deterministically", () => {
    expect(slugifySheetFileName("  Exercise Database.HTML ")).toBe("exercise-database");
    expect(slugifySheetFileName("DAILY TRACKER.html")).toBe("daily-tracker");
    expect(slugifySheetFileName("A  B___C!.html")).toBe("a-b-c");
  });
});

describe("redaction placeholder", () => {
  it("builds the documented placeholder form without the value", () => {
    expect(redactedPlaceholder("client-name")).toBe("[REDACTED:client-name]");
    expect(redactedPlaceholder("ped_protocol.dose")).toBe("[REDACTED:ped_protocol.dose]");
  });
});
