import { describe, expect, it } from "vitest";

import { extractExercises, extractFoods } from "../../lib/extraction/databases";

const FOODS_HTML = `
<table class="waffle no-grid">
  <tr><th class="row-header"></th><th class="column-headers-background">A</th><th class="column-headers-background">B</th></tr>
  <tr><th>1</th><td class="s0"></td><td class="s0"></td></tr>
  <tr><th>2</th><td class="s0"></td><td class="s0">NO.</td><td class="s0">FOOD</td><td class="s0">AMOUNT</td><td class="s0">UNIT</td><td class="s0">CALORIES (kcal)</td><td class="s0">PROTEIN (g)</td><td class="s0">CARBS (g)</td><td class="s0">FATS (g)</td><td class="s0">COOKED/RAW/DRY</td><td class="s0">CAT</td></tr>
  <tr><th>3</th><td class="s0"></td></tr>
  <tr><th>4</th><td class="s0"></td><td class="s0">1</td><td class="s0">Oats</td><td class="s0">80</td><td class="s0">g</td><td class="s0">304</td><td class="s0">10</td><td class="s0">51</td><td class="s0">4,5</td><td class="s0">Dry Weight</td><td class="s0">CHO</td></tr>
  <tr><th>5</th><td class="s0"></td><td class="s0">2</td><td class="s0">Whey</td><td class="s0">30</td><td class="s0">g</td><td class="s0">120</td><td class="s0">24</td><td class="s0"></td><td class="s0">1.9</td><td class="s0">Raw Weight</td><td class="s0"></td></tr>
  <tr><th>6</th><td class="s0"></td><td class="s0">3</td><td class="s0"></td><td class="s0"></td><td class="s0"></td><td class="s0"></td><td class="s0"></td><td class="s0"></td><td class="s0"></td><td class="s0"></td><td class="s0"></td></tr>
  <tr><th>7</th><td class="s0"></td><td class="s0"></td><td class="s0">Template by Someone, email x@example.com</td></tr>
</table>
`;

const EXERCISES_HTML = `
<table class="waffle no-grid">
  <tr><th class="row-header"></th><th class="column-headers-background">A</th><th class="column-headers-background">B</th></tr>
  <tr><th>1</th><td class="s0"></td></tr>
  <tr><th>2</th><td class="s0"></td><td class="s0">ID</td><td class="s0">Exercise Name</td><td class="s0">Muscle Group</td><td class="s0">Primary Target</td><td class="s0">Additional Target(s)</td><td class="s0">Equipment</td><td class="s0">Movement Pattern</td><td class="s0">Position / Setup</td><td class="s0">Coaching Notes / Cues</td><td class="s0">Video Link</td></tr>
  <tr><th>3</th><td class="s0"></td></tr>
  <tr><th>4</th><td class="s0"></td><td class="s0">1</td><td class="s0">Ab Wheel Rollout</td><td class="s0">Core</td><td class="s0">Abdominals</td><td class="s0"></td><td class="s0">Ab Wheel</td><td class="s0">Anti-Extension</td><td class="s0">Not specified</td><td class="s0"></td><td class="s0"></td></tr>
  <tr><th>5</th><td class="s0"></td><td class="s0">2</td><td class="s0">Cable Crunch</td><td class="s0">Core</td><td class="s0">Abdominals</td><td class="s0">Obliques</td><td class="s0">Cable</td><td class="s0">Trunk Flexion</td><td class="s0">Decline</td><td class="s0">Flex the spine.</td><td class="s0">https://example.com/v/2</td></tr>
</table>
`;

