import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  getWorkspacePreferences,
  updateWorkspacePreferences,
} from "@/lib/workspace/preferences";

/**
 * GET/PATCH /api/v1/workspaces/:workspaceId/preferences — workspace
 * appearance and preferences (D25), in the canvas vocabulary.
 *
 * Both directions are gated on `appearance.write`: the D15 matrix grants
 * workspace appearance and preferences to owner and coach only, so a client
 * gets 403 on read as well as write. The patch body is unvalidated `unknown`
 * until the service's Zod schema parses it; shape violations return
 * 400 invalid_input. Per-user client preferences stay unwired (O3).
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
  capability: "appearance.write",
  params: paramsSchema,
  handler: ({ workspace }) => getWorkspacePreferences(workspace),
});

export const PATCH = defineApiV1Route({
  capability: "appearance.write",
  params: paramsSchema,
  handler: async ({ workspace, request }) =>
    updateWorkspacePreferences(workspace, await readJson(request)),
});
