// FULL-PACKAGE SLICE of #175
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  readStaffIifymPlan,
  saveIifymDraft,
} from "@/lib/iifym/service";

import {
  readBody,
  sessionOf,
  unwrapIifym,
} from "../../../iifym-plans/_result";

/**
 * Card 10 staff surface: the coach's macro-target draft + published
 * version headers for one client (GET), and the shared-draft write
 * (PUT) under `draftRevision` CAS. An optional `timezone` key on PUT is
 * an explicit plan-scoped timezone confirm (mirrors the meal-plan
 * protocol). Every operation re-authorizes `mealPlans/*` inside its own
 * serializable transaction - the route capability only shapes who
 * reaches the service.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const putBodySchema = z.object({
  expectedRevision: z.number().int().min(0),
  title: z.string().min(1).max(80).optional(),
  timezone: z.string().min(1).max(64).optional(),
  draft: z.unknown(),
});

export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapIifym(
      readStaffIifymPlan(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
      }),
    ),
});

export const PUT = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, putBodySchema);
    return unwrapIifym(
      saveIifymDraft(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        expectedRevision: body.expectedRevision,
        title: body.title,
        timezone: body.timezone,
        draft: body.draft,
      }),
    );
  },
});
