// Card 05b: own-scope media surface. Upload is the two-step intent +
// presigned PUT the `/api/v1/media` routes expose; a client caller never
// names a clientProfileId — the service resolves it from the session.
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

/** GET media/:mediaObjectId — fresh presigned download url for own media. */
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
