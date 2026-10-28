// Stage 1 card 02 / issue #162 — seeded UI slice. Thin /api/v1 route over
// Hanzlah's merged supplement backend (lib/supplements/*); the owning
// follow-up on #162 replaces this wiring. Do not extend it here.

import { z } from "zod";

import {
  ApiError,
  defineApiV1Route,
  requireOwnClientProfile,
} from "@/lib/api/v1";
import {
  readOwnSupplementPlanFromAction,
  readStaffSupplementPlanFromAction,
  saveSupplementPlanFromAction,
  type SupplementSafeResult,
} from "@/lib/supplements/boundary";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1).max(64),
});

const bodySchema = z.object({
  expectedRevision: z.number().int().min(0),
  name: z.string().optional(),
  items: z.array(z.unknown()),
});

// Closed mapping: the boundary's safe vocabulary becomes typed API errors,
// so no service detail crosses the wire.
function unwrap<T>(result: SupplementSafeResult<T>): T {
  if (result.ok) return result.value;
  switch (result.code) {
    case "denied":
      throw new ApiError(403, "forbidden");
    case "invalid_input":
      throw new ApiError(400, "invalid_input");
    case "conflict":
    case "serialization_conflict":
      throw new ApiError(409, "conflict");
    default:
      // not_available / consent_missing / policy_not_configured surface as
      // the same closed 404 — the caller cannot tell them apart.
      throw new ApiError(404, "not_found");
  }
}

const sessionOf = (userId: string) => ({ user: { id: userId } });

// plan.read resolves "workspace" scope for staff and "own" for a client, so
// the one GET serves the coach reading a roster client and the client
// reading its own saved plan. The backend re-authorizes inside its
// transaction; the workspaceId always comes from the resolved context.
export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  handler: async ({ viewer, workspace, params }) => {
    // B3: under own scope the path id must be the caller's own client
    // profile; a foreign id refuses before any read.
    await requireOwnClientProfile(viewer, workspace, params.clientProfileId);
    const result =
      workspace.scope === "own"
        ? await readOwnSupplementPlanFromAction(sessionOf(viewer.userId), {
            workspaceId: workspace.workspaceId,
          })
        : await readStaffSupplementPlanFromAction(sessionOf(viewer.userId), {
            workspaceId: workspace.workspaceId,
            clientProfileId: params.clientProfileId,
          });
    return unwrap(result);
  },
});

// plan.write is denied for clients at the capability gate, so only staff
// ever reach this handler.
export const PUT = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, workspace, params, request }) => {
    const body = bodySchema.parse(await request.json());
    const result = await saveSupplementPlanFromAction(
      sessionOf(viewer.userId),
      {
        workspaceId: workspace.workspaceId,
        clientProfileId: params.clientProfileId,
        expectedRevision: body.expectedRevision,
        name: body.name,
        items: body.items,
      },
    );
    return unwrap(result);
  },
});
