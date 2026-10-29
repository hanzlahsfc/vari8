import { z } from "zod";

import { defineApiV1Route, requireOwnClientProfile } from "@/lib/api/v1";
import {
  createTemporaryNutritionPlan,
  listOwnTemporaryNutritionPlans,
  listStaffTemporaryNutritionPlans,
} from "@/lib/mealplan/service";

import { readBody, sessionOf, unwrapMealPlan } from "../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/meal-plans/temporary
 * POST same path - W2-N9 temporary nutrition plans.
 *
 * GET branches on scope exactly like the parent meal-plan route: an
 * own-scope client caller reads only its own rebound profile's rows
 * (requireOwnClientProfile runs BEFORE any row lookup, so a foreign or
 * missing clientProfileId is a 403); staff callers read the requested
 * client's rows.
 *
 * POST is staff-only (plan.write): a dated temporary plan layered on the
 * running nutrition plan. Validation mirrors the frontend contract -
 * closed kind/source labels, non-blank label, real calendar dates, ordered
 * range of at most 28 inclusive days - plus the amendment rule: a
 * same-source range intersection is rejected 400 invalid_input while
 * different sources may overlap.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const bodySchema = z.object({
  kind: z.enum(["refeed", "diet-break", "custom"]),
  label: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  source: z.enum(["mealPlan", "iifym"]),
  plan: z.record(z.string(), z.unknown()),
});

export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  handler: async ({ viewer, workspace, params }) => {
    await requireOwnClientProfile(viewer, workspace, params.clientProfileId);
    return unwrapMealPlan(
      workspace.scope === "own"
        ? listOwnTemporaryNutritionPlans(sessionOf(viewer), {
            workspaceId: params.workspaceId,
          })
        : listStaffTemporaryNutritionPlans(sessionOf(viewer), {
            workspaceId: params.workspaceId,
            clientProfileId: params.clientProfileId,
          }),
    );
  },
});

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapMealPlan(
      createTemporaryNutritionPlan(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        kind: body.kind,
        label: body.label,
        startDate: body.startDate,
        endDate: body.endDate,
        source: body.source,
        plan: body.plan,
      }),
    );
  },
});
