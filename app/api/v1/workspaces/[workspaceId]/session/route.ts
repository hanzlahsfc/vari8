import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  CAPABILITIES,
  capabilityScope,
  type Capability,
  type CapabilityScope,
} from "@/lib/auth/roles";

/**
 * GET /api/v1/workspaces/:workspaceId/session — the caller's session context.
 *
 * The canvas wiring (PR-01) calls this once per screen to gate UI: it returns
 * the authenticated user id, the workspace id and membership, the resolved
 * D15 role, and the caller's scope for every capability
 * (`"workspace" | "own" | "deny"`). Cookie or bearer auth; 401 unauthenticated,
 * 403 when the caller is not an ACTIVE member of this workspace.
 *
 * Gated on `own.read` — non-deny for every role — so any workspace member
 * resolves; the response itself carries the real grants.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  handler: async ({ viewer, workspace }) => ({
    user: { id: viewer.userId, email: viewer.email, name: viewer.name },
    workspace: { id: workspace.workspaceId, memberId: workspace.memberId },
    role: workspace.role,
    capabilities: Object.fromEntries(
      CAPABILITIES.map((capability) => [
        capability,
        capabilityScope(workspace.role, capability),
      ]),
    ) as Record<Capability, CapabilityScope>,
  }),
});
