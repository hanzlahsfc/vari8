import { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import type { AuthorizationRepo } from "../auth/guard";

/**
 * Prisma-backed authorization adapter (S1-B).
 *
 * Narrow selects only, and every client/assignment query is constrained by the
 * workspace directly in the database query — there is no helper that fetches an
 * unscoped client collection for in-memory filtering.
 */
export function createPrismaAuthorizationRepo(
  client: PrismaClient = prisma,
): AuthorizationRepo {
  return {
    getUser: (id) =>
      client.user.findUnique({
        where: { id },
        select: { id: true, platformRole: true, status: true },
      }),
    getWorkspace: (id) =>
      client.workspace.findUnique({
        where: { id },
        select: { id: true, status: true },
      }),
    getMembership: (userId, workspaceId) =>
      client.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { id: true, role: true, status: true },
      }),
    getClientProfileInWorkspace: (clientProfileId, workspaceId) =>
      client.clientProfile.findFirst({
        where: { id: clientProfileId, workspaceId },
        select: { id: true, workspaceId: true, userId: true },
      }),
    getActiveAssignment: ({ workspaceId, clientProfileId, coachMemberId }) =>
      client.clientAssignment.findFirst({
        where: {
          workspaceId,
          clientProfileId,
          coachMemberId,
          status: "ACTIVE",
        },
        select: { id: true },
      }),
  };
}

export const prismaAuthorizationRepo = createPrismaAuthorizationRepo();
