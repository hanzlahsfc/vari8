"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isSupplementsEnabled } from "@/lib/supplements/gate";
import {
  readStaffSupplementPlanFromAction,
  saveSupplementPlanFromAction,
} from "@/lib/supplements/boundary";
import type { StaffSupplementPlanView } from "@/lib/supplements/service";

/**
 * PR-SUPP — staff supplement-plan server actions.
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

export type SupplementPlanActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; message: string; revision?: number };

/**
 * Save the whole plan (name + ordered items). Whole-plan replace is the
 * approved UI contract: Cancel/discarded edits never reach the server.
 */
export async function saveSupplementPlanAction(input: {
  workspaceId: string;
  clientProfileId: string;
  expectedRevision: number;
  name?: string;
  items: unknown;
}): Promise<SupplementPlanActionState> {
  if (!isSupplementsEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    !validId(input?.workspaceId) ||
    !validId(input?.clientProfileId) ||
    typeof input?.expectedRevision !== "number" ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !Array.isArray(input?.items) ||
    input.items.length > 50 ||
    (input.name !== undefined &&
      (typeof input.name !== "string" || input.name.length > 120))
  )
    return { status: "error", message: INVALID };

  const result = await saveSupplementPlanFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(
    `/workspace/${input.workspaceId}/clients/${input.clientProfileId}/supplements`,
  );
  return {
    status: "ok",
    message: "Supplement plan saved.",
    revision: result.value.revision,
  };
}

/**
 * Explicit staff view of the saved plan — the detail surface that writes
 * the one structural READ audit per view (decision #80).
 */
export async function viewSupplementPlanAction(input: {
  workspaceId: string;
  clientProfileId: string;
}): Promise<
  | { status: "ok"; view: StaffSupplementPlanView }
  | { status: "error"; message: string }
> {
  if (!isSupplementsEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (!validId(input?.workspaceId) || !validId(input?.clientProfileId))
    return { status: "error", message: INVALID };

  const result = await readStaffSupplementPlanFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "ok", view: result.value };
}
