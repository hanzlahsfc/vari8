import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  createCoachNoteFromRoute,
  readCoachNotes,
  type NoteSafeResult,
} from "@/lib/notes/boundary";

/**
 * /api/v1/workspaces/:workspaceId/notes — staff coach notes (D26, O13).
 *
 * GET    — list every live note in the workspace, or one client's notes
 *          with ?clientProfileId= (workspace-level + per-client kinds).
 * POST   — create { clientProfileId?, visibility: "PRIVATE"|"GENERAL",
 *          body }. GENERAL requires a client (O13 + schema CHECK);
 *          PRIVATE without a client is the workspace-level note the
 *          canvas Notes workspace shows.
 *
 * Capability `notes.write`: owner + coach at workspace scope, client
 * deny — a client request fails 403 before any lookup (PR-M3 acceptance).
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
  visibility: z.unknown(),
  body: z.unknown(),
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
function unwrap<T>(result: NoteSafeResult<T>): T {
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
  capability: "notes.write",
  params: paramsSchema,
  query: listQuerySchema,
  handler: async (ctx) =>
    unwrap(
      await readCoachNotes(caller(ctx), {
        clientProfileId: ctx.query?.clientProfileId ?? null,
      }),
    ),
});

export const POST = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: async (ctx) => {
    const body = createBodySchema.parse(await readJson(ctx.request));
    return unwrap(await createCoachNoteFromRoute(caller(ctx), body));
  },
});
