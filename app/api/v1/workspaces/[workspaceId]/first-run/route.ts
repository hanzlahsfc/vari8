import { ZodError, z } from "zod";

import { ApiError, reportV1Failure, requestIdFor } from "@/lib/api/v1";
import { AccessDeniedError } from "@/lib/auth/guard";
import { getViewerFromHeaders } from "@/lib/auth/viewer";
import { readFirstRunChecklist } from "@/lib/dashboard/first-run";

/**
 * GET /api/v1/workspaces/:workspaceId/first-run - the live first-run checklist
 * flags the coach workspace card polls. Cookie or bearer auth like every /api/v1
 * route; the service re-authorizes `workspaceSettings/read` (the staff shell
 * gate) so a denied caller gets the closed 403 shape.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

export async function GET(
  request: Request,
  routeCtx: { params: Promise<unknown> },
): Promise<Response> {
  const requestId = requestIdFor(request);
  try {
    const viewer = await getViewerFromHeaders(request.headers);
    if (!viewer) throw new ApiError(401, "unauthenticated");
    const params = paramsSchema.parse(await routeCtx.params);
    const checklist = await readFirstRunChecklist(
      { user: { id: viewer.id } },
      { workspaceId: params.workspaceId },
    );
    return Response.json(checklist);
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json(
        { error: { code: error.code } },
        { status: error.status },
      );
    }
    if (error instanceof AccessDeniedError) {
      return Response.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: {
            code: "invalid_input",
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              code: issue.code,
            })),
          },
        },
        { status: 400 },
      );
    }
    return reportV1Failure(request, requestId, error);
  }
}
