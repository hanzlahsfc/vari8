import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listOwnClientTasks } from "@/lib/tasks/service";

import { sessionOf, unwrapTask } from "./_result";

/**
 * GET /api/v1/workspaces/:workspaceId/tasks?option=open|completed|both
 *
 * Card 05a client row: the caller's own task list. The service resolves
 * the caller's own client profile and returns it as `clientProfileId`:
 * the PATCH /clients/:clientProfileId/tasks/:taskId target.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const querySchema = z.object({
  option: z.enum(["open", "completed", "both"]).optional(),
});

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapTask(
      listOwnClientTasks(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        option: query.option,
      }),
    ),
});
