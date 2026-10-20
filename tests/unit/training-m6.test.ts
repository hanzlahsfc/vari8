// PR-M6 — ordered per-set prescriptions, exercise metadata, the O5
// set-logging model, and the shared muscle-volume math (D29, canvas
// port). Guards what a browser cannot check by eye: literal working-set
// counts per muscle group for the canvas demo program, draft round-trip
// of ordered set rows, per-field client projection, and boundary
// validation of the log and library shapes.

import { describe, expect, it } from "vitest";

import {
  MUSCLE_GROUPS,
  programMuscleVolume,
  volumeExerciseId,
  weeklyMuscleVolume,
} from "../../lib/training/volume";
import {
  emptyTrainingDraft,
  materializeWeeks,
  normalizeTrainingDraft,
  projectForClient,
  TrainingError,
  validatePublishCompleteness,
  type MaterializedProgram,
  type TrainingDraft,
} from "../../lib/trainingprogram/payload";
import {
  exerciseLibraryItemInputSchema,
  sessionSetLogSchema,
} from "../../lib/trainingprogram/validators";

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

// The canvas demo program exactly as the sample program draws it
// (frontend/src/components/ethereal/builder/model.ts workoutSchedule,
// week 6): Lower strength + Upper strength.
const DEMO_WEEK6 = [
  {
    week: 6,
    exercises: [
      { id: "deadlift", sets: 4 },
      { id: "split-squat", sets: 3 },
      { id: "bench", sets: 4 },
      { id: "row", sets: 3 },
    ],
  },
];

describe("weeklyMuscleVolume — canvas demo program literals", () => {
  it("counts literal working sets per group for the demo week", () => {
    const v = weeklyMuscleVolume(DEMO_WEEK6, 6);
    expect(v.totalSets).toBe(14);
    expect(v.unassignedSets).toBe(0);
    const sets = Object.fromEntries(v.groups.map((g) => [g.id, g.sets]));
    expect(sets).toEqual({
      chest: 4,
      back: 3,
      shoulders: 0,
      biceps: 0,
      triceps: 0,
      core: 0,
      glutes: 3,
      quadriceps: 0,
      hamstrings: 4,
      calves: 0,
    });
    const intensity = Object.fromEntries(
      v.groups.map((g) => [g.id, g.intensity]),
    );
    expect(intensity.chest).toBe(1);
    expect(intensity.hamstrings).toBe(1);
    expect(intensity.back).toBe(0.75);
    expect(intensity.glutes).toBe(0.75);
    expect(intensity.calves).toBe(0);
  });

  it("ignores other weeks and unmapped exercises", () => {
    const v = weeklyMuscleVolume(
      [
        { week: 5, exercises: [{ id: "deadlift", sets: 9 }] },
        {
          week: 6,
          exercises: [
            { id: "deadlift", sets: 4 },
            { id: "mystery", sets: 2 },
          ],
        },
      ],
      6,
    );
    expect(v.totalSets).toBe(6);
    expect(v.unassignedSets).toBe(2);
    expect(v.groups.find((g) => g.id === "hamstrings")?.sets).toBe(4);
  });
});

describe("programMuscleVolume — materialized sessions", () => {
  it("maps muscle fields and drops warm-up set rows", () => {
    const v = programMuscleVolume(
      [
        {
          exercises: [
            {
              id: "e-dead",
              muscle: "hamstrings",
              setRows: [
                {
                  id: "a",
                  reps: 4,
                  tempo: "",
                  type: "Warm-up",
                  rest: "",
                  instructions: "",
                },
                {
                  id: "b",
                  reps: 4,
                  tempo: "",
                  type: "Working",
                  rest: "",
                  instructions: "",
                },
                {
                  id: "c",
                  reps: 4,
                  tempo: "",
                  type: "working",
                  rest: "",
                  instructions: "",
                },
              ],
            },
            { id: "e-ss", muscle: "glutes", sets: 3 },
          ],
        },
        {
          exercises: [
            { id: "e-bench", muscle: "chest", sets: 4 },
            { id: "e-row", muscle: "back", sets: 3 },
          ],
        },
      ],
      6,
    );
    const sets = Object.fromEntries(v.groups.map((g) => [g.id, g.sets]));
    expect(sets.hamstrings).toBe(2);
    expect(sets.glutes).toBe(3);
    expect(sets.chest).toBe(4);
    expect(sets.back).toBe(3);
    expect(v.totalSets).toBe(12);
    expect(v.unassignedSets).toBe(0);
  });

  it("volumeExerciseId prefers the muscle allocation over the id", () => {
    expect(volumeExerciseId("whatever", "chest")).toBe("bench");
    expect(volumeExerciseId("deadlift", "glutes")).toBe("hip-thrust");
    expect(volumeExerciseId("deadlift")).toBe("deadlift");
    expect(volumeExerciseId("x", "not-a-group")).toBe("x");
  });

  it("every library muscle id is a canvas muscle group", () => {
    expect(MUSCLE_GROUPS.map((g) => g.id)).toEqual([
      "chest",
      "back",
      "shoulders",
      "biceps",
      "triceps",
      "core",
      "glutes",
      "quadriceps",
      "hamstrings",
      "calves",
    ]);
  });
});

