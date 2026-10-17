"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isTrainingPlansEnabled } from "@/lib/trainingprogram/gate";
import {
  cancelTrainingProgramFromAction,
  publishTrainingProgramVersionFromAction,
  readStaffTrainingProgramFromAction,
  readStaffTrainingProgramsFromAction,
  readStaffTrainingProgramVersionFromAction,
  saveTrainingProgramDraftFromAction,
  setTrainingProgramTimezoneFromAction,
} from "@/lib/trainingprogram/boundary";
import type {
  StaffProgramDetail,
  StaffProgramList,
  StaffVersionDetail,
} from "@/lib/trainingprogram/service";

/**
 * TRAINING-I1A (PROMPT 244) — staff training-program server actions.
 *
 * Order is load-bearing on every action: feature resolver → session →
 * bounded input binding → service boundary. With the flag off or an
 * untrusted runtime the action returns unavailable BEFORE `auth()` runs
 * — no session lookup, no input reads, no service/database/audit work.
 * Each action independently authorizes inside its service transaction;
 * page capability flags are advisory only.
 */

const OFF = "This feature is not available.";
const DENIED = "You don't have access to do that.";
const INVALID = "Check the request details and try again.";

async function sessionUser() {
  const session = await auth();
  const id = session?.user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function isWellFormedString(v: string): boolean {
  try {
    encodeURIComponent(v);
    return true;
  } catch {
    return false;
  }
}

const validId = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 128 &&
  isWellFormedString(v);

export type TrainingActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; message: string; revision?: number; programId?: string };

export async function saveTrainingDraftAction(input: {
  workspaceId: string;
  clientProfileId: string;
  programId?: string;
  expectedRevision: number;
  title?: string;
  startDate?: string;
  weekCount?: number;
  fieldConfig?: unknown;
  timezone?: string;
  draft: unknown;
}): Promise<TrainingActionState> {
  if (!isTrainingPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    (input.programId !== undefined && !validId(input.programId)) ||
    !Number.isSafeInteger(input?.expectedRevision) ||
    input.expectedRevision < 0 ||
    (input.title !== undefined &&
      (typeof input.title !== "string" || input.title.length > 80)) ||
    (input.startDate !== undefined &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(input.startDate))) ||
    (input.weekCount !== undefined &&
      (!Number.isSafeInteger(input.weekCount) ||
        input.weekCount < 1 ||
        input.weekCount > 104)) ||
    (input.timezone !== undefined &&
      (typeof input.timezone !== "string" ||
        input.timezone.length === 0 ||
        input.timezone.length > 64))
  )
    return { status: "error", message: INVALID };

  const result = await saveTrainingProgramDraftFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(
    `/workspace/${input.workspaceId}/clients/${input.clientProfileId}/training-program`,
  );
  return {
    status: "ok",
    message: "Draft saved.",
    revision: result.value.revision,
    programId: result.value.programId,
  };
}

export async function publishTrainingVersionAction(input: {
  workspaceId: string;
  clientProfileId: string;
  programId: string;
  expectedRevision: number;
  effectiveDate: string;
  expectedPredecessor?: string | null;
  acknowledgeImmediateTakeover?: boolean;
}): Promise<TrainingActionState> {
  if (!isTrainingPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    !validId(input?.programId) ||
    !Number.isSafeInteger(input?.expectedRevision) ||
    input.expectedRevision < 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(input?.effectiveDate ?? "")) ||
    (input.expectedPredecessor !== undefined &&
      input.expectedPredecessor !== null &&
      !validId(input.expectedPredecessor))
  )
    return { status: "error", message: INVALID };

  const result = await publishTrainingProgramVersionFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(
    `/workspace/${input.workspaceId}/clients/${input.clientProfileId}/training-program`,
  );
  return {
    status: "ok",
    message: `Published version ${result.value.versionSeq}.`,
    programId: input.programId,
  };
}

export async function cancelTrainingProgramAction(input: {
  workspaceId: string;
  clientProfileId: string;
  programId: string;
}): Promise<TrainingActionState> {
  if (!isTrainingPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    !validId(input?.programId)
  )
    return { status: "error", message: INVALID };

  const result = await cancelTrainingProgramFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(
    `/workspace/${input.workspaceId}/clients/${input.clientProfileId}/training-program`,
  );
  return { status: "ok", message: "Replacement cancelled." };
}

export async function confirmTrainingTimezoneAction(input: {
  workspaceId: string;
  clientProfileId: string;
  programId: string;
  timezone: string;
}): Promise<TrainingActionState> {
  if (!isTrainingPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    !validId(input?.programId) ||
    typeof input?.timezone !== "string" ||
    input.timezone.length === 0 ||
    input.timezone.length > 64
  )
    return { status: "error", message: INVALID };

  const result = await setTrainingProgramTimezoneFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(
    `/workspace/${input.workspaceId}/clients/${input.clientProfileId}/training-program`,
  );
  return { status: "ok", message: "Timezone confirmed." };
}

export type TrainingVersionDetailState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; detail: StaffVersionDetail };

/** Explicit version detail read — one committed call = one READ audit. */
export async function viewTrainingVersionAction(input: {
  workspaceId: string;
  clientProfileId: string;
  programId: string;
  versionId: string;
}): Promise<TrainingVersionDetailState> {
  if (!isTrainingPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    !validId(input?.programId) ||
    !validId(input?.versionId)
  )
    return { status: "error", message: INVALID };
  const result = await readStaffTrainingProgramVersionFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "ok", detail: result.value };
}

export type TrainingMoreVersionsState =
  | { status: "error"; message: string }
  | {
      status: "ok";
      versions: StaffProgramDetail["versions"];
      nextCursor: number | null;
    };

/** Bounded keyset page read for version history "Load more". */
export async function listTrainingVersionsAction(input: {
  workspaceId: string;
  clientProfileId: string;
  programId: string;
  cursor: number;
}): Promise<TrainingMoreVersionsState> {
  if (!isTrainingPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    !validId(input?.programId) ||
    !Number.isSafeInteger(input?.cursor) ||
    input.cursor < 1
  )
    return { status: "error", message: INVALID };
  const result = await readStaffTrainingProgramFromAction(
    { user: { id: userId } },
    {
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      programId: input.programId,
      versionCursor: input.cursor,
    },
  );
  if (!result.ok) return { status: "error", message: result.message };
  return {
    status: "ok",
    versions: result.value.versions,
    nextCursor: result.value.nextVersionCursor,
  };
}

export type TrainingProgramPageState =
  | { status: "error"; message: string }
  | {
      status: "ok";
      programs: StaffProgramList["programs"];
      nextCursor: StaffProgramList["nextCursor"];
    };

/** Bounded keyset page read for the program list "Load more". */
export async function listTrainingProgramsAction(input: {
  workspaceId: string;
  clientProfileId: string;
  cursor: { createdAt: string; id: string };
}): Promise<TrainingProgramPageState> {
  if (!isTrainingPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    typeof input?.cursor?.createdAt !== "string" ||
    !validId(input?.cursor?.id)
  )
    return { status: "error", message: INVALID };
  const result = await readStaffTrainingProgramsFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  return {
    status: "ok",
    programs: result.value.programs,
    nextCursor: result.value.nextCursor,
  };
}
