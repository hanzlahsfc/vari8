import type { Prisma } from "@prisma/client";

import type { SeedContext } from "./index";
import {
  materializeWeeks,
  normalizeFieldConfig,
  normalizeTrainingDraft,
  type TrainingDraft,
} from "../../lib/trainingprogram/payload";

/**
 * PR-M6: canvas demo training domain for the `canvas-demo` workspace.
 *
 * Values are copied from the canvas demo state, verbatim:
 * - the starter exercise library (`frontend/src/components/coach/plans/
 *   training/library-model.ts` `defaultExerciseLibrary()`), written as
 *   workspace ExerciseLibraryItem rows (the coach-editable library);
 * - the sample program the client training tab draws
 *   (`frontend/src/components/ethereal/builder/model.ts`
 *   `workoutSchedule` + `prescriptions`, week 6): "Lower strength"
 *   (Deadlift 4×"4 to 5" note "Leave two reps in reserve", Split squat
 *   3×"8 / side") and "Upper strength" (Bench press 4×"6",
 *   Chest-supported row 3×"8 to 10"), eight week-based weeks anchored so
 *   the 2026-10-19 demo date lands on week 6.
 *
 * Muscle allocations follow the canvas PRIMARY_MUSCLE table (ported in
 * lib/training/volume.ts) so the seeded program reproduces the canvas
 * volume panel: chest 4, back 3, hamstrings 4, glutes 3, total 14.
 *
 * The program is written as a draft + published version 1 with raw
 * rows: the seed must not depend on a signed-in session. Every write
 * is an idempotent find-or-create keyed on stable names.
 */

const WORKSPACE_SLUG = "canvas-demo";
const DEMO_CLIENT_NAME = "Emma Anders"; // canvas client-001, the demo default
const PROGRAM_TITLE = "Strength foundation";
export const START_DATE = "2026-09-14"; // week 6 of 8 on 2026-10-19
export const WEEK_COUNT = 8;
const ANCHOR_TZ = "Europe/Vienna";

// Canvas `defaultExerciseLibrary()`: copied verbatim, in order.
const LIBRARY: {
  id: string;
  name: string;
  muscle: string;
  secondaryMuscles: string[];
  notes: string;
}[] = [
  {
    id: "library-back-squat",
    name: "Back squat",
    muscle: "quadriceps",
    secondaryMuscles: ["glutes", "core"],
    notes: "Brace before each rep; keep the whole foot grounded.",
  },
  {
    id: "library-bench-press",
    name: "Bench press",
    muscle: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
    notes: "Set the shoulder blades before unracking.",
  },
  {
    id: "library-deadlift",
    name: "Deadlift",
    muscle: "hamstrings",
    secondaryMuscles: ["glutes", "back"],
    notes: "Build tension against the bar before lifting.",
  },
  {
    id: "library-row",
    name: "Chest-supported row",
    muscle: "back",
    secondaryMuscles: ["biceps"],
    notes: "Pause briefly with the shoulder blades drawn back.",
  },
  {
    id: "library-lat-pulldown",
    name: "Lat pulldown",
    muscle: "back",
    secondaryMuscles: ["biceps"],
    notes: "Lead with the elbows and keep the torso steady.",
  },
  {
    id: "library-shoulder-press",
    name: "Dumbbell shoulder press",
    muscle: "shoulders",
    secondaryMuscles: ["triceps"],
    notes: "Use a comfortable range without arching the lower back.",
  },
  {
    id: "library-hip-thrust",
    name: "Hip thrust",
    muscle: "glutes",
    secondaryMuscles: ["hamstrings"],
    notes: "Finish with the hips, keeping the ribs stacked over the pelvis.",
  },
  {
    id: "library-leg-extension",
    name: "Leg extension",
    muscle: "quadriceps",
    secondaryMuscles: [],
    notes: "Control the lowering phase; avoid bouncing at the bottom.",
  },
  {
    id: "library-calf-raise",
    name: "Standing calf raise",
    muscle: "calves",
    secondaryMuscles: [],
    notes: "Use a full stretch and controlled pause at the top.",
  },
  {
    id: "library-plank",
    name: "Forearm plank",
    muscle: "core",
    secondaryMuscles: ["shoulders"],
    notes:
      "Maintain a straight line from head to heels; stop before form changes.",
  },
];

