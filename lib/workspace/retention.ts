import { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { writeAuditEvent } from "../audit";
import { AccessDeniedError, authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "./access";
import { WorkspaceServiceError, type ClientLifecycleResult } from "./clients";

/**
 * PR-M1 retention-gated delete (D27).
 *
 * Archive is the soft archive owned by `clients.ts`; this module owns the
 * retention gate and the "delete the client for good" operation:
 *
 * - `archivedAt` must be set (an unarchived client is not in retention), and
 *   `archivedAt <= now - workspace.retentionDays` (default 90 days, per
 *   workspace, D27). Nothing is deleted automatically.
 * - A successful delete writes one structural audit event in the same
 *   transaction (ids and the REMOVED status marker only, never content).
 * - The client profile row is deleted. Dependent client-scoped records hold
 *   RESTRICT foreign keys (PR-M0), so a delete that would orphan records is
 *   refused by the database and surfaced as `client_not_deletable`; the wider
 *   erasure of client-scoped records is the parked retention/erasure policy
 *   (D12, product-decisions D-10), not this card.
 */

export const DEFAULT_RETENTION_DAYS = 90;

const DAY_MS = 86_400_000;

/** Instant at and before which an archived client leaves retention. */
export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * The retention boundary, inclusive: `archivedAt` exactly on the cutoff means
 * the full period has elapsed and delete is permitted; anything later refuses.
 */
export function retentionElapsed(
  archivedAt: Date,
  retentionDays: number,
  now: Date,
): boolean {
  return archivedAt.getTime() <= retentionCutoff(now, retentionDays).getTime();
}

function mapDeleteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // FK RESTRICT: client-scoped dependent records still reference the profile.
    if (error.code === "P2003")
      throw new WorkspaceServiceError("client_not_deletable");
    if (error.code === "P2034")
      throw new WorkspaceServiceError("serialization_conflict");
  }
  throw error;
}

/**
 * Delete a client profile for good (D27). Staff only: the CLIENT `own` write
 * scope is refused, matching archive/restore in `clients.ts`.
 *
 * Refusals: `client_not_accessible` (absent or foreign-workspace profile),
 * `client_not_archived` (retention never started), `retention_not_elapsed`
 * (inside the workspace's retention window), `client_not_deletable`
 * (dependent records still reference the profile).
 */
export async function deleteClientProfile(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  client: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<ClientLifecycleResult> {
  try {
    return await client.$transaction(
      async (tx) => {
        const context = await authorize(
          session,
          {
            resource: "clientProfiles",
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        if (context.grantedScope === "own")
          throw new AccessDeniedError("role_denied", "clientProfiles", "write");

        const profile = await tx.clientProfile.findFirst({
          where: { id: input.clientProfileId, workspaceId: input.workspaceId },
          select: { id: true, archivedAt: true },
        });
        if (!profile) throw new WorkspaceServiceError("client_not_accessible");
        if (!profile.archivedAt)
          throw new WorkspaceServiceError("client_not_archived");

        const workspace = await tx.workspace.findUnique({
          where: { id: input.workspaceId },
          select: { retentionDays: true },
        });
        const retentionDays =
          workspace?.retentionDays ?? DEFAULT_RETENTION_DAYS;
        if (!retentionElapsed(profile.archivedAt, retentionDays, now))
          throw new WorkspaceServiceError("retention_not_elapsed");

        // The audit row is written before the delete it describes: the row's
        // own subject link is set-null by the delete, so `resourceId` is the
        // durable structural reference to the deleted profile.
        await writeAuditEvent(tx, context, {
          action: "DELETE",
          resourceType: "client_profile",
          resourceId: profile.id,
          subjectClientProfileId: profile.id,
          meta: { status: "REMOVED" },
        });
        await tx.clientProfile.delete({ where: { id: profile.id } });
        return { clientProfileId: profile.id, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    mapDeleteError(error);
  }
}
