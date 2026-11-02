/**
 * W2-FE2 staff tracker: the values wire maps into the tab's `client.tracking`
 * shape (numeric values in entry values, text-family displays and coach notes
 * in tracking.text), and the note keys split back into the write shape.
 */
import { describe, expect, it } from "vitest";

import {
  mergeStaffTracking,
  staffNoteKeyToWire,
  staffNoteText,
  staffTrackerToTracking,
  type StaffTrackerValuesWire,
} from "../../components/canvas/data/tracker";
import { writeStaffTrackerNote } from "../../lib/daily-entry/service";
import { DailyEntryError } from "../../lib/daily-entry/gate";
import { AccessDeniedError } from "../../lib/auth/guard";

const ready: StaffTrackerValuesWire = {
  state: "ready",
  clientName: "Amara Lopez",
  entries: [
    {
      entryDate: "2026-10-08",
      values: [
        { parameterKey: "p_demo_weight", kind: "MEASUREMENT", display: "81.2" },
        { parameterKey: "p_seed_sleep", kind: "DURATION", display: "7.5" },
        { parameterKey: "mood_score", kind: "RATING", display: "8" },
        {
          parameterKey: "p_demo_training_feel",
          kind: "OPTION",
          display: "Strong",
        },
        { parameterKey: "p_demo_notes", kind: "TEXT", display: "felt easy" },
      ],
    },
    {
      entryDate: "2026-10-09",
      values: [
        { parameterKey: "p_demo_weight", kind: "MEASUREMENT", display: "80.9" },
      ],
    },
  ],
  cellNotes: [
    {
      entryDate: "2026-10-08",
      parameterKey: "p_demo_weight",
      body: "Down 0.4 kg",
    },
  ],
  dayNotes: [{ entryDate: "2026-10-08", body: "Solid day, keep the load" }],
  parameters: [
    { key: "p_demo_weight", kind: "MEASUREMENT" },
    { key: "p_seed_sleep", kind: "DURATION" },
    { key: "mood_score", kind: "RATING" },
    { key: "p_demo_training_feel", kind: "OPTION" },
    { key: "p_demo_notes", kind: "TEXT" },
    { key: "p_demo_cardio-duration", kind: "DURATION" },
  ],
};

describe("staffTrackerToTracking", () => {
  it("maps numeric kinds to entry values and text kinds to date slots", () => {
    const hydration = staffTrackerToTracking(ready);
    expect(hydration).not.toBeNull();
    expect(hydration?.tracking.entries).toEqual([
      {
        date: "2026-10-08",
        values: { weight: 81.2, sleep: 7.5, mood_score: 8 },
      },
      { date: "2026-10-09", values: { weight: 80.9 } },
    ]);
    expect(hydration?.tracking.text["2026-10-08:training_feel"]).toBe("Strong");
    expect(hydration?.tracking.text["2026-10-08:notes"]).toBe("felt easy");
  });

  it("strips the seed prefix and keeps a key without one unchanged", () => {
    const hydration = staffTrackerToTracking(ready);
    expect(hydration?.parameterKeys).toEqual({
      weight: "p_demo_weight",
      sleep: "p_seed_sleep",
      mood_score: "mood_score",
      training_feel: "p_demo_training_feel",
      notes: "p_demo_notes",
      "cardio-duration": "p_demo_cardio-duration",
    });
    expect(hydration?.tracking.entries[0].values).not.toHaveProperty(
      "p_demo_weight",
    );
  });

  it("lands cell notes and day notes in the note slots and the baseline", () => {
    const hydration = staffTrackerToTracking(ready);
    expect(hydration?.tracking.text["2026-10-08:note:weight"]).toBe(
      "Down 0.4 kg",
    );
    expect(hydration?.tracking.text["2026-10-08:coach-note"]).toBe(
      "Solid day, keep the load",
    );
    expect(hydration?.noteText).toEqual({
      "2026-10-08:note:weight": "Down 0.4 kg",
      "2026-10-08:coach-note": "Solid day, keep the load",
    });
  });

  it("drops blank displays and non-finite numerics", () => {
    const blank: StaffTrackerValuesWire = {
      state: "ready",
      clientName: "Amara Lopez",
      entries: [
        {
          entryDate: "2026-10-08",
          values: [
            { parameterKey: "p_demo_weight", kind: "MEASUREMENT", display: "" },
            {
              parameterKey: "p_seed_sleep",
              kind: "MEASUREMENT",
              display: "n/a",
            },
            { parameterKey: "mood_score", kind: "RATING", display: "Infinity" },
            {
              parameterKey: "p_demo_training_feel",
              kind: "OPTION",
              display: "",
            },
            { parameterKey: "p_demo_notes", kind: "TEXT", display: "" },
          ],
        },
      ],
      cellNotes: [],
      dayNotes: [],
      parameters: [{ key: "p_demo_weight", kind: "MEASUREMENT" }],
    };
    const hydration = staffTrackerToTracking(blank);
    expect(hydration?.tracking.entries).toEqual([
      { date: "2026-10-08", values: {} },
    ]);
    expect(hydration?.tracking.text).toEqual({});
    expect(hydration?.noteText).toEqual({});
  });

  it("returns null for a consent_missing wire", () => {
    expect(staffTrackerToTracking({ state: "consent_missing" })).toBeNull();
  });
});

