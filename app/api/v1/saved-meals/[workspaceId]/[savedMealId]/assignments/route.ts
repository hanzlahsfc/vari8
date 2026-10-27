import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { assignSavedMealToClient } from "@/lib/nutrition/saved-meals";

/**
 * POST /api/v1/saved-meals/:workspaceId/:savedMealId/assignments - T7 (R6)
 * staff assign write under `library.manage`. Body: `{ clientProfileId }`.
 * Produces a new client-owned meal row detached from the library row;
 * every call creates a fresh copy, so re-assigning yields a second
 * independent row.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  savedMealId: z.string().min(1).max(64),
});

const bodySchema = z.object({
  clientProfileId: z.string().min(1).max(64),
});

export const POST = defineApiV1Route({
  capability: "library.manage",
  params: paramsSchema,
  handler: async ({ workspace, params, request }) => {
    const body = bodySchema.parse(await request.json());
    return assignSavedMealToClient(
      workspace,
      params.savedMealId,
      body.clientProfileId,
    );
  },
});
