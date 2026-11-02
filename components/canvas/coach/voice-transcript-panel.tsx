"use client";

import { useEffect, useRef, useState } from "react";

import type { ActorScope } from "./voice-transcript-actor";
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
  actor,
}: {
  /** The card's minted download URL; fetched only on user request. */
  audioUrl: string;
  /** Exact audio identity — the media_object id (or staged chip id). */
  cacheKey: string;
  /**
   * The authenticated actor (workspace + user) for the temporary cache.
   * Fail closed: until the session resolves to a real user id the panel
   * neither reads/writes cache nor starts inference — loading, error and
   * retry are explicit states, never a shared placeholder scope.
   */
  actor: ActorScope;
}) {
  const scope = actor.status === "ready" ? actor.scope : null;
  const [state, setState] = useState<
    "idle" | "busy" | "ready" | "error"
  >("idle");
  const [text, setText] = useState<string>("");
  // The scope a running transcription belongs to — results bind to the
  // actor that produced them, never to whoever signs in next.
  const scopeRef = useRef<string | null>(scope);
  scopeRef.current = scope;
  useEffect(() => {
    // Any actor transition (loading, error, or a different resolved
    // scope) resets the panel: a prior identity's transcript can never
    // survive into the new session. Cache reads happen only after actor
    // resolution — and only for a card whose authorized mint resolved.
    abort.current?.abort();
    setState("idle");
    setText("");
    if (!scope) return;
    const cached = readCachedTranscript(scope, cacheKey);
    if (cached) {
      setText(cached);
      setState("ready");
    }
  }, [scope, cacheKey, actor.status]);
  const [note, setNote] = useState("");
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!transcriptionSupported()) return null;

  const start = async () => {
    if (!scope) return; // fail closed — never infer without an actor
    const runScope = scope;
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
      // Always key the write to the producing actor; only display when
      // that actor is still current — a stale completion can't surface
      // under a different identity.
      writeCachedTranscript(runScope, cacheKey, transcript);
      if (!mounted.current || scopeRef.current !== runScope) return;
      setText(transcript);
      setState("ready");
    } catch (error) {
      // Stale run: an abort/error from a previous actor or superseded
      // take must not clear a newer transcript, set its error, or
      // disturb its pending state.
      if (!mounted.current || scopeRef.current !== runScope) return;
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
  if (actor.status === "loading")
    return (
      <p className="cd-muted" role="status">
        Resolving sign-in…
      </p>
    );
  if (actor.status === "error")
    return (
      <div className="cd-transcript">
        <p role="alert" className="cd-muted">
          Couldn’t verify sign-in — transcripts are unavailable. Playback
          and sending are unaffected.
        </p>
        <Button onClick={actor.retry}>Retry</Button>
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
