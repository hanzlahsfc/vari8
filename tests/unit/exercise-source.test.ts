import { describe, expect, it } from "vitest";

import { extractExerciseSource } from "../../lib/exercise/source";

const HEADERS = [
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
];

function row(cells: string[], tag = "td"): string {
  return `<tr>${cells.map((text) => `<${tag}>${text}</${tag}>`).join("")}</tr>`;
}

function dataRow(values: Partial<Record<number, string>>): string {
  const cells = Array.from({ length: 11 }, (_, i) => values[i + 1] ?? "");
  return row(cells);
}

function html(dataRows: string[]): string {
  return `<html><body><table class="waffle"><tbody>
    ${row(["", ...HEADERS.map(() => "")], "th")}
    ${dataRow({ 2: "ID", 3: "Exercise Name", 4: "Muscle Group", 5: "Primary Target", 6: "Additional Target(s)", 7: "Equipment", 8: "Movement Pattern", 9: "Position / Setup", 10: "Coaching Notes / Cues", 11: "Video Link" })}
    ${dataRows.join("\n")}
  </tbody></table></body></html>`;
}

const META = {
  sourceName: "Exercise Database.html",
  sourceFingerprint: "fp-test-1",
};

describe("extractExerciseSource", () => {
  it("maps the real header set and classifies every candidate row explicitly", () => {
    const source = extractExerciseSource(
      html([
        dataRow({
          2: "1",
          3: "Back Squat",
          4: "Quadriceps",
          5: "Quadriceps",
          6: "Gluteus Maximus",
          7: "Barbell",
          8: "Squat",
          9: "Standing",
          10: "Brace the trunk.",
          11: "http://example.com/squat",
        }),
        dataRow({ 2: "2" }),
        dataRow({ 2: "x", 3: "Weird row" }),
        dataRow({ 2: "1", 3: "Duplicate Id" }),
        dataRow({
          2: "3",
          3: "Plank",
          4: "Core",
          5: "Abdominals",
          7: "Bodyweight",
          8: "Anti-Extension",
          9: "Prone",
        }),
        dataRow({ 2: "Footer note only" }),
        dataRow({}),
      ]),
      META,
    );

    expect(source.headerRow).toBe(1);
    expect(source.columns).toMatchObject({
      id: 2,
      name: 3,
      muscleGroup: 4,
      primaryTarget: 5,
      additionalTargets: 6,
      equipment: 7,
      movementPattern: 8,
      positionSetup: 9,
      cues: 10,
      videoLink: 11,
    });

    expect(source.accepted.map((r) => r.sourceId)).toEqual([1, 3]);
    expect(source.rejected).toEqual([
      { sourceRow: 3, sourceId: 2, reasonCode: "missing_name" },
      { sourceRow: 4, sourceId: null, reasonCode: "invalid_source_id" },
      { sourceRow: 7, sourceId: null, reasonCode: "non_data_row" },
    ]);
    expect(source.duplicates).toEqual([
      { sourceRow: 5, sourceId: 1, reasonCode: "duplicate_source_id" },
    ]);

    expect(source.ignoredEmptyRowCount).toBe(1);
    expect(source.sourceRowCount).toBe(
      source.accepted.length +
        source.rejected.length +
        source.duplicates.length,
    );
    expect(source.scannedRowCount).toBe(
      source.sourceRowCount + source.ignoredEmptyRowCount,
    );
  });

  it("preserves source text verbatim and maps empty cells to null", () => {
    const source = extractExerciseSource(
      html([
        dataRow({
          2: "1",
          3: "Leg Press",
          4: "Quadriceps",
          5: "Quadriceps",
          7: "Leg Press Machine",
          8: "Leg Press",
          9: "Not specified",
        }),
        dataRow({ 2: "2", 3: "Mystery" }),
      ]),
      META,
    );
    const first = source.accepted[0];
    expect(first).toMatchObject({
      sourceId: 1,
      name: "Leg Press",
      muscleGroup: "Quadriceps",
      primaryTarget: "Quadriceps",
      equipment: "Leg Press Machine",
      movementPattern: "Leg Press",
      // "Not specified" is a real source literal, preserved verbatim.
      positionSetup: "Not specified",
      additionalTargets: null,
      cues: null,
      videoLink: null,
    });
    expect(source.accepted[1]).toMatchObject({
      sourceId: 2,
      name: "Mystery",
      muscleGroup: null,
      primaryTarget: null,
      additionalTargets: null,
      equipment: null,
      movementPattern: null,
      positionSetup: null,
      cues: null,
      videoLink: null,
    });
  });

  it("computes a stable content fingerprint that changes with content", () => {
    const build = (name: string) =>
      extractExerciseSource(
        html([dataRow({ 2: "1", 3: name, 4: "Core" })]),
        META,
      ).accepted[0].rowFingerprint;
    const a = build("Plank");
    const b = build("Plank");
    const c = build("Crunch");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when a required header is missing", () => {
    const bad = `<table class="waffle"><tbody>
      ${dataRow({ 2: "ID", 4: "Muscle Group" })}
      ${dataRow({ 2: "1", 3: "No name header" })}
    </tbody></table>`;
    expect(() => extractExerciseSource(bad, META)).toThrow(/header/i);
  });
});
