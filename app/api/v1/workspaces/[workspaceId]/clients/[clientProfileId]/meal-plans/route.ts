// W2-A2 staff meal-plan surface.
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readStaffMealPlan, saveMealPlanDraft } from "@/lib/mealplan/service";

import { readBody, sessionOf, unwrapMealPlan } from "./_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/meal-plans
 *
 * Staff detail read: shared draft + bounded version headers +
 * server-resolved current/upcoming. `plan.read` gates the route; the
 * service re-authorizes under locks (assigned coaches need an ACTIVE
 * ClientAssignment). A foreign-workspace caller never reaches the
 * service: the workspace member check above returns 403.
 *
 * PUT: save the shared draft under `expectedRevision` CAS. Revision 0
 * creates the container (title required). An explicit `timezone`
 * confirm stamps provenance; it never retimes published snapshots.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const querySchema = z.object({
  cursor: z.coerce.number().int().min(1).optional(),
});

const bodySchema = z.object({
  expectedRevision: z.number().int().min(0),
  title: z.string().min(1).optional(),
  draft: z.unknown(),
  timezone: z.string().min(1).optional(),
});

export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapMealPlan(
      readStaffMealPlan(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        cursor: query.cursor,
      }),
    ),
});

export const PUT = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapMealPlan(
      saveMealPlanDraft(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        expectedRevision: body.expectedRevision,
        title: body.title,
        draft: body.draft,
        timezone: body.timezone,
      }),
    );
  },
});
