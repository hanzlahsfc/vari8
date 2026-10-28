import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { deleteTemporaryNutritionPlan } from "@/lib/mealplan/service";

import { sessionOf, unwrapMealPlan } from "../../_result";

/**
 * DELETE
 * /api/v1/workspaces/:workspaceId/clients/:clientProfileId/meal-plans/temporary/:temporaryPlanId
 *
 * W2-N9 staff delete of one temporary nutrition plan row scoped beneath
 * the client. A foreign or missing id reads as denied (403), never 404.
 * Clients are denied by the plan.write capability before the service.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
  temporaryPlanId: z.string().min(1),
});

export const DELETE = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapMealPlan(
      deleteTemporaryNutritionPlan(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        temporaryPlanId: params.temporaryPlanId,
      }),
    ),
});
