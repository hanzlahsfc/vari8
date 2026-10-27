"use client";

// Client progress photos: dated posed gallery plus a local compare view. The
// entry wire carries no pose, so the pose travels in the media file name
// ({pose} · {date}) and is parsed back on read, same as the coach cards do.

import { Camera, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { DEFAULT_POSES } from "../coach/check-ins/photos";
import { formatDate } from "../coach/model";
import { useLocalToday } from "../coach/targets/use-local-today";
import { DateField, Empty, Select } from "../coach/ui";
import {
  type AssignedMediaItemWire,
  fetchOwnMediaDownload,
  listAssignedMedia,
  uploadOwnMedia,
} from "../data/media";
import {
  compareProgressPhotos,
  createProgressPhoto,
  deleteProgressPhoto,
  listProgressPhotos,
  type ProgressPhotoEntryWire,
} from "../data/progress-photos";

export type PhotoItem = {
  id: string;
  mediaObjectId: string;
  takenOn: string;
  pose: string;
  src?: string;
};

export type PhotoGalleryActions = {
  upload: (pose: string, file: File, takenOn: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  compare: (firstId: string, secondId: string) => Promise<PhotoItem[]>;
};

const longDate = (takenOn: string) =>
  formatDate(takenOn, { day: "numeric", month: "long" });

function photoFileName(pose: string, takenOn: string) {
  return `${pose} · ${longDate(takenOn)}`;
}

function poseFromFileName(fileName: string) {
  const parts = fileName.split(" · ");
  return parts.length > 1 && parts[0] ? parts[0] : "Photo";
}

export function PhotoGallery({
  entries,
  phase,
  actions,
  poses,
  footer,
}: {
  entries: PhotoItem[] | null;
  phase: "loading" | "ready" | "error";
  actions: PhotoGalleryActions;
  poses?: string[];
  footer?: ReactNode;
}) {
  const today = useLocalToday();
  const options = poses?.length ? poses : DEFAULT_POSES;
  // picked holds an explicit choice; the field shows today until they pick.
  const [picked, setPicked] = useState<string | null>(null);
  const takenOn = picked ?? today;
  const [pose, setPose] = useState(options[0] ?? "Photo");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [comparing, setComparing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pair, setPair] = useState<PhotoItem[] | null>(null);
  const [busyCompare, setBusyCompare] = useState(false);

  const addPhoto = async (file: File) => {
    setUploading(true);
    try {
      await actions.upload(pose, file, takenOn);
      setStatus("");
      setPicked(null);
    } catch {
      setStatus("That photo could not be uploaded. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (id: string) => {
    setRemoving(id);
    try {
      await actions.remove(id);
      setStatus("");
    } catch {
      setStatus("That photo could not be removed. Try again.");
    } finally {
      setRemoving(null);
    }
  };

  const runCompare = async (firstId: string, secondId: string) => {
    setBusyCompare(true);
    try {
      setPair(await actions.compare(firstId, secondId));
      setStatus("");
    } catch {
      setStatus("Those photos could not be compared. Try again.");
      setSelected([]);
    } finally {
      setBusyCompare(false);
    }
  };

  const pickPhoto = (id: string) => {
    if (busyCompare) return;
    const next = selected.includes(id)
      ? selected.filter((current) => current !== id)
      : [...selected, id];
    setSelected(next);
    if (next.length === 2) void runCompare(next[0], next[1]);
  };

  const exitCompare = () => {
    setComparing(false);
    setSelected([]);
    setPair(null);
  };

  const count = entries?.length ?? 0;

  return (
    <section className="cd-preview-section" aria-label="Progress photos">
      <h2>Progress photos</h2>
      <div className="ca-checkin-form">
        <div className="ca-photo-question">
          <span className="ca-photo-question-label">
            Add a photo with its date and pose
          </span>
          <DateField label="Date taken" value={takenOn} onChange={setPicked} />
          <Select
            label="Pose"
            value={pose}
            options={options}
            disabled={uploading}
            onChange={setPose}
          />
          <div className="ca-photo-grid">
            <div className="ca-photo-tile">
              <label className="ca-photo-pick">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void addPhoto(file);
                  }}
                />
                <span className="ca-photo-empty">
                  <Camera size={20} aria-hidden="true" />
                  <b>{uploading ? "Uploading…" : "Add photo"}</b>
                </span>
              </label>
            </div>
          </div>
        </div>
        {count >= 2 && (
          <div className="ca-photos-toolbar">
            <button
              type="button"
              aria-pressed={comparing}
              onClick={() => (comparing ? exitCompare() : setComparing(true))}
            >
              {comparing ? "Done" : "Compare"}
            </button>
          </div>
        )}
        {comparing && !pair && (
          <p className="ca-photos-hint">Pick two photos to compare.</p>
        )}
        {status && <p className="ca-photo-error">{status}</p>}
        {phase === "loading" ? (
          <div className="client-app-loading" role="status">
            Loading your photos…
          </div>
        ) : phase === "error" ? (
          <Empty title="Your photos could not be loaded">
            Check your connection and reload the page.
          </Empty>
        ) : count === 0 ? (
          <Empty title="No photos yet">
            Add your first progress photo above.
          </Empty>
        ) : pair ? (
          <div className="ca-photos-compare">
            {pair.map((item) => (
              <figure className="ca-photos-compare-column" key={item.id}>
                {item.src ? (
                  // biome-ignore lint/performance/noImgElement: presigned urls expire; next/image caching would pin stale links
                  <img
                    className="ca-photos-img"
                    src={item.src}
                    alt={`${item.pose} on ${formatDate(item.takenOn)}`}
                  />
                ) : (
                  <div className="ca-photo-pick" aria-hidden="true" />
                )}
                <figcaption>
                  <b>{item.pose}</b>
                  <span className="ca-photos-date">
                    {formatDate(item.takenOn)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="ca-photo-grid ca-photos-gallery">
            {(entries ?? []).map((entry) => (
              <figure
                className={`ca-photos-item${selected.includes(entry.id) ? " selected-item" : ""}`}
                key={entry.id}
              >
                <div className="ca-photo-tile">
                  {comparing ? (
                    <button
                      type="button"
                      className="ca-photo-pick"
                      aria-pressed={selected.includes(entry.id)}
                      aria-label={`Select photo from ${formatDate(entry.takenOn)}`}
                      onClick={() => pickPhoto(entry.id)}
                    >
                      {entry.src ? (
                        // biome-ignore lint/performance/noImgElement: presigned urls expire; next/image caching would pin stale links
                        <img
                          className="ca-photos-img"
                          src={entry.src}
                          alt={`${entry.pose} on ${formatDate(entry.takenOn)}`}
                        />
                      ) : (
                        <span className="ca-photos-missing" aria-hidden="true">
                          <Camera size={18} />
                        </span>
                      )}
                    </button>
                  ) : entry.src ? (
                    // biome-ignore lint/performance/noImgElement: presigned urls expire; next/image caching would pin stale links
                    <img
                      className="ca-photos-img"
                      src={entry.src}
                      alt={`${entry.pose} on ${formatDate(entry.takenOn)}`}
                    />
                  ) : (
                    <div className="ca-photo-pick" aria-hidden="true" />
                  )}
                  {!comparing && (
                    <button
                      type="button"
                      className="ca-photo-remove"
                      aria-label={`Delete photo from ${formatDate(entry.takenOn)}`}
                      disabled={removing === entry.id}
                      onClick={() => void removePhoto(entry.id)}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <figcaption className="ca-photos-date">
                  {formatDate(entry.takenOn)}
                  <span className="ca-photos-pose">{entry.pose}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
      {footer}
    </section>
  );
}

export function ClientPhotos({
  workspaceId,
  clientProfileId,
  poses,
}: {
  workspaceId: string;
  clientProfileId: string;
  poses?: string[];
}) {
  const [entries, setEntries] = useState<PhotoItem[] | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const requested = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const { entries: next } = await listProgressPhotos(
        workspaceId,
        clientProfileId,
      );
      setEntries(
        next.map((entry) => ({
          id: entry.id,
          mediaObjectId: entry.mediaObjectId,
          takenOn: entry.takenOn,
          pose: "Photo",
        })),
      );
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [workspaceId, clientProfileId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only load keyed by workspace.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, clientProfileId]);

  // Mint a url and read the pose off the file name per visible entry; urls
  // expire, so each pass refetches only ids not already resolved.
  useEffect(() => {
    if (!entries) return;
    let cancelled = false;
    for (const entry of entries) {
      if (requested.current.has(entry.mediaObjectId)) continue;
      requested.current.add(entry.mediaObjectId);
      void fetchOwnMediaDownload(workspaceId, entry.mediaObjectId)
        .then(({ download, mediaObject }) => {
          if (cancelled) return;
          const pose = poseFromFileName(mediaObject.fileName);
          setEntries((current) =>
            (current ?? []).map((item) =>
              item.mediaObjectId === entry.mediaObjectId
                ? { ...item, pose, src: download.url }
                : item,
            ),
          );
        })
        .catch(() => {
          requested.current.delete(entry.mediaObjectId);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [entries, workspaceId]);

  const actions: PhotoGalleryActions = {
    upload: async (pose, file, takenOn) => {
      const mediaObjectId = await uploadOwnMedia(
        workspaceId,
        file,
        photoFileName(pose, takenOn),
        file.type || "image/png",
      );
      await createProgressPhoto(workspaceId, clientProfileId, {
        mediaObjectId,
        ...(takenOn ? { takenOn } : {}),
      });
      await load();
    },
    remove: async (id) => {
      await deleteProgressPhoto(workspaceId, clientProfileId, id);
      await load();
    },
    compare: async (firstId, secondId) => {
      const { first, second } = await compareProgressPhotos(
        workspaceId,
        clientProfileId,
        firstId,
        secondId,
      );
      const known = entries ?? [];
      return [first, second].map(
        (wire: ProgressPhotoEntryWire): PhotoItem =>
          known.find((item) => item.id === wire.id) ?? {
            id: wire.id,
            mediaObjectId: wire.mediaObjectId,
            takenOn: wire.takenOn,
            pose: "Photo",
          },
      );
    },
  };

  return (
    <PhotoGallery
      entries={entries}
      phase={phase}
      actions={actions}
      poses={poses}
      footer={<SharedMedia workspaceId={workspaceId} />}
    />
  );
}

// T6 (R8): media the coach assigned to this client. The list is own scope;
// each item opens through the same download mint the gallery uses, which
// the service now also grants via media_assignment.
function SharedMedia({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<AssignedMediaItemWire[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let live = true;
    void listAssignedMedia(workspaceId)
      .then(({ items: next }) => {
        if (live) setItems(next);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [workspaceId]);

  const open = (item: AssignedMediaItemWire) =>
    void fetchOwnMediaDownload(workspaceId, item.mediaObjectId)
      .then(({ download }) => window.open(download.url, "_blank"))
      .catch(() => setStatus("That file could not be opened."));

  return (
    <div className="ca-shared-media">
      <h2>Shared by your coach</h2>
      {status && <p className="ca-photo-error">{status}</p>}
      {failed ? (
        <Empty title="Shared media could not be loaded">
          Check your connection and reload the page.
        </Empty>
      ) : items === null ? (
        <div className="client-app-loading" role="status">
          Loading shared media…
        </div>
      ) : items.length === 0 ? (
        <Empty title="Nothing shared yet">
          Files your coach shares with you appear here.
        </Empty>
      ) : (
        <ul className="ca-shared-media-list">
          {items.map((item) => (
            <li className="ca-shared-media-row" key={item.mediaObjectId}>
              <span>
                {item.fileName}
                <small>{item.kind.toLowerCase()}</small>
              </span>
              <button type="button" onClick={() => open(item)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
