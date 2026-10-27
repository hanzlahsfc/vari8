import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listWorkspaceAttentionTriage } from "@/lib/dashboard/service";

/**
 * GET /api/v1/workspaces/:workspaceId/attention. W2-T5 (R11) coach
 * attention triage: derived per-client needsAttention rows. Staff-only
 * via the roster.read capability (owner + coach workspace scope,
 * clients denied at the route layer).
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "roster.read",
  params: paramsSchema,
  handler: ({ viewer, workspace }) =>
    listWorkspaceAttentionTriage(viewer, workspace),
});
