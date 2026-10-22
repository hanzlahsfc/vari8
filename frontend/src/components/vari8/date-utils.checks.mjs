import assert from "node:assert/strict";
import {
  daysInMonth,
  formatCalendarDate,
  isoWeeksInYear,
  normalizeTimePart,
  parseCalendarDate,
  parseTimeValue,
} from "./date-utils.ts";

assert.equal(daysInMonth(2024, 2), 29, "leap February has 29 days");
assert.equal(daysInMonth(2025, 2), 28, "common February has 28 days");
assert.equal(daysInMonth(1900, 2), 28, "century years need the 400-year rule");
assert.equal(daysInMonth(2000, 2), 29, "400th years are leap years");
assert.equal(parseCalendarDate("2024-02-29")?.day, 29, "leap day parses");
assert.equal(
  parseCalendarDate("2025-02-29"),
  null,
  "invalid leap day is rejected",
);
assert.equal(
  parseCalendarDate("2026-04-31"),
  null,
  "invalid month day is rejected",
);
assert.equal(
  parseCalendarDate("2026-13-01"),
  null,
  "invalid month is rejected",
);
assert.equal(formatCalendarDate({ year: 9, month: 4, day: 3 }), "0009-04-03");
assert.equal(isoWeeksInYear(2026), 53, "Thursday-start year has week 53");
assert.equal(isoWeeksInYear(2025), 52, "common ISO year has week 52");
assert.deepEqual(parseTimeValue("00:00"), { hour: "00", minute: "00" });
assert.deepEqual(parseTimeValue("23:59"), { hour: "23", minute: "59" });
assert.equal(parseTimeValue("24:00"), null, "hours stop at 23");
assert.equal(parseTimeValue("12:60"), null, "minutes stop at 59");
assert.equal(parseTimeValue("7:05"), null, "committed time uses two digits");
assert.equal(normalizeTimePart("7", 23), "07");
assert.equal(normalizeTimePart("59", 59), "59");
assert.equal(normalizeTimePart("24", 23), null);
