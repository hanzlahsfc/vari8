import { describe, expect, it } from "vitest";

import { normalizeEmail } from "../../lib/email";

describe("normalizeEmail", () => {
  it("trims and lowercases strings and rejects non-strings", () => {
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com");
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(42)).toBe("");
  });
});
