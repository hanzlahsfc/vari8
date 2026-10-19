import { ZodError, type ZodType } from "zod";

import { getViewerFromHeaders } from "@/lib/auth/viewer";
import { capabilityScope, memberRoleToRole } from "@/lib/auth/roles";
import type { Capability, CapabilityScope, Role } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";

/**
 * PR-05 /api/v1 route helper (D6): every operation goes through this boundary.
 *
 * Order of operations, fail-closed at each step:
 *   1. authenticate — session cookie or `Authorization: Bearer` (the bearer
 *      plugin rewrites the header into the session cookie inside the auth
 *      pipeline, so both resolve through `auth.api.getSession`). A viewer
 *      additionally requires the user row to be ACTIVE right now.
 *   2. validate — route params and the query string with Zod; bad input never
 *      reaches the workspace lookup.
 *   3. authorize — resolve the caller's ACTIVE membership in an ACTIVE
 *      workspace, map to a D15 role, require a non-deny scope for the route's
 *      declared capability. Non-membership and denial both map to 403 so a
 *      caller cannot distinguish "not my workspace" from "not my role".
 *   4. one service call — the handler receives the resolved context.
 *   5. typed JSON — success body is the service result verbatim; failures are
 *      `{ error: { code } }` with 400 invalid_input / 401 unauthenticated /
 *      403 forbidden / 500 internal.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

export type ApiViewer = {
  userId: string;
  email: string;
  name: string | null;
};

export type ApiWorkspaceContext = {
  workspaceId: string;
  memberId: string;
  role: Role;
  scope: Exclude<CapabilityScope, "deny">;
};

export type V1RouteContext<P, Q> = {
  viewer: ApiViewer;
  workspace: ApiWorkspaceContext;
  params: P;
  query: Q;
  request: Request;
};

export type V1RouteDefinition<P, Q, R> = {
  capability: Capability;
  /** Zod schema for the route's dynamic segment params (must include workspaceId). */
  params: ZodType<P>;
  /** Zod schema for URL search params. */
  query?: ZodType<Q>;
  handler: (ctx: V1RouteContext<P, Q>) => Promise<R>;
};

async function authenticate(request: Request): Promise<ApiViewer> {
  const viewer = await getViewerFromHeaders(request.headers);
  if (!viewer) throw new ApiError(401, "unauthenticated");
  return { userId: viewer.id, email: viewer.email, name: viewer.name };
}

async function resolveWorkspaceContext(
  userId: string,
  workspaceId: string,
  capability: Capability,
): Promise<ApiWorkspaceContext> {
  const member = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { id: true, role: true },
  });
  const role = member ? memberRoleToRole(member.role) : null;
  if (!member || role === null) throw new ApiError(403, "forbidden");
  const scope = capabilityScope(role, capability);
  if (scope === "deny") throw new ApiError(403, "forbidden");
  return { workspaceId, memberId: member.id, role, scope };
}

export function defineApiV1Route<P extends { workspaceId: string }, Q, R>(
  def: V1RouteDefinition<P, Q, R>,
) {
  return async function handle(
    request: Request,
    routeCtx: { params: Promise<unknown> },
  ): Promise<Response> {
    try {
      const viewer = await authenticate(request);
      const params = def.params.parse(await routeCtx.params);
      const query = def.query
        ? def.query.parse(
            Object.fromEntries(new URL(request.url).searchParams.entries()),
          )
        : (undefined as Q);
      const workspace = await resolveWorkspaceContext(
        viewer.userId,
        params.workspaceId,
        def.capability,
      );
      const result = await def.handler({ viewer, workspace, params, query, request });
      return Response.json(result);
    } catch (error) {
      if (error instanceof ApiError) {
        return Response.json(
          { error: { code: error.code } },
          { status: error.status },
        );
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
      return Response.json(
        { error: { code: "internal" } },
        { status: 500 },
      );
    }
  };
}
