import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  getSidebarState,
  updateSidebarState,
} from "@/lib/workspace/preferences";

/**
 * GET/PATCH /api/v1/workspaces/:workspaceId/preferences/sidebar — the
 * caller's own sidebar collapsed flag on this workspace
 * (`workspace_member.sidebar_collapsed`, PR-M0).
 *
 * Member-scoped, not role-scoped: gated on `own.read`/`own.write` (non-deny
 * for every D15 role, including client). The write lands on the member row
 * the route helper resolved for this (user, workspace) pair, so it can
 * never touch another member's state.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_input");
  }
}

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  handler: ({ workspace }) => getSidebarState(workspace),
});

export const PATCH = defineApiV1Route({
  capability: "own.write",
  params: paramsSchema,
  handler: async ({ workspace, request }) =>
    updateSidebarState(workspace, await readJson(request)),
});
