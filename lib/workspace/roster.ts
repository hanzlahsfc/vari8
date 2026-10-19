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
 * deterministic. The cursor encodes BOTH sort keys — `id` alone would skip or
 * repeat rows sharing a `createdAt`; `nextCursor` is the last returned row's
 * composite cursor when a next page exists.
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

// "|" is safe: it appears in neither ISO-8601 timestamps nor generated ids
// (unlike ":", which collides with the time component of the timestamp).
const CURSOR_SEP = "|";

/** `<iso createdAt>|<id>` — composite keyset matching the sort order. */
export function encodeRosterCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}${CURSOR_SEP}${id}`;
}

export function parseRosterCursor(
  cursor: string,
): { createdAt: Date; id: string } | null {
  const at = cursor.indexOf(CURSOR_SEP);
  if (at <= 0 || at === cursor.length - 1) return null;
  const createdAt = new Date(cursor.slice(0, at));
  const id = cursor.slice(at + 1);
  if (Number.isNaN(createdAt.getTime()) || id.length === 0) return null;
  return { createdAt, id };
}

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
  const cursor = input.cursor ? parseRosterCursor(input.cursor) : null;
  const rows = await client.clientProfile.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      // "own" scope only ever matches the caller's own profile — used when a
      // role gets a narrowed grant; the D15 matrix currently denies clients
      // roster.read outright, so this is defense in depth, not new scope.
      ...(workspace.scope === "own" ? { userId: viewer.userId } : {}),
      // Keyset predicate matching ORDER BY (created_at, id):
      //   createdAt > c.createdAt OR (createdAt = c.createdAt AND id > c.id)
      ...(cursor
        ? {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const items = rows
    .slice(0, limit)
    .map((row) => ({ clientProfileId: row.id, name: row.name }));
  const nextCursor =
    rows.length > limit
      ? encodeRosterCursor(rows[limit - 1].createdAt, rows[limit - 1].id)
      : null;
  return { items, nextCursor };
}
