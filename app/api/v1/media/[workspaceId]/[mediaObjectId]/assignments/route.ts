import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { assignMediaToClient } from "../../../service";

/**
 * POST /api/v1/media/:workspaceId/:mediaObjectId/assignments - T6 (R8)
 * staff assignment write under `library.manage`. Body:
 * `{ clientProfileId }`; grants the item to that client. Idempotent: a
 * live grant returns the durable row rather than a conflict.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  mediaObjectId: z.string().min(1).max(64),
});

const bodySchema = z.object({
  clientProfileId: z.string().min(1).max(64),
});

export const POST = defineApiV1Route({
  capability: "library.manage",
  params: paramsSchema,
  handler: async ({ workspace, params, request }) => {
    const body = bodySchema.parse(await request.json());
    return assignMediaToClient(
      workspace,
      params.mediaObjectId,
      body.clientProfileId,
    );
  },
});
