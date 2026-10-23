// TRAINING-I1A (PROMPT 244) — pure-module contract tests: draft
// boundary-document strictness, override-boundary materialization
// (the required 3,3,3,6,6,5,5 counterexample), publish completeness,
// client fieldConfig projection, and anchor week math (gvAt, spans,
// markers, ceiling, boundary fold).

import { describe, expect, it } from "vitest";

import {
  canonicalDraftContent,
  emptyTrainingDraft,
  materializeWeeks,
  normalizeFieldConfig,
  normalizeTrainingDraft,
  validatePublishCompleteness,
  TrainingError,
  type TrainingDraft,
} from "../../lib/trainingprogram/payload";
import {
  addDays,
  boundaryInstant,
  ceiling,
  governedSpan,
  gvAt,
  isShadowed,
  localDateOf,
  versionForWeek,
  weekIndex,
  weekMarker,
  weekStartInstant,
  type VersionInstant,
} from "../../lib/trainingprogram/weeks";

const CFG_ALL_ON = {
  sets: true,
  fixedReps: true,
  repRanges: true,
  tempo: true,
  setType: true,
  restPause: true,
  instructions: true,
  progressionNotes: true,
};

function baseDraft(): TrainingDraft {
  return {
    programMode: "WEEK_BASED",
    sessions: [{ id: "s1", name: "Day A" }],
    exercises: [
      { id: "e1", sessionId: "s1", name: "Squat" },
      { id: "e2", sessionId: "s1", name: "Bench" },
    ],
    sessionOrder: {},
    exerciseOrder: {},
    sessionPresence: { s1: { "1": true } },
    exercisePresence: { "s1/e1": { "1": true }, "s1/e2": { "1": true } },
    sessionNames: {},
    fieldCells: {},
    setRows: {},
  };
}

describe("normalizeTrainingDraft — strictness", () => {
  it("accepts a minimal valid draft", () => {
    expect(normalizeTrainingDraft(baseDraft())).toEqual(baseDraft());
  });
  it("rejects unknown top-level keys, unknown modes, and dangling nodes", () => {
    expect(() => normalizeTrainingDraft({ ...baseDraft(), bogus: 1 })).toThrow(
      TrainingError,
    );
    expect(() =>
      normalizeTrainingDraft({ ...baseDraft(), programMode: "DAILY" }),
    ).toThrow(TrainingError);
    expect(() =>
      normalizeTrainingDraft({
        ...baseDraft(),
        sessionPresence: { ghost: { "1": true } },
      }),
    ).toThrow(TrainingError);
    expect(() =>
      normalizeTrainingDraft({
        ...baseDraft(),
        fieldCells: { "s1/e1/unknown": { "1": "x" } },
      }),
    ).toThrow(TrainingError);
    expect(() =>
      normalizeTrainingDraft({
        ...baseDraft(),
        fieldCells: { "s1/ghost/sets": { "1": 3 } },
      }),
    ).toThrow(TrainingError);
    // Invalid week keys and out-of-range values.
    expect(() =>
      normalizeTrainingDraft({
        ...baseDraft(),
        fieldCells: { "s1/e1/sets": { "0": 3 } },
      }),
    ).toThrow(TrainingError);
    expect(() =>
      normalizeTrainingDraft({
        ...baseDraft(),
        fieldCells: { "s1/e1/sets": { "3": 21 } },
      }),
    ).toThrow(TrainingError);
    // Duplicate ids / foreign sessionId.
    expect(() =>
      normalizeTrainingDraft({
        ...baseDraft(),
        sessions: [
          { id: "s1", name: "A" },
          { id: "s1", name: "B" },
        ],
      }),
    ).toThrow(TrainingError);
    expect(() =>
      normalizeTrainingDraft({
        ...baseDraft(),
        exercises: [{ id: "e9", sessionId: "ghost", name: "X" }],
      }),
    ).toThrow(TrainingError);
  });
});