describe("extractFoods", () => {
  const result = extractFoods(FOODS_HTML);

  it("maps columns from the real header labels", () => {
    expect(result.headerRow).toBe(2);
    expect(result.columns.food).toBe(3);
    expect(result.columns.category).toBe(11);
  });

  it("preserves source text and normalizes numbers additively", () => {
    const oats = result.records[0];
    expect(oats.food).toBe("Oats");
    expect(oats.amount).toBe("80");
    expect(oats.unit).toBe("g");
    expect(oats.calories).toBe("304");
    expect(oats.protein).toBe("10");
    expect(oats.carbs).toBe("51");
    expect(oats.fats).toBe("4,5");
    expect(oats.state).toBe("Dry Weight");
    expect(oats.normalized?.fats).toBe(4.5);
    expect(oats.normalized?.calories).toBe(304);
  });

  it("preserves empty fields as empty strings without inventing values", () => {
    const whey = result.records[1];
    expect(whey.carbs).toBe("");
    expect(whey.category).toBe("");
    expect(whey.normalized?.carbs).toBeUndefined();
  });

  it("keeps source row traceability and source order", () => {
    expect(result.records.map((r) => r.sourceRow)).toEqual([4, 5]);
    expect(result.records.map((r) => r.no)).toEqual(["1", "2"]);
  });

  it("skips numbered-but-empty placeholder rows and non-numeric footer rows", () => {
    expect(result.records).toHaveLength(2);
    expect(result.skippedNumberedRows).toBe(1);
  });
});

describe("extractExercises", () => {
  const result = extractExercises(EXERCISES_HTML);

  it("maps columns from the real header labels", () => {
    expect(result.headerRow).toBe(2);
    expect(result.columns.name).toBe(3);
    expect(result.columns.videoLink).toBe(11);
  });

  it("extracts all fields and preserves empty ones", () => {
    const first = result.records[0];
    expect(first.id).toBe("1");
    expect(first.name).toBe("Ab Wheel Rollout");
    expect(first.muscleGroup).toBe("Core");
    expect(first.primaryTarget).toBe("Abdominals");
    expect(first.additionalTargets).toBe("");
    expect(first.equipment).toBe("Ab Wheel");
    expect(first.movementPattern).toBe("Anti-Extension");
    expect(first.positionSetup).toBe("Not specified");
    expect(first.cues).toBe("");
    const second = result.records[1];
    expect(second.additionalTargets).toBe("Obliques");
    expect(second.equipment).toBe("Cable");
    expect(second.movementPattern).toBe("Trunk Flexion");
    expect(second.positionSetup).toBe("Decline");
    expect(second.cues).toBe("Flex the spine.");
    expect(second.videoLink).toBe("https://example.com/v/2");
  });

  it("keeps source row traceability", () => {
    expect(result.records.map((r) => r.sourceRow)).toEqual([4, 5]);
  });
});

describe("header handling", () => {
  it("throws clearly when the header row is missing", () => {
    expect(() =>
      extractFoods('<table class="waffle"><tr><td>x</td></tr></table>'),
    ).toThrow(/header/i);
  });

  it("maps by header label, not column position", () => {
    const shuffled = `
      <table class="waffle">
        <tr><th class="row-header"></th><th class="column-headers-background">A</th></tr>
        <tr><th>1</th><td></td><td>AMOUNT</td><td>FOOD</td><td>NO.</td><td>PROTEIN (g)</td><td>CARBS (g)</td><td>CALORIES (kcal)</td></tr>
        <tr><th>2</th><td></td><td>80</td><td>Oats</td><td>7</td><td>10</td><td>51</td><td>304</td></tr>
      </table>`;
    const record = extractFoods(shuffled).records[0];
    expect(record.no).toBe("7");
    expect(record.food).toBe("Oats");
    expect(record.amount).toBe("80");
    expect(record.protein).toBe("10");
    expect(record.carbs).toBe("51");
    expect(record.calories).toBe("304");
    expect(record.normalized?.calories).toBe(304);
  });

  it("records a TODO(product) when a column is missing instead of guessing", () => {
    const partial = `
      <table class="waffle">
        <tr><th class="row-header"></th><th class="column-headers-background">A</th></tr>
        <tr><th>1</th><td></td><td>NO.</td><td>FOOD</td><td>CALORIES (kcal)</td></tr>
        <tr><th>2</th><td></td><td>1</td><td>Apple</td><td>52</td></tr>
      </table>`;
    const result = extractFoods(partial);
    expect(result.missingHeaders).toContain("category");
    expect(result.records[0].category).toBe("");
    expect(result.records[0].todo).toContain("TODO(product)");
  });
});
