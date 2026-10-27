import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { readWorkspaceAppearance } from "./service";

/**
 * GET /api/v1/workspaces/:workspaceId/appearance: card w2-c2 client-scoped
 * appearance read (the one conditional GET the card allows). `own.read`
 * scope: a client reads only the workspace they belong to; a foreign
 * workspace id yields 403 from the membership check upstream, identical to
 * non-membership. GET only.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  handler: ({ params }) => readWorkspaceAppearance(params.workspaceId),
});