function draftWithSets(): TrainingDraft {
  return {
    ...emptyTrainingDraft("WEEK_BASED"),
    sessions: [
      { id: "s-lower", name: "Lower strength" },
      { id: "s-upper", name: "Upper strength" },
    ],
    exercises: [
      {
        id: "e-dead",
        sessionId: "s-lower",
        name: "Deadlift",
        muscle: "hamstrings",
        secondaryMuscles: ["glutes", "back"],
        generalNotes: "Build tension before lifting.",
        libraryItemId: "lib-deadlift",
      },
      { id: "e-bench", sessionId: "s-upper", name: "Bench press" },
    ],
    sessionPresence: { "s-lower": { "1": true }, "s-upper": { "1": true } },
    exercisePresence: {
      "s-lower/e-dead": { "1": true },
      "s-upper/e-bench": { "1": true },
    },
    setRows: {
      "s-lower/e-dead": {
        "1": [
          {
            id: "w1",
            reps: 4,
            repsMax: 5,
            tempo: "31X0",
            type: "Warm-up",
            rest: "90s",
            instructions: "Smooth pull",
            coachNote: "Keep the brace",
          },
          {
            id: "w2",
            reps: 4,
            tempo: "31X0",
            type: "Working",
            rest: "180s",
            instructions: "",
          },
          {
            id: "w3",
            reps: 4,
            tempo: "",
            type: "Working",
            rest: "180s",
            instructions: "",
          },
          {
            id: "w4",
            reps: 4,
            tempo: "",
            type: "Working",
            rest: "180s",
            instructions: "",
          },
        ],
      },
      "s-upper/e-bench": {
        "1": [
          {
            id: "b1",
            reps: 6,
            tempo: "",
            type: "Working",
            rest: "",
            instructions: "",
          },
          {
            id: "b2",
            reps: 6,
            tempo: "",
            type: "Working",
            rest: "",
            instructions: "",
          },
        ],
        "3": [
          {
            id: "b3",
            reps: 8,
            tempo: "",
            type: "Working",
            rest: "",
            instructions: "",
          },
        ],
      },
    },
  };
}

describe("normalizeTrainingDraft — setRows and exercise metadata", () => {
  it("round-trips ordered set rows and metadata unchanged", () => {
    const draft = draftWithSets();
    expect(normalizeTrainingDraft(draft)).toEqual(draft);
  });

  it("rejects dangling setRows keys, bad rows and unknown muscle ids", () => {
    const draft = draftWithSets();
    expect(() =>
      normalizeTrainingDraft({
        ...draft,
        setRows: { "s-lower/ghost": { "1": [] } },
      }),
    ).toThrow(TrainingError);
    expect(() =>
      normalizeTrainingDraft({
        ...draft,
        setRows: {
          "s-lower/e-dead": {
            "1": [
              {
                id: "x",
                reps: 0,
                tempo: "",
                type: "Working",
                rest: "",
                instructions: "",
              },
            ],
          },
        },
      }),
    ).toThrow(TrainingError);
    expect(() =>
      normalizeTrainingDraft({
        ...draft,
        exercises: [
          { ...draft.exercises[0], muscle: "not-a-group" },
          draft.exercises[1],
        ],
      }),
    ).toThrow(TrainingError);
    expect(() =>
      normalizeTrainingDraft({
        ...draft,
        exercises: [
          { ...draft.exercises[0], secondaryMuscles: ["toes"] },
          draft.exercises[1],
        ],
      }),
    ).toThrow(TrainingError);
  });
});

describe("materializeWeeks — ordered sets per week", () => {
  it("emits ordered setRows, derives the set count, carries metadata", () => {
    const m = materializeWeeks(draftWithSets(), "2026-09-14", 3);
    const w1 = m.weeks[0].sessions[0].exercises[0];
    expect(w1.muscle).toBe("hamstrings");
    expect(w1.secondaryMuscles).toEqual(["glutes", "back"]);
    expect(w1.libraryItemId).toBe("lib-deadlift");
    expect(w1.generalNotes).toBe("Build tension before lifting.");
    expect(w1.setRows?.map((r) => r.id)).toEqual(["w1", "w2", "w3", "w4"]);
    expect(w1.sets).toBe(4);
    const w3bench = m.weeks[2].sessions[1].exercises[0];
    expect(w3bench.setRows?.map((r) => r.id)).toEqual(["b3"]);
    expect(w3bench.sets).toBe(1);
    const w2bench = m.weeks[1].sessions[1].exercises[0];
    expect(w2bench.setRows?.map((r) => r.id)).toEqual(["b1", "b2"]);
  });
});

