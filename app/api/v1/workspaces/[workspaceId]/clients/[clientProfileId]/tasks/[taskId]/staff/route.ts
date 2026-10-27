import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  cancelClientTask,
  editClientTask,
} from "@/lib/tasks/service";

import {
  readBody,
  sessionOf,
  unwrapTask,
} from "../../../../../tasks/_result";

/**
 * PATCH  /api/v1/workspaces/:workspaceId/clients/:clientProfileId/tasks/:taskId/staff
 * DELETE /api/v1/workspaces/:workspaceId/clients/:clientProfileId/tasks/:taskId/staff
 *
 * W2-A4 staff transitions on an OPEN client task: PATCH edits title and
 * dueDate only (status is not an input), DELETE cancels. Staff status
 * scope is CANCELLED only - COMPLETED stays client-owned through the
 * own-scope PATCH on ../route.ts, which this file does not change.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
  taskId: z.string().min(1),
});

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  dueDate: z.string().min(1).max(32).optional(),
  expectedRevision: z.number().int().min(0),
});

const deleteSchema = z.object({
  expectedRevision: z.number().int().min(0),
});

export const PATCH = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, patchSchema);
    return unwrapTask(
      editClientTask(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        taskId: params.taskId,
        title: body.title,
        dueDate: body.dueDate,
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
    return unwrapTask(
      cancelClientTask(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        taskId: params.taskId,
        expectedRevision: body.expectedRevision,
      }),
    );
  },
});
