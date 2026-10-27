import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  deleteCoachTask,
  setCoachTaskCompleted,
} from "@/lib/coach-tasks/service";

import {
  readBody,
  sessionOf,
  unwrapCoachTask,
} from "../_result";

/**
 * PATCH  /api/v1/workspaces/:workspaceId/coach-tasks/:coachTaskId
 * DELETE /api/v1/workspaces/:workspaceId/coach-tasks/:coachTaskId
 *
 * W2-A4 coach to-do transitions: PATCH completes or reopens
 * (completed boolean, optional expectedRevision CAS); DELETE soft deletes
 * and stamps the model's deletedAt/restoreUntil restore window.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  coachTaskId: z.string().min(1),
});

const patchSchema = z.object({
  completed: z.boolean(),
  expectedRevision: z.number().int().min(0).optional(),
});

const deleteSchema = z.object({
  expectedRevision: z.number().int().min(0).optional(),
});

export const PATCH = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, patchSchema);
    return unwrapCoachTask(
      setCoachTaskCompleted(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        coachTaskId: params.coachTaskId,
        completed: body.completed,
        expectedRevision: body.expectedRevision,
      }),
    );
  },
});

export const DELETE = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, deleteSchema);
    return unwrapCoachTask(
      deleteCoachTask(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        coachTaskId: params.coachTaskId,
        expectedRevision: body.expectedRevision,
      }),
    );
  },
});
