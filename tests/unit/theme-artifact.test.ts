import { describe, expect, it } from "vitest";

import type { ClassDeclarations } from "../../lib/extraction/css";
import type { ExtractionCell } from "../../lib/extraction/contracts";
import { buildThemeArtifact } from "../../lib/extraction/theme";

function cell(row: number, col: number, className: string, text = ""): ExtractionCell {
  return { row, col, rowSpan: 1, colSpan: 1, class: className, text };
}

const classes: Record<string, ClassDeclarations> = {
  s1: { "background-color": "#191919", color: "#ffffff", "font-family": "Golos" },
  s2: { "background-color": "#282828", color: "#b7b7b7" },
};

const sheets = [
  {
    slug: "a",
    cells: [cell(1, 1, "s1", "secret client value"), cell(1, 2, "s1"), cell(2, 1, "s2")],
    classes,
  },
];

describe("buildThemeArtifact", () => {
  const theme = buildThemeArtifact(sheets);

  it("aggregates distinct combinations with counts and provenance", () => {
    expect(theme.combinations).toHaveLength(2);
    const dark = theme.combinations.find((c) => c.background === "#191919");
    expect(dark).toMatchObject({ text: "#ffffff", font: "Golos", count: 2, seenIn: ["a"] });
    const surface = theme.combinations.find((c) => c.background === "#282828");
    expect(surface?.font).toBeNull();
  });

  it("is sorted deterministically", () => {
    const keys = theme.combinations.map((c) => `${c.background}|${c.text}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("never includes cell text (privacy)", () => {
    expect(JSON.stringify(theme)).not.toContain("secret client value");
  });
});
