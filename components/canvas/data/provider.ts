// The data seam's storage primitive (PR-W0). This is the only module that
// touches localStorage: card acceptance is a grep that shows `localStorage`
// only inside components/canvas/data/*.ts. Every domain provider funnels its
// reads and writes through these helpers so later wiring PRs can swap one
// provider's persistence for /api/v1 calls without touching another file.

import type { CoachState } from "../coach/model";

function storage(): Storage | null {
  return typeof globalThis.localStorage === "undefined"
    ? null
    : globalThis.localStorage;
}

/** Raw getItem; null when the key is absent or storage is unavailable. */
export function readStorage(key: string): string | null {
  return storage()?.getItem(key) ?? null;
}

/** Raw setItem; throws when storage is unavailable, like setItem itself does. */
export function writeStorage(key: string, value: string): void {
  const target = storage();
  if (!target) throw new Error("Browser storage is unavailable.");
  target.setItem(key, value);
}

export function removeStorage(key: string): void {
  storage()?.removeItem(key);
}

/**
 * getItem + JSON.parse. Returns undefined when nothing is stored (absent or
 * empty), so a stored JSON `null` stays distinguishable from "no data".
 * Parse failures propagate to the caller, matching the inline code these
 * providers replace.
 */
export function readJson(key: string): unknown {
  const raw = readStorage(key);
  return raw ? JSON.parse(raw) : undefined;
}

export function writeJson(key: string, value: unknown): void {
  writeStorage(key, JSON.stringify(value));
}

/**
 * One domain's slice of the persisted coach state (PR-W0). The monolithic
 * `coach-desktop-mockup-v1` envelope is separated before serializing into one
 * key per domain. `extract` pulls the slice out of the live state for saving;
 * `merge` folds a persisted slice back into the state being assembled on
 * load. Validation stays centralized: the assembled state must pass
 * `isCoachState` before the store uses it, exactly as the single-envelope
 * read did.
 */
export type CoachSlice = {
  /** localStorage key this domain owns under the coach namespace. */
  key: string;
  extract(state: CoachState): unknown;
  merge(slice: unknown, state: CoachState): void;
};
