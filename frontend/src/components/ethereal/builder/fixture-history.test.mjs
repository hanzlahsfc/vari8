import assert from "node:assert/strict";
import test from "node:test";
import { initialRecords, upgradeAdditionalFixture } from "./model.ts";

const date = (offset) => {
  const value = new Date(`${initialRecords.client.asOf}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

test("the fictional fixture has a full year of scheduled habit and macro history", () => {
  const start = date(-364);
  for (const habit of initialRecords.habits) {
    assert.ok(habit.scheduledDates.length >= 150, `${habit.id} spans the year`);
    assert.ok(
      habit.scheduledDates[0] <= date(-350),
      `${habit.id} starts near a year ago`,
    );
    assert.ok(habit.scheduledDates.includes(initialRecords.client.asOf));
    assert.ok(habit.completions.some((item) => item.status === "done"));
    assert.ok(habit.completions.some((item) => item.status === "skipped"));
    assert.ok(
      habit.scheduledDates.some(
        (scheduled) =>
          !habit.completions.some((item) => item.date === scheduled),
      ),
      `${habit.id} retains scheduled but unlogged days`,
    );
  }
  for (const option of ["TD", "NTD"]) {
    const today = initialRecords.macroIntake.find(
      (item) =>
        item.date === initialRecords.client.asOf && item.option === option,
    );
    assert.deepEqual(
      [today.protein, today.carbs, today.fat].every(Number.isFinite),
      true,
    );
    assert.ok(
      initialRecords.macroIntake.some(
        (item) => item.option === option && item.date === start,
      ),
    );
    assert.ok(
      initialRecords.macroTargets.some(
        (item) => item.option === option && item.effectiveFrom === "2025-10-07",
      ),
    );
    assert.ok(
      initialRecords.calorieTargets.some(
        (item) => item.option === option && item.effectiveFrom === "2025-10-07",
      ),
    );
  }
});

test("version two saved samples gain history without losing edits or intentional empty sources", () => {
  const saved = structuredClone(initialRecords);
  saved.sampleHistoryVersion = 2;
  saved.activeNutritionOption = "NTD";
  saved.steps = [];
  saved.habits = saved.habits.map((habit) => ({
    ...habit,
    scheduledDates: [saved.client.asOf],
    completions:
      habit.id === "walk"
        ? [{ date: saved.client.asOf, status: "skipped" }]
        : [],
  }));
  saved.macroIntake = [
    { date: "2026-09-25", option: "TD", protein: 124, carbs: 202, fat: 57 },
    { date: "2026-10-04", option: "NTD", protein: 121, carbs: 204, fat: 61 },
    { date: "2026-10-05", option: "TD", protein: 136, carbs: 218, fat: 52 },
    { date: "2026-10-06", option: "TD", protein: 88, carbs: 142 },
  ];
  saved.macroTargets = saved.macroTargets.filter(
    (target) => target.effectiveFrom >= "2026-09-01",
  );
  saved.calorieTargets = saved.calorieTargets.filter(
    (target) => target.effectiveFrom === "2026-10-01",
  );
  saved.calorieIntake = [
    { date: "2026-10-04", option: "NTD", value: 1940, unit: "kcal" },
    { date: "2026-10-05", option: "TD", value: 2180, unit: "kcal" },
    { date: "2026-10-06", option: "TD", value: 1460, unit: "kcal" },
  ];
  const upgraded = upgradeAdditionalFixture(saved);
  assert.equal(upgraded.sampleHistoryVersion, 4);
  assert.equal(upgraded.activeNutritionOption, "NTD");
  assert.deepEqual(upgraded.steps, []);
  assert.deepEqual(
    upgraded.habits
      .find((habit) => habit.id === "walk")
      .completions.find((item) => item.date === saved.client.asOf),
    { date: saved.client.asOf, status: "skipped" },
  );
  const oldPartial = upgraded.macroIntake.find(
    (item) => item.date === saved.client.asOf && item.option === "TD",
  );
  assert.deepEqual(
    [oldPartial.protein, oldPartial.carbs, oldPartial.fat],
    [88, 142, 60],
  );
  assert.ok(
    upgraded.macroIntake.some(
      (item) =>
        item.date === saved.client.asOf &&
        item.option === "NTD" &&
        Number.isFinite(item.fat),
    ),
  );
  assert.ok(
    upgraded.calorieIntake.some(
      (item) => item.date === saved.client.asOf && item.option === "NTD",
    ),
  );
  assert.ok(
    upgraded.habits.every((habit) => habit.scheduledDates[0] <= date(-358)),
  );
  assert.ok(
    upgraded.macroTargets.some(
      (target) => target.effectiveFrom === "2025-10-07",
    ),
  );
  assert.ok(
    upgraded.calorieTargets.some(
      (target) => target.effectiveFrom === "2025-10-07",
    ),
  );
});

test("edited historical plans survive sample upgrades unchanged", () => {
  const saved = structuredClone(initialRecords);
  saved.sampleHistoryVersion = 2;
  saved.macroTargets = saved.macroTargets.filter(
    (target) => target.effectiveFrom >= "2026-09-01",
  );
  saved.macroTargets[0].low += 3;
  saved.calorieTargets = saved.calorieTargets.filter(
    (target) => target.effectiveFrom === "2026-10-01",
  );
  saved.calorieTargets[0].low += 25;
  const macroTargets = structuredClone(saved.macroTargets);
  const calorieTargets = structuredClone(saved.calorieTargets);
  const upgraded = upgradeAdditionalFixture(saved);
  assert.deepEqual(upgraded.macroTargets, macroTargets);
  assert.deepEqual(upgraded.calorieTargets, calorieTargets);
});

test("version three records missing the selected option's current-day nutrition are repaired", () => {
  const saved = structuredClone(initialRecords);
  saved.sampleHistoryVersion = 3;
  saved.activeNutritionOption = "NTD";
  saved.macroIntake = saved.macroIntake.filter(
    (item) => !(item.date === saved.client.asOf && item.option === "NTD"),
  );
  saved.calorieIntake = saved.calorieIntake.filter(
    (item) => !(item.date === saved.client.asOf && item.option === "NTD"),
  );
  const upgraded = upgradeAdditionalFixture(saved);
  const todayMacros = upgraded.macroIntake.find(
    (item) => item.date === saved.client.asOf && item.option === "NTD",
  );
  const todayCalories = upgraded.calorieIntake.find(
    (item) => item.date === saved.client.asOf && item.option === "NTD",
  );
  assert.deepEqual(
    [todayMacros.protein, todayMacros.carbs, todayMacros.fat],
    [125, 190, 68],
  );
  assert.equal(todayCalories.value, 1872);
});

test("unmarked edited nutrition sources gain older and current keys while existing gaps and values stay intact", () => {
  const saved = structuredClone(initialRecords);
  delete saved.sampleHistoryVersion;
  saved.activeNutritionOption = "NTD";
  saved.macroIntake = [
    { date: "2026-09-25", option: "TD", protein: 111, carbs: 201, fat: 62 },
    { date: "2026-10-06", option: "TD", protein: 88, carbs: 142, fat: 60 },
  ];
  saved.calorieIntake = [
    { date: "2026-10-05", option: "TD", value: 2195, unit: "kcal" },
  ];
  const upgraded = upgradeAdditionalFixture(saved);
  assert.deepEqual(
    upgraded.macroIntake.find(
      (item) => item.date === "2026-09-25" && item.option === "TD",
    ),
    { date: "2026-09-25", option: "TD", protein: 111, carbs: 201, fat: 62 },
  );
  assert.ok(
    !upgraded.macroIntake.some(
      (item) => item.date === "2026-09-26" && item.option === "TD",
    ),
  );
  assert.ok(
    upgraded.macroIntake.some(
      (item) => item.date === date(-364) && item.option === "TD",
    ),
  );
  assert.deepEqual(
    upgraded.calorieIntake.find(
      (item) => item.date === "2026-10-05" && item.option === "TD",
    ),
    { date: "2026-10-05", option: "TD", value: 2195, unit: "kcal" },
  );
  assert.ok(
    upgraded.calorieIntake.some(
      (item) => item.date === saved.client.asOf && item.option === "NTD",
    ),
  );
});
