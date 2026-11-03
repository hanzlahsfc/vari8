"use client";

import { Mic, Square, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { uploadWorkspaceMedia } from "./media-card";
import { type Media, uid } from "./model";
import { Button } from "./ui";

/**
 * PR-MEDIA real recorder (D20, S02-25): the canvas `DemoRecorder` dialog —
 * record -> preview -> discard/attach, same `cd-*` markup — with the
 * synthesized demo sources replaced by a real `MediaRecorder` stream
 * (`getUserMedia` audio for voice notes, camera + microphone for video
 * feedback). "Attach" runs the real two-step upload through
 * `uploadWorkspaceMedia` and hands a canvas `Media` item (media_object id)
 * to the caller.
 *
 * Canvas copy adjustments follow the D32 truth-text rule: strings that
 * described the demo source ("Record demo voice note", "Recording local
 * demo") would be false on a real stream, so the demo word is dropped while
 * position, style and structure stay identical.
 */

function recordMime(kind: "voice" | "video"): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates =
    kind === "voice"
      ? ["audio/webm", "audio/mp4", "audio/ogg"]
      : ["video/webm;codecs=vp8", "video/webm", "video/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

// Owner-approved cap (P680, hardened P682): voice notes auto-stop just
// under five minutes and the finished take's real encoded duration is
// verified before it may attach. The elapsed checks below come from a
// start timestamp, so a backgrounded tab's delayed interval detects an
// overrun on resume — it does not prevent one; the duration guard in
// `complete` rejects those takes.
const VOICE_MAX_SECONDS = 300;
// The UX auto-stop aims one displayed second early so an on-time stop
// encodes strictly under the cap. Anything that still lands over — only
// possible via a delayed callback — is rejected, never trimmed.
const VOICE_STOP_EARLY_SECONDS = 1;

function extensionFor(contentType: string): string {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("quicktime")) return "mov";
  return "bin";
}

/**
 * P682: the only trustworthy "did we stay under the cap" signal is the
 * encoded take itself. `decodeAudioData` measures the real audio length;
 * `<audio>.duration` would read container metadata that recorded WebM
 * files typically lack (it reports Infinity). `null` means the duration
 * could not be determined for this take — the caller must refuse to
 * attach rather than assume it is within the limit.
 */
async function voiceDurationSeconds(blob: Blob): Promise<number | null> {
  const Decode =
    globalThis.OfflineAudioContext ??
    (
      globalThis as {
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      }
    ).webkitOfflineAudioContext;
  if (!Decode) return null;
  try {
    const context = new Decode(1, 1, 44_100);
    const { duration } = await context.decodeAudioData(
      await blob.arrayBuffer(),
    );
    return Number.isFinite(duration) && duration >= 0 ? duration : null;
  } catch {
    return null;
  }
}

export function DemoRecorder({
  kind,
  workspaceId,
  clientProfileId,
  onAttach,
}: {
  kind: "voice" | "video";
  workspaceId?: string;
  /** Staff uploads name the profile; a client's own profile is inferred. */
  clientProfileId?: string;
  onAttach: (item: Media) => void;
}) {
  const [phase, setPhase] = useState<
    "idle" | "recording" | "preview" | "uploading"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(
    null,
  );
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const startedAt = useRef(0);
  const active = useRef(true);
  // Abortable upload + preview-URL cleanup on every exit: a close/unmount
  // mid-upload aborts the request and a late completion can never land an
  // attach; the preview object URL is revoked on unmount, not only on
  // explicit discard.
  const uploadAbort = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      uploadAbort.current?.abort();
      uploadAbort.current = null;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);
  useEffect(() => {
    if (phase !== "recording") return;
    const elapsed = () =>
      Math.floor((Date.now() - startedAt.current) / 1000);
    const check = () => {
      const e = elapsed();
      setSeconds(e);
      if (kind === "voice" && e >= VOICE_MAX_SECONDS - VOICE_STOP_EARLY_SECONDS) {
        // Auto-stop just under the approved cap — stops the recorder,
        // which releases tracks and (once the duration guard passes)
        // lands in the preview phase.
        if (recorder.current?.state === "recording")
          recorder.current.stop();
      }
    };
    const timer = window.setInterval(check, 250);
    // A backgrounded tab's interval may not fire until focus returns —
    // checking elapsed on visibility/ focus closes the overrun window.
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [phase, kind]);

  const stopStream = () => {
    stream.current?.getTracks().forEach((track) => {
      track.stop();
    });
    stream.current = null;
  };

  const complete = async (blob: Blob) => {
    if (!active.current) return;
    // P682 (voice only): the UX auto-stop can arrive late — a delayed
    // interval/visibility check still stops the recorder, but audio
    // already encoded past the cap is inside this blob. Verify the
    // take's real duration before it becomes attachable; never trim,
    // never assume an unverifiable take is within the limit.
    if (kind === "voice") {
      const duration = await voiceDurationSeconds(blob);
      if (!active.current) return;
      if (duration === null) {
        setPhase("idle");
        setError(
          "This recording's length could not be verified, so it can't be attached. Record it again.",
        );
        return;
      }
      if (duration > VOICE_MAX_SECONDS) {
        setPhase("idle");
        setError(
          "This recording exceeded the five-minute limit, so it can't be attached. Record it again.",
        );
        return;
      }
    }
    const url = URL.createObjectURL(blob);
    previewUrl.current = url;
    setPreview({ url, blob });
    setPhase("preview");
  };

  const start = async () => {
    setError("");
    setSeconds(0);
    const mime = recordMime(kind);
    if (typeof MediaRecorder === "undefined" || !mime) {
      setError(
        `${kind === "voice" ? "Voice" : "Video"} recording is unavailable in this browser. Text feedback still works.`,
      );
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia(
        kind === "voice" ? { audio: true } : { video: true, audio: true },
      );
      stream.current = media;
      if (kind === "video" && live.current) {
        live.current.srcObject = media;
        await live.current.play().catch(() => {});
      }
      startedAt.current = Date.now();
      const chunks: BlobPart[] = [];
      const r = new MediaRecorder(media, { mimeType: mime });
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        stopStream();
        complete(new Blob(chunks, { type: mime.split(";")[0] }));
      };
      recorder.current = r;
      r.start();
      setPhase("recording");
    } catch {
      stopStream();
      setPhase("idle");
      setError(
        `${kind === "voice" ? "Microphone" : "Camera"} access is unavailable. Text feedback still works.`,
      );
    }
  };

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const discard = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    previewUrl.current = null;
    setPreview(null);
    setPhase("idle");
  };

  const attach = async () => {
    if (!preview) return;
    // No workspace wired (pure demo embed): attach the local item as before.
    if (!workspaceId) {
      const contentType = preview.blob.type.split(";")[0];
      const item: Media = {
        id: uid("media"),
        name: previewName,
        type: contentType,
        size: preview.blob.size,
      };
      discard();
      onAttach(item);
      return;
    }
    setPhase("uploading");
    setError("");
    const controller = new AbortController();
    uploadAbort.current = controller;
    try {
      const contentType = preview.blob.type.split(";")[0];
      const fileName = `${
        kind === "voice" ? "voice-note" : "video-feedback"
      }.${extensionFor(contentType)}`;
      const item = await uploadWorkspaceMedia({
        workspaceId,
        clientProfileId,
        fileName,
        contentType,
        blob: preview.blob,
        signal: controller.signal,
      });
      uploadAbort.current = null;
      // A close/unmount mid-upload made this completion late — never land it.
      if (!active.current) return;
      discard();
      onAttach(item);
    } catch {
      uploadAbort.current = null;
      if (controller.signal.aborted || !active.current) return;
      setPhase("preview");
      setError("Upload failed. Preview is kept — try again or discard it.");
    }
  };

  const previewName = preview
    ? kind === "voice"
      ? `Voice note · ${extensionFor(preview.blob.type)}`
      : `Video feedback · ${extensionFor(preview.blob.type)}`
    : "";
  const previewVideo = preview?.blob.type.startsWith("video/") ?? false;

  return (
    <div className="cd-recorder">
      <video
        ref={live}
        hidden={kind === "voice" || phase !== "recording"}
        muted
        playsInline
        aria-label="Video recording preview"
      />
      {phase === "idle" && (
        <Button onClick={start}>
          {kind === "voice" ? <Mic size={16} /> : <Video size={16} />}
          Record {kind === "voice" ? "voice note" : "video feedback"}
        </Button>
      )}
      {phase === "recording" && (
        <div className="cd-recorder-active">
          <span role="status">
            Recording · {seconds}
            {kind === "voice" ? ` / ${VOICE_MAX_SECONDS}` : ""}s
          </span>
          <Button onClick={stop}>
            <Square size={14} />
            Stop & preview
          </Button>
        </div>
      )}
      {(phase === "preview" || phase === "uploading") && preview && (
        <>
          <div className="cd-media-card">
            <div className="cd-media-heading">
              {previewVideo ? <Video size={17} /> : <Mic size={17} />}
              <span>
                {previewName}
                <small>
                  {`${Math.max(1, Math.round(preview.blob.size / 1024))} KB`}
                </small>
              </span>
            </div>
            {previewVideo ? (
              <video
                src={preview.url}
                controls
                playsInline
                aria-label={previewName}
              >
                <track kind="captions" />
              </video>
            ) : (
              <audio src={preview.url} controls aria-label={previewName}>
                <track kind="captions" />
              </audio>
            )}
          </div>
          <div className="cd-actions">
            <Button onClick={discard} disabled={phase === "uploading"}>
              Discard
            </Button>
            <Button
              primary
              onClick={attach}
              disabled={phase === "uploading"}
            >
              {phase === "uploading"
                ? "Uploading…"
                : `Attach ${kind === "voice" ? "voice note" : "video"}`}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="status" className="cd-muted">
          {error}
        </p>
      )}
    </div>
  );
}
