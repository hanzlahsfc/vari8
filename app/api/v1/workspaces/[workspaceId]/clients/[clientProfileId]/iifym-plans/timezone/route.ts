// FULL-PACKAGE SLICE of #175
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { setIifymTimezone } from "@/lib/iifym/service";

import {
  readBody,
  sessionOf,
  unwrapIifym,
} from "../../../../iifym-plans/_result";

/**
 * POST /api/v1/workspaces/:workspaceId/clients/:clientProfileId/iifym-plans/timezone
 *
 * Card 10 timezone confirm - the plan-scoped scheduling timezone the
 * published versions' effective dates resolve against. Explicit action,
 * never inferred from the coach's browser zone; idempotent when the
 * stored zone already matches. Re-authorizes `mealPlans/write` +
 * ACTIVE assignment inside a serializable transaction.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const bodySchema = z.object({
  timezone: z.string().min(1).max(64),
});

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapIifym(
      setIifymTimezone(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        timezone: body.timezone,
      }),
    );
  },
});