describe("staffNoteText", () => {
  it("keeps only note and coach-note keys", () => {
    const text = {
      "2026-10-08:weight": "81.2",
      "2026-10-08:notes": "felt easy",
      "2026-10-08:note:weight": "Down 0.4 kg",
      "2026-10-08:coach-note": "Solid day, keep the load",
    };
    expect(staffNoteText(text)).toEqual({
      "2026-10-08:note:weight": "Down 0.4 kg",
      "2026-10-08:coach-note": "Solid day, keep the load",
    });
  });
});

describe("staffNoteKeyToWire", () => {
  it("sends a day note with no parameterKey", () => {
    const wire = staffNoteKeyToWire("2026-10-08:coach-note", {});
    expect(wire).toEqual({ entryDate: "2026-10-08" });
    expect(wire?.parameterKey).toBeUndefined();
  });

  it("returns null for a cell note on an unmapped column", () => {
    expect(staffNoteKeyToWire("2026-10-08:note:weigh-in", {})).toBeNull();
  });

  it("uses the learned parameter key when the map has one", () => {
    expect(
      staffNoteKeyToWire("2026-10-08:note:weight", {
        weight: "p_live_weight",
      }),
    ).toEqual({ entryDate: "2026-10-08", parameterKey: "p_live_weight" });
  });

  it("returns null for keys colliding with Object.prototype members", () => {
    // Without own-property lookup, `parameterKeys["hasOwnProperty"]` resolves
    // an inherited function and would fabricate a bogus parameter key.
    expect(staffNoteKeyToWire("2026-10-08:note:hasOwnProperty", {})).toBeNull();
    expect(staffNoteKeyToWire("2026-10-08:note:constructor", {})).toBeNull();
  });
});

describe("mergeStaffTracking", () => {
  it("keeps local-only derived-column notes while the server wins the rest", () => {
    const hydration = staffTrackerToTracking(ready)!;
    const local = {
      entries: [{ date: "2026-10-08", values: { weight: 99 } }],
      text: {
        "2026-10-08:note:weigh-in": "local derived note",
        "2026-10-08:note:weight": "stale server-mapped note",
        "2026-10-08:mood_score": "not a note key",
      },
    };
    const merged = mergeStaffTracking(local, hydration);
    // Unmapped derived-column note survives hydration.
    expect(merged.text["2026-10-08:note:weigh-in"]).toBe("local derived note");
    // Mapped note the server does not return is dropped (server deleted it).
    expect(merged.text["2026-10-08:note:weight"]).toBe("Down 0.4 kg");
    // Non-note local text never survives the merge.
    expect(merged.text["2026-10-08:mood_score"]).toBeUndefined();
    // Server entries replace local ones outright.
    expect(merged.entries).toEqual(hydration.tracking.entries);
  });
});

