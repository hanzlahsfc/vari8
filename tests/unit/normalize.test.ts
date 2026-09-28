import { describe, expect, it } from "vitest";

import { normalizeNumeric } from "../../lib/extraction/normalize";

describe("normalizeNumeric", () => {
  it("normalizes unambiguous integers", () => {
    expect(normalizeNumeric("2485")).toBe(2485);
    expect(normalizeNumeric("-3")).toBe(-3);
    expect(normalizeNumeric(" 42 ")).toBe(42);
  });

  it("normalizes comma decimals", () => {
    expect(normalizeNumeric("4,5")).toBe(4.5);
    expect(normalizeNumeric("-2,75")).toBe(-2.75);
  });

  it("normalizes dot decimals with 1-2 fractional digits", () => {
    expect(normalizeNumeric("66.9")).toBe(66.9);
    expect(normalizeNumeric("36.5")).toBe(36.5);
  });

  it("normalizes grouped thousands", () => {
    expect(normalizeNumeric("12,000")).toBe(12000);
    expect(normalizeNumeric("14.000")).toBe(14000);
    expect(normalizeNumeric("1,234,567")).toBe(1234567);
    expect(normalizeNumeric("1.234.567")).toBe(1234567);
  });

  it("refuses ambiguous single-group values", () => {
    expect(normalizeNumeric("1.234")).toBeUndefined();
    expect(normalizeNumeric("1,234")).toBeUndefined();
  });

  it("refuses non-numeric text, dates, ranges, and units", () => {
    expect(normalizeNumeric("")).toBeUndefined();
    expect(normalizeNumeric("20.07.2026")).toBeUndefined();
    expect(normalizeNumeric("6-10")).toBeUndefined();
    expect(normalizeNumeric("4 iu")).toBeUndefined();
    expect(normalizeNumeric("50%")).toBeUndefined();
    expect(normalizeNumeric("3010")).toBe(3010);
  });
});
