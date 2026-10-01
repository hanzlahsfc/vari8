import { cache } from "react";
import { forbidden, redirect } from "next/navigation";

import { auth } from "../../auth";
import { prisma } from "../db";
import {
  createPrismaAuthorizationRepo,
  type PrismaLike,
} from "../workspace/access";
import {
  AccessDeniedError,
  authorize,
  authorizeCollection,
  type AuthorizationContext,
  type CollectionContext,
  type SessionLike,
} from "./guard";
import { type Action, type Resource, type WorkspaceRole } from "./rbac";

/**
 * S1-H — server-side route guard wiring for the authenticated workspace shell.
 *
 * Every helper re-reads current database state through the S1-B guard; nothing
 * trusts JWT claims. Denials from `authorize` are mapped to `null` (and, at the
 * route boundary, to a real HTTP 403 via Next `forbidden()`); unexpected DB
 * errors propagate (they must surface as 500, never as a false 403).
 *
 * `requireSessionUser` is wrapped in React `cache()` so a layout and its page
 * share exactly one `auth()`/session-gate read per request.
 */

/** Roles permitted to read `workspaceSettings` — the staff workspace shell. */
const STAFF_WORKSPACE_ROLES: readonly WorkspaceRole[] = [
  "WORKSPACE_OWNER",
  "COACH",
  "ASSISTANT_COACH",
];

export type WorkspaceAccessRequest = {
  resource: Resource;
  action: Action;
  workspaceId: string;
};

/**
 * Authorize a workspace-scoped request, returning the context or `null` when
 * the guard denies. Only `AccessDeniedError` is mapped to `null`; every other
 * error propagates.
 */
export async function resolveWorkspaceAccess(
  session: SessionLike,
  request: WorkspaceAccessRequest,
  client: PrismaLike = prisma,
): Promise<AuthorizationContext | null> {
  try {
    return await authorize(
      session,
      request,
      createPrismaAuthorizationRepo(client),
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) return null;
    throw error;
  }
}

/**
 * Route-boundary guard: authorize or render the access-denied page (HTTP 403).
 */
export async function requireWorkspaceAccess(
  session: SessionLike,
  request: WorkspaceAccessRequest,
  client: PrismaLike = prisma,
): Promise<AuthorizationContext> {
  const ctx = await resolveWorkspaceAccess(session, request, client);
  if (ctx === null) forbidden();
  return ctx;
}

/**
 * Phase 1.1 — workspace-level Daily Tracker collection guard. A Daily Tracker
 * shell is a workspace collection view (no single client record yet), so it
 * uses `authorizeCollection("dailyTracking/read")`: owner/coach/assistant and a
 * client's own scope resolve, while SUPPORT, non-members, and inactive
 * users/workspaces/memberships deny with a real HTTP 403. No RBAC cell changes.
 */
export async function requireDailyTrackerAccess(
  session: SessionLike,
  workspaceId: string,
  client: PrismaLike = prisma,
): Promise<CollectionContext> {
  try {
    return await authorizeCollection(
      session,
      { resource: "dailyTracking", action: "read", workspaceId },
      createPrismaAuthorizationRepo(client),
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) forbidden();
    throw error;
  }
}

/**
 * Session gate. Returns the session user id plus the raw session, or redirects
 * to the sign-in page. Memoized per request via React `cache()`.
 */
export const requireSessionUser = cache(
  async (): Promise<{ userId: string; session: SessionLike }> => {
    const session = await auth();
    const userId = session?.user?.id;
    if (typeof userId !== "string" || userId.length === 0) redirect("/login");
    return { userId, session };
  },
);

export type SessionWorkspaceSummary = {
  id: string;
  name: string;
  role: WorkspaceRole;
};

/**
 * The session user's ACTIVE staff workspaces, resolved entirely server-side and
 * scoped by `userId` + ACTIVE membership + ACTIVE workspace. CLIENT/SUPPORT-only
 * memberships are intentionally excluded from the staff shell. Minimal fields.
 */
export async function listSessionWorkspaces(
  userId: string,
  client: PrismaLike = prisma,
): Promise<SessionWorkspaceSummary[]> {
  const rows = await client.workspaceMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      role: { in: [...STAFF_WORKSPACE_ROLES] },
      workspace: { status: "ACTIVE" },
    },
    select: { role: true, workspace: { select: { id: true, name: true } } },
    orderBy: { workspace: { name: "asc" } },
  });
  return rows.map((row) => ({
    id: row.workspace.id,
    name: row.workspace.name,
    role: row.role as WorkspaceRole,
  }));
}

/**
 * Post-authorization scoped read of the workspace name for the shell header.
 * Accepts only a workspace-scoped context and fails closed otherwise.
 */
export async function getAuthorizedWorkspaceSummary(
  ctx: AuthorizationContext & { workspaceId: string },
  client: PrismaLike = prisma,
): Promise<{ id: string; name: string }> {
  if (typeof ctx?.workspaceId !== "string" || ctx.workspaceId.length === 0) {
    throw new Error("workspace context required");
  }
  const workspace = await client.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { id: true, name: true },
  });
  if (!workspace) throw new Error("workspace not found");
  return workspace;
}