describe("writeStaffTrackerNote", () => {
  it("rejects calendar-invalid dates instead of rolling them over", async () => {
    const session = { user: { id: "user-1" } };
    const call = writeStaffTrackerNote(session, {
      workspaceId: "w",
      clientProfileId: "c",
      entryDate: "2026-02-31",
      body: "note",
    });
    await expect(call).rejects.toThrowError(DailyEntryError);
    await expect(
      writeStaffTrackerNote(session, {
        workspaceId: "w",
        clientProfileId: "c",
        entryDate: "2026-02-31",
        body: "note",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  const baseInput = {
    workspaceId: "w1",
    clientProfileId: "c1",
    entryDate: "2026-10-20",
    body: "note",
  };

  function fakeAuthDb(memberRole: string, assignment: unknown) {
    return {
      user: {
        findUnique: async () => ({
          id: "u1",
          platformRole: null,
          status: "ACTIVE",
        }),
      },
      workspace: { findUnique: async () => ({ id: "w1", status: "ACTIVE" }) },
      workspaceMember: {
        findUnique: async () => ({
          id: "m1",
          role: memberRole,
          status: "ACTIVE",
        }),
        findFirst: async () => ({ id: "m1" }),
      },
      clientProfile: {
        findFirst: async () => ({ id: "c1", workspaceId: "w1", userId: "cu" }),
      },
      clientAssignment: { findFirst: async () => assignment },
    };
  }

  it("denies an unassigned same-workspace coach via coachNotes/write", async () => {
    const session = { user: { id: "u1" } };
    await expect(
      writeStaffTrackerNote(session, baseInput, {
        db: fakeAuthDb("COACH", null) as never,
      }),
    ).rejects.toMatchObject({ reason: "not_assigned" });
  });

  it("denies the workspace owner under the rbac coachNotes matrix", async () => {
    const session = { user: { id: "u1" } };
    await expect(
      writeStaffTrackerNote(session, baseInput, {
        db: fakeAuthDb("WORKSPACE_OWNER", { id: "a1" }) as never,
      }),
    ).rejects.toMatchObject({ reason: "role_denied" });
  });

  it("rejects a whitespace-only parameterKey instead of touching the day note", async () => {
    const dayDeletes: unknown[] = [];
    const db = {
      ...fakeAuthDb("COACH", { id: "a1" }),
      trackerDayNote: {
        upsert: async () => ({}),
        deleteMany: async (args: unknown) => {
          dayDeletes.push(args);
          return {};
        },
      },
      trackerComment: {
        upsert: async () => ({}),
        deleteMany: async () => ({}),
      },
      parameterDefinition: { findFirst: async () => null },
    };
    await expect(
      writeStaffTrackerNote(
        { user: { id: "u1" } },
        { ...baseInput, parameterKey: "   ", body: "" },
        { db: db as never },
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(dayDeletes).toHaveLength(0);
  });

  it("lets an assigned coach reach the day-note upsert", async () => {
    const upserts: unknown[] = [];
    const db = {
      ...fakeAuthDb("COACH", { id: "a1" }),
      trackerDayNote: {
        upsert: async (args: unknown) => {
          upserts.push(args);
          return {};
        },
        deleteMany: async () => ({}),
      },
      trackerComment: {
        upsert: async () => ({}),
        deleteMany: async () => ({}),
      },
      parameterDefinition: { findFirst: async () => null },
    };
    const out = await writeStaffTrackerNote({ user: { id: "u1" } }, baseInput, {
      db: db as never,
    });
    expect(out).toEqual({ state: "ok" });
    expect(upserts).toHaveLength(1);
  });
});