describe("projectForClient — per-set field gating", () => {
  function projected(cfg: Partial<typeof CFG_ALL_ON>) {
    const m = materializeWeeks(draftWithSets(), "2026-09-14", 1);
    const out = projectForClient(m, { ...CFG_ALL_ON, ...cfg });
    return out.weeks[0].sessions[0].exercises[0];
  }

  it("drops setRows when the Sets toggle is off", () => {
    const ex = projected({ sets: false });
    expect(ex.setRows).toBeUndefined();
    expect(ex.sets).toBeUndefined();
  });

  it("strips reps, tempo, type, rest and instructions per toggle but keeps coachNote", () => {
    const ex = projected({
      fixedReps: false,
      repRanges: false,
      tempo: false,
      setType: false,
      restPause: false,
      instructions: false,
    });
    const row = ex.setRows?.[0];
    expect(row).toBeDefined();
    expect(row?.reps).toBeUndefined();
    expect(row?.repsMax).toBeUndefined();
    expect(row?.tempo).toBeUndefined();
    expect(row?.type).toBeUndefined();
    expect(row?.rest).toBeUndefined();
    expect(row?.instructions).toBeUndefined();
    expect(row?.coachNote).toBe("Keep the brace");
    expect(row?.id).toBe("w1");
  });
});

describe("validatePublishCompleteness — setRows satisfy sets and reps", () => {
  it("publishes a program whose prescriptions live in setRows only", () => {
    const m: MaterializedProgram = materializeWeeks(
      draftWithSets(),
      "2026-09-14",
      1,
    );
    expect(() => validatePublishCompleteness(m, CFG_ALL_ON)).not.toThrow();
  });
});

describe("validators — O5 set-logging model", () => {
  it("accepts a full session log with per-set actuals, note and flags", () => {
    const log = sessionSetLogSchema.parse({
      programId: "prog1",
      versionId: "ver1",
      sessionId: "s-lower",
      week: 6,
      performedDate: "2026-10-19",
      exercises: [
        {
          exerciseId: "e-dead",
          sets: [
            {
              setId: "w1",
              actualReps: 5,
              load: 60,
              loadUnit: "kg",
              rpe: 8,
              note: "Left knee felt unsettled near the bottom.",
              flags: ["checkin-review"],
            },
            { setId: "w2", actualReps: 4, load: 62.5, loadUnit: "kg" },
          ],
        },
      ],
      completedAt: "2026-10-19T07:42:00Z",
    });
    expect(log.exercises[0].sets[0].flags).toEqual(["checkin-review"]);
  });

  it("rejects out-of-range rpe, non-integer reps and oversized flag lists", () => {
    const base = {
      sessionId: "s1",
      week: 1,
      performedDate: "2026-10-19",
      exercises: [{ exerciseId: "e1", sets: [{ setId: "a", actualReps: 8 }] }],
    };
    expect(
      sessionSetLogSchema.safeParse({
        ...base,
        exercises: [
          { exerciseId: "e1", sets: [{ setId: "a", actualReps: 8, rpe: 11 }] },
        ],
      }).success,
    ).toBe(false);
    expect(
      sessionSetLogSchema.safeParse({
        ...base,
        exercises: [
          { exerciseId: "e1", sets: [{ setId: "a", actualReps: 8.5 }] },
        ],
      }).success,
    ).toBe(false);
    expect(
      sessionSetLogSchema.safeParse({
        ...base,
        exercises: [
          {
            exerciseId: "e1",
            sets: [
              { setId: "a", actualReps: 8, flags: ["a", "b", "c", "d", "e"] },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      sessionSetLogSchema.safeParse({ ...base, performedDate: "19-10-2026" })
        .success,
    ).toBe(false);
  });
});

describe("validators — coach-editable exercise library", () => {
  it("accepts the canvas ExerciseDefinition write shape", () => {
    const item = exerciseLibraryItemInputSchema.parse({
      name: "Back squat",
      muscle: "quadriceps",
      secondaryMuscles: ["glutes", "core"],
      notes: "Brace before each rep; keep the whole foot grounded.",
      catalogItemId: "cat-42",
    });
    expect(item.muscle).toBe("quadriceps");
  });

  it("rejects an unknown primary muscle and blank names", () => {
    expect(
      exerciseLibraryItemInputSchema.safeParse({
        name: "X",
        muscle: "toes",
        secondaryMuscles: [],
        notes: "",
      }).success,
    ).toBe(false);
    expect(
      exerciseLibraryItemInputSchema.safeParse({
        name: "   ",
        muscle: "chest",
        secondaryMuscles: [],
        notes: "",
      }).success,
    ).toBe(false);
  });
});
