import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/canvas/data/http", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "../../components/canvas/data/http";
import {
  foldScheduleHistory,
  foldScheduleRules,
  isRuleOccurrence,
  loadCheckins,
  mergeCheckinLoad,
  recurringEventId,
  scheduleOn,
  viennaDate,
  weekdayIndex,
} from "../../components/canvas/data/checkins";
import {
  eventsBetween,
  type CoachState,
} from "../../components/canvas/coach/model";
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

/**
 * The board read: three rules a browser cannot see until the data is wrong.
 *
 * 1. A cancelled instance is not an additional date. The calendar read returns
 *    CANCELLED rows, and the remove handler reloads the range it just cancelled
 *    in, so a pushed CANCELLED row puts the removed chip straight back.
 * 2. A reviewed submission is "Feedback sent". The header DTO carries
 *    `reviewedAt`, and the board's status derives from `response`, so a reload
 *    turns every answered check-in back into "Awaiting feedback" unless the
 *    provider maps the field.
 * 3. The range is a Vienna day range. `from=T00:00:00Z` is 02:00 local in
 *    summer, so a check-in due in the first hours of the first visible day is
 *    never read.
 * 4. A partial read failure keeps that client's rows. Replacing the slice
 *    wholesale reads as "this athlete has no check-ins".
 */
describe("check-in board read (PR-W6)", () => {
  const workspaceId = "ws-1";
  const client = { id: "client-001", name: "Emma Anders" };

  const rules = {
    items: [
      {
        ruleId: "r1",
        formId: "f1",
        weekday: "MONDAY",
        startDate: "2026-10-01",
        endDate: null,
        status: "ACTIVE",
      },
    ],
  };

  function stub(routes: {
    calendar: unknown[];
    submissions?: unknown[];
    rules?: unknown;
  }) {
    const calls: string[] = [];
    vi.mocked(apiFetch).mockImplementation((async (url: string) => {
      calls.push(url);
      if (url.includes("/schedule-rules?")) return routes.rules ?? rules;
      if (url.includes("/instances?")) return { items: routes.calendar };
      if (url.includes("/submissions?"))
        return { items: routes.submissions ?? [] };
      throw new Error(`unexpected ${url}`);
    }) as never);
    return calls;
  }

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("does not re-materialise a cancelled instance as an additional date", async () => {
    stub({
      calendar: [
        {
          instanceId: "seed-extra-cancelled",
          formId: "f2",
          formName: "Custom update",
          versionSeq: 1,
          dueAt: "2026-10-14T07:00:00.000Z",
          dueTz: "Europe/Vienna",
          coachNote: "Removed",
          state: "CANCELLED",
          submittedAt: null,
        },
        {
          instanceId: "seed-extra-live",
          formId: "f2",
          formName: "Custom update",
          versionSeq: 1,
          dueAt: "2026-10-15T07:00:00.000Z",
          dueTz: "Europe/Vienna",
          coachNote: "Kept",
          state: "SCHEDULED",
          submittedAt: null,
        },
      ],
    });

    const loaded = await loadCheckins({
      workspaceId,
      from: "2026-10-12",
      to: "2026-10-18",
      clients: [client],
      profileIdFor: async () => "cp-1",
    });

    expect(loaded.extras.map((extra) => extra.id)).toEqual(["seed-extra-live"]);
    expect(Object.keys(loaded.instances)).toEqual(["seed-extra-live"]);
  });

  it("reads a reviewed submission as feedback sent", async () => {
    stub({
      calendar: [],
      submissions: [
        {
          instanceId: "seed-occ-2026-10-08",
          submissionId: "sub-1",
          formName: "Weekly check-in",
          dueAt: "2026-10-08T07:00:00.000Z",
          submittedAt: "2026-10-08T17:00:00.000Z",
          reviewedAt: "2026-10-09T08:30:00.000Z",
        },
      ],
    });

    const loaded = await loadCheckins({
      workspaceId,
      from: "2026-10-05",
      to: "2026-10-11",
      clients: [client],
      profileIdFor: async () => "cp-1",
    });

    expect(loaded.submissions[0].response).toEqual({
      text: "",
      changes: [],
      date: "2026-10-09",
    });
    // The board's status rule, called the way the screen calls it.
    const state = {
      clients: [],
      extras: [],
      submissions: loaded.submissions,
      messages: [],
      templates: [],
      reviewDrafts: {},
    } as unknown as CoachState;
    const events = eventsBetween(state, "2026-10-08", "2026-10-08");
    expect(events.map((event) => event.status)).toEqual(["Feedback sent"]);
  });

  it("sends the range as Vienna midnights, not UTC midnights", async () => {
    const calls = stub({ calendar: [] });
    await loadCheckins({
      workspaceId,
      from: "2026-10-12",
      to: "2026-10-18",
      clients: [client],
      profileIdFor: async () => "cp-1",
    });
    const instancesUrl = calls.find((url) => url.includes("/instances?")) ?? "";
    const query = new URLSearchParams(instancesUrl.split("?")[1]);
    // CEST: 00:00 Vienna is 22:00Z the day before.
    expect(query.get("from")).toBe("2026-10-11T22:00:00.000Z");
    expect(query.get("to")).toBe("2026-10-18T22:00:00.000Z");

    // CET: the same local day starts an hour later in UTC.
    const winter = stub({ calendar: [] });
    await loadCheckins({
      workspaceId,
      from: "2026-12-01",
      to: "2026-12-07",
      clients: [client],
      profileIdFor: async () => "cp-1",
    });
    const winterUrl = winter.find((url) => url.includes("/instances?")) ?? "";
    const winterQuery = new URLSearchParams(winterUrl.split("?")[1]);
    expect(winterQuery.get("from")).toBe("2026-11-30T23:00:00.000Z");
  });

  it("keeps a failed client's rows and replaces the rest", () => {
    const extras = (id: string, clientId: string) => ({
      id,
      clientId,
      date: "2026-10-14",
      type: "Custom" as const,
      note: "",
    });
    const submission = (id: string, clientId: string) => ({
      id,
      clientId,
      date: "2026-10-12",
      eventId: `recurring:${clientId}:2026-10-12`,
      type: "Full" as const,
      answers: [],
      metrics: [],
      visuals: [],
      note: "",
      flags: [],
    });

    const merged = mergeCheckinLoad(
      {
        extras: [
          extras("old-failed", "client-002"),
          extras("old-stale", "client-001"),
        ],
        submissions: [
          submission("sub-failed", "client-002"),
          submission("sub-stale", "client-001"),
        ],
      },
      {
        extras: [extras("new-ok", "client-001")],
        submissions: [submission("sub-new", "client-001")],
      },
      ["client-002"],
    );

    expect(merged.extras.map((extra) => extra.id)).toEqual([
      "new-ok",
      "old-failed",
    ]);
    expect(merged.submissions.map((item) => item.id)).toEqual([
      "sub-new",
      "sub-failed",
    ]);
  });
});