const FIELD_CONFIG = {
  sets: true,
  fixedReps: true,
  repRanges: true,
  tempo: true,
  setType: true,
  restPause: true,
  instructions: true,
  progressionNotes: true,
};

const set = (
  id: string,
  reps: number,
  type = "Working",
  extra: Record<string, unknown> = {},
) => ({
  id,
  reps,
  tempo: "",
  type,
  rest: "",
  instructions: "",
  ...extra,
});

/**
 * The canvas sample program as a training draft (canvas `workoutSchedule`,
 * week 6). Exported so a test can compare the seeded program's volume with
 * the canvas volume panel without a database. `libraryItemIds` maps the
 * canvas library ids (`library-deadlift`, ...) to seeded row ids.
 */
export function demoProgramDraft(
  libraryItemIds: ReadonlyMap<string, string> = new Map(),
): TrainingDraft {
  return normalizeTrainingDraft({
    programMode: "WEEK_BASED",
    sessions: [
      { id: "s-lower", name: "Lower strength" },
      { id: "s-upper", name: "Upper strength" },
    ],
    exercises: [
      {
        id: "e-deadlift",
        sessionId: "s-lower",
        name: "Deadlift",
        muscle: "hamstrings",
        secondaryMuscles: ["glutes", "back"],
        libraryItemId: libraryItemIds.get("library-deadlift"),
      },
      {
        id: "e-split-squat",
        sessionId: "s-lower",
        name: "Split squat",
        muscle: "glutes",
      },
      {
        id: "e-bench",
        sessionId: "s-upper",
        name: "Bench press",
        muscle: "chest",
        secondaryMuscles: ["triceps", "shoulders"],
        libraryItemId: libraryItemIds.get("library-bench-press"),
      },
      {
        id: "e-row",
        sessionId: "s-upper",
        name: "Chest-supported row",
        muscle: "back",
        secondaryMuscles: ["biceps"],
        libraryItemId: libraryItemIds.get("library-row"),
      },
    ],
    sessionOrder: { "1": ["s-lower", "s-upper"] },
    exerciseOrder: {},
    sessionPresence: { "s-lower": { "1": true }, "s-upper": { "1": true } },
    exercisePresence: {
      "s-lower/e-deadlift": { "1": true },
      "s-lower/e-split-squat": { "1": true },
      "s-upper/e-bench": { "1": true },
      "s-upper/e-row": { "1": true },
    },
    sessionNames: {},
    fieldCells: {
      "s-lower/e-deadlift/sets": { "1": 4 },
      "s-lower/e-deadlift/reps": { "1": "4\u20135" },
      "s-lower/e-deadlift/note": { "1": "Leave two reps in reserve" },
      "s-lower/e-split-squat/sets": { "1": 3 },
      "s-lower/e-split-squat/reps": { "1": "8 / side" },
      "s-upper/e-bench/sets": { "1": 4 },
      "s-upper/e-bench/reps": { "1": "6" },
      "s-upper/e-row/sets": { "1": 3 },
      "s-upper/e-row/reps": { "1": "8\u201310" },
    },
    setRows: {
      "s-lower/e-deadlift": {
        "1": [
          set("d1", 4, "Working", { repsMax: 5 }),
          set("d2", 4, "Working", { repsMax: 5 }),
          set("d3", 4, "Working", { repsMax: 5 }),
          set("d4", 4, "Working", { repsMax: 5 }),
        ],
      },
      "s-lower/e-split-squat": {
        "1": [set("ss1", 8), set("ss2", 8), set("ss3", 8)],
      },
      "s-upper/e-bench": {
        "1": [set("b1", 6), set("b2", 6), set("b3", 6), set("b4", 6)],
      },
      "s-upper/e-row": {
        "1": [
          set("r1", 8, "Working", { repsMax: 10 }),
          set("r2", 8, "Working", { repsMax: 10 }),
          set("r3", 8, "Working", { repsMax: 10 }),
        ],
      },
    },
  });
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;

  const workspace = await prisma.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
  });
  if (!workspace) return; // 00-workspace.seed.ts owns the demo workspace.
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: workspace.id, role: "WORKSPACE_OWNER" },
    orderBy: { createdAt: "asc" },
  });
  const client = await prisma.clientProfile.findFirst({
    where: { workspaceId: workspace.id, name: DEMO_CLIENT_NAME },
  });
  if (!member || !client) return;

  // ── Coach-editable exercise library (canvas starter set) ─────────────
  const libraryIds = new Map<string, string>();
  let libraryCreated = 0;
  for (const item of LIBRARY) {
    const existing = await prisma.exerciseLibraryItem.findFirst({
      where: { workspaceId: workspace.id, name: item.name, archivedAt: null },
    });
    if (existing) {
      libraryIds.set(item.id, existing.id);
      continue;
    }
    const row = await prisma.exerciseLibraryItem.create({
      data: {
        workspaceId: workspace.id,
        name: item.name,
        muscle: item.muscle,
        secondaryMuscles: item.secondaryMuscles,
        notes: item.notes,
        createdByMemberId: member.id,
      },
    });
    libraryIds.set(item.id, row.id);
    libraryCreated += 1;
  }

  // The canvas sample program for the demo client (see demoProgramDraft).
  const draft = demoProgramDraft(libraryIds);
  const fieldConfig = normalizeFieldConfig(FIELD_CONFIG);
  const payload = materializeWeeks(draft, START_DATE, WEEK_COUNT);

  const existing = await prisma.trainingProgram.findFirst({
    where: {
      workspaceId: workspace.id,
      clientProfileId: client.id,
      title: PROGRAM_TITLE,
    },
    include: { versions: { select: { id: true } } },
  });
  let programCreated = 0;
  if (!existing) {
    const activationInstant = new Date(`${START_DATE}T00:00:00+02:00`);
    await prisma.trainingProgram.create({
      data: {
        workspaceId: workspace.id,
        clientProfileId: client.id,
        title: PROGRAM_TITLE,
        startDate: new Date(`${START_DATE}T00:00:00Z`),
        weekCount: WEEK_COUNT,
        programMode: "WEEK_BASED",
        fieldConfig: fieldConfig as unknown as Prisma.InputJsonValue,
        confirmedTimezone: ANCHOR_TZ,
        timezoneSetByMemberId: member.id,
        timezoneSetAt: activationInstant,
        draft: draft as unknown as Prisma.InputJsonValue,
        draftRevision: 1,
        draftSavedByMemberId: member.id,
        draftUpdatedAt: activationInstant,
        firstPublishedAt: activationInstant,
        createdByMemberId: member.id,
        versions: {
          create: {
            workspaceId: workspace.id,
            clientProfileId: client.id,
            versionSeq: 1,
            effectiveDate: new Date(`${START_DATE}T00:00:00Z`),
            effectiveTimezone: ANCHOR_TZ,
            activationInstant,
            payload: payload as unknown as Prisma.InputJsonValue,
            fieldConfig: fieldConfig as unknown as Prisma.InputJsonValue,
            publishOriginRevision: 1,
            publishedAt: activationInstant,
            publishedByMemberId: member.id,
          },
        },
      },
    });
    programCreated = 1;
  }

  console.log(
    `[seed] training: ${libraryCreated} library item(s), ` +
      `${programCreated ? `program "${PROGRAM_TITLE}" week 1-${WEEK_COUNT} published` : "program already present"} ` +
      `for ${DEMO_CLIENT_NAME} @ ${WORKSPACE_SLUG}`,
  );
}
