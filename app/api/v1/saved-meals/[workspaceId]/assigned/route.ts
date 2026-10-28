import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { listAssignedMeals } from "@/lib/nutrition/saved-meals";

/**
 * GET /api/v1/saved-meals/:workspaceId/assigned - T7 (R6) client-visible
 * list under `clientData.read`. Clients resolve to their own profile
 * through the session (any other id is forbidden); staff pass
 * `?clientProfileId=` to preview.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

const querySchema = z.object({
  clientProfileId: z.string().min(1).max(64).optional(),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, workspace, query }) =>
    listAssignedMeals(viewer, workspace, query.clientProfileId),
});
