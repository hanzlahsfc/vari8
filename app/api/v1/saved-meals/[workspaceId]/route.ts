import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { listSavedMeals } from "@/lib/nutrition/saved-meals";

/**
 * GET /api/v1/saved-meals/:workspaceId - T7 (R6) staff library list under
 * `library.manage`. Returns live library rows (client-owned copies are
 * excluded) with the profile ids each row is assigned to.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "library.manage",
  params: paramsSchema,
  handler: async ({ workspace }) => listSavedMeals(workspace),
});
