import { describe, expect, it } from "vitest";

import {
  isSheetViewerEnabled,
  requireSheetViewer,
} from "../../lib/sheet-viewer";

describe("isSheetViewerEnabled", () => {
  it("is disabled unless the flag is exactly 1", () => {
    expect(isSheetViewerEnabled(undefined)).toBe(false);
    expect(isSheetViewerEnabled("")).toBe(false);
    expect(isSheetViewerEnabled("true")).toBe(false);
    expect(isSheetViewerEnabled("0")).toBe(false);
    expect(isSheetViewerEnabled("1")).toBe(true);
  });
});

describe("requireSheetViewer (fail-closed gate used by the pages)", () => {
  it("throws (notFound) when disabled", () => {
    expect(() => requireSheetViewer(undefined)).toThrow();
    expect(() => requireSheetViewer("0")).toThrow();
  });

  it("does not throw when explicitly enabled", () => {
    expect(() => requireSheetViewer("1")).not.toThrow();
  });
});
