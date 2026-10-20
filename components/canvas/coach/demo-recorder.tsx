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

function extensionFor(contentType: string): string {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("quicktime")) return "mov";
  return "bin";
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
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const stopStream = () => {
    stream.current?.getTracks().forEach((track) => {
      track.stop();
    });
    stream.current = null;
  };

  const complete = (blob: Blob) => {
    if (!active.current) return;
    setPreview({ url: URL.createObjectURL(blob), blob });
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
      });
      discard();
      onAttach(item);
    } catch {
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
          <span role="status">Recording · {seconds}s</span>
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
