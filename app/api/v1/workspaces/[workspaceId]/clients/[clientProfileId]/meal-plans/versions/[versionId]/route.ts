// W2-A2 staff meal-plan version detail surface.
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readStaffMealPlanVersion } from "@/lib/mealplan/service";

import { sessionOf, unwrapMealPlan } from "../../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/meal-plans/versions/:versionId
 *
 * Exact-id version read, tenant- and client-coherent: a version id from
 * another client or workspace is not accessible (403 via
 * plan_not_accessible). The coach canvas uses it to hydrate the ACTIVE
 * plan payload; the detail read returns only version headers.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
  versionId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapMealPlan(
      readStaffMealPlanVersion(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        versionId: params.versionId,
      }),
    ),
});
