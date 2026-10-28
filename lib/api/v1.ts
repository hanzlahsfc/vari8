import { randomUUID } from "node:crypto";

import { ZodError, type ZodType } from "zod";

import { getViewerFromHeaders } from "@/lib/auth/viewer";
import { capabilityScope, memberRoleToRole } from "@/lib/auth/roles";
import type { Capability, CapabilityScope, Role } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { logError, TRUSTED_ID_SHAPE, trustedId } from "@/lib/log";

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

/**
 * Own-scope path binding (B3): a client-scoped route whose resolved scope is
 * "own" serves only the caller's own client profile. When the path
 * clientProfileId is missing or is not the caller's own profile, refuse with
 * the same 403 the capability gate emits, before any domain read: a foreign
 * id is indistinguishable from a denied capability. No-op for staff scope:
 * staff reads stay bound to the path id inside the domain services.
 */
export async function requireOwnClientProfile(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  clientProfileId: string,
): Promise<void> {
  if (workspace.scope !== "own") return;
  const own = await prisma.clientProfile.findFirst({
    where: { workspaceId: workspace.workspaceId, userId: viewer.userId },
    select: { id: true },
  });
  if (!own || own.id !== clientProfileId) throw new ApiError(403, "forbidden");
}

/**
 * LOGGING (#168): an inbound `x-request-id` is honored only when it matches a
 * safe token shape — a caller-controlled id must not smuggle newlines or markup
 * into a log line; anything else mints a fresh UUID. The id is echoed back on
 * the 500 response so a client can report it against the log line.
 */
export function requestIdFor(request: Request): string {
  const inbound = request.headers.get("x-request-id");
  return inbound && TRUSTED_ID_SHAPE.test(inbound) ? inbound : randomUUID();
}

/**
 * The one structured failure reporter for /api/v1 — used by the
 * defineApiV1Route funnel for every unhandled handler error and by routes
 * that cannot go through the wrapper (`media/object` redeems an HMAC
 * signature instead of a session). One redacted line on stdout, then the
 * safe `{ error: { code: "internal" } }` body with the correlation id the
 * line used — logged and returned ids are identical by construction.
 */
export function reportV1Failure(
  request: Request,
  requestId: string,
  error: unknown,
): Response {
  // Re-validate: callers pass requestIdFor's output today, but the trusted
  // marker must never carry an unvalidated string into a log line.
  const id = TRUSTED_ID_SHAPE.test(requestId) ? requestId : randomUUID();
  logError("api_v1_request_failed", {
    requestId: trustedId(id),
    method: request.method,
    route: new URL(request.url).pathname,
    status: 500,
    error,
  });
  return Response.json(
    { error: { code: "internal" } },
    { status: 500, headers: { "x-request-id": id } },
  );
}

export function defineApiV1Route<P extends { workspaceId: string }, Q, R>(
  def: V1RouteDefinition<P, Q, R>,
) {
  return async function handle(
    request: Request,
    routeCtx: { params: Promise<unknown> },
  ): Promise<Response> {
    const requestId = requestIdFor(request);
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
      const result = await def.handler({
        viewer,
        workspace,
        params,
        query,
        request,
      });
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
      // One error line per unhandled 500 — request id, route and status,
      // redacted error. Typed ApiError/ZodError responses are expected
      // traffic and never reach the log.
      // One error line per unhandled 500 — request id, route and status,
      // redacted error. Typed ApiError/ZodError responses are expected
      // traffic and never reach the log.
      return reportV1Failure(request, requestId, error);
    }
  };
}
