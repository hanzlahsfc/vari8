import { randomUUID } from "node:crypto";

import type { MediaKind } from "@prisma/client";

import {
  ApiError,
  type ApiViewer,
  type ApiWorkspaceContext,
} from "@/lib/api/v1";
import { prisma } from "@/lib/db";
import {
  assertMediaByteSize,
  clientObjectPrefix,
  getObjectStorage,
  mediaKindForContentType,
  parseClientObjectKey,
  presignTtlSeconds,
  StorageError,
} from "@/lib/storage";

/**
 * PR-MEDIA media service (D20) — the one place upload intents and download
 * mints are decided. Called only inside `defineApiV1Route`, so the viewer is
 * authenticated and the workspace context already carries the caller's D15
 * role scope for `message.write`.
 *
 * Scope semantics ("own" = client role):
 *   - Upload: keys are anchored to a client profile. A client may only
 *     upload under the client profile linked to their user account; staff
 *     name the profile explicitly and it must belong to the workspace, or
 *     pass `library: true` to file the item under the coach library owner
 *     (media_object.client_profile_id stays NULL for library items).
 *   - Download: a client may mint a URL only for objects under their own
 *     client profile prefix or for an object assigned to them through
 *     media_assignment (T6). Anything else is 403, indistinguishable from
 *     non-membership upstream.
 *
 * T6 (R7/R8): the library list, assignment writes and the delete path run
 * under `library.manage` (staff only upstream); the client-visible list
 * runs under `clientData.read` where the profile resolves own-scope. The
 * delete decision is FAIL: a live assignment maps to 409 `has_assignments`
 * and the media row stays live until every grant is removed.
 *
 * Storage failures map to typed API errors: an unconfigured backend is 503
 * (`storage_not_configured`), a rejected type is 400
 * (`unsupported_media_type`), an over-cap size is 400 (`payload_too_large`).
 */

/** Reserved pseudo-owner segment for coach library object keys. */
const LIBRARY_OWNER = "library";

export type UploadIntentInput = {
  fileName: string;
  contentType: string;
  byteSize: number;
  clientProfileId?: string;
  library?: boolean;
};

function mapStorageError(error: unknown): never {
  if (error instanceof StorageError) {
    switch (error.code) {
      case "storage_not_configured":
        throw new ApiError(503, "storage_not_configured");
      case "payload_too_large":
        throw new ApiError(400, "payload_too_large");
      case "unsupported_media_type":
        throw new ApiError(400, "unsupported_media_type");
      default:
        throw new ApiError(400, "invalid_input");
    }
  }
  throw error;
}

