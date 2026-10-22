// D32 gives a screen a pixel budget of 0.1 percent of its captured area. The gate must fail on a
// revert to a zero default and must still refuse bad env input, so these assert the numbers the
// harness actually compares against.
import { describe, expect, it } from "vitest";

import {
  ConfigError,
  D32_MAX_CHANGED_FRACTION,
  d32Budget,
  envThresholds,
} from "../../tools/parity/compare.mjs";

// The JS signature infers NodeJS.ProcessEnv, which wants NODE_ENV; the harness only reads PARITY_*.
const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("parity pixel budget", () => {
  it("allows 0.1 percent of a desktop and a mobile capture", () => {
    expect(D32_MAX_CHANGED_FRACTION).toBe(0.001);
    expect(d32Budget(1440 * 900)).toBe(1296);
    expect(d32Budget(390 * 844)).toBe(329);
  });

  it("defaults to the D32 fraction, not a zero budget", () => {
    expect(envThresholds(env({}))).toEqual({ tol: 0, maxDiff: null });
  });

  it("keeps an absolute override", () => {
    expect(envThresholds(env({ PARITY_MAX_DIFF_PIXELS: "400" }))).toEqual({
      tol: 0,
      maxDiff: 400,
    });
    expect(envThresholds(env({ PARITY_MAX_DIFF_PIXELS: "0" })).maxDiff).toBe(0);
  });

  it("refuses a budget that is not a whole number", () => {
    expect(() => envThresholds(env({ PARITY_MAX_DIFF_PIXELS: "abc" }))).toThrow(
      ConfigError,
    );
    expect(() => envThresholds(env({ PARITY_AA_TOLERANCE: "300" }))).toThrow(
      ConfigError,
    );
  });

  it("passes the measured nav pill residuals from the port", () => {
    // 340 px in four 1440 shots, 228 in s07-exercise-library, against the 1296 px budget.
    expect(d32Budget(1440 * 900)).toBeGreaterThan(340);
  });
});
