"use client";
import { File, Mic, Play, Square, Trash2, Video } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { type Media, uid } from "./model";
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
  const { media, attach } = useCoach();
  const url = media[item.id];
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
          <audio src={url} controls aria-label={item.name}>
            <track
              kind="captions"
              src="data:text/vtt,WEBVTT%0A%0A00%3A00.000%20--%3E%2000%3A03.000%0ALocal%20demo%20audio%20tones.%0A"
            />
          </audio>
        ) : video ? (
          <video src={url} controls playsInline aria-label={item.name}>
            <track kind="captions" />
          </video>
        ) : (
          <a href={url} download={item.name}>
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
export function DemoRecorder({
  kind,
  onAttach,
}: {
  kind: "voice" | "video";
  onAttach: (item: Media) => void;
}) {
  const { attach } = useCoach();
  const [phase, setPhase] = useState<"idle" | "recording" | "preview">("idle");
  const [seconds, setSeconds] = useState(0);
  const [item, setItem] = useState<Media | null>(null);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      cancelAnimationFrame(frame.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => {
        t.stop();
      });
    };
  }, []);
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);
  const complete = (blob: Blob) => {
    if (!active.current) return;
    const item: Media = {
      id: uid("media"),
      name:
        kind === "voice"
          ? "Voice note · demo.wav"
          : "Check-in video feedback · demo.webm",
      type: blob.type,
      size: blob.size,
      demo: kind,
    };
    attach(item, blob);
    setItem(item);
    setPhase("preview");
  };
  const start = () => {
    setError("");
    setSeconds(0);
    setPhase("recording");
    if (kind === "voice") return;
    try {
      const c = canvas.current;
      if (!c || typeof MediaRecorder === "undefined")
        throw new Error("Canvas recording unavailable");
      c.width = 640;
      c.height = 360;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      const draw = () => {
        const t = Date.now() / 1000;
        ctx.fillStyle = "#151216";
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "#eb91b8";
        ctx.font = "24px sans-serif";
        ctx.fillText("Your weekly check-in", 38, 58);
        ctx.fillStyle = "#eee";
        ctx.font = "17px sans-serif";
        ctx.fillText("Review · progress · next steps", 38, 94);
        ctx.strokeStyle = "#eb91b8";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 18; i++) {
          const x = 40 + i * 25,
            y = 180 + i * 3 + Math.sin(i + t) * 6;
          if (!i) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#b5a9b0";
        ctx.font = "14px sans-serif";
        ctx.fillText("Local demo recording · no camera or microphone", 38, 325);
        ctx.fillStyle = "#eb91b8";
        ctx.beginPath();
        ctx.arc(555, 95, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#251820";
        ctx.font = "17px sans-serif";
        ctx.fillText("LM", 541, 101);
        frame.current = requestAnimationFrame(draw);
      };
      draw();
      const s = c.captureStream(15);
      stream.current = s;
      const r = new MediaRecorder(s, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
          ? "video/webm;codecs=vp8"
          : "video/webm",
      });
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        cancelAnimationFrame(frame.current);
        s.getTracks().forEach((t) => {
          t.stop();
        });
        complete(new Blob(chunks, { type: "video/webm" }));
      };
      recorder.current = r;
      r.start();
    } catch {
      setPhase("idle");
      setError(
        "Demo video recording is unavailable in this browser. Text feedback still works.",
      );
    }
  };
  const stop = () => {
    if (kind === "voice") complete(demoAudio());
    else if (recorder.current?.state === "recording") recorder.current.stop();
  };
  return (
    <div className="cd-recorder">
      <canvas
        ref={canvas}
        hidden={kind === "voice" || phase !== "recording"}
        aria-label="Demo video recording preview"
      />
      {phase === "idle" && (
        <Button onClick={start}>
          {kind === "voice" ? <Mic size={16} /> : <Video size={16} />}Record
          demo {kind === "voice" ? "voice note" : "video feedback"}
        </Button>
      )}
      {phase === "recording" && (
        <div className="cd-recorder-active">
          <span role="status">Recording local demo · {seconds}s</span>
          <Button onClick={stop}>
            <Square size={14} />
            Stop & preview
          </Button>
        </div>
      )}
      {phase === "preview" && item && (
        <>
          <MediaCard item={item} />
          <div className="cd-actions">
            <Button
              onClick={() => {
                setItem(null);
                setPhase("idle");
              }}
            >
              Discard
            </Button>
            <Button
              primary
              onClick={() => {
                onAttach(item);
                setItem(null);
                setPhase("idle");
              }}
            >
              Attach {kind === "voice" ? "voice note" : "video"}
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
