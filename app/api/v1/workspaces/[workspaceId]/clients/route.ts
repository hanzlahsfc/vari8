import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listWorkspaceClientRoster } from "@/lib/workspace/roster";

/**
 * GET /api/v1/workspaces/:workspaceId/clients — the coach's client roster.
 * Reference route for the /api/v1 foundation: cookie or bearer auth,
 * workspace+role resolution, Zod query validation, one service call.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(64).optional(),
});

export const GET = defineApiV1Route({
  capability: "roster.read",
  params: paramsSchema,
  query: querySchema,
  handler: ({ viewer, workspace, query }) =>
    listWorkspaceClientRoster(viewer, workspace, query ?? {}),
});
