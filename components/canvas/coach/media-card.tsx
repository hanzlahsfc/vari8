"use client";

import Image from "next/image";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";

/**
 * PR-MEDIA port of the canvas `MediaCard` (frontend/src/components/coach/
 * media.tsx) onto stored media (D20, S02-24). Same DOM structure and the
 * same `cd-*` classes the canvas stylesheet defines; the demo-only branches
 * ("Local demo media", localStorage reattach) are gone — bytes live on the
 * server now, so the card fetches a short-lived presigned URL from
 * `GET /api/v1/media/:workspaceId/:mediaObjectId` and shows the real file
 * size (D32 truth-text row S02-24).
 *
 * The canvas renders icons through lucide-react, which the backend app does
 * not carry; the same lucide glyphs are inlined below as SVGs so the visual
 * output is identical.
 */

export type StoredMedia = {
  /** media_object id. */
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
};

function Icon({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function FileIcon({ size = 17 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </Icon>
  );
}

export function MicIcon({ size = 17 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </Icon>
  );
}

export function VideoIcon({ size = 17 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </Icon>
  );
}

export function PlayIcon({ size = 14 }: { size?: number }) {
  return (
    <Icon size={size}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </Icon>
  );
}

export function SquareIcon({ size = 14 }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </Icon>
  );
}

export function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </Icon>
  );
}

function Button({
  children,
  className = "",
  primary = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={`cd-button ${primary ? "cd-primary" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

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
 * PUT the bytes at the presigned URL. Used by the recorder here and by the
 * message/check-in wiring PRs for the file picker (S02-08).
 */
export async function uploadWorkspaceMedia(input: {
  workspaceId: string;
  clientProfileId?: string;
  fileName: string;
  contentType: string;
  blob: Blob;
}): Promise<StoredMedia> {
  const intent = await fetch(`/api/v1/media/${input.workspaceId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.blob.size,
      clientProfileId: input.clientProfileId,
    }),
  });
  if (!intent.ok) throw await apiError(intent);
  const { mediaObject, upload } = (await intent.json()) as {
    mediaObject: StoredMedia;
    upload: { url: string; headers: Record<string, string> };
  };
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: upload.headers,
    body: input.blob,
  });
  if (!put.ok) throw await apiError(put);
  return mediaObject;
}

/**
 * MediaCard on stored media: type icon, name, real size, remove button;
 * image preview link, audio/video players or a download link — the canvas
 * branches minus the demo ones.
 */
export function MediaCard({
  workspaceId,
  media,
  onRemove,
}: {
  workspaceId: string;
  media: StoredMedia;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/media/${workspaceId}/${media.id}`)
      .then(async (res) => {
        if (!res.ok) throw await apiError(res);
        const body = (await res.json()) as {
          download: { url: string };
        };
        if (live) setUrl(body.download.url);
      })
      .catch(() => {
        if (live) setUrl(null);
      });
    return () => {
      live = false;
    };
  }, [workspaceId, media.id]);

  const image = media.contentType.startsWith("image/");
  const audio = media.contentType.startsWith("audio/");
  const video = media.contentType.startsWith("video/");
  return (
    <div className="cd-media-card">
      <div className="cd-media-heading">
        {video ? (
          <VideoIcon size={17} />
        ) : audio ? (
          <MicIcon size={17} />
        ) : (
          <FileIcon size={17} />
        )}
        <span>
          {media.fileName}
          <small>{`${Math.max(1, Math.round(media.byteSize / 1024))} KB`}</small>
        </span>
        {onRemove && (
          <Button aria-label={`Remove ${media.fileName}`} onClick={onRemove}>
            <TrashIcon size={14} />
          </Button>
        )}
      </div>
      {url ? (
        image ? (
          <a href={url} target="_blank" rel="noreferrer">
            <Image
              src={url}
              alt={media.fileName}
              width={640}
              height={360}
              unoptimized
            />
          </a>
        ) : audio ? (
          <audio src={url} controls aria-label={media.fileName}>
            <track kind="captions" />
          </audio>
        ) : video ? (
          <video src={url} controls playsInline aria-label={media.fileName}>
            <track kind="captions" />
          </video>
        ) : (
          <a href={url} download={media.fileName}>
            Download attachment
          </a>
        )
      ) : null}
    </div>
  );
}
