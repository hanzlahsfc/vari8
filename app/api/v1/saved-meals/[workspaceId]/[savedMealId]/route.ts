import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { savedMealPayload } from "@/lib/db-types/saved-meal";

import { upsertSavedMeal } from "@/lib/nutrition/saved-meals";

/**
 * PUT /api/v1/saved-meals/:workspaceId/:savedMealId - T7 (R6) library
 * upsert under `library.manage`. The canvas saved-meal library syncs its
 * coach-local rows here; only library rows are writable (a client-owned
 * copy id is not_found through this route).
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  savedMealId: z.string().min(1).max(64),
});

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  meal: savedMealPayload,
  sortOrder: z.number().int().optional(),
});

export const PUT = defineApiV1Route({
  capability: "library.manage",
  params: paramsSchema,
  handler: async ({ workspace, params, request }) => {
    const body = bodySchema.parse(await request.json());
    return upsertSavedMeal(workspace, params.savedMealId, body);
  },
});
