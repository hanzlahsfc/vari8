// Card 08 (#172): progress-photo data seam. One provider speaks for both
// callers - a client binds their own clientProfileId (the service resolves
// and matches it), staff name the roster client's id. Upload keeps the
// proven two-step media intent + presigned PUT, then attaches the media
// object to a dated entry in a second call.

import { apiFetch } from "./http";
import { fetchMediaDownload, uploadOwnMedia } from "./media";

export type ProgressPhotoEntryWire = {
  id: string;
  mediaObjectId: string;
  takenOn: string;
  clientVisible: boolean;
  checkInSubmissionId: string | null;
  createdAt: string;
};

const basePath = (workspaceId: string, clientProfileId: string) =>
  `/workspaces/${workspaceId}/clients/${clientProfileId}/progress-photos`;

export function listProgressPhotos(
  workspaceId: string,
  clientProfileId: string,
): Promise<{ entries: ProgressPhotoEntryWire[] }> {
  return apiFetch(basePath(workspaceId, clientProfileId));
}

export function createProgressPhoto(
  workspaceId: string,
  clientProfileId: string,
  body: {
    mediaObjectId: string;
    takenOn?: string;
    checkInSubmissionId?: string;
    clientVisible?: boolean;
  },
): Promise<{ entry: ProgressPhotoEntryWire }> {
  return apiFetch(basePath(workspaceId, clientProfileId), {
    method: "POST",
    body,
  });
}

export function deleteProgressPhoto(
  workspaceId: string,
  clientProfileId: string,
  entryId: string,
): Promise<{ deleted: boolean; id: string }> {
  return apiFetch(`${basePath(workspaceId, clientProfileId)}/${entryId}`, {
    method: "DELETE",
  });
}

export function compareProgressPhotos(
  workspaceId: string,
  clientProfileId: string,
  firstId: string,
  secondId: string,
): Promise<{ first: ProgressPhotoEntryWire; second: ProgressPhotoEntryWire }> {
  return apiFetch(
    `${basePath(workspaceId, clientProfileId)}/compare?first=${encodeURIComponent(firstId)}&second=${encodeURIComponent(secondId)}`,
  );
}

/** One compare column on the coach physique card: a photo date with its
 * shots, plus the check-in submission it came from when the entry is
 * linked. */
export type PhysiqueColumn = {
  date: string;
  submissionId?: string;
  photos: { pose: string; src: string }[];
};

/**
 * Staff read for the athlete overview compare card: the client's
 * progress photos grouped by `takenOn`, each shot resolved to a fresh
 * download url. The entry DTO carries no pose; the media file name does
 * (`{pose} · {date}`), so the pose falls back to "Photo" when the name
 * does not carry it. A photo whose mint fails is skipped rather than
 * blanking the card.
 */
export async function loadPhysiquePhotos(
  workspaceId: string,
  clientProfileId: string,
): Promise<PhysiqueColumn[]> {
  const { entries } = await listProgressPhotos(workspaceId, clientProfileId);
  const columns = new Map<string, PhysiqueColumn>();
  for (const entry of entries) {
    let src = "";
    let pose = "Photo";
    try {
      const mint = await fetchMediaDownload(workspaceId, entry.mediaObjectId);
      src = mint.download.url;
      const parts = mint.mediaObject.fileName.split(" · ");
      pose = parts.length > 1 && parts[0] ? parts[0] : "Photo";
    } catch {
      continue;
    }
    const column =
      columns.get(entry.takenOn) ??
      ({ date: entry.takenOn, photos: [] } satisfies PhysiqueColumn);
    column.submissionId ??= entry.checkInSubmissionId ?? undefined;
    column.photos.push({ pose, src });
    columns.set(entry.takenOn, column);
  }
  return [...columns.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Upload one image file and attach it as a dated entry in a single call.
 * The client picks takenOn; an absent value defaults to today server-side.
 */
export async function uploadOwnProgressPhoto(
  workspaceId: string,
  clientProfileId: string,
  file: File | Blob,
  takenOn?: string,
): Promise<ProgressPhotoEntryWire> {
  const mediaObjectId = await uploadOwnMedia(
    workspaceId,
    file,
    file instanceof File ? file.name : "photo",
    file.type || "image/png",
  );
  const { entry } = await createProgressPhoto(workspaceId, clientProfileId, {
    mediaObjectId,
    ...(takenOn ? { takenOn } : {}),
  });
  return entry;
}
