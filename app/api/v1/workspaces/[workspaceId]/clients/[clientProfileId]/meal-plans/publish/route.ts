// W2-A2 staff meal-plan publish surface.
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { publishMealPlanVersion } from "@/lib/mealplan/service";

import { readBody, sessionOf, unwrapMealPlan } from "../_result";

/**
 * POST /api/v1/workspaces/:workspaceId/clients/:clientProfileId/meal-plans/publish
 *
 * Mints an immutable effective-dated version from the current shared
 * draft. `expectedRevision` is the publish-origin revision: replaying
 * the same call returns the stored version unchanged (checked before
 * the CAS). A foreign-workspace caller never reaches the service: the
 * workspace member check above returns 403.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const bodySchema = z.object({
  expectedRevision: z.number().int().min(1),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapMealPlan(
      publishMealPlanVersion(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        expectedRevision: body.expectedRevision,
        effectiveDate: body.effectiveDate,
      }),
    );
  },
});
