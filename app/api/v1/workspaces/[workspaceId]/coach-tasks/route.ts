import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  createCoachTaskFromRoute,
  readCoachTasks,
  readCoachTaskFromRoute,
  type CoachTaskSafeResult,
} from "@/lib/coach-tasks/boundary";

/**
 * GET  /api/v1/workspaces/:workspaceId/coach-tasks?clientProfileId=
 * POST /api/v1/workspaces/:workspaceId/coach-tasks
 *
 * W2-A4 coach to-do rows over CoachTask: staff to-dos (D26), never
 * ClientTask rows. GET without the query param reads the workspace-level
 * list; with it, that client's to-dos. POST creates either kind with a
 * server-assigned id.
 *
 * The response keeps the { coachTasks } / { coachTask } envelopes the
 * canvas adapter reads. tasks.manage keeps client callers denied at the
 * gate: owner + coach at workspace scope, client deny.
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

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_input");
  }
}

// The workspace API never answers 404 for a missing or deleted row;
// not_available collapses to 403 the same way daily-entries/_result.ts
// maps it, so the error vocabulary stays uniform across routes.
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

function caller(ctx: {
  viewer: { userId: string };
  workspace: { workspaceId: string; scope: "workspace" | "own" };
}) {
  return {
    userId: ctx.viewer.userId,
    workspaceId: ctx.workspace.workspaceId,
    scope: ctx.workspace.scope,
  };
}

export const GET = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  query: querySchema,
  handler: async (ctx) => {
    const listed = unwrap(
      await readCoachTasks(caller(ctx), {
        clientProfileId: ctx.query?.clientProfileId ?? null,
      }),
    );
    return { coachTasks: listed.tasks, hasMore: listed.hasMore };
  },
});

export const POST = defineApiV1Route({
  capability: "tasks.manage",
  params: paramsSchema,
  handler: async (ctx) => {
    const body = bodySchema.parse(await readJson(ctx.request));
    const created = unwrap(
      await createCoachTaskFromRoute(caller(ctx), {
        clientProfileId: body.clientProfileId ?? null,
        title: body.title,
      }),
    );
    const view = unwrap(
      await readCoachTaskFromRoute(caller(ctx), { taskId: created.id }),
    );
    return { coachTask: view };
  },
});
