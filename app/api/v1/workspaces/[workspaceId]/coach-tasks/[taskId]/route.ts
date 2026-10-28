import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  deleteCoachTaskFromRoute,
  setCoachTaskCompletionFromRoute,
  updateCoachTaskTitleFromRoute,
  type CoachTaskSafeResult,
} from "@/lib/coach-tasks/boundary";

/**
 * /api/v1/workspaces/:workspaceId/coach-tasks/:taskId — one staff to-do.
 *
 * PATCH  — { title?, complete?, expectedRevision }: edits the title
 *          and/or sets explicit completion state (the canvas checkbox;
 *          idempotent replay-safe). At least one field required.
 * DELETE — soft delete with the D24 undo window;
 *          ?expectedRevision= carries the CAS check.
 *
 * Capability `tasks.manage`: client deny — 403 before any lookup.
 */

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  taskId: z.string().min(1),
});

const patchBodySchema = z
  .object({
    title: z.unknown().optional(),
    complete: z.unknown().optional(),
    expectedRevision: z.number().int().min(1),
  })
  .refine((body) => body.title !== undefined || body.complete !== undefined, {
    message: "at least one of title or complete is required",
  });

const deleteQuerySchema = z.object({
  expectedRevision: z.coerce.number().int().min(1),
});

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_input");
  }
}

// The route helper wraps the handler's return in Response.json — handlers
// return data and map a closed failure to a thrown ApiError.
function unwrap<T>(result: CoachTaskSafeResult<T>): T {
  if (result.ok) return result.value;
  const status =
    result.code === "denied"
      ? 403
      : result.code === "invalid_input"
        ? 400
        : result.code === "conflict" || result.code === "serialization_conflict"
          ? 409
          : 404;
  const code = result.code === "denied" ? "forbidden" : result.code;
  throw new ApiError(status, code);
}

export const PATCH = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  handler: async (ctx) => {
    const body = patchBodySchema.parse(await readJson(ctx.request));
    const caller = {
      userId: ctx.viewer.userId,
      workspaceId: ctx.workspace.workspaceId,
      scope: ctx.workspace.scope,
    };
    // Field order is fixed (title, then completion) so a mixed patch is
    // deterministic; each op keeps its own CAS + audit.
    if (body.title !== undefined) {
      const result = await updateCoachTaskTitleFromRoute(caller, {
        taskId: ctx.params.taskId,
        title: body.title,
        expectedRevision: body.expectedRevision,
      });
      if (!result.ok || body.complete === undefined) return unwrap(result);
      const completion = await setCoachTaskCompletionFromRoute(caller, {
        taskId: ctx.params.taskId,
        complete: body.complete as boolean,
        expectedRevision: result.value.revision,
      });
      return unwrap(completion);
    }
    return unwrap(
      await setCoachTaskCompletionFromRoute(caller, {
        taskId: ctx.params.taskId,
        complete: body.complete as boolean,
        expectedRevision: body.expectedRevision,
      }),
    );
  },
});

export const DELETE = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  query: deleteQuerySchema,
  handler: async (ctx) =>
    unwrap(
      await deleteCoachTaskFromRoute(
        {
          userId: ctx.viewer.userId,
          workspaceId: ctx.workspace.workspaceId,
          scope: ctx.workspace.scope,
        },
        {
          taskId: ctx.params.taskId,
          expectedRevision: ctx.query.expectedRevision,
        },
      ),
    ),
});
