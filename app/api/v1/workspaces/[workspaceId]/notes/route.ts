// W2-A1: the workspace-level private note list the Notes screen reads at
// coach/notes.tsx. Reads and writes run through the same CoachNote rows with
// a null clientProfileId. notes.write is staff-only: clients and
// foreign-workspace members get a literal 403 at the capability gate.
//
// PUT replaces the whole list - the canvas edits the collection in place.
//
// GET without a query returns the { notes: [{ id, text }] } envelope the
// canvas adapter reads; ?clientProfileId= serves the per-client and
// visibility-scoped read. POST creates a note with a server-assigned id;
// GENERAL visibility requires a client (O13 + schema CHECK).

import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  createCoachNoteFromRoute,
  readCoachNotes,
  type NoteSafeResult,
} from "@/lib/notes/boundary";
import {
  listWorkspaceCoachNotes,
  writeWorkspaceCoachNotes,
} from "@/lib/workspace/client-detail";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

const listQuerySchema = z.object({
  clientProfileId: z.string().min(1).optional(),
});

const putBodySchema = z.object({
  notes: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().min(1).max(4000),
        pinned: z.boolean().optional(),
      }),
    )
    .max(500),
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

// The route helper wraps the handler's return in Response.json - handlers
// return data and map a closed failure to a thrown ApiError.
function unwrap<T>(result: NoteSafeResult<T>): T {
  if (result.ok) return result.value;
  // The workspace API never answers 404 for a missing or deleted row;
  // not_available collapses to 403 the same way daily-entries/_result.ts
  // maps it, so the error vocabulary stays uniform across routes.
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
  capability: "notes.write",
  params: paramsSchema,
  query: listQuerySchema,
  handler: async (ctx) => {
    if (ctx.query?.clientProfileId == null) {
      return listWorkspaceCoachNotes(ctx.workspace);
    }
    return unwrap(
      await readCoachNotes(caller(ctx), {
        clientProfileId: ctx.query.clientProfileId,
      }),
    );
  },
});

export const POST = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: async (ctx) => {
    const body = createBodySchema.parse(await readJson(ctx.request));
    return unwrap(await createCoachNoteFromRoute(caller(ctx), body));
  },
});

export const PUT = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: async ({ workspace, request }) => {
    const body = putBodySchema.parse(await readJson(request));
    return writeWorkspaceCoachNotes(workspace, body.notes);
  },
});