describe("createExtra — additional-date write (P588)", () => {
  const base = "/workspaces/ws-1/checkins";
  const input = {
    workspaceId: "ws-1",
    clientProfileId: "cp-1",
    date: "2026-11-04",
    type: "Full" as const,
    note: "knee check",
  };
  const rules = {
    items: [{ formId: "form-weekly", status: "ACTIVE" }],
  };
  const versions = {
    options: [
      {
        position: 0,
        formName: "Renamed whatever",
        versionSeq: 2,
        formId: "form-weekly",
        formVersionId: "fv-wk-2",
      },
      {
        position: 1,
        formName: "Custom update",
        versionSeq: 9,
        formId: "form-custom",
        formVersionId: "fv-cu-9",
      },
    ],
  };

  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("uses the ACTIVE rule's exact formId, not a name match", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(rules)
      .mockResolvedValueOnce(versions)
      .mockResolvedValueOnce({ status: "scheduled", instanceId: "inst-1" });
    const { createExtra } =
      await import("../../components/canvas/data/checkins");
    const out = await createExtra(input);
    expect(out).toEqual({ instanceId: "inst-1" });
    const [url, opts] = vi.mocked(apiFetch).mock.calls[2];
    expect(url).toBe(`${base}/instances`);
    expect(opts?.body).toMatchObject({
      clientProfileId: "cp-1",
      formId: "form-weekly",
      formVersionId: "fv-wk-2",
      dueTz: "Europe/Vienna",
      coachNote: "knee check",
    });
  });

  it("refuses Custom — provisional mapping is gone, zero POSTs", async () => {
    const { createExtra } =
      await import("../../components/canvas/data/checkins");
    await expect(createExtra({ ...input, type: "Custom" })).rejects.toThrow(
      /Custom check-ins are not available/,
    );
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
  });

  it("refuses with no ACTIVE schedule — zero POSTs", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ items: [] });
    const { createExtra } =
      await import("../../components/canvas/data/checkins");
    await expect(createExtra(input)).rejects.toThrow(
      /No active check-in schedule/,
    );
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);
  });

  it("refuses when multiple ACTIVE forms are ambiguous — zero POSTs", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      items: [
        { formId: "form-weekly", status: "ACTIVE" },
        { formId: "form-other", status: "ACTIVE" },
      ],
    });
    const { createExtra } =
      await import("../../components/canvas/data/checkins");
    await expect(createExtra(input)).rejects.toThrow(/ambiguous/);
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);
  });

  it("picks the selected form's LATEST version only", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(rules)
      .mockResolvedValueOnce({
        options: [
          {
            position: 0,
            formName: "Weekly check-in",
            versionSeq: 1,
            formId: "form-weekly",
            formVersionId: "fv-wk-1",
          },
          {
            position: 1,
            formName: "Weekly check-in",
            versionSeq: 4,
            formId: "form-weekly",
            formVersionId: "fv-wk-4",
          },
        ],
      })
      .mockResolvedValueOnce({ status: "scheduled", instanceId: "inst-2" });
    const { createExtra } =
      await import("../../components/canvas/data/checkins");
    await createExtra(input);
    expect(vi.mocked(apiFetch).mock.calls[2][1]?.body).toMatchObject({
      formVersionId: "fv-wk-4",
    });
  });
});

