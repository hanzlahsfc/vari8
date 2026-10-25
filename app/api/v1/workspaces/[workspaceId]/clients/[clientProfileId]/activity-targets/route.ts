// Issue #169 (Stage 5 card 07): thin /api/v1 route over the activity-targets
// domain (lib/activity-targets/*). GET on plan.read resolves workspace scope
// for staff and own scope for the client; PUT on plan.write denies clients at
// the capability gate. `confirmation_required` crosses as a distinct 409 code
// so the editor can show the same-day replace confirm dialog.

import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  readOwnActivityTargetsFromAction,
  readStaffActivityTargetsFromAction,
  writeActivityTargetFromAction,
  type ActivityTargetSafeResult,
} from "@/lib/activity-targets/boundary";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1).max(64),
});

const bodySchema = z.object({
  metric: z.string().min(1),
  effectiveFrom: z.string().min(1),
  confirmSameDay: z.boolean().optional(),
  target: z.unknown().nullable(),
});

// Closed mapping: the boundary's safe vocabulary becomes typed API errors,
// so no service detail crosses the wire.
function unwrap<T>(result: ActivityTargetSafeResult<T>): T {
  if (result.ok) return result.value;
  switch (result.code) {
    case "denied":
      throw new ApiError(403, "forbidden");
    case "invalid_input":
      throw new ApiError(400, "invalid_input");
    case "confirmation_required":
      throw new ApiError(409, "confirmation_required");
    case "conflict":
    case "serialization_conflict":
      throw new ApiError(409, "conflict");
  }
}

const sessionOf = (userId: string) => ({ user: { id: userId } });

// plan.read resolves "workspace" scope for staff and "own" for a client, so
// the one GET serves the coach reading a roster client and the client
// reading its own versions. The service re-authorizes inside its
// transaction; the workspaceId always comes from the resolved context.
export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  handler: async ({ viewer, workspace, params }) => {
    const result =
      workspace.scope === "own"
        ? await readOwnActivityTargetsFromAction(sessionOf(viewer.userId), {
            workspaceId: workspace.workspaceId,
          })
        : await readStaffActivityTargetsFromAction(sessionOf(viewer.userId), {
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
    const result = await writeActivityTargetFromAction(
      sessionOf(viewer.userId),
      {
        workspaceId: workspace.workspaceId,
        clientProfileId: params.clientProfileId,
        metric: body.metric,
        effectiveFrom: body.effectiveFrom,
        target: body.target,
        confirmSameDay: body.confirmSameDay,
      },
    );
    return unwrap(result);
  },
});
