import { describe, expect, it } from "vitest";

import {
  SHEET_SLUGS,
  slugifySheetFileName,
} from "../../lib/extraction/contracts";

describe("sheet slug mapping", () => {
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
    expect(slugifySheetFileName("  Exercise Database.HTML ")).toBe(
      "exercise-database",
    );
    expect(slugifySheetFileName("DAILY TRACKER.html")).toBe("daily-tracker");
    expect(slugifySheetFileName("A  B___C!.html")).toBe("a-b-c");
  });
});

