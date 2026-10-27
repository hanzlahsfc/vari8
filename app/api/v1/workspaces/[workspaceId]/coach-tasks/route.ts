import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  createCoachTask,
  listCoachTasks,
} from "@/lib/coach-tasks/service";

import {
  readBody,
  sessionOf,
  unwrapCoachTask,
} from "./_result";

/**
 * GET  /api/v1/workspaces/:workspaceId/coach-tasks?clientProfileId=
 * POST /api/v1/workspaces/:workspaceId/coach-tasks
 *
 * W2-A4 coach to-do row over CoachTask. GET without the query param reads
 * the workspace-level list (clientProfileId null rows); with it, that
 * client's to-dos. POST creates either kind. tasks.manage keeps client
 * callers denied at the gate.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const querySchema = z.object({
  clientProfileId: z.string().min(1).optional(),
});

const bodySchema = z.object({
  title: z.string().min(1).max(120),
  clientProfileId: z.string().min(1).max(128).nullable().optional(),
});

export const GET = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapCoachTask(
      listCoachTasks(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: query.clientProfileId,
      }),
    ),
});

export const POST = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapCoachTask(
      createCoachTask(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: body.clientProfileId,
        title: body.title,
      }),
    );
  },
});
