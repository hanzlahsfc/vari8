import { randomUUID } from "node:crypto";

import {
  ApiError,
  type ApiViewer,
  type ApiWorkspaceContext,
} from "@/lib/api/v1";
import { prisma } from "@/lib/db";
import type { SavedMealPayload } from "@/lib/db-types/saved-meal";

/**
 * T7 (R6) saved-meal service: the coach reusable-meal library plus the
 * assign action that copies a library row into a client-owned meal row.
 * Called only inside `defineApiV1Route`, so the viewer is authenticated and
 * the workspace context carries the caller's D15 role scope.
 *
 * Ownership semantics ("library" vs "client-owned"):
 *   - A saved_meal row with client_profile_id NULL is a coach library row.
 *   - Assign creates a NEW row owned by exactly one client profile: fresh
 *     row id, regenerated meal.id inside the JSONB payload, and a
 *     source_saved_meal_id provenance pointer. The copy is detached:
 *     library edits and deletes never propagate, and re-assigning produces
 *     a second independent copy rather than updating the first.
 *   - Library writes (upsert, assign source, delete) require
 *     `library.manage` upstream; the client-visible list runs under
 *     `clientData.read` and resolves to the caller's own profile.
 */

type SavedMealWire = {
  id: string;
  name: string;
  sortOrder: number;
  meal: SavedMealPayload;
  clientProfileId: string | null;
  sourceSavedMealId: string | null;
  assignedAt: string | null;
};

function toWire(row: {
  id: string;
  name: string;
  sortOrder: number;
  meal: unknown;
  clientProfileId: string | null;
  sourceSavedMealId: string | null;
  assignedAt: Date | null;
}): SavedMealWire {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    meal: row.meal as SavedMealPayload,
    clientProfileId: row.clientProfileId,
    sourceSavedMealId: row.sourceSavedMealId,
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
  };
}

const ROW_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  meal: true,
  clientProfileId: true,
  sourceSavedMealId: true,
  assignedAt: true,
} as const;

async function resolveClientProfile(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  requestedClientProfileId?: string,
): Promise<{ id: string }> {
  if (workspace.scope === "own") {
    // Client role: the profile derives from the caller's own account. A
    // requested id that is not their own is forbidden, not "not found".
    const own = await prisma.clientProfile.findFirst({
      where: { workspaceId: workspace.workspaceId, userId: viewer.userId },
      select: { id: true },
    });
    if (!own) throw new ApiError(403, "forbidden");
    if (requestedClientProfileId && requestedClientProfileId !== own.id)
      throw new ApiError(403, "forbidden");
    return own;
  }
  if (!requestedClientProfileId) throw new ApiError(400, "invalid_input");
  const profile = await prisma.clientProfile.findFirst({
    where: { id: requestedClientProfileId, workspaceId: workspace.workspaceId },
    select: { id: true },
  });
  if (!profile) throw new ApiError(404, "not_found");
  return profile;
}

/**
 * GET /api/v1/saved-meals/:workspaceId - staff library list under
 * `library.manage`. Returns live library rows (client copies excluded)
 * with the profile ids each row is currently assigned to.
 */
export async function listSavedMeals(workspace: ApiWorkspaceContext) {
  const rows = await prisma.savedMeal.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      clientProfileId: null,
      deletedAt: null,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: ROW_SELECT,
  });
  const copies = await prisma.savedMeal.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      sourceSavedMealId: { in: rows.map((row) => row.id) },
      deletedAt: null,
    },
    select: { sourceSavedMealId: true, clientProfileId: true },
  });
  const assignedBy = new Map<string, Set<string>>();
  for (const copy of copies) {
    if (!copy.sourceSavedMealId || !copy.clientProfileId) continue;
    const set = assignedBy.get(copy.sourceSavedMealId) ?? new Set<string>();
    set.add(copy.clientProfileId);
    assignedBy.set(copy.sourceSavedMealId, set);
  }
  return {
    items: rows.map((row) => ({
      ...toWire(row),
      assignedClientProfileIds: [...(assignedBy.get(row.id) ?? [])],
    })),
  };
}

/**
 * PUT /api/v1/saved-meals/:workspaceId/:savedMealId - upsert one library
 * row (the canvas library syncs coach-local saved meals here). Only
 * library rows are writable: a client-owned copy id is not_found through
 * this route, and the target row is never a copy.
 */
export async function upsertSavedMeal(
  workspace: ApiWorkspaceContext,
  savedMealId: string,
  input: { name: string; meal: SavedMealPayload; sortOrder?: number },
) {
  const existing = await prisma.savedMeal.findFirst({
    where: { id: savedMealId, workspaceId: workspace.workspaceId },
    select: { id: true, clientProfileId: true },
  });
  if (existing && existing.clientProfileId !== null)
    throw new ApiError(404, "not_found");

  const row = await prisma.savedMeal.upsert({
    where: {
      id_workspaceId: { id: savedMealId, workspaceId: workspace.workspaceId },
    },
    create: {
      id: savedMealId,
      workspaceId: workspace.workspaceId,
      name: input.name,
      meal: input.meal,
      sortOrder: input.sortOrder ?? 0,
      createdByMemberId: workspace.memberId,
    },
    update: {
      name: input.name,
      meal: input.meal,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      revision: { increment: 1 },
    },
    select: ROW_SELECT,
  });
  return { savedMeal: toWire(row) };
}

/**
 * POST .../assignments - copy one library row into a new client-owned
 * meal row for exactly the chosen client. NOT idempotent: every call
 * creates a fresh detached row, so a re-assign yields a second
 * independent copy and neither row is corrupted. The source must be a
 * live library row in this workspace; the client must be a profile in
 * this workspace.
 */
export async function assignSavedMealToClient(
  workspace: ApiWorkspaceContext,
  savedMealId: string,
  clientProfileId: string,
) {
  const source = await prisma.savedMeal.findFirst({
    where: {
      id: savedMealId,
      workspaceId: workspace.workspaceId,
      clientProfileId: null,
      deletedAt: null,
    },
    select: { id: true, name: true, meal: true },
  });
  if (!source) throw new ApiError(404, "not_found");

  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId: workspace.workspaceId },
    select: { id: true },
  });
  if (!client) throw new ApiError(404, "not_found");

  const payload = source.meal as SavedMealPayload;
  const copy = await prisma.savedMeal.create({
    data: {
      workspaceId: workspace.workspaceId,
      name: source.name,
      meal: { ...payload, id: randomUUID() },
      createdByMemberId: workspace.memberId,
      clientProfileId: client.id,
      sourceSavedMealId: source.id,
      assignedByMemberId: workspace.memberId,
      assignedAt: new Date(),
    },
    select: ROW_SELECT,
  });
  return { clientMeal: toWire(copy) };
}

/**
 * GET /api/v1/saved-meals/:workspaceId/assigned - the client-visible own
 * list under `clientData.read`. Clients resolve to their own profile
 * through the session (any other id is forbidden); staff name
 * `clientProfileId` to preview. Only live client-owned rows are listed.
 */
export async function listAssignedMeals(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  requestedClientProfileId?: string,
) {
  const profile = await resolveClientProfile(
    viewer,
    workspace,
    requestedClientProfileId,
  );
  const rows = await prisma.savedMeal.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      clientProfileId: profile.id,
      deletedAt: null,
    },
    orderBy: [{ assignedAt: "desc" }, { name: "asc" }],
    select: ROW_SELECT,
  });
  return { items: rows.map(toWire) };
}
