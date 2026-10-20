import { randomUUID } from "node:crypto";

import { ApiError, type ApiViewer, type ApiWorkspaceContext } from "@/lib/api/v1";
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
 *     name the profile explicitly and it must belong to the workspace.
 *   - Download: a client may mint a URL only for objects under their own
 *     client profile prefix. Anything else is 403, indistinguishable from
 *     non-membership upstream.
 *
 * Storage failures map to typed API errors: an unconfigured backend is 503
 * (`storage_not_configured`), a rejected type is 400
 * (`unsupported_media_type`), an over-cap size is 400 (`payload_too_large`).
 */

export type UploadIntentInput = {
  fileName: string;
  contentType: string;
  byteSize: number;
  clientProfileId?: string;
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
    const profile = await resolveClientProfile(
      viewer,
      workspace,
      input.clientProfileId,
    );

    const mediaObjectId = randomUUID();
    const storageKey =
      clientObjectPrefix(workspace.workspaceId, profile.id) + mediaObjectId;
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
      },
      select: {
        id: true,
        kind: true,
        fileName: true,
        contentType: true,
        byteSize: true,
      },
    });

    return {
      mediaObject: {
        id: media.id,
        kind: media.kind,
        fileName: media.fileName,
        contentType: media.contentType,
        byteSize: Number(media.byteSize),
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
      if (!own || own.id !== clientProfileId)
        throw new ApiError(403, "forbidden");
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
