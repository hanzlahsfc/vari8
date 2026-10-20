// MEAL-PLAN-I1 (PROMPT 211) — dev/test-only feature gate contract. The flag
// is necessary but NEVER sufficient: both the exact "1" value AND a trusted
// development/test runtime classification are required;
// production/unknown/missing/malformed fail closed.

import { describe, expect, it } from "vitest";

import {
  classifyMealPlanRuntime,
  isMealPlansEnabled,
} from "../../lib/mealplan/gate";

describe("MEAL-PLAN-I1 gate — runtime classification", () => {
  it("explicit APP_ENV wins and only development/test are trusted", () => {
    expect(classifyMealPlanRuntime({ APP_ENV: "development" })).toBe(
      "development",
    );
    expect(classifyMealPlanRuntime({ APP_ENV: "test" })).toBe("test");
    for (const v of ["production", "staging", "preview", "", "TEST", " dev "])
      expect(classifyMealPlanRuntime({ APP_ENV: v })).toBe("production");
  });

  it("falls back to NODE_ENV allowlist when APP_ENV is unset", () => {
    expect(classifyMealPlanRuntime({ NODE_ENV: "development" })).toBe(
      "development",
    );
    expect(classifyMealPlanRuntime({ NODE_ENV: "test" })).toBe("test");
    expect(classifyMealPlanRuntime({ NODE_ENV: "production" })).toBe(
      "production",
    );
    expect(classifyMealPlanRuntime({})).toBe("production");
  });
});

describe("MEAL-PLAN-I1 gate — enablement decision", () => {
  it("requires the exact flag value AND a trusted runtime", () => {
    expect(
      isMealPlansEnabled({ ENABLE_MEAL_PLANS: "1", APP_ENV: "test" }),
    ).toBe(true);
    expect(
      isMealPlansEnabled({ ENABLE_MEAL_PLANS: "1", APP_ENV: "development" }),
    ).toBe(true);
    for (const env of [
      { ENABLE_MEAL_PLANS: "1", APP_ENV: "production" },
      { ENABLE_MEAL_PLANS: "1", APP_ENV: "staging" },
      { ENABLE_MEAL_PLANS: "1" },
      { ENABLE_MEAL_PLANS: "true", APP_ENV: "test" },
      { ENABLE_MEAL_PLANS: "", APP_ENV: "test" },
      { APP_ENV: "test" },
      {},
    ])
      expect(isMealPlansEnabled(env)).toBe(false);
  });
});
