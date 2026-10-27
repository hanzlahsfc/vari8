"use client";

// Card 08 (#172): the client's own progress-photo gallery. Uploads keep the
// proven media flow (intent + presigned PUT, then a dated entry); the date
// defaults to today and the client can change it before uploading. The
// gallery is strictly own scope — the service resolves the caller's profile
// from the session, so the id passed here can only ever be their own.

import { Camera, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteProgressPhoto,
  listProgressPhotos,
  type ProgressPhotoEntryWire,
  uploadOwnProgressPhoto,
} from "../data/progress-photos";
import { fetchOwnMediaDownload } from "../data/media";
import { formatDate } from "../coach/model";
import { useLocalToday } from "../coach/targets/use-local-today";
import { DateField, Empty } from "../coach/ui";

export function ClientPhotos({
  workspaceId,
  clientProfileId,
}: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const today = useLocalToday();
  const [entries, setEntries] = useState<ProgressPhotoEntryWire[] | null>(
    null,
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  // picked holds an explicit client choice; the field shows today until
  // they pick, so the default stays live without an effect.
  const [picked, setPicked] = useState<string | null>(null);
  const takenOn = picked ?? today;
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const requested = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const { entries: next } = await listProgressPhotos(
        workspaceId,
        clientProfileId,
      );
      setEntries(next);
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

  // Mint a fresh download url per visible entry; urls expire, so each
  // render pass refetches only ids that are not already resolved.
  useEffect(() => {
    if (!entries) return;
    let cancelled = false;
    const requestedSet = requested.current;
    const inFlight = new Set<string>();
    const resolved = new Set<string>();
    for (const entry of entries) {
      if (requestedSet.has(entry.mediaObjectId)) continue;
      requestedSet.add(entry.mediaObjectId);
      inFlight.add(entry.mediaObjectId);
      void fetchOwnMediaDownload(workspaceId, entry.mediaObjectId)
        .then(({ download }) => {
          if (cancelled) return;
          resolved.add(entry.mediaObjectId);
          setUrls((current) => ({
            ...current,
            [entry.mediaObjectId]: download.url,
          }));
        })
        .catch(() => {
          requestedSet.delete(entry.mediaObjectId);
        });
    }
    return () => {
      cancelled = true;
      // Entries reloaded mid-mint: ids that never wrote a url must be
      // released so the next pass mints them again; resolved ids keep
      // their deduped urls.
      for (const id of inFlight)
        if (!resolved.has(id)) requestedSet.delete(id);
    };
  }, [entries, workspaceId]);

  const addPhoto = async (file: File) => {
    setUploading(true);
    try {
      await uploadOwnProgressPhoto(
        workspaceId,
        clientProfileId,
        file,
        takenOn || undefined,
      );
      setStatus("");
      setPicked(null);
      await load();
    } catch {
      setStatus("That photo could not be uploaded. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (entryId: string) => {
    setRemoving(entryId);
    try {
      await deleteProgressPhoto(workspaceId, clientProfileId, entryId);
      await load();
    } catch {
      setStatus("That photo could not be removed. Try again.");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="cd-preview-section" aria-label="Progress photos">
      <h2>Progress photos</h2>
      <div className="ca-checkin-form">
        <div className="ca-photo-question">
          <span className="ca-photo-question-label">
            Add a photo with its date
          </span>
          <DateField
            label="Date taken"
            value={takenOn}
            onChange={setPicked}
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
        {status && <p className="ca-photo-error">{status}</p>}
        {phase === "loading" ? (
          <div className="client-app-loading" role="status">
            Loading your photos…
          </div>
        ) : phase === "error" ? (
          <Empty title="Your photos could not be loaded">
            Check your connection and reload the page.
          </Empty>
        ) : entries && entries.length === 0 ? (
          <Empty title="No photos yet">
            Add your first progress photo above.
          </Empty>
        ) : (
          <div className="ca-photo-grid ca-photos-gallery">
            {(entries ?? []).map((entry) => (
              <figure className="ca-photos-item" key={entry.id}>
                <div className="ca-photo-tile">
                  {urls[entry.mediaObjectId] ? (
                    // biome-ignore lint/performance/noImgElement: presigned urls expire; next/image caching would pin stale links
                    <img
                      className="ca-photos-img"
                      src={urls[entry.mediaObjectId]}
                      alt={`Progress photo from ${formatDate(entry.takenOn)}`}
                    />
                  ) : (
                    <div className="ca-photo-pick" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className="ca-photo-remove"
                    aria-label={`Delete photo from ${formatDate(entry.takenOn)}`}
                    disabled={removing === entry.id}
                    onClick={() => void removePhoto(entry.id)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <figcaption className="ca-photos-date">
                  {formatDate(entry.takenOn)}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
