import { describe, expect, it } from "vitest";

import type { ExtractionCell } from "../../lib/extraction/contracts";
import { isSafeCellText, redactSheet, safeLabelSet, sortRedactions } from "../../lib/extraction/redact";

function cell(row: number, col: number, text: string, extra: Partial<ExtractionCell> = {}): ExtractionCell {
  return { row, col, rowSpan: 1, colSpan: 1, class: "s1", text, ...extra };
}

// Synthetic values only — never real client data.
const SENSITIVE = "Synthetic Client Note 12345";
const SYNTHETIC_DOSE = "9999iu";

const CELLS: ExtractionCell[] = [
  cell(8, 7, "BODYWEIGHT"), // safe curated label
  cell(3, 1, "Averages"), // safe pattern
  cell(4, 3, SENSITIVE, { normalized: 12345 }), // redacted + normalized dropped
  cell(5, 3, SYNTHETIC_DOSE), // redacted
  cell(6, 3, "Menstrual"), // phase word in a client sheet -> redacted
  cell(7, 3, "", { rowSpan: 2 }), // empty spanned cell preserved
  cell(9, 3, "", { checkbox: "checked" as const }), // empty checkbox preserved
  cell(10, 3, "nobody@example.com"), // contact -> redacted
];

describe("redactSheet", () => {
  const result = redactSheet("daily-tracker", "DAILY TRACKER.html", CELLS, {}, []);
  const byKey = new Map(result.artifact.cells.map((c) => [`${c.row}:${c.col}`, c]));

  it("redacts person-specific values and replaces text with the placeholder", () => {
    expect(byKey.get("4:3")?.text).toBe("[REDACTED:client.daily-entry]");
    expect(byKey.get("5:3")?.text).toBe("[REDACTED:client.daily-entry]");
    expect(byKey.get("6:3")?.text).toBe("[REDACTED:client.daily-entry]");
  });

  it("drops normalized/todo on redacted cells", () => {
    const redacted = byKey.get("4:3");
    expect(redacted?.normalized).toBeUndefined();
    expect(redacted?.todo).toBeUndefined();
  });

  it("preserves coordinates, spans, class, empty cells, and checkbox state", () => {
    expect(byKey.get("4:3")).toMatchObject({ row: 4, col: 3, rowSpan: 1, colSpan: 1, class: "s1" });
    expect(byKey.get("7:3")).toMatchObject({ text: "", rowSpan: 2 });
    expect(byKey.get("9:3")).toMatchObject({ text: "", checkbox: "checked" });
  });

  it("keeps curated labels and structural patterns", () => {
    expect(byKey.get("8:7")?.text).toBe("BODYWEIGHT");
    expect(byKey.get("3:1")?.text).toBe("Averages");
  });

  it("emits exactly one manifest entry per redacted cell, with no original value", () => {
    expect(result.redactions).toHaveLength(4); // 4:3, 5:3, 6:3, 10:3
    const serialized = JSON.stringify(result.redactions);
    expect(serialized).not.toContain(SENSITIVE);
    expect(serialized).not.toContain(SYNTHETIC_DOSE);
    expect(serialized).not.toContain("nobody@example.com");
    for (const entry of result.redactions) {
      expect(entry.placeholder).toMatch(/^\[REDACTED:/);
      expect(entry.cell?.row).toBeGreaterThan(0);
      expect(Object.keys(entry).sort()).toEqual(
        ["artifact", "cell", "fieldCategory", "placeholder", "reason", "sheet"].sort(),
      );
    }
  });

  it("records a TODO(product) for the fail-closed policy", () => {
    expect(result.artifact.todos.some((t) => t.startsWith("TODO(product)"))).toBe(true);
  });
});

describe("isSafeCellText", () => {
  const labels = safeLabelSet("dashboard");

  it("keeps safe labels, patterns, and product copy", () => {
    expect(isSafeCellText("dashboard", "CURRENT WEEK", labels)).toBe(true);
    expect(isSafeCellText("dashboard", "WEEK 11", labels)).toBe(true);
    expect(isSafeCellText("dashboard", "© 2026 INFINITYCRE8", labels)).toBe(true);
  });

  it("fails closed for ambiguous client text and contacts", () => {
    expect(isSafeCellText("dashboard", "felt tired today", labels)).toBe(false);
    expect(isSafeCellText("dashboard", "vendor@example.com", labels)).toBe(false);
  });

  it("treats reference databases as safe but still blocks contacts", () => {
    expect(isSafeCellText("nutrition-database", "Chicken Breast", new Set())).toBe(true);
    expect(isSafeCellText("nutrition-database", "a@b.com", new Set())).toBe(false);
  });
});

describe("sortRedactions", () => {
  it("orders deterministically by artifact, row, col, category", () => {
    const sorted = sortRedactions([
      { artifact: "spec/sheets/b.json", cell: { row: 2, col: 1 }, fieldCategory: "c", placeholder: "p", reason: "r" },
      { artifact: "spec/sheets/a.json", cell: { row: 5, col: 1 }, fieldCategory: "c", placeholder: "p", reason: "r" },
      { artifact: "spec/sheets/a.json", cell: { row: 1, col: 2 }, fieldCategory: "c", placeholder: "p", reason: "r" },
    ]);
    expect(sorted.map((e) => `${e.artifact}:${e.cell?.row}:${e.cell?.col}`)).toEqual([
      "spec/sheets/a.json:1:2",
      "spec/sheets/a.json:5:1",
      "spec/sheets/b.json:2:1",
    ]);
  });
});
