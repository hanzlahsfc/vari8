import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readOwnNextCheckInInstance } from "@/lib/checkin/instances-boundary";

import { sessionOf, unwrap } from "../../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/checkins/instances/next
 *
 * Card 05b: the earliest unfinished scheduled Check-In for the calling
 * client: how the own check-in screen learns its instanceId without a
 * staff-scoped list. `next` is null for the truthful no-pending state.
 * Static `next` resolves before the `[instanceId]` dynamic segment.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrap(
      await readOwnNextCheckInInstance(sessionOf(viewer), {
        workspaceId: params.workspaceId,
      }),
    ),
});
