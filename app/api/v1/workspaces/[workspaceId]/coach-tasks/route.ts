import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  createCoachTaskFromRoute,
  readCoachTasks,
  type CoachTaskSafeResult,
} from "@/lib/coach-tasks/boundary";

/**
 * /api/v1/workspaces/:workspaceId/coach-tasks — staff to-dos (D26:
 * private coach tasks, their own entity, never ClientTask).
 *
 * GET    — list every live to-do in the workspace, or one client's with
 *          ?clientProfileId= (null client = workspace-level to-do).
 * POST   — create { clientProfileId?, title }.
 *
 * Capability `tasks.manage`: owner + coach at workspace scope, client
 * deny — a client request fails 403 before any lookup (PR-M3
 * acceptance).
 */

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

const listQuerySchema = z.object({
  clientProfileId: z.string().min(1).optional(),
});

const createBodySchema = z.object({
  clientProfileId: z.string().min(1).optional(),
  title: z.unknown(),
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

export const GET = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  query: listQuerySchema,
  handler: async (ctx) =>
    unwrap(
      await readCoachTasks(
        {
          userId: ctx.viewer.userId,
          workspaceId: ctx.workspace.workspaceId,
          scope: ctx.workspace.scope,
        },
        { clientProfileId: ctx.query?.clientProfileId ?? null },
      ),
    ),
});

export const POST = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  handler: async (ctx) => {
    const body = createBodySchema.parse(await readJson(ctx.request));
    return unwrap(
      await createCoachTaskFromRoute(
        {
          userId: ctx.viewer.userId,
          workspaceId: ctx.workspace.workspaceId,
          scope: ctx.workspace.scope,
        },
        body,
      ),
    );
  },
});
