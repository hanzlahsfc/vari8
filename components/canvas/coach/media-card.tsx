"use client";

import { File, Mic, Trash2, Video } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import type { Media } from "./model";
import { Button } from "./ui";
import { useActorScope } from "./voice-transcript-actor";
import { VoiceTranscript } from "./voice-transcript-panel";

/**
 * PR-MEDIA real MediaCard (D20, S02-24): the canvas `MediaCard` from
 * `media.tsx` against stored media. Same DOM structure, same `cd-*` classes
 * and the same canvas `Media` item shape — but the item's id is a
 * media_object id and the body resolves a short-lived presigned URL from
 * `GET /api/v1/media/:workspaceId/:mediaObjectId`. The demo branches are
 * gone ("Local demo media", localStorage reattach): bytes live on the
 * server, so the label shows the real file size (D32 truth-text row).
 */

/** The JSON error code a /api/v1 route returned, or a generic label. */
async function apiError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    return new Error(body.error?.code ?? `http_${response.status}`);
  } catch {
    return new Error(`http_${response.status}`);
  }
}

/**
 * The two-step real upload a canvas attach becomes: POST the intent, then
 * PUT the bytes at the presigned URL. Returns a canvas `Media` item whose
 * id is the media_object id — a drop-in for the message/check-in wiring
 * (S02-08 picker, recorder, draft attachments).
 */
export async function uploadWorkspaceMedia(input: {
  workspaceId: string;
  clientProfileId?: string;
  fileName: string;
  contentType: string;
  blob: Blob;
  /** Optional abort — cancellation removes the chip composer-side; the
   *  media intent may still persist unlinked server-side. */
  signal?: AbortSignal;
}): Promise<Media> {
  const intent = await fetch(`/api/v1/media/${input.workspaceId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.blob.size,
      clientProfileId: input.clientProfileId,
    }),
    signal: input.signal,
  });
  if (!intent.ok) throw await apiError(intent);
  const body = (await intent.json()) as {
    mediaObject: {
      id: string;
      fileName: string;
      contentType: string;
      byteSize: number;
    };
    upload: { url: string; headers: Record<string, string> };
  };
  const put = await fetch(body.upload.url, {
    method: "PUT",
    headers: body.upload.headers,
    body: input.blob,
    signal: input.signal,
  });
  if (!put.ok) throw await apiError(put);
  return {
    id: body.mediaObject.id,
    name: body.mediaObject.fileName,
    type: body.mediaObject.contentType,
    size: body.mediaObject.byteSize,
    mediaObjectId: body.mediaObject.id,
  };
}

/**
 * Uploads a canvas `Media` item's bytes in the background and stamps
 * `item.mediaObjectId` so `MediaCard` can mint playback URLs. Returns true
 * when the object reached the server; on any failure the item simply stays
 * local (the canvas preview path keeps working unchanged).
 */
export async function uploadCanvasMedia(
  item: Media,
  blob: Blob,
  options: { workspaceId?: string; clientProfileId?: string },
): Promise<boolean> {
  if (!options.workspaceId) return false;
  try {
    const stored = await uploadWorkspaceMedia({
      workspaceId: options.workspaceId,
      clientProfileId: options.clientProfileId,
      fileName: item.name,
      contentType: blob.type.split(";")[0] || item.type,
      blob,
    });
    item.mediaObjectId = stored.id;
    return true;
  } catch {
    return false;
  }
}

export function MediaCard({
  workspaceId,
  item,
  onRemove,
  scope,
}: {
  workspaceId: string;
  /** Authenticated actor scope for the temporary transcript cache. */
  scope?: string;
  /** Canvas Media shape; `item.id` is the media_object id. */
  item: Media;
  onRemove?: () => void;
}) {
  const actor = useActorScope(workspaceId);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/media/${workspaceId}/${item.id}`)
      .then(async (res) => {
        if (!res.ok) throw await apiError(res);
        const body = (await res.json()) as { download: { url: string } };
        if (live) setUrl(body.download.url);
      })
      .catch(() => {
        if (live) setUrl(null);
      });
    return () => {
      live = false;
    };
  }, [workspaceId, item.id]);

  const itemType = typeof item.type === "string" ? item.type : "";
  const image = itemType.startsWith("image/");
  const audio = itemType.startsWith("audio/");
  const video = itemType.startsWith("video/");
  return (
    <div className="cd-media-card">
      <div className="cd-media-heading">
        {video ? (
          <Video size={17} />
        ) : audio ? (
          <Mic size={17} />
        ) : (
          <File size={17} />
        )}
        <span>
          {item.name}
          <small>{`${Math.max(1, Math.round(item.size / 1024))} KB`}</small>
        </span>
        {onRemove && (
          <Button aria-label={`Remove ${item.name}`} onClick={onRemove}>
            <Trash2 size={14} />
          </Button>
        )}
      </div>
      {url ? (
        image ? (
          <a href={url} target="_blank" rel="noreferrer">
            <Image
              src={url}
              alt={item.name}
              width={640}
              height={360}
              unoptimized
            />
          </a>
        ) : audio ? (
          <>
            <audio src={url} controls aria-label={item.name}>
              <track kind="captions" />
            </audio>
            <VoiceTranscript
              audioUrl={url}
              cacheKey={item.mediaObjectId ?? item.id}
              actor={scope ? { status: "ready" as const, scope, retry: () => {} } : actor}
            />
          </>
        ) : video ? (
          <video src={url} controls playsInline aria-label={item.name}>
            <track kind="captions" />
          </video>
        ) : (
          <a href={url} download={item.name}>
            Download attachment
          </a>
        )
      ) : null}
    </div>
  );
}
