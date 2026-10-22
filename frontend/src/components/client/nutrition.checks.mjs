import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { macroKcal } from "./nutrition-model.ts";

describe("macroKcal", () => {
  it("computes 4P + 4C + 9F for a complete day", () => {
    const result = macroKcal({ protein: 30, carbs: 50, fat: 10 });
    assert.equal(result.value, 410);
    assert.equal(result.complete, true);
  });

  it("sums recorded macros only when a macro is null", () => {
    const input = { protein: 30, carbs: 50, fat: null };
    const result = macroKcal(input);
    assert.equal(result.value, 320);
    assert.equal(result.complete, false);
    assert.equal(input.fat, null);
  });

  it("returns null value when nothing is recorded", () => {
    const result = macroKcal({ protein: null, carbs: null, fat: null });
    assert.equal(result.value, null);
    assert.equal(result.complete, false);
  });

  it("keeps the recorded macro when two are null", () => {
    const result = macroKcal({ protein: null, carbs: null, fat: 20 });
    assert.equal(result.value, 180);
    assert.equal(result.complete, false);
  });
});
