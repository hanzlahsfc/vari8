import { describe, expect, it } from "vitest";

import { normalizeTaskTitle } from "../../lib/coach-tasks/service";
import {
  normalizeNoteBody,
  normalizeVisibility,
} from "../../lib/notes/service";
import { parseCommentDate } from "../../lib/tracker-comments/service";

/**
 * PR-M3 input contract at the trust boundary — the same normalization the
 * services apply before any row is touched (D14 keep: validation rules a
 * browser check cannot see).
 */
describe("PR-M3 input normalization", () => {
  it("note body: trims and rejects non-strings and blanks", () => {
    expect(normalizeNoteBody("  hello  ")).toBe("hello");
    expect(() => normalizeNoteBody("   ")).toThrowError(/invalid_input/);
    expect(() => normalizeNoteBody("")).toThrowError(/invalid_input/);
    expect(() => normalizeNoteBody(42)).toThrowError(/invalid_input/);
    expect(() => normalizeNoteBody(null)).toThrowError(/invalid_input/);
  });

  it("note visibility: only the two canvas kinds pass", () => {
    expect(normalizeVisibility("PRIVATE")).toBe("PRIVATE");
    expect(normalizeVisibility("GENERAL")).toBe("GENERAL");
    expect(() => normalizeVisibility("private")).toThrowError(/invalid_input/);
    expect(() => normalizeVisibility("STAFF")).toThrowError(/invalid_input/);
    expect(() => normalizeVisibility(undefined)).toThrowError(/invalid_input/);
  });

  it("coach task title: 1..120 chars after trim", () => {
    expect(normalizeTaskTitle("  Prepare feedback video ")).toBe(
      "Prepare feedback video",
    );
    expect(normalizeTaskTitle("x".repeat(120))).toBe("x".repeat(120));
    expect(() => normalizeTaskTitle("x".repeat(121))).toThrowError(
      /invalid_input/,
    );
    expect(() => normalizeTaskTitle("")).toThrowError(/invalid_input/);
    expect(() => normalizeTaskTitle("   ")).toThrowError(/invalid_input/);
    expect(() => normalizeTaskTitle(7)).toThrowError(/invalid_input/);
  });

  it("comment date: strict YYYY-MM-DD, real calendar days only", () => {
    expect(parseCommentDate("2026-10-19")).toBe("2026-10-19");
    expect(parseCommentDate("2024-02-29")).toBe("2024-02-29");
    expect(parseCommentDate("2026-02-29")).toBeNull();
    expect(parseCommentDate("2026-13-01")).toBeNull();
    expect(parseCommentDate("10/19/2026")).toBeNull();
    expect(parseCommentDate("2026-1-9")).toBeNull();
    expect(parseCommentDate(20261019)).toBeNull();
    expect(parseCommentDate("")).toBeNull();
  });
});
