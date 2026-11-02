"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isMealPlansEnabled } from "@/lib/mealplan/gate";
import {
  publishMealPlanVersionFromAction,
  readStaffMealPlanFromAction,
  readStaffMealPlanVersionFromAction,
  saveMealPlanDraftFromAction,
  setMealPlanTimezoneFromAction,
} from "@/lib/mealplan/boundary";
import type {
  MealPlanVersionDetail,
  StaffMealPlanView,
} from "@/lib/mealplan/service";
import { collectMealPlanFoodIds } from "@/lib/mealplan/payload";
import { loadNutritionFoodMap } from "@/lib/nutrition/foods";
import type { Food } from "@/lib/nutrition/math";

/**
 * MEAL-PLAN-I1 (decision 115) — staff meal-plan server actions.
 *
 * Order is load-bearing on every action: feature resolver → session →
 * bounded input binding → service boundary. With the flag off or an
 * untrusted runtime, the action returns unavailable BEFORE `auth()` runs
 * — no session lookup, no input reads, no service/database/audit work.
 * Each action independently authorizes inside the service transaction;
 * the page's capability flags are advisory only.
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

export type MealPlanActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; message: string; revision?: number };

export async function confirmMealPlanTimezoneAction(input: {
  workspaceId: string;
  clientProfileId: string;
  timezone: string;
}): Promise<MealPlanActionState> {
  if (!isMealPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    typeof input?.timezone !== "string" ||
    input.timezone.length === 0 ||
    input.timezone.length > 64
  )
    return { status: "error", message: INVALID };

  const result = await setMealPlanTimezoneFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(
    `/workspace/${input.workspaceId}/clients/${input.clientProfileId}/meal-plan`,
  );
  return { status: "ok", message: "Timezone confirmed." };
}

export async function saveMealPlanDraftAction(input: {
  workspaceId: string;
  clientProfileId: string;
  expectedRevision: number;
  title?: string;
  timezone?: string;
  draft: unknown;
}): Promise<MealPlanActionState> {
  if (!isMealPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    !Number.isSafeInteger(input?.expectedRevision) ||
    input.expectedRevision < 0 ||
    (input.title !== undefined &&
      (typeof input.title !== "string" || input.title.length > 80)) ||
    (input.timezone !== undefined &&
      (typeof input.timezone !== "string" ||
        input.timezone.length === 0 ||
        input.timezone.length > 64))
  )
    return { status: "error", message: INVALID };

  const result = await saveMealPlanDraftFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(
    `/workspace/${input.workspaceId}/clients/${input.clientProfileId}/meal-plan`,
  );
  return {
    status: "ok",
    message: "Draft saved.",
    revision: result.value.revision,
  };
}

export async function publishMealPlanVersionAction(input: {
  workspaceId: string;
  clientProfileId: string;
  expectedRevision: number;
  effectiveDate: string;
}): Promise<MealPlanActionState> {
  if (!isMealPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    !Number.isSafeInteger(input?.expectedRevision) ||
    input.expectedRevision < 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(input?.effectiveDate ?? ""))
  )
    return { status: "error", message: INVALID };

  const result = await publishMealPlanVersionFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(
    `/workspace/${input.workspaceId}/clients/${input.clientProfileId}/meal-plan`,
  );
  return {
    status: "ok",
    message: `Published version ${result.value.versionSeq}.`,
  };
}

export type MealPlanVersionDetailState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; detail: MealPlanVersionDetail; foods: Food[] };

/** Explicit version detail read — one committed call = one READ audit. */
export async function viewMealPlanVersionAction(input: {
  workspaceId: string;
  clientProfileId: string;
  versionId: string;
}): Promise<MealPlanVersionDetailState> {
  if (!isMealPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    !validId(input?.versionId)
  )
    return { status: "error", message: INVALID };
  const result = await readStaffMealPlanVersionFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  // Catalog foods for the published payload's portion references —
  // totals come from the shared canvas math (D29).
  const foods = await loadNutritionFoodMap(
    collectMealPlanFoodIds(result.value.payload),
  );
  return { status: "ok", detail: result.value, foods: [...foods.values()] };
}

export type MealPlanMoreVersionsState =
  | { status: "error"; message: string }
  | {
      status: "ok";
      versions: StaffMealPlanView["versions"];
      nextCursor: number | null;
    };

/** Bounded keyset page read for version history "Load more". */
export async function listMealPlanVersionsAction(input: {
  workspaceId: string;
  clientProfileId: string;
  cursor: number;
}): Promise<MealPlanMoreVersionsState> {
  if (!isMealPlansEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    !Number.isSafeInteger(input?.cursor) ||
    input.cursor < 1
  )
    return { status: "error", message: INVALID };
  const result = await readStaffMealPlanFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  return {
    status: "ok",
    versions: result.value.versions,
    nextCursor: result.value.nextCursor,
  };
}
