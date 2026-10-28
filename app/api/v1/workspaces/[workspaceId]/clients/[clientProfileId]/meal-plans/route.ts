// W2-A2 meal-plan surface; W2-N7 adds the client own-scope GET branch.
import { z } from "zod";

import { defineApiV1Route, requireOwnClientProfile } from "@/lib/api/v1";
import {
  readOwnMealPlan,
  readStaffMealPlan,
  saveMealPlanDraft,
  type OwnMealPlanView,
  type StaffMealPlanView,
} from "@/lib/mealplan/service";

import { readBody, sessionOf, unwrapMealPlan } from "./_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/meal-plans
 *
 * Staff detail read: shared draft + bounded version headers +
 * server-resolved current/upcoming. `plan.read` gates the route; the
 * service re-authorizes under locks (assigned coaches need an ACTIVE
 * ClientAssignment). A foreign-workspace caller never reaches the
 * service: the workspace member check above returns 403.
 * Own-scope read (W2-N7): a client caller is bound to its own
 * clientProfileId before any read, then gets the published current
 * payload plus upcoming version metadata only; draft and staff fields
 * stay on the staff branch.
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
  handler: async ({ viewer, workspace, params, query }) => {
    await requireOwnClientProfile(viewer, workspace, params.clientProfileId);
    const result: Promise<OwnMealPlanView | StaffMealPlanView> =
      workspace.scope === "own"
        ? readOwnMealPlan(sessionOf(viewer), {
            workspaceId: workspace.workspaceId,
          })
        : readStaffMealPlan(sessionOf(viewer), {
            workspaceId: workspace.workspaceId,
            clientProfileId: params.clientProfileId,
            cursor: query.cursor,
          });
    return unwrapMealPlan(result);
  },
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
