import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  restoreCoachNoteFromRoute,
  type NoteSafeResult,
} from "@/lib/notes/boundary";

/**
 * POST /api/v1/workspaces/:workspaceId/notes/:noteId/restore — the D24
 * Undo path: restores a soft-deleted note while its restore window is
 * open; a closed window maps to not_available.
 *
 * Capability `notes.write`: client deny — 403 before any lookup.
 */

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  noteId: z.string().min(1),
});

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

export const POST = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: async (ctx) =>
    unwrap(
      await restoreCoachNoteFromRoute(
        {
          userId: ctx.viewer.userId,
          workspaceId: ctx.workspace.workspaceId,
          scope: ctx.workspace.scope,
        },
        { noteId: ctx.params.noteId },
      ),
    ),
});
