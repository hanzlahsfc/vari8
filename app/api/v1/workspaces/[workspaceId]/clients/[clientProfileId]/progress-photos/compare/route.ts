import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { compareProgressPhotos } from "../service";

/**
 * GET .../progress-photos/compare?first=<id>&second=<id> — card 08 (#172)
 * comparator. Both entries must belong to the path client, so a pair
 * spanning two clients is refused as not found.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1).max(64),
});

const querySchema = z.object({
  first: z.string().min(1).max(64),
  second: z.string().min(1).max(64),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: ({ viewer, workspace, params, query }) =>
    compareProgressPhotos(
      viewer,
      workspace,
      params.clientProfileId,
      query.first,
      query.second,
    ),
});
