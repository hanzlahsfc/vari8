import type { ApiViewer, ApiWorkspaceContext } from "@/lib/api/v1";
import { prisma } from "@/lib/db";
import type { PrismaLike } from "./access";

/**
 * PR-05: the coach's client roster read — the reference operation for the
 * /api/v1 foundation. Authorization (membership, ACTIVE workspace, capability
 * scope) is resolved by the route helper; this service trusts that typed
 * context and performs the scoped read only.
 *
 * Ordering is a stable (created_at, id) keyset so `cursor` pagination is
 * deterministic; `nextCursor` is the last row's id when a next page exists.
 */
export type ClientRosterEntry = {
  clientProfileId: string;
  name: string;
};

export type ClientRosterResult = {
  items: ClientRosterEntry[];
  nextCursor: string | null;
};

export const ROSTER_DEFAULT_LIMIT = 25;
export const ROSTER_MAX_LIMIT = 100;

export async function listWorkspaceClientRoster(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  input: { limit?: number; cursor?: string },
  client: PrismaLike = prisma,
): Promise<ClientRosterResult> {
  const limit = Math.min(
    ROSTER_MAX_LIMIT,
    Math.max(1, Math.floor(input.limit ?? ROSTER_DEFAULT_LIMIT)),
  );
  const rows = await client.clientProfile.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      // "own" scope only ever matches the caller's own profile — used when a
      // role gets a narrowed grant; the D15 matrix currently denies clients
      // roster.read outright, so this is defense in depth, not new scope.
      ...(workspace.scope === "own" ? { userId: viewer.userId } : {}),
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
    },
    select: { id: true, name: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const items = rows
    .slice(0, limit)
    .map((row) => ({ clientProfileId: row.id, name: row.name }));
  const nextCursor = rows.length > limit ? rows[limit - 1].id : null;
  return { items, nextCursor };
}
