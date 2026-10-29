import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { assignClientTask, listStaffClientTasks } from "@/lib/tasks/service";

import { readBody, sessionOf, unwrapTask } from "../../../tasks/_result";

/**
 * GET  /api/v1/workspaces/:workspaceId/clients/:clientProfileId/tasks
 * POST /api/v1/workspaces/:workspaceId/clients/:clientProfileId/tasks
 *
 * W2-A4 staff client-task row: GET lists via listStaffClientTasks, POST
 * assigns via assignClientTask. Both functions re-authorize inside the
 * transaction; tasks.manage supplies the route scope.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const bodySchema = z.object({
  title: z.string().min(1).max(120),
  dueDate: z.string().min(1).max(32),
});

export const GET = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapTask(
      listStaffClientTasks(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
      }),
    ),
});

export const POST = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapTask(
      assignClientTask(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        title: body.title,
        dueDate: body.dueDate,
      }),
    );
  },
});