describe("saveRecurringDays — existing-schedule edits (P593)", () => {
  const input = {
    workspaceId: "ws-1",
    clientProfileId: "cp-1",
    weekday: 1,
    add: true,
  };
  const rules = {
    items: [
      {
        ruleId: "r-tue",
        formId: "form-weekly",
        weekday: "TUESDAY",
        startDate: "2026-10-01",
        endDate: null,
        status: "ACTIVE",
      },
      {
        ruleId: "r-wed",
        formId: "form-weekly",
        weekday: "WEDNESDAY",
        startDate: "2026-10-01",
        endDate: null,
        status: "ENDED",
      },
    ],
  };

  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("creates a new weekday rule from the established formId then generates", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(rules)
      .mockResolvedValueOnce({ ruleId: "r-new" })
      .mockResolvedValueOnce({});
    const { saveRecurringDays } =
      await import("../../components/canvas/data/checkins");
    await saveRecurringDays({ ...input, weekday: 2 });
    const [u1, o1] = vi.mocked(apiFetch).mock.calls[1];
    expect(u1).toBe("/workspaces/ws-1/checkins/schedule-rules");
    expect(o1?.body).toMatchObject({
      formId: "form-weekly",
      weekday: "WEDNESDAY",
      timezone: "Europe/Vienna",
      replacesRuleId: "r-wed",
    });
    expect(vi.mocked(apiFetch).mock.calls[2][0]).toContain("r-new/generate");
  });

  it("ends an ACTIVE rule when the weekday is removed", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(rules)
      .mockResolvedValueOnce({ status: "ended" });
    const { saveRecurringDays } =
      await import("../../components/canvas/data/checkins");
    const out = await saveRecurringDays({ ...input, weekday: 1, add: false });
    expect(out.ruleId).toBe("r-tue");
    expect(vi.mocked(apiFetch).mock.calls[1][0]).toContain("r-tue/status");
  });

  it("refuses with no rules — first-create is not implemented", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ items: [] });
    const { saveRecurringDays } =
      await import("../../components/canvas/data/checkins");
    await expect(saveRecurringDays(input)).rejects.toThrow(
      /first recurring schedule/,
    );
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);
  });

  it("refuses when rules span multiple forms — zero writes", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      items: [
        ...rules.items,
        { ...rules.items[0], ruleId: "r-other", formId: "form-other" },
      ],
    });
    const { saveRecurringDays } =
      await import("../../components/canvas/data/checkins");
    await expect(saveRecurringDays(input)).rejects.toThrow(/ambiguous/);
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);
  });
});