/** The client profile this upload/download is anchored to, fail-closed. */
async function resolveClientProfile(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  requestedClientProfileId?: string,
): Promise<{ id: string }> {
  if (workspace.scope === "own") {
    // Client role: the profile is derived from the viewer's own account.
    // A requested id that is not their own is forbidden, not "not found".
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
 * POST /api/v1/media/:workspaceId — create the media_object pointer and the
 * presigned PUT for its bytes. The row records the declared size and type;
 * the local object route re-checks the actual bytes against it, and the
 * schema CHECK caps byte_size at 20 MB.
 */
export async function createMediaUpload(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  input: UploadIntentInput,
) {
  try {
    const kind = mediaKindForContentType(input.contentType);
    if (!kind) throw new StorageError("unsupported_media_type");
    const byteSize = assertMediaByteSize(input.byteSize);
    // T6 (R7): `library: true` files the upload under the reserved library
    // owner and leaves client_profile_id NULL. Only staff may use it - a
    // client-scoped caller naming the library owner is invalid input.
    const library = input.library === true;
    if (library && workspace.scope !== "workspace")
      throw new ApiError(400, "invalid_input");
    const profile = library
      ? null
      : await resolveClientProfile(viewer, workspace, input.clientProfileId);

    const mediaObjectId = randomUUID();
    const storageKey =
      clientObjectPrefix(
        workspace.workspaceId,
        profile ? profile.id : LIBRARY_OWNER,
      ) + mediaObjectId;
    const backend = await getObjectStorage();
    const upload = await backend.presignPut(storageKey, {
      contentType: input.contentType,
      byteSize,
      ttlSeconds: presignTtlSeconds(),
    });

    const media = await prisma.mediaObject.create({
      data: {
        id: mediaObjectId,
        workspaceId: workspace.workspaceId,
        kind,
        storageKey,
        fileName: input.fileName,
        contentType: input.contentType,
        byteSize: BigInt(byteSize),
        uploadedByUserId: viewer.userId,
        clientProfileId: profile?.id ?? null,
      },
      select: {
        id: true,
        kind: true,
        fileName: true,
        contentType: true,
        byteSize: true,
        clientProfileId: true,
      },
    });

    return {
      mediaObject: {
        id: media.id,
        kind: media.kind,
        fileName: media.fileName,
        contentType: media.contentType,
        byteSize: Number(media.byteSize),
        clientProfileId: media.clientProfileId,
      },
      upload,
    };
  } catch (error) {
    mapStorageError(error);
  }
}

/**
 * GET /api/v1/media/:workspaceId/:mediaObjectId — mint a short-lived
 * download URL for a live media_object row in this workspace.
 */
export async function mintMediaDownload(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  mediaObjectId: string,
) {
  try {
    const media = await prisma.mediaObject.findFirst({
      where: {
        id: mediaObjectId,
        workspaceId: workspace.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        kind: true,
        storageKey: true,
        fileName: true,
        contentType: true,
        byteSize: true,
      },
    });
    if (!media) throw new ApiError(404, "not_found");

    const { workspaceId, clientProfileId } = parseClientObjectKey(
      media.storageKey,
    );
    if (workspaceId !== workspace.workspaceId)
      throw new ApiError(404, "not_found");

    if (workspace.scope === "own") {
      const own = await prisma.clientProfile.findFirst({
        where: { workspaceId: workspace.workspaceId, userId: viewer.userId },
        select: { id: true },
      });
      if (!own) throw new ApiError(403, "forbidden");
      // T6 (R8): own prefix always mints; any other owner prefix mints only
      // when a live media_assignment grants the item to this client.
      if (own.id !== clientProfileId) {
        const grant = await prisma.mediaAssignment.findFirst({
          where: {
            workspaceId: workspace.workspaceId,
            mediaObjectId,
            clientProfileId: own.id,
          },
          select: { id: true },
        });
        if (!grant) throw new ApiError(403, "forbidden");
      }
    }

    const backend = await getObjectStorage();
    const download = await backend.presignGet(
      media.storageKey,
      presignTtlSeconds(),
    );

    return {
      mediaObject: {
        id: media.id,
        kind: media.kind,
        fileName: media.fileName,
        contentType: media.contentType,
        byteSize: Number(media.byteSize),
      },
      download,
    };
  } catch (error) {
    mapStorageError(error);
  }
}

export type MediaLibraryFilter = {
  kind?: MediaKind;
  /** "library" = coach-owned rows (client_profile_id NULL);
   *  "client" = rows owned by a client profile; undefined = everything. */
  ownership?: "library" | "client";
};

/**
 * GET /api/v1/media/:workspaceId - the staff library list (`library.manage`
 * upstream, so only workspace scope reaches here). Every live media row is
 * listed with its owner and the clients it is currently assigned to.
 */
export async function listMediaLibrary(
  workspace: ApiWorkspaceContext,
  filter: MediaLibraryFilter,
) {
  const items = await prisma.mediaObject.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      deletedAt: null,
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.ownership === "library"
        ? { clientProfileId: null }
        : filter.ownership === "client"
          ? { clientProfileId: { not: null } }
          : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      fileName: true,
      contentType: true,
      byteSize: true,
      clientProfileId: true,
      createdAt: true,
      clientAssignments: { select: { clientProfileId: true } },
    },
  });
  return {
    items: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      fileName: item.fileName,
      contentType: item.contentType,
      byteSize: Number(item.byteSize),
      clientProfileId: item.clientProfileId,
      assignedClientProfileIds: item.clientAssignments.map(
        (assignment) => assignment.clientProfileId,
      ),
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

/**
 * POST .../assignments - grant one media object to one client. Idempotent:
 * an existing live grant returns the durable row instead of a conflict.
 * The media object must be a live row in this workspace; the client must be
 * a profile in this workspace.
 */
export async function assignMediaToClient(
  workspace: ApiWorkspaceContext,
  mediaObjectId: string,
  clientProfileId: string,
) {
  const media = await prisma.mediaObject.findFirst({
    where: {
      id: mediaObjectId,
      workspaceId: workspace.workspaceId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!media) throw new ApiError(404, "not_found");

  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId: workspace.workspaceId },
    select: { id: true },
  });
  if (!client) throw new ApiError(404, "not_found");

  const existing = await prisma.mediaAssignment.findFirst({
    where: {
      workspaceId: workspace.workspaceId,
      mediaObjectId,
      clientProfileId,
    },
    select: { id: true, assignedAt: true },
  });
  if (existing) {
    return {
      assignment: {
        id: existing.id,
        mediaObjectId,
        clientProfileId,
        assignedAt: existing.assignedAt.toISOString(),
      },
    };
  }

  const assignment = await prisma.mediaAssignment.create({
    data: {
      workspaceId: workspace.workspaceId,
      mediaObjectId,
      clientProfileId,
      assignedByMemberId: workspace.memberId,
    },
    select: { id: true, assignedAt: true },
  });
  return {
    assignment: {
      id: assignment.id,
      mediaObjectId,
      clientProfileId,
      assignedAt: assignment.assignedAt.toISOString(),
    },
  };
}

