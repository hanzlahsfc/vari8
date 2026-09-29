import { describe, expect, it } from "vitest";

import type { ExtractionCell } from "../../lib/extraction/contracts";
import {
  isSafeCellText,
  redactSheet,
  safeLabelSet,
  sortRedactions,
} from "../../lib/extraction/redact";

function cell(
  row: number,
  col: number,
  text: string,
  extra: Partial<ExtractionCell> = {},
): ExtractionCell {
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
  const result = redactSheet(
    "daily-tracker",
    "DAILY TRACKER.html",
    CELLS,
    {},
    [],
  );
  const byKey = new Map(
    result.artifact.cells.map((c) => [`${c.row}:${c.col}`, c]),
  );

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
    expect(byKey.get("4:3")).toMatchObject({
      row: 4,
      col: 3,
      rowSpan: 1,
      colSpan: 1,
      class: "s1",
    });
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
        [
          "artifact",
          "cell",
          "fieldCategory",
          "placeholder",
          "reason",
          "sheet",
        ].sort(),
      );
    }
  });

  it("records a TODO(product) for the fail-closed policy", () => {
    expect(
      result.artifact.todos.some((t) => t.startsWith("TODO(product)")),
    ).toBe(true);
  });
});

describe("MENSES cycle-phase guide (source-aware region)", () => {
  const cells = [
    cell(7, 11, "Luteal"), // client current phase, OUTSIDE the guide region
    cell(14, 25, "CYCLE PHASE GUIDE"), // static label
    cell(17, 26, "Days 1-5"),
    cell(17, 39, "Days 15-28"),
    cell(18, 26, "MENSTRUAL"),
    cell(18, 39, "LUTEAL"),
    cell(20, 34, "Shedding phase. Focus on rest, recovery movement."),
    cell(26, 2, "synthetic cycle history value 99"), // below the region
  ];
  const result = redactSheet("menses", "MENSES.html", cells, {}, []);
  const at = (row: number, col: number) =>
    result.artifact.cells.find((c) => c.row === row && c.col === col);

  it("keeps the full guide block (labels, day ranges, phase names, descriptions)", () => {
    expect(at(17, 26)?.text).toBe("Days 1-5");
    expect(at(17, 39)?.text).toBe("Days 15-28");
    expect(at(18, 26)?.text).toBe("MENSTRUAL");
    expect(at(18, 39)?.text).toBe("LUTEAL");
    expect(at(20, 34)?.text).toContain("Shedding phase");
  });

  it("still redacts client values outside the region", () => {
    expect(at(7, 11)?.text).toBe("[REDACTED:client.menses]");
    expect(at(26, 2)?.text).toBe("[REDACTED:client.menses]");
  });
});

describe("isSafeCellText", () => {
  const labels = safeLabelSet("dashboard");

  it("keeps safe labels, patterns, and product copy", () => {
    expect(isSafeCellText("dashboard", "CURRENT WEEK", labels)).toBe(true);
    expect(isSafeCellText("dashboard", "WEEK 11", labels)).toBe(true);
    expect(isSafeCellText("dashboard", "© 2026 INFINITYCRE8", labels)).toBe(
      true,
    );
  });

  it("fails closed for ambiguous client text and contacts", () => {
    expect(isSafeCellText("dashboard", "felt tired today", labels)).toBe(false);
    expect(isSafeCellText("dashboard", "vendor@example.com", labels)).toBe(
      false,
    );
  });

  it("treats reference databases as safe but still blocks contacts", () => {
    expect(
      isSafeCellText("nutrition-database", "Chicken Breast", new Set()),
    ).toBe(true);
    expect(isSafeCellText("nutrition-database", "a@b.com", new Set())).toBe(
      false,
    );
  });
});

describe("sortRedactions", () => {
  it("orders deterministically by artifact, row, col, category", () => {
    const sorted = sortRedactions([
      {
        artifact: "spec/sheets/b.json",
        cell: { row: 2, col: 1 },
        fieldCategory: "c",
        placeholder: "p",
        reason: "r",
      },
      {
        artifact: "spec/sheets/a.json",
        cell: { row: 5, col: 1 },
        fieldCategory: "c",
        placeholder: "p",
        reason: "r",
      },
      {
        artifact: "spec/sheets/a.json",
        cell: { row: 1, col: 2 },
        fieldCategory: "c",
        placeholder: "p",
        reason: "r",
      },
    ]);
    expect(
      sorted.map((e) => `${e.artifact}:${e.cell?.row}:${e.cell?.col}`),
    ).toEqual([
      "spec/sheets/a.json:1:2",
      "spec/sheets/a.json:5:1",
      "spec/sheets/b.json:2:1",
    ]);
  });
});
