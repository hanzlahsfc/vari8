// Appearance domain provider (PR-W0). Owns the coach preferences slice
// (mode, accent, availability, notifications, logo, sidebar) and the
// ethereal appearance key. The Appearance type, its defaults and the
// normalizeHex accent rule stay with the AppearanceProvider in lib/canvas,
// which owns them; this file owns the storage key and the JSON IO, so the
// import direction stays one way (lib/canvas -> components/canvas/data).
// PR-W10 wires this domain to the server; it edits this file only.

import type { Appearance } from "@/lib/canvas/ethereal-appearance";
import type { CoachState } from "../coach/model";
import { type CoachSlice, readJson, writeJson } from "./provider";

export const APPEARANCE_KEY = "coach-data-appearance-v1";

export const appearanceSlice: CoachSlice = {
  key: APPEARANCE_KEY,
  extract: (state) => ({ preferences: state.preferences }),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid appearance slice");
    const data = slice as { preferences?: CoachState["preferences"] };
    state.preferences = data.preferences as CoachState["preferences"];
  },
};

// --- Ethereal appearance draft (coaching-ethereal-appearance-v1) ---

export const ETHEREAL_APPEARANCE_KEY = "coaching-ethereal-appearance-v1";

/**
 * Parsed value of the stored appearance draft, or null when absent, empty or
 * unparsable — the AppearanceProvider applies its own shape validation and
 * field defaults on top, unchanged.
 */
export function loadEtherealAppearance(): unknown {
  try {
    const value = readJson(ETHEREAL_APPEARANCE_KEY);
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

export function saveEtherealAppearance(appearance: Appearance): void {
  writeJson(ETHEREAL_APPEARANCE_KEY, appearance);
}
