"use client";

// Card 08 (#172): staff gallery + comparator for one client. Every call
// goes through the /api/v1 progress-photo routes - the service resolves
// the caller's workspace scope there; this panel holds no authorization
// decisions of its own.

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiClientError } from "@/components/canvas/data/http";
import { fetchMediaDownload } from "@/components/canvas/data/media";
import {
  compareProgressPhotos,
  deleteProgressPhoto,
  listProgressPhotos,
  type ProgressPhotoEntryWire,
} from "@/components/canvas/data/progress-photos";

function label(entry: ProgressPhotoEntryWire): string {
  return entry.takenOn;
}

export function PhotosPanel({
  workspaceId,
  clientProfileId,
}: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const [entries, setEntries] = useState<ProgressPhotoEntryWire[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [pair, setPair] = useState<{
    first: ProgressPhotoEntryWire;
    second: ProgressPhotoEntryWire;
  } | null>(null);
  const [compareError, setCompareError] = useState("");
  const requested = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const { entries: next } = await listProgressPhotos(
        workspaceId,
        clientProfileId,
      );
      setEntries(next);
      setPhase("ready");
      setFirstId((current) =>
        next.some((entry) => entry.id === current)
          ? current
          : (next.at(-1)?.id ?? ""),
      );
      setSecondId((current) =>
        next.some((entry) => entry.id === current)
          ? current
          : (next[0]?.id ?? ""),
      );
    } catch {
      setPhase("error");
    }
  }, [workspaceId, clientProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      void fetchMediaDownload(workspaceId, entry.mediaObjectId)
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

  const compare = async () => {
    if (!firstId || !secondId) return;
    setCompareError("");
    setPair(null);
    try {
      setPair(
        await compareProgressPhotos(
          workspaceId,
          clientProfileId,
          firstId,
          secondId,
        ),
      );
    } catch (error) {
      setCompareError(
        error instanceof ApiClientError && error.code === "not_found"
          ? "Only photos of this client can be compared."
          : "The comparison could not be loaded. Try again.",
      );
    }
  };

  const remove = async (entryId: string) => {
    setRemoving(entryId);
    try {
      await deleteProgressPhoto(workspaceId, clientProfileId, entryId);
      setPair((current) =>
        current &&
        (current.first.id === entryId || current.second.id === entryId)
          ? null
          : current,
      );
      await load();
    } catch {
      setStatus("That photo could not be removed. Try again.");
    } finally {
      setRemoving(null);
    }
  };

  if (phase === "loading") return <p role="status">Loading photos…</p>;
  if (phase === "error")
    return (
      <div className="empty-state" role="status">
        <p>The gallery could not be loaded. Reload the page to try again.</p>
      </div>
    );
  const list = entries ?? [];

  const figure = (entry: ProgressPhotoEntryWire) => (
    <figure className="photos-compare__figure" key={entry.id}>
      {urls[entry.mediaObjectId] ? (
        // biome-ignore lint/performance/noImgElement: presigned urls expire; next/image caching would pin stale links
        <img
          src={urls[entry.mediaObjectId]}
          alt={`Progress photo from ${entry.takenOn}`}
        />
      ) : (
        <div className="photos-compare__placeholder" aria-hidden="true" />
      )}
      <figcaption>{entry.takenOn}</figcaption>
    </figure>
  );

  return (
    <div className="photos-panel">
      {status ? <p role="status">{status}</p> : null}
      {list.length === 0 ? (
        <div className="empty-state">
          <p>No progress photos yet for this client.</p>
        </div>
      ) : (
        <>
          <div className="photos-compare" data-testid="photo-compare">
            <div className="photos-compare__controls">
              <label>
                From
                <select
                  value={firstId}
                  onChange={(event) => setFirstId(event.target.value)}
                >
                  {list.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {label(entry)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To
                <select
                  value={secondId}
                  onChange={(event) => setSecondId(event.target.value)}
                >
                  {list.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {label(entry)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="auth-button"
                onClick={() => void compare()}
                disabled={!firstId || !secondId}
              >
                Compare
              </button>
            </div>
            {compareError ? (
              <p className="photos-compare__error" role="alert">
                {compareError}
              </p>
            ) : null}
            {pair ? (
              <div
                className="photos-compare__grid"
                data-testid="photo-compare-result"
              >
                {figure(pair.first)}
                {figure(pair.second)}
              </div>
            ) : null}
          </div>
          <ul className="photos-gallery" data-testid="photo-gallery">
            {list.map((entry) => (
              <li className="photos-gallery__item" key={entry.id}>
                {urls[entry.mediaObjectId] ? (
                  // biome-ignore lint/performance/noImgElement: presigned urls expire; next/image caching would pin stale links
                  <img
                    src={urls[entry.mediaObjectId]}
                    alt={`Progress photo from ${entry.takenOn}`}
                  />
                ) : (
                  <div
                    className="photos-gallery__placeholder"
                    aria-hidden="true"
                  />
                )}
                <div className="photos-gallery__meta">
                  <span className="photos-gallery__date">{entry.takenOn}</span>
                  {!entry.clientVisible ? (
                    <span className="photos-gallery__flag">
                      Hidden from client
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="auth-button"
                  disabled={removing === entry.id}
                  onClick={() => void remove(entry.id)}
                >
                  {removing === entry.id ? "Removing…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
