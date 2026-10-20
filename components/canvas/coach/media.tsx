"use client";
import { File, Mic, Play, Trash2, Video } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { DemoRecorder as RealRecorder } from "./demo-recorder";
import type { Media } from "./model";
import { useCoach } from "./store";
import { Button } from "./ui";

function demoAudio(): Blob {
  const rate = 16000,
    seconds = 3,
    count = rate * seconds;
  const buffer = new ArrayBuffer(44 + count * 2);
  const v = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + count * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const envelope = Math.sin((Math.PI * t) / seconds) * 0.12;
    v.setInt16(
      44 + i * 2,
      Math.sin(2 * Math.PI * (240 + Math.sin(t * 4) * 35) * t) *
        envelope *
        32767,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}
export function MediaCard({
  item,
  onRemove,
}: {
  item: Media;
  onRemove?: () => void;
}) {
  const { media, attach, workspaceId } = useCoach();
  const url = media[item.id];
  // PR-MEDIA: stored media (uploaded via /api/v1/media) resolves a fresh
  // presigned URL instead of a local blob — same card, real bytes.
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  useEffect(() => {
    if (url || !item.mediaObjectId || !workspaceId) return;
    let live = true;
    fetch(`/api/v1/media/${workspaceId}/${item.mediaObjectId}`)
      .then(async (res) => (res.ok ? ((await res.json()) as {
        download: { url: string };
      }) : null))
      .then((body) => {
        if (live && body?.download?.url) setRemoteUrl(body.download.url);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url, item.mediaObjectId, workspaceId]);
  const src = url ?? remoteUrl;
  const image = item.type.startsWith("image/");
  const audio = item.type.startsWith("audio/");
  const video = item.type.startsWith("video/");
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
          <small>
            {item.demo
              ? "Local demo media"
              : `${Math.max(1, Math.round(item.size / 1024))} KB`}
          </small>
        </span>
        {onRemove && (
          <Button aria-label={`Remove ${item.name}`} onClick={onRemove}>
            <Trash2 size={14} />
          </Button>
        )}
      </div>
      {src ? (
        image ? (
          <a href={src} target="_blank" rel="noreferrer">
            <Image
              src={src}
              alt={item.name}
              width={640}
              height={360}
              unoptimized
            />
          </a>
        ) : audio ? (
          <audio src={src} controls aria-label={item.name}>
            <track
              kind="captions"
              src="data:text/vtt,WEBVTT%0A%0A00%3A00.000%20--%3E%2000%3A03.000%0ALocal%20demo%20audio%20tones.%0A"
            />
          </audio>
        ) : video ? (
          <video src={src} controls playsInline aria-label={item.name}>
            <track kind="captions" />
          </video>
        ) : (
          <a href={src} download={item.name}>
            Download attachment
          </a>
        )
      ) : item.demo === "voice" ? (
        <Button onClick={() => attach(item, demoAudio())}>
          <Play size={14} />
          Load demo audio preview
        </Button>
      ) : (
        <label className="cd-reattach">
          Media kept as metadata after reload. Reattach to preview.
          <input
            aria-label={`Reattach ${item.name}`}
            type="file"
            accept={item.type}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) attach(item, f);
            }}
          />
        </label>
      )}
    </div>
  );
}
/**
 * PR-MEDIA (S02-25): the same dialog, now on the real recorder —
 * `components/canvas/coach/demo-recorder.tsx` records via
 * `MediaRecorder`/`getUserMedia` and uploads through `/api/v1/media`.
 * The wrapper resolves this conversation's clientProfileId from the roster.
 */
export function DemoRecorder({
  kind,
  onAttach,
  clientName,
}: {
  kind: "voice" | "video";
  onAttach: (item: Media) => void;
  /** Canvas client name, used to resolve the upload's profile anchor. */
  clientName?: string;
}) {
  const { workspaceId, clientProfileIdFor } = useCoach();
  const [profileId, setProfileId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (clientName)
      clientProfileIdFor(clientName).then((id) => {
        if (live) setProfileId(id);
      });
    return () => {
      live = false;
    };
  }, [clientName, clientProfileIdFor]);
  return (
    <RealRecorder
      kind={kind}
      workspaceId={workspaceId}
      clientProfileId={profileId ?? undefined}
      onAttach={onAttach}
    />
  );
}
