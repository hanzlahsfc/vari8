import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  deleteCoachTaskFromRoute,
  readCoachTaskFromRoute,
  setCoachTaskCompletionFromRoute,
  updateCoachTaskTitleFromRoute,
  type CoachTaskSafeResult,
  type CoachTaskView,
} from "@/lib/coach-tasks/boundary";

/**
 * /api/v1/workspaces/:workspaceId/coach-tasks/:taskId — one staff to-do.
 *
 * PATCH  — { title?, complete?, completed?, expectedRevision? }: edits the
 *          title and/or sets explicit completion state (the canvas checkbox;
 *          idempotent replay-safe). `complete` and `title` calls answer with
 *          the flat { revision, complete?, changed } shape; the `completed`
 *          field name answers with the { coachTask } envelope the canvas
 *          adapter reads. When the caller supplies expectedRevision it is
 *          enforced as CAS inside the write transaction; when it is absent
 *          the route resolves the live revision first so the serialized CAS
 *          check still runs.
 * DELETE — soft delete with the D24 undo window. A query
 *          ?expectedRevision= answers { revision, changed }; the canvas
 *          empty-body call answers { coachTask } with the pre-delete view.
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
    completed: z.unknown().optional(),
    expectedRevision: z.number().int().min(1).optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.complete !== undefined ||
      body.completed !== undefined,
    { message: "at least one of title, complete or completed is required" },
  );

const deleteQuerySchema = z.object({
  expectedRevision: z.coerce.number().int().min(1).optional(),
});

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_input");
  }
}

// The route helper wraps the handler's return in Response.json — handlers
// return data and map a closed failure to a thrown ApiError. The workspace
// API never answers 404 for a missing or deleted row; not_available
// collapses to 403 the same way daily-entries/_result.ts maps it.
function unwrap<T>(result: CoachTaskSafeResult<T>): T {
  if (result.ok) return result.value;
  const status =
    result.code === "denied" || result.code === "not_available"
      ? 403
      : result.code === "invalid_input"
        ? 400
        : result.code === "conflict" || result.code === "serialization_conflict"
          ? 409
          : 404;
  const code = result.code === "denied" ? "forbidden" : result.code;
  throw new ApiError(status, code);
}

function callerOf(ctx: {
  viewer: { userId: string };
  workspace: { workspaceId: string; scope: "workspace" | "own" };
}) {
  return {
    userId: ctx.viewer.userId,
    workspaceId: ctx.workspace.workspaceId,
    scope: ctx.workspace.scope,
  };
}

// The { coachTask } envelope keeps the exact seven field view the canvas
// adapter and its contract tests read.
function strictView(view: CoachTaskView) {
  return {
    id: view.id,
    clientProfileId: view.clientProfileId,
    title: view.title,
    completedAt: view.completedAt,
    completedByMemberId: view.completedByMemberId,
    createdByMemberId: view.createdByMemberId,
    revision: view.revision,
  };
}

async function liveRevision(
  caller: Parameters<typeof readCoachTaskFromRoute>[0],
  taskId: string,
): Promise<number> {
  const current = await readCoachTaskFromRoute(caller, { taskId });
  if (!current.ok) unwrap(current);
  return current.value.revision;
}

export const PATCH = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  handler: async (ctx) => {
    const body = patchBodySchema.parse(await readJson(ctx.request));
    const caller = callerOf(ctx);
    const wantsFlat = body.complete !== undefined || body.title !== undefined;
    // Field order is fixed (title, then completion) so a mixed patch is
    // deterministic; each op keeps its own CAS + audit. An absent
    // expectedRevision resolves the live revision so the serialized CAS
    // check inside the write transaction still runs.
    if (body.title !== undefined) {
      const expected =
        body.expectedRevision ?? (await liveRevision(caller, ctx.params.taskId));
      const result = await updateCoachTaskTitleFromRoute(caller, {
        taskId: ctx.params.taskId,
        title: body.title,
        expectedRevision: expected,
      });
      const completionRequested =
        body.complete !== undefined || body.completed !== undefined;
      if (!result.ok || !completionRequested) {
        if (!result.ok) return unwrap(result);
        if (wantsFlat) return unwrap(result);
        const view = await readCoachTaskFromRoute(caller, {
          taskId: ctx.params.taskId,
        });
        return { coachTask: strictView(unwrap(view)) };
      }
      const completion = await setCoachTaskCompletionFromRoute(caller, {
        taskId: ctx.params.taskId,
        complete: (body.complete ?? body.completed) as boolean,
        expectedRevision: result.value.revision,
      });
      if (!completion.ok) return unwrap(completion);
      if (wantsFlat) return unwrap(completion);
      const view = await readCoachTaskFromRoute(caller, {
        taskId: ctx.params.taskId,
      });
      return { coachTask: strictView(unwrap(view)) };
    }
    const completeValue = (body.complete ?? body.completed) as boolean;
    const expected =
      body.expectedRevision ?? (await liveRevision(caller, ctx.params.taskId));
    const completion = await setCoachTaskCompletionFromRoute(caller, {
      taskId: ctx.params.taskId,
      complete: completeValue,
      expectedRevision: expected,
    });
    if (!completion.ok) return unwrap(completion);
    if (wantsFlat) return unwrap(completion);
    const view = await readCoachTaskFromRoute(caller, {
      taskId: ctx.params.taskId,
    });
    return { coachTask: strictView(unwrap(view)) };
  },
});

export const DELETE = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  query: deleteQuerySchema,
  handler: async (ctx) => {
    const caller = callerOf(ctx);
    if (ctx.query?.expectedRevision !== undefined) {
      return unwrap(
        await deleteCoachTaskFromRoute(caller, {
          taskId: ctx.params.taskId,
          expectedRevision: ctx.query.expectedRevision,
        }),
      );
    }
    const before = await readCoachTaskFromRoute(caller, {
      taskId: ctx.params.taskId,
    });
    const view = unwrap(before);
    unwrap(
      await deleteCoachTaskFromRoute(caller, {
        taskId: ctx.params.taskId,
        expectedRevision: view.revision,
      }),
    );
    return { coachTask: strictView({ ...view, revision: view.revision + 1 }) };
  },
});
