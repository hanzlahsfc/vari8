// FULL-PACKAGE SLICE of #175
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readOwnIifymPlan } from "@/lib/iifym/service";

import { sessionOf, unwrapIifym } from "./_result";

/**
 * GET /api/v1/workspaces/:workspaceId/iifym-plans
 *
 * Card 10 client surface: the caller's own CURRENT published macro
 * target version (immutable payload: options + weekday schedule) plus
 * the earliest upcoming header, resolved from the session - no client id
 * in the path because the service binds the caller's own client profile.
 * The weekday->option resolution happens in the canvas via
 * `scheduledOption`; the draft is never selected, never returned.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapIifym(
      readOwnIifymPlan(sessionOf(viewer), {
        workspaceId: params.workspaceId,
      }),
    ),
});