describe("normalizeFieldConfig", () => {
  it("accepts subsets, rejects unknown keys and non-booleans", () => {
    expect(normalizeFieldConfig({ sets: true, tempo: false })).toEqual({
      ...Object.fromEntries(
        [
          "sets",
          "fixedReps",
          "repRanges",
          "tempo",
          "setType",
          "restPause",
          "instructions",
          "progressionNotes",
        ].map((k) => [k, false]),
      ),
      sets: true,
    });
    expect(() => normalizeFieldConfig({ bogus: true })).toThrow(TrainingError);
    expect(() => normalizeFieldConfig({ sets: "yes" })).toThrow(TrainingError);
  });
});

describe("materializeWeeks — override-boundary resolution (P4 §3)", () => {
  it("required counterexample: w1=3, w4=4, w6=5, then edit w4=6 → 3,3,3,6,6,5,5", () => {
    const draft = baseDraft();
    draft.fieldCells["s1/e1/sets"] = { "1": 3, "4": 6, "6": 5 };
    const m = materializeWeeks(draft, "2026-01-05", 7);
    const sets = m.weeks.map(
      (w) => w.sessions[0]?.exercises.find((e) => e.id === "e1")?.sets,
    );
    expect(sets).toEqual([3, 3, 3, 6, 6, 5, 5]);
  });
  it("order-independence: boundary set determines weeks, not commit order", () => {
    const a = baseDraft();
    a.fieldCells["s1/e1/sets"] = { "1": 3, "4": 6, "6": 5 };
    const b = baseDraft();
    b.fieldCells["s1/e1/sets"] = { "6": 5, "4": 6, "1": 3 };
    expect(materializeWeeks(a, "2026-01-05", 7)).toEqual(
      materializeWeeks(b, "2026-01-05", 7),
    );
  });
  it("equal-valued explicit override protects the week from earlier edits", () => {
    const draft = baseDraft();
    // w5 explicit 3 (= inherited); later w1 edit to 9 must not touch w5.
    draft.fieldCells["s1/e1/sets"] = { "1": 3, "5": 3, "6": 5 };
    draft.fieldCells["s1/e1/sets"]["1"] = 9;
    const m = materializeWeeks(draft, "2026-01-05", 7);
    const sets = m.weeks.map(
      (w) => w.sessions[0]?.exercises.find((e) => e.id === "e1")?.sets,
    );
    expect(sets).toEqual([9, 9, 9, 9, 3, 5, 5]);
  });
  it("absence boundaries: remove at w3 → hidden; re-add at w5 → values return", () => {
    const draft = baseDraft();
    draft.exercisePresence["s1/e2"] = { "1": true, "3": false, "5": true };
    draft.fieldCells["s1/e2/reps"] = { "1": "8" };
    const m = materializeWeeks(draft, "2026-01-05", 6);
    const count = (w: number) =>
      m.weeks[w - 1].sessions[0]?.exercises.filter((e) => e.id === "e2").length;
    expect([1, 2, 3, 4, 5, 6].map(count)).toEqual([1, 1, 0, 0, 1, 1]);
    expect(
      m.weeks[4].sessions[0]?.exercises.find((e) => e.id === "e2")?.reps,
    ).toBe("8");
  });
  it("session/exercise order boundaries apply from their week", () => {
    const draft = baseDraft();
    draft.sessions.push({ id: "s2", name: "Day B" });
    draft.sessionPresence["s2"] = { "1": true };
    draft.sessionOrder = { "3": ["s2", "s1"] };
    const m = materializeWeeks(draft, "2026-01-05", 4);
    expect(m.weeks[0].sessions.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(m.weeks[2].sessions.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(m.weeks[3].sessions.map((s) => s.id)).toEqual(["s2", "s1"]);
  });
  it("session name boundaries resolve per week; declaration name is fallback", () => {
    const draft = baseDraft();
    draft.sessionNames = { s1: { "2": "Deload day" } };
    const m = materializeWeeks(draft, "2026-01-05", 3);
    expect(m.weeks[0].sessions[0].name).toBe("Day A");
    expect(m.weeks[1].sessions[0].name).toBe("Deload day");
    expect(m.weeks[2].sessions[0].name).toBe("Deload day");
  });
  it("weekCount shrink truncates materialization; sparse boundaries retained", () => {
    const draft = baseDraft();
    draft.fieldCells["s1/e1/sets"] = { "1": 3, "10": 9 };
    const m = materializeWeeks(draft, "2026-01-05", 4);
    expect(m.weeks).toHaveLength(4);
    expect(m.weeks[3].sessions[0]?.exercises[0]?.sets).toBe(3);
    // Boundary @10 still in the draft — re-extending restores it.
    const m2 = materializeWeeks(draft, "2026-01-05", 12);
    expect(m2.weeks[9].sessions[0]?.exercises[0]?.sets).toBe(9);
  });
});

describe("validatePublishCompleteness", () => {
  it("requires ≥1 exercise; sets/reps required only when toggled", () => {
    const draft = baseDraft();
    draft.fieldCells["s1/e1/sets"] = { "1": 3 };
    draft.fieldCells["s1/e1/reps"] = { "1": "8" };
    draft.fieldCells["s1/e2/sets"] = { "1": 4 };
    draft.fieldCells["s1/e2/reps"] = { "1": "6" };
    expect(() =>
      validatePublishCompleteness(
        materializeWeeks(draft, "2026-01-05", 2),
        CFG_ALL_ON,
      ),
    ).not.toThrow();
    // Every materialized exercise must satisfy the enabled required
    // fields — a second exercise without them is still incomplete.
    const halfDone = baseDraft();
    halfDone.fieldCells["s1/e1/sets"] = { "1": 3 };
    halfDone.fieldCells["s1/e1/reps"] = { "1": "8" };
    expect(() =>
      validatePublishCompleteness(
        materializeWeeks(halfDone, "2026-01-05", 2),
        CFG_ALL_ON,
      ),
    ).toThrow(TrainingError);
    const noReps = baseDraft();
    noReps.exercisePresence["s1/e2"] = { "1": false };
    noReps.fieldCells["s1/e1/sets"] = { "1": 3 };
    expect(() =>
      validatePublishCompleteness(
        materializeWeeks(noReps, "2026-01-05", 2),
        CFG_ALL_ON,
      ),
    ).toThrow(TrainingError);
    // reps not required when both rep toggles off.
    const cfgNoReps = { ...CFG_ALL_ON, fixedReps: false, repRanges: false };
    expect(() =>
      validatePublishCompleteness(
        materializeWeeks(noReps, "2026-01-05", 2),
        cfgNoReps,
      ),
    ).not.toThrow();
    // sets not required when toggle off.
    const cfgNoSets = { ...CFG_ALL_ON, sets: false, fixedReps: true };
    const noSets = baseDraft();
    noSets.exercisePresence["s1/e2"] = { "1": false };
    noSets.fieldCells["s1/e1/reps"] = { "1": "8" };
    expect(() =>
      validatePublishCompleteness(
        materializeWeeks(noSets, "2026-01-05", 2),
        cfgNoSets,
      ),
    ).not.toThrow();
    // Empty program → incomplete.
    expect(() =>
      validatePublishCompleteness(
        materializeWeeks(emptyTrainingDraft(), "2026-01-05", 2),
        CFG_ALL_ON,
      ),
    ).toThrow(TrainingError);
  });
});

describe("canonicalDraftContent — `changed` marker identity (G)", () => {
  it("covers the complete draft including confirmedTimezone", () => {
    const a = {
      title: "P",
      startDate: "2026-01-05",
      weekCount: 8,
      fieldConfig: normalizeFieldConfig(CFG_ALL_ON),
      confirmedTimezone: "UTC" as string | null,
      draft: baseDraft(),
    };
    expect(canonicalDraftContent(a) === canonicalDraftContent({ ...a })).toBe(
      true,
    );
    expect(
      canonicalDraftContent(a) ===
        canonicalDraftContent({ ...a, confirmedTimezone: "Pacific/Auckland" }),
    ).toBe(false);
    expect(
      canonicalDraftContent(a) === canonicalDraftContent({ ...a, title: "P2" }),
    ).toBe(false);
  });
});

// ── weeks.ts — anchor math, gvAt, spans, markers ─────────────────────────

const V = (
  seq: number,
  activationIso: string,
  effectiveDate = activationIso.slice(0, 10),
): VersionInstant => ({
  id: `v${seq}`,
  versionSeq: seq,
  effectiveDate,
  effectiveTimezone: "UTC",
  activationInstant: new Date(activationIso),
  publishedAt: new Date(activationIso),
});

describe("week math under the immutable anchor", () => {
  it("weekIndex and boundary instants are pure local-date arithmetic", () => {
    expect(weekIndex("2026-01-05", "2026-01-04")).toBeLessThanOrEqual(0);
    expect(weekIndex("2026-01-05", "2026-01-05")).toBe(1);
    expect(weekIndex("2026-01-05", "2026-01-11")).toBe(1);
    expect(weekIndex("2026-01-05", "2026-01-12")).toBe(2);
    expect(addDays("2026-01-05", 14)).toBe("2026-01-19");
    const s = weekStartInstant("UTC", "2026-01-05", 2);
    expect(s.toISOString()).toBe("2026-01-12T00:00:00.000Z");
  });
  it("boundaryInstant folds a skipped local date forward (Apia 2011-12-30)", () => {
    const b = boundaryInstant("Pacific/Apia", "2011-12-30");
    // Whole-day skip → next representable local midnight: 2011-12-31 +13.
    expect(localDateOf(b, "Pacific/Apia")).toBe("2011-12-31");
  });
  it("ceiling = count of locked weeks under the anchor; high-water is floor only", () => {
    const now = new Date("2026-01-26T00:00:00Z"); // local wk4 of an 8-wk program
    expect(ceiling("UTC", "2026-01-05", 8, 0, now)).toBe(3);
    expect(ceiling("UTC", "2026-01-05", 8, 2, now)).toBe(3);
    // After program end, all weeks locked.
    const later = new Date("2026-04-01T00:00:00Z");
    expect(ceiling("UTC", "2026-01-05", 8, 0, later)).toBe(8);
  });
});

describe("gvAt / governed spans (P8 §5)", () => {
  it("selects greatest seq with activation ≤ t and < cutoff", () => {
    const vs = [
      V(1, "2026-01-05T00:00:00Z"),
      V(2, "2026-01-12T00:00:00Z"),
      V(3, "2026-01-19T00:00:00Z"),
    ];
    expect(gvAt(vs, new Date("2026-01-15T00:00:00Z"), null)?.versionSeq).toBe(
      2,
    );
    expect(
      gvAt(
        vs,
        new Date("2026-01-15T00:00:00Z"),
        new Date("2026-01-12T00:00:00Z"),
      )?.versionSeq,
    ).toBe(1);
    expect(gvAt(vs, new Date("2026-01-01T00:00:00Z"), null)).toBeNull();
  });
  it("activation exactly at t is eligible (inclusive boundary)", () => {
    const vs = [
      V(1, "2026-01-05T00:00:00Z"),
      V(2, "2026-01-12T00:00:00Z"),
      V(3, "2026-01-19T00:00:00Z"),
    ];
    // t == activationInstant exactly → eligible; greatest seq wins.
    expect(gvAt(vs, new Date("2026-01-12T00:00:00Z"), null)?.versionSeq).toBe(
      2,
    );
    expect(gvAt(vs, new Date("2026-01-19T00:00:00Z"), null)?.versionSeq).toBe(
      3,
    );
    // The cutoff stays exclusive at the same instant.
    expect(
      gvAt(
        vs,
        new Date("2026-01-19T00:00:00Z"),
        new Date("2026-01-19T00:00:00Z"),
      )?.versionSeq,
    ).toBe(2);
  });
  it("shadowed versions have null spans; cutoff trims", () => {
    const vs = [
      V(1, "2026-01-05T00:00:00Z"),
      V(2, "2026-02-16T00:00:00Z"), // activates later…
      V(3, "2026-01-19T00:00:00Z"), // …but a later seq activates first
    ];
    expect(isShadowed(vs, vs[1])).toBe(true);
    expect(governedSpan(vs, vs[1], null)).toBeNull();
    expect(governedSpan(vs, vs[0], null)?.to).toEqual(
      new Date("2026-01-19T00:00:00Z"),
    );
    // A version activating at/after the successor cutoff never governs.
    expect(
      governedSpan(vs, vs[2], new Date("2026-01-10T00:00:00Z")),
    ).toBeNull();
    // A version activating before the cutoff spans until it.
    expect(
      governedSpan(vs, vs[2], new Date("2026-02-01T00:00:00Z"))?.to,
    ).toEqual(new Date("2026-02-01T00:00:00Z"));
    expect(
      governedSpan(vs, vs[0], new Date("2026-02-01T00:00:00Z"))?.to,
    ).toEqual(new Date("2026-01-19T00:00:00Z"));
  });
});

describe("versionForWeek + marker (P8 §5.2/§5.4)", () => {
  const start = "2026-01-05";
  const vs = [
    V(1, "2026-01-05T00:00:00Z"),
    V(2, "2026-01-14T00:00:00Z"), // mid-week-2 revision
  ];
  it("past week → last governing at week end; future → week-start; current → now", () => {
    const past = versionForWeek(
      vs,
      "UTC",
      start,
      1,
      new Date("2026-02-01T00:00:00Z"),
      null,
    );
    expect(past.state).toBe("past");
    expect(past.version?.versionSeq).toBe(1);
    const cur = versionForWeek(
      vs,
      "UTC",
      start,
      2,
      new Date("2026-01-15T12:00:00Z"),
      null,
    );
    expect(cur.state).toBe("current");
    expect(cur.version?.versionSeq).toBe(2);
    const fut = versionForWeek(
      vs,
      "UTC",
      start,
      4,
      new Date("2026-01-15T12:00:00Z"),
      null,
    );
    expect(fut.state).toBe("scheduled");
    expect(fut.version?.versionSeq).toBe(2); // governs at week-4 start
    const fut2 = versionForWeek(
      vs,
      "UTC",
      start,
      3,
      new Date("2026-01-10T00:00:00Z"),
      null,
    );
    // gvAt(weekStart): v2 (Jan 14) activates before week-3 start (Jan 19)
    // — the committed version governs the week start; scheduled, never
    // presented as current.
    expect(fut2.version?.versionSeq).toBe(2);
  });
  it("marker: mid-week revision labelled updated/updates; first publish never", () => {
    const t = new Date("2026-01-15T00:00:00Z");
    expect(weekMarker(vs, "UTC", start, 2, t)).toEqual({
      label: "updated",
      effectiveDate: "2026-01-14",
    });
    // Before v2 activates the marker is future tense.
    const before = new Date("2026-01-13T00:00:00Z");
    expect(weekMarker(vs, "UTC", start, 2, before)).toEqual({
      label: "updates",
      effectiveDate: "2026-01-14",
    });
    // Week 1: no prior prescription → no marker.
    expect(weekMarker(vs, "UTC", start, 1, t)).toBeNull();
  });
});

describe("TRAINING-I1B-1 — Evergreen mode", () => {
  it("normalizeTrainingDraft accepts EVERGREEN; unknown modes still reject", () => {
    const d = normalizeTrainingDraft({
      ...baseDraft(),
      programMode: "EVERGREEN",
    });
    expect(d.programMode).toBe("EVERGREEN");
  });
  it("materializeWeeks stamps programMode; evergreen materializes one week", () => {
    const eg: TrainingDraft = { ...baseDraft(), programMode: "EVERGREEN" };
    const m = materializeWeeks(eg, "2026-10-05", 1);
    expect(m.programMode).toBe("EVERGREEN");
    expect(m.weeks).toHaveLength(1);
    expect(m.weeks[0].week).toBe(1);
    // Retained out-of-range boundary keys stay inert for week 1.
    const carried: TrainingDraft = {
      ...eg,
      fieldCells: { "s1/e1/sets": { "1": 3, "5": 9 } },
    };
    const m2 = materializeWeeks(carried, "2026-10-05", 1);
    expect(m2.weeks[0].sessions[0].exercises[0].sets).toBe(3);
  });
});
