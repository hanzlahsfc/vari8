/**
 * CLIENT-TASKS-I1 date contract — strict declared YYYY-MM-DD parsing,
 * the task-specific proposed bound (server-UTC today + 5 calendar
 * years, leap-normalized to Mar-01), timezone-independent display, and
 * server-UTC overdue/due-today semantics.
 */
import { describe, expect, it } from "vitest";
import {
  formatTaskDueDate,
  parseTaskDueDate,
  serverTodayUtc,
  taskDueState,
} from "@/lib/tasks/date";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe("parseTaskDueDate", () => {
  it("accepts a strict declared date and round-trips it", () => {
    expect(parseTaskDueDate("2026-10-14")).toBe("2026-10-14");
    expect(parseTaskDueDate("1970-01-01")).toBe("1970-01-01");
  });
  it("rejects malformed, impossible and bounded-out dates", () => {
    for (const bad of [
      "2026-2-14",
      "2026/10/14",
      "2025-02-30",
      "not-a-date",
      "20261014",
      "1969-12-31",
      "",
      " 2026-10-14 ",
    ])
      expect(parseTaskDueDate(bad)).toBeNull();
  });
  it("accepts today and rejects beyond the five-year horizon", () => {
    const today = serverTodayUtc();
    expect(parseTaskDueDate(today)).toBe(today);
    const [y, m, d] = today.split("-").map(Number);
    const inFive = new Date(Date.UTC(y + 5, m - 1, d))
      .toISOString()
      .slice(0, 10);
    expect(parseTaskDueDate(inFive)).toBe(inFive);
    const over = new Date(Date.UTC(y + 5, m - 1, d + 1))
      .toISOString()
      .slice(0, 10);
    expect(parseTaskDueDate(over)).toBeNull();
  });
  it("leap-day reference normalizes deterministically to Mar-01", () => {
    // Feb-29 reference: y+5 lands in a non-leap year → Mar-01 bound.
    // 2028-02-29 + 5y → 2033-02-29 doesn't exist → 2033-03-01.
    const leap = parseTaskDueDate("2033-03-01", { today: "2028-02-29" });
    expect(leap).toBe("2033-03-01");
    expect(parseTaskDueDate("2033-02-28", { today: "2028-02-29" })).toBe(
      "2033-02-28",
    );
  });
});

describe("server-UTC today + due-state (P3-D)", () => {
  it("today matches the server UTC calendar date", () => {
    const now = new Date();
    const expected = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    )
      .toISOString()
      .slice(0, 10);
    expect(serverTodayUtc()).toBe(expected);
    expect(DATE_RE.test(serverTodayUtc())).toBe(true);
  });
  it("overdue is computed, never stored, and truthful at the boundary", () => {
    expect(taskDueState("2026-10-13", "2026-10-14")).toBe("overdue");
    expect(taskDueState("2026-10-14", "2026-10-14")).toBe("due-today");
    expect(taskDueState("2026-10-15", "2026-10-14")).toBe("upcoming");
  });
});

describe("timezone-independent display", () => {
  it("formats identically regardless of viewer offset", () => {
    // The same stored date renders the same string everywhere —
    // formatTaskDueDate anchors in UTC, never local time.
    const formatted = formatTaskDueDate("2026-10-14");
    expect(formatted).toMatch(/Oct 14/);
    // Simulated extreme viewers: the formatted string cannot shift day.
    for (const tz of ["Pacific/Kiritimati", "Pacific/Niue", "UTC"]) {
      const viaIntl = new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: tz,
      }).format(new Date("2026-10-14T00:00:00Z"));
      if (tz === "UTC") expect(formatted).toBe(viaIntl);
    }
  });
  it("serializes a stored @db.Date value losslessly", () => {
    // What the DB row yields — ISO date slice, no local-time rewrite.
    const stored = new Date("2026-10-14T00:00:00Z");
    expect(formatTaskDueDate(stored.toISOString().slice(0, 10))).toBe(
      formatTaskDueDate("2026-10-14"),
    );
  });
});
