"use server";

import { auth } from "@/auth";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import {
  listStaffCheckInReviewQueue,
  type StaffCheckInReviewQueueItem,
} from "@/lib/checkin/instances-boundary";

/**
 * CHECK-IN-OVERVIEW-I1 — review-queue pagination action.
 * Called programmatically by the queue list's "Load earlier" control;
 * feature resolver first, session second, bounded args only, boundary
 * last. Zero audits (header-only list read).
 */

const INVALID = "Check the request details and try again.";
const DENIED = "You don’t have access to this Check-In.";
const OFF = "Check-Ins aren’t available right now.";

async function sessionUser(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function loadCheckInReviewQueueAction(
  ctx: { workspaceId: string },
  input: { cursor: string },
): Promise<
  | {
      status: "ok";
      items: StaffCheckInReviewQueueItem[];
      nextCursor: string | null;
    }
  | { status: "error"; message: string }
> {
  if (!isCheckInsEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    typeof ctx !== "object" ||
    ctx === null ||
    typeof ctx.workspaceId !== "string" ||
    ctx.workspaceId.length === 0 ||
    ctx.workspaceId.length > 128 ||
    typeof input !== "object" ||
    input === null ||
    typeof input.cursor !== "string" ||
    input.cursor.length === 0 ||
    input.cursor.length > 200
  )
    return { status: "error", message: INVALID };

  const result = await listStaffCheckInReviewQueue(
    { user: { id: userId } },
    { workspaceId: ctx.workspaceId, cursor: input.cursor },
  );
  if (!result.ok) return { status: "error", message: result.message };
  return {
    status: "ok",
    items: result.value.items,
    nextCursor: result.value.nextCursor,
  };
}
