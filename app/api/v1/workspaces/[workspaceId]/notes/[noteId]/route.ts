import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  deleteCoachNoteFromRoute,
  updateCoachNoteBodyFromRoute,
  type NoteSafeResult,
} from "@/lib/notes/boundary";

/**
 * /api/v1/workspaces/:workspaceId/notes/:noteId — one staff coach note.
 *
 * PATCH  — update the body { body, expectedRevision } (CAS conflict on a
 *          stale revision).
 * DELETE — soft delete with the D24 undo window;
 *          ?expectedRevision= carries the CAS check.
 *
 * Capability `notes.write`: client deny — 403 before any lookup.
 */

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  noteId: z.string().min(1),
});

const updateBodySchema = z.object({
  body: z.unknown(),
  expectedRevision: z.number().int().min(1),
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

export const PATCH = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: async (ctx) => {
    const body = updateBodySchema.parse(await readJson(ctx.request));
    return unwrap(
      await updateCoachNoteBodyFromRoute(caller(ctx), {
        noteId: ctx.params.noteId,
        body: body.body,
        expectedRevision: body.expectedRevision,
      }),
    );
  },
});

export const DELETE = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  query: deleteQuerySchema,
  handler: async (ctx) =>
    unwrap(
      await deleteCoachNoteFromRoute(caller(ctx), {
        noteId: ctx.params.noteId,
        expectedRevision: ctx.query.expectedRevision,
      }),
    ),
});
