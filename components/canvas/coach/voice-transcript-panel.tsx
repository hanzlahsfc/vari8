"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "./ui";
import {
  readCachedTranscript,
  transcribeAudio,
  transcriptionSupported,
  writeCachedTranscript,
} from "./voice-transcript";

/**
 * P688 — "View transcript" panel for a voice attachment. Loads the audio
 * bytes only on demand (the card's already-minted download URL), runs the
 * embedded whisper-tiny pipeline off the main thread, and caches the text
 * in sessionStorage keyed to the exact media identity — temporary by
 * decision, never written into the message or media_object.
 *
 * Every failure (missing model, undecodable audio, no Worker/WASM,
 * aborted run) lands in the same recoverable error state — recording,
 * sending and playback never depend on this control.
 */
export function VoiceTranscript({
  audioUrl,
  cacheKey,
}: {
  /** The card's minted download URL; fetched only on user request. */
  audioUrl: string;
  /** Exact audio identity — the media_object id (or staged chip id). */
  cacheKey: string;
}) {
  const [state, setState] = useState<
    "idle" | "busy" | "ready" | "error"
  >(() => (readCachedTranscript(cacheKey) ? "ready" : "idle"));
  const [text, setText] = useState<string>(
    () => readCachedTranscript(cacheKey) ?? "",
  );
  const [note, setNote] = useState("");
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  if (!transcriptionSupported()) return null;

  const start = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setState("busy");
    setNote("Fetching audio…");
    try {
      const res = await fetch(audioUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const blob = await res.blob();
      const transcript = await transcribeAudio(blob, {
        signal: controller.signal,
        onProgress: (event) => {
          if (mounted.current) setNote(event.label);
        },
      });
      writeCachedTranscript(cacheKey, transcript);
      if (!mounted.current) return;
      setText(transcript);
      setState("ready");
    } catch (error) {
      if (!mounted.current) return;
      if ((error as DOMException)?.name === "AbortError") {
        setState("idle");
        setNote("");
        return;
      }
      setNote("");
      setState("error");
    }
  };

  if (state === "ready")
    return (
      <div className="cd-transcript">
        <p className="cd-muted">
          Auto-transcript — may contain errors.
        </p>
        <p>{text || "(no speech detected)"}</p>
      </div>
    );
  if (state === "busy")
    return (
      <div className="cd-transcript">
        <p role="status" className="cd-muted">
          {note}
        </p>
        <Button onClick={() => abort.current?.abort()}>Cancel</Button>
      </div>
    );
  return (
    <div className="cd-transcript">
      {state === "error" && (
        <p role="alert" className="cd-muted">
          Transcription is unavailable right now — the recording still
          plays and sends.
        </p>
      )}
      <Button onClick={() => void start()}>
        {state === "error" ? "Retry transcript" : "View transcript"}
      </Button>
    </div>
  );
}
