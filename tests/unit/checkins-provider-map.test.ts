import { describe, expect, it } from "vitest";

import {
  foldScheduleHistory,
  foldScheduleRules,
  isRuleOccurrence,
  recurringEventId,
  scheduleOn,
  viennaDate,
  weekdayIndex,
} from "../../components/canvas/data/checkins";
import { unwrap } from "../../app/api/v1/workspaces/[workspaceId]/checkins/_result";

/**
 * PR-W6 unit rules a click cannot see (D11/D14):
 *
 * 1. Recurring projection. A MONDAY+WEDNESDAY rule must project D, D+2, D+7,
 *    D+9 and nothing else. This is the fold the board renders from; if the
 *    weekday mapping slips by one, every chip lands on the wrong day and the
 *    calendar still looks plausible.
 * 2. Lifecycle. A PAUSED or ENDED rule stops projecting from the fold while the
 *    instances it already materialized stay on the calendar (those arrive as
 *    rows, not as projections). Classification folds every rule regardless of
 *    status, so such a row keeps its rule type instead of becoming Custom.
 * 3. Closed-code mapping. `denied`/`not_available` are 403, `invalid_input` is
 *    400, state conflicts are 409. A browser cannot see the difference between
 *    403 and 200 on a denied write; a test can.
 */

describe("check-in schedule projection (PR-W6)", () => {
  // 2026-10-12 is a Monday.
  const MONDAY = "2026-10-12";
  const rules = [
    { weekday: "MONDAY", startDate: MONDAY, status: "ACTIVE" },
    { weekday: "WEDNESDAY", startDate: MONDAY, status: "ACTIVE" },
  ];

  it("projects a Mon+Wed rule to D, D+2, D+7, D+9 only", () => {
    const schedules = foldScheduleRules(rules);
    expect(schedules).toEqual([{ effective: MONDAY, weekdays: [0, 2] }]);

    expect(isRuleOccurrence(schedules, "2026-10-12")).toBe(true); // D  Mon
    expect(isRuleOccurrence(schedules, "2026-10-14")).toBe(true); // D+2 Wed
    expect(isRuleOccurrence(schedules, "2026-10-19")).toBe(true); // D+7 Mon
    expect(isRuleOccurrence(schedules, "2026-10-21")).toBe(true); // D+9 Wed
    expect(isRuleOccurrence(schedules, "2026-10-13")).toBe(false); // Tue
    expect(isRuleOccurrence(schedules, "2026-10-18")).toBe(false); // Sun
    // Before the rule starts nothing is projected.
    expect(isRuleOccurrence(schedules, "2026-10-11")).toBe(false);
  });

  it("drops paused and ended rules from the projection", () => {
    const schedules = foldScheduleRules([
      { weekday: "MONDAY", startDate: MONDAY, status: "ACTIVE" },
      { weekday: "WEDNESDAY", startDate: MONDAY, status: "PAUSED" },
      { weekday: "FRIDAY", startDate: MONDAY, status: "ENDED" },
    ]);
    expect(schedules).toEqual([{ effective: MONDAY, weekdays: [0] }]);
    expect(isRuleOccurrence(schedules, "2026-10-14")).toBe(false);
    expect(isRuleOccurrence(schedules, "2026-10-16")).toBe(false);
    expect(isRuleOccurrence(schedules, "2026-10-12")).toBe(true);
  });

  it("classifies a paused rule's history as a rule occurrence", () => {
    expect(
      isRuleOccurrence(
        foldScheduleHistory([
          { weekday: "WEDNESDAY", startDate: MONDAY, status: "PAUSED" },
        ]),
        "2026-10-14",
      ),
    ).toBe(true);
  });

  it("uses the latest segment not after the date (schedule change keeps history)", () => {
    const schedules = foldScheduleRules([
      { weekday: "FRIDAY", startDate: "2026-10-01", status: "ENDED" },
      { weekday: "TUESDAY", startDate: "2026-10-01", status: "ACTIVE" },
      { weekday: "MONDAY", startDate: "2026-10-19", status: "ACTIVE" },
    ]);
    expect(schedules.map((s) => s.effective)).toEqual([
      "2026-10-01",
      "2026-10-19",
    ]);
    expect(scheduleOn(schedules, "2026-10-19")?.weekdays).toEqual([0]);
    expect(isRuleOccurrence(schedules, "2026-10-13")).toBe(true); // Tue, old rule
    expect(isRuleOccurrence(schedules, "2026-10-12")).toBe(false); // Mon, not yet
  });

  it("maps a due instant to its Europe/Vienna calendar date", () => {
    expect(viennaDate("2026-10-12T17:00:00Z")).toBe("2026-10-12");
    // 23:30Z is already the next day in Vienna (CEST, +2).
    expect(viennaDate("2026-10-12T23:30:00Z")).toBe("2026-10-13");
    expect(weekdayIndex("2026-10-12")).toBe(0);
  });

  it("keys recurring events the way eventsBetween does", () => {
    expect(recurringEventId("client-001", "2026-10-12")).toBe(
      "recurring:client-001:2026-10-12",
    );
  });
});

describe("check-in closed-code mapping (PR-W6)", () => {
  const code = (result: never) => {
    try {
      unwrap(result);
    } catch (error) {
      return (error as { status: number; code: string }).status;
    }
    return 200;
  };

  it("maps denied and not_available to 403, invalid_input to 400, conflicts to 409", () => {
    expect(code({ ok: false, code: "denied", message: "" } as never)).toBe(403);
    expect(
      code({ ok: false, code: "not_available", message: "" } as never),
    ).toBe(403);
    expect(
      code({ ok: false, code: "invalid_input", message: "" } as never),
    ).toBe(400);
    expect(
      code({ ok: false, code: "idempotency_conflict", message: "" } as never),
    ).toBe(409);
    expect(
      code({ ok: false, code: "serialization_conflict", message: "" } as never),
    ).toBe(409);
  });

  it("passes a success value through untouched", () => {
    expect(unwrap({ ok: true, value: { status: "paused" } })).toEqual({
      status: "paused",
    });
  });
});
