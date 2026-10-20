"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion)";

function subscribe(onStoreChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/**
 * Reduced-motion preference that renders identically on the server and during
 * hydration. `useReducedMotion` from motion reads `matchMedia` lazily during
 * the hydration render, so the server (always falsy) and the client can
 * compute different props from it - the hydration mismatch behind issue #70.
 * The server snapshot is `false`; the real device value applies after mount.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