/** DELETE .../assignments/:clientProfileId - revoke the grant. */
export async function unassignMediaFromClient(
  workspace: ApiWorkspaceContext,
  mediaObjectId: string,
  clientProfileId: string,
) {
  const removed = await prisma.mediaAssignment.deleteMany({
    where: {
      workspaceId: workspace.workspaceId,
      mediaObjectId,
      clientProfileId,
    },
  });
  if (removed.count === 0) throw new ApiError(404, "not_found");
  return { unassigned: true };
}

/**
 * GET /api/v1/media/:workspaceId/assigned - the client-visible list. Runs
 * under `clientData.read`: clients resolve to their own profile through the
 * session (any other id is forbidden), staff name `clientProfileId` to
 * preview. Only live media rows are listed.
 */
export async function listAssignedMedia(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  requestedClientProfileId?: string,
) {
  const profile = await resolveClientProfile(
    viewer,
    workspace,
    requestedClientProfileId,
  );
  const grants = await prisma.mediaAssignment.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      clientProfileId: profile.id,
      mediaObject: { deletedAt: null },
    },
    orderBy: { assignedAt: "desc" },
    select: {
      assignedAt: true,
      mediaObject: {
        select: {
          id: true,
          kind: true,
          fileName: true,
          contentType: true,
          byteSize: true,
        },
      },
    },
  });
  return {
    items: grants.map((grant) => ({
      mediaObjectId: grant.mediaObject.id,
      kind: grant.mediaObject.kind,
      fileName: grant.mediaObject.fileName,
      contentType: grant.mediaObject.contentType,
      byteSize: Number(grant.mediaObject.byteSize),
      assignedAt: grant.assignedAt.toISOString(),
    })),
  };
}

/**
 * DELETE /api/v1/media/:workspaceId/:mediaObjectId - soft delete, FAIL
 * semantics (the card's decision): a row with live assignments returns 409
 * `has_assignments` and stays live; the coach unassigns first.
 */
export async function deleteMediaObject(
  workspace: ApiWorkspaceContext,
  mediaObjectId: string,
) {
  const media = await prisma.mediaObject.findFirst({
    where: {
      id: mediaObjectId,
      workspaceId: workspace.workspaceId,
      deletedAt: null,
    },
    select: {
      id: true,
      _count: { select: { clientAssignments: true } },
    },
  });
  if (!media) throw new ApiError(404, "not_found");
  if (media._count.clientAssignments > 0)
    throw new ApiError(409, "has_assignments");
  await prisma.mediaObject.update({
    where: { id: media.id },
    data: { deletedAt: new Date() },
  });
  return { mediaObject: { id: media.id, deleted: true } };
}
