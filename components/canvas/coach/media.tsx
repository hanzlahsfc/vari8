"use client";
import { File, Mic, Play, Trash2, Video } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { SegmentedControl } from "../vari8/components";
import {
  assignMediaToClient,
  deleteMediaObject,
  fetchMediaDownload,
  listMediaLibrary,
  unassignMediaFromClient,
} from "../data/media";
import { ApiClientError } from "../data/http";
import { DemoRecorder as RealRecorder } from "./demo-recorder";
import type { CoachClient, Media } from "./model";
import { VoiceTranscript } from "./voice-transcript-panel";
import { useActorScope } from "./voice-transcript-actor";
import { useCoach } from "./store";
import { Button, Empty } from "./ui";

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
  const actorScope = useActorScope(workspaceId ?? "");
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
          <>
            <audio src={src} controls aria-label={item.name}>
              <track
                kind="captions"
                src="data:text/vtt,WEBVTT%0A%0A00%3A00.000%20--%3E%2000%3A03.000%0ALocal%20demo%20audio%20tones.%0A"
              />
            </audio>
            <VoiceTranscript
              audioUrl={src}
              cacheKey={item.mediaObjectId ?? item.id}
              scope={actorScope ?? `${workspaceId}:pending`}
            />
          </>
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
  clientProfileId,
}: {
  kind: "voice" | "video";
  onAttach: (item: Media) => void;
  /** Canvas client name, used to resolve the upload's profile anchor. */
  clientName?: string;
  /** Authoritative server profile id — skips name resolution entirely. */
  clientProfileId?: string;
}) {
  const { workspaceId, clientProfileIdFor } = useCoach();
  const [profileId, setProfileId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (clientProfileId) setProfileId(clientProfileId);
    else if (clientName)
      clientProfileIdFor(clientName).then((id) => {
        if (live) setProfileId(id);
      });
    return () => {
      live = false;
    };
  }, [clientName, clientProfileId, clientProfileIdFor]);
  return (
    <RealRecorder
      kind={kind}
      workspaceId={workspaceId}
      clientProfileId={profileId ?? undefined}
      onAttach={onAttach}
    />
  );
}
// T6 (R7/R8): coach media library with type and ownership filters plus
// per-client share actions. Items and async actions are injected by the
// mount so the identical component runs on the standalone demo data in
// this tree and on the backend API in the canvas twin.
export type MediaLibraryType = "image" | "video" | "audio" | "document";
export type MediaLibraryItem = {
  id: string;
  name: string;
  type: MediaLibraryType;
  /** Byte size; rendered as KB. */
  size: number;
  /** Owning client label; null means the item sits in the coach library. */
  owner: string | null;
  /** Whether the item is shared with the client this panel serves. */
  assigned: boolean;
};
export type MediaLibraryTypeFilter = MediaLibraryType | "all";
export type MediaLibraryOwnerFilter = "all" | "library" | "client";
export function mediaLibraryItemsVisible(
  items: MediaLibraryItem[],
  type: MediaLibraryTypeFilter,
  owner: MediaLibraryOwnerFilter,
): MediaLibraryItem[] {
  return items.filter(
    (item) =>
      (type === "all" || item.type === type) &&
      (owner === "all" ||
        (owner === "library" ? item.owner === null : item.owner !== null)),
  );
}
export function MediaLibrary({
  clientName,
  items,
  status,
  busy,
  onOpen,
  onAssign,
  onUnassign,
  onDelete,
}: {
  clientName: string;
  items: MediaLibraryItem[];
  status?: string;
  busy?: boolean;
  onOpen?: (item: MediaLibraryItem) => void;
  onAssign: (item: MediaLibraryItem) => void;
  onUnassign: (item: MediaLibraryItem) => void;
  onDelete: (item: MediaLibraryItem) => void;
}) {
  const [type, setType] = useState<MediaLibraryTypeFilter>("all");
  const [owner, setOwner] = useState<MediaLibraryOwnerFilter>("all");
  const visible = mediaLibraryItemsVisible(items, type, owner);
  return (
    <div className="cd-media-library">
      <div className="cd-media-library-filters">
        <SegmentedControl
          label="Filter media by type"
          value={type}
          onValueChange={(value) => setType(value as MediaLibraryTypeFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "image", label: "Images" },
            { value: "video", label: "Videos" },
            { value: "audio", label: "Audio" },
            { value: "document", label: "Files" },
          ]}
        />
        <SegmentedControl
          label="Filter media by owner"
          value={owner}
          onValueChange={(value) => setOwner(value as MediaLibraryOwnerFilter)}
          options={[
            { value: "all", label: "Everyone" },
            { value: "library", label: "Library" },
            { value: "client", label: "Client uploads" },
          ]}
        />
      </div>
      {status ? (
        <p className="cd-muted" role="status">
          {status}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <Empty title="No media match these filters">
          Try another type or owner.
        </Empty>
      ) : (
        <ul className="cd-media-library-list">
          {visible.map((item) => (
            <li className="cd-media-library-row" key={item.id}>
              <span className="cd-media-library-icon" aria-hidden="true">
                {item.type === "video" ? (
                  <Video size={16} />
                ) : item.type === "audio" ? (
                  <Mic size={16} />
                ) : (
                  <File size={16} />
                )}
              </span>
              <span className="cd-media-library-name">
                {item.name}
                <small>
                  {Math.max(1, Math.round(item.size / 1024))} KB ·{" "}
                  {item.owner ?? "Coach library"}
                  {item.assigned ? ` · shared with ${clientName}` : ""}
                </small>
              </span>
              <span className="cd-media-library-actions">
                {onOpen && (
                  <Button disabled={busy} onClick={() => onOpen(item)}>
                    Open
                  </Button>
                )}
                {item.assigned ? (
                  <Button disabled={busy} onClick={() => onUnassign(item)}>
                    Unassign
                  </Button>
                ) : (
                  <Button
                    primary
                    disabled={busy}
                    onClick={() => onAssign(item)}
                  >
                    Assign
                  </Button>
                )}
                <Button
                  aria-label={`Remove ${item.name}`}
                  disabled={busy}
                  onClick={() => onDelete(item)}
                >
                  <Trash2 size={14} />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Canvas mount: the same MediaLibrary wired to /api/v1/media. The owner
// column resolves profile ids through the roster endpoint the store
// already uses; delete surfaces the server's FAIL decision
// (has_assignments) instead of guessing.
const MEDIA_TYPE_BY_KIND: Record<string, MediaLibraryType> = {
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  DOCUMENT: "document",
};
export function ClientMediaPanel({ client }: { client: CoachClient }) {
  const { workspaceId, clientProfileIdFor } = useCoach();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [items, setItems] = useState<MediaLibraryItem[] | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    if (!workspaceId) return;
    clientProfileIdFor(client.name).then((id) => {
      if (live) setProfileId(id);
    });
    return () => {
      live = false;
    };
  }, [workspaceId, client.name, clientProfileIdFor]);

  useEffect(() => {
    if (!workspaceId || !profileId) return;
    let live = true;
    void (async () => {
      try {
        const [library, roster] = await Promise.all([
          listMediaLibrary(workspaceId),
          fetch(`/api/v1/workspaces/${workspaceId}/clients?limit=100`).then(
            async (res) =>
              ((await res.json()) as {
                items?: { clientProfileId: string; name: string }[];
              }).items ?? [],
          ),
        ]);
        if (!live) return;
        const ownerName = new Map(
          roster.map((row) => [row.clientProfileId, row.name] as const),
        );
        setItems(
          library.items.map((item) => ({
            id: item.id,
            name: item.fileName,
            type: MEDIA_TYPE_BY_KIND[item.kind] ?? "document",
            size: item.byteSize,
            owner: item.clientProfileId
              ? (ownerName.get(item.clientProfileId) ?? "Client")
              : null,
            assigned: item.assignedClientProfileIds.includes(profileId),
          })),
        );
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [workspaceId, profileId]);

  const run = (
    action: (item: MediaLibraryItem) => Promise<unknown>,
    done: (item: MediaLibraryItem) => void,
  ) => {
    if (!workspaceId || !profileId) return () => {};
    return (item: MediaLibraryItem) => {
      setBusy(true);
      setStatus("");
      void action(item)
        .then(() => done(item))
        .catch((error: unknown) => {
          if (
            error instanceof ApiClientError &&
            error.code === "has_assignments"
          )
            setStatus("Unassign this item before removing it.");
          else setStatus("That change could not be saved. Try again.");
        })
        .finally(() => setBusy(false));
    };
  };

  const markAssigned = (item: MediaLibraryItem, assigned: boolean) =>
    setItems((current) =>
      (current ?? []).map((row) =>
        row.id === item.id ? { ...row, assigned } : row,
      ),
    );

  if (!workspaceId || !profileId)
    return <Empty title="Media needs a signed-in workspace" />;
  if (failed)
    return (
      <Empty title="The media library could not be loaded">
        Check your connection and reopen this tab.
      </Empty>
    );
  if (!items)
    return (
      <div className="client-app-loading" role="status">
        Loading the media library…
      </div>
    );
  return (
    <MediaLibrary
      clientName={client.name}
      items={items}
      status={status}
      busy={busy}
      onOpen={(item) =>
        void fetchMediaDownload(workspaceId, item.id)
          .then(({ download }) => window.open(download.url, "_blank"))
          .catch(() => setStatus("That item could not be opened."))
      }
      onAssign={run(
        (item) => assignMediaToClient(workspaceId, item.id, profileId),
        (item) => {
          markAssigned(item, true);
          setStatus(`Assigned to ${client.name}.`);
        },
      )}
      onUnassign={run(
        (item) => unassignMediaFromClient(workspaceId, item.id, profileId),
        (item) => {
          markAssigned(item, false);
          setStatus("Assignment removed.");
        },
      )}
      onDelete={run(
        (item) => deleteMediaObject(workspaceId, item.id),
        (item) => {
          setItems((current) =>
            (current ?? []).filter((row) => row.id !== item.id),
          );
          setStatus("Removed from the library.");
        },
      )}
    />
  );
}
