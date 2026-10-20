/**
 * PR-M6 — zod-validated shapes crossing the training boundary.
 *
 * - `prescribedSetSchema`: the canvas `TrainingSet`
 *   (frontend/src/components/coach/plans/types.ts:26-34) — ordered
 *   per-set prescription rows. No prescribed load per set (owner ruling
 *   O12: the canvas does not draw it).
 * - `setLogEntrySchema` / `loggedExerciseSchema` / `sessionSetLogSchema`:
 *   the set-logging model of owner ruling O5 — per-set actual reps,
 *   load, RPE, set note and flags, plus the session-complete marker the
 *   logbook gap (P04) names. Storage lands with PR-W8; these schemas
 *   are the contract it wires.
 * - `exerciseLibraryItemInputSchema`: the coach-editable exercise
 *   library write shape (V3-L1-Exercise) — the canvas
 *   `ExerciseDefinition` backed by `exercise_library_item`.
 *
 * Values are stored and rendered exactly as entered: bounds here are
 * structural (TRAINING_LIMITS), never prescription rules.
 */

import { z } from "zod";

import { MUSCLE_GROUP_IDS } from "../training/volume";
import { TRAINING_LIMITS } from "./limits";

const idString = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "id must be 1-64 url-safe characters");

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), {
    message: "date must be a real calendar date",
  });

const isoInstantString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "instant must be an ISO timestamp",
  });

// ── Ordered per-set prescriptions (canvas TrainingSet) ───────────────────

export const prescribedSetSchema = z
  .object({
    id: idString,
    reps: z.number().int().min(1).max(999),
    repsMax: z.number().int().min(1).max(999).optional(),
    tempo: z.string().max(TRAINING_LIMITS.tempoMax),
    type: z.string().max(TRAINING_LIMITS.setTypeMax),
    rest: z.string().max(TRAINING_LIMITS.restMax),
    instructions: z.string().max(TRAINING_LIMITS.instructionsMax),
    /** P05: a coach note pinned to a future set, client-visible. */
    coachNote: z.string().max(TRAINING_LIMITS.noteMax).optional(),
  })
  .strict()
  .refine((s) => s.repsMax === undefined || s.repsMax >= s.reps, {
    message: "repsMax must be >= reps",
  });
export type PrescribedSet = z.infer<typeof prescribedSetSchema>;

// ── Set logging (O5: actual reps, load, RPE, set note, flags) ────────────

/**
 * One logged set. `setId` references the prescribed set row it answers;
 * rows without `setId` are client-added sets outside the prescription.
 * Optional numeric fields stay absent when the client leaves them blank
 * (#36: a blank input stays missing, never zero).
 *
 * `flags` carries the flag kinds the surface draws — today only
 * "checkin-review" (P04: flag the set note for the coach's check-in
 * review). The list shape leaves room for later kinds without a shape
 * change.
 */
export const setLogEntrySchema = z
  .object({
    setId: idString.optional(),
    actualReps: z.number().int().min(0).max(999),
    load: z.number().min(0).max(9999).optional(),
    loadUnit: z.string().max(8).optional(),
    rpe: z.number().min(0).max(10).optional(),
    note: z.string().max(TRAINING_LIMITS.noteMax).optional(),
    flags: z.array(z.string().max(32)).max(4).optional(),
  })
  .strict();
export type SetLogEntry = z.infer<typeof setLogEntrySchema>;

export const loggedExerciseSchema = z
  .object({
    exerciseId: idString,
    sets: z.array(setLogEntrySchema).min(1).max(40),
  })
  .strict();
export type LoggedExercise = z.infer<typeof loggedExerciseSchema>;

/**
 * One logged session against a program — the client logbook entry (P04)
 * and the review-context record (P06). `completedAt` is the
 * session-complete marker; absent means partially logged.
 */
export const sessionSetLogSchema = z
  .object({
    programId: idString.optional(),
    versionId: idString.optional(),
    sessionId: idString,
    week: z.number().int().min(1).max(TRAINING_LIMITS.weekCountMax),
    performedDate: isoDateString,
    exercises: z.array(loggedExerciseSchema).min(1).max(48),
    completedAt: isoInstantString.optional(),
  })
  .strict();
export type SessionSetLog = z.infer<typeof sessionSetLogSchema>;

// ── Coach-editable exercise library (canvas ExerciseDefinition) ──────────

export const exerciseLibraryItemInputSchema = z
  .object({
    name: z.string().trim().min(1).max(TRAINING_LIMITS.exerciseNameMax),
    muscle: z.enum(MUSCLE_GROUP_IDS as [string, ...string[]]),
    secondaryMuscles: z
      .array(z.enum(MUSCLE_GROUP_IDS as [string, ...string[]]))
      .max(10),
    notes: z.string().max(2000),
    catalogItemId: z.string().max(TRAINING_LIMITS.catalogItemIdMax).optional(),
    demoMediaId: idString.optional(),
  })
  .strict();
export type ExerciseLibraryItemInput = z.infer<
  typeof exerciseLibraryItemInputSchema
>;
