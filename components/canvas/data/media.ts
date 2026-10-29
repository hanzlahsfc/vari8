// Card 05b: own-scope media surface. Upload is the two-step intent +
// presigned PUT the `/api/v1/media` routes expose; a client caller never
// names a clientProfileId: the service resolves it from the session.
// Download mints a short-lived GET url, same shape the staff card uses.

import { apiFetch } from "./http";

export type OwnMediaUploadWire = {
  mediaObject: {
    id: string;
    kind: string;
    fileName: string;
    contentType: string;
    byteSize: number;
  };
  upload: {
    url: string;
    method: "PUT";
    headers: Record<string, string>;
    expiresAt: string;
  };
};

export type OwnMediaDownloadWire = {
  mediaObject: {
    id: string;
    kind: string;
    fileName: string;
    contentType: string;
    byteSize: number;
  };
  download: { url: string; expiresAt: string };
};

/**
 * Upload one file for the calling client's own profile. Returns the durable
 * mediaObjectId a check-in `visual` answer or a photo entry references.
 */
export async function uploadOwnMedia(
  workspaceId: string,
  file: File | Blob,
  fileName: string,
  contentType: string,
): Promise<string> {
  const intent = await apiFetch<OwnMediaUploadWire>(
    `/media/${workspaceId}`,
    {
      method: "POST",
      body: {
        fileName,
        contentType,
        byteSize: file.size,
      },
    },
  );
  const response = await fetch(intent.upload.url, {
    method: intent.upload.method,
    headers: intent.upload.headers,
    body: file,
  });
  if (!response.ok) throw new Error("upload_failed");
  return intent.mediaObject.id;
}

/** GET media/:mediaObjectId: fresh presigned download url for own media. */
export function fetchOwnMediaDownload(
  workspaceId: string,
  mediaObjectId: string,
): Promise<OwnMediaDownloadWire> {
  return apiFetch(`/media/${workspaceId}/${mediaObjectId}`);
}

// Card 08: the same mint route serves staff reading a client's media —
// the service re-checks scope either way, so this is only a clearer name
// for staff-side callers.
export const fetchMediaDownload = fetchOwnMediaDownload;

// T6 (R7/R8): staff library list, assignment writes and the client-visible
// assigned-media read. The wire shapes mirror the route responses.

export type MediaLibraryItemWire = {
  id: string;
  kind: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  /** Owning client profile; null means the item is in the coach library. */
  clientProfileId: string | null;
  assignedClientProfileIds: string[];
  createdAt: string;
};

export type MediaLibraryWire = { items: MediaLibraryItemWire[] };

export type MediaAssignmentWire = {
  assignment: {
    id: string;
    mediaObjectId: string;
    clientProfileId: string;
    assignedAt: string;
  };
};

export type AssignedMediaItemWire = {
  mediaObjectId: string;
  kind: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  assignedAt: string;
};

export type AssignedMediaWire = { items: AssignedMediaItemWire[] };

/** GET media/:workspaceId - staff library list with optional filters. */
export function listMediaLibrary(
  workspaceId: string,
  filter?: { type?: string; ownership?: "library" | "client" },
): Promise<MediaLibraryWire> {
  const params = new URLSearchParams();
  if (filter?.type) params.set("type", filter.type);
  if (filter?.ownership) params.set("ownership", filter.ownership);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return apiFetch(`/media/${workspaceId}${suffix}`);
}

/** POST .../assignments - grant one media object to one client. */
export function assignMediaToClient(
  workspaceId: string,
  mediaObjectId: string,
  clientProfileId: string,
): Promise<MediaAssignmentWire> {
  return apiFetch(`/media/${workspaceId}/${mediaObjectId}/assignments`, {
    method: "POST",
    body: { clientProfileId },
  });
}

/** DELETE .../assignments/:clientProfileId - revoke the grant. */
export function unassignMediaFromClient(
  workspaceId: string,
  mediaObjectId: string,
  clientProfileId: string,
): Promise<{ unassigned: boolean }> {
  return apiFetch(
    `/media/${workspaceId}/${mediaObjectId}/assignments/${clientProfileId}`,
    { method: "DELETE" },
  );
}

/** DELETE media/:mediaObjectId - staff soft delete (409 while assigned). */
export function deleteMediaObject(
  workspaceId: string,
  mediaObjectId: string,
): Promise<{ mediaObject: { id: string; deleted: boolean } }> {
  return apiFetch(`/media/${workspaceId}/${mediaObjectId}`, {
    method: "DELETE",
  });
}

/** GET media/:workspaceId/assigned - the client-visible shared media list. */
export function listAssignedMedia(
  workspaceId: string,
  clientProfileId?: string,
): Promise<AssignedMediaWire> {
  const suffix = clientProfileId
    ? `?clientProfileId=${encodeURIComponent(clientProfileId)}`
    : "";
  return apiFetch(`/media/${workspaceId}/assigned${suffix}`);
}
