"use client";

import { useSyncExternalStore } from "react";

/**
 * FI-I3 — bounded light/dark appearance control (owner-approved scope).
 *
 * Personal preference in THIS browser only: a validated theme identifier
 * under the dedicated `appearance` localStorage key. `pro-dark` remains
 * the default when the value is absent, malformed or the identifier is
 * not one of the two existing themes. No account/workspace persistence,
 * no cross-device sync, no accents/fonts — those stay on the roadmap.
 *
 * The identifier is whitelisted before it is ever applied — stored
 * content can never inject styles or markup. Storage failures (private
 * mode, disabled storage) degrade to session-scoped switching.
 */

const STORAGE_KEY = "appearance";
const THEMES = ["pro-dark", "pro-white"] as const;
type Theme = (typeof THEMES)[number];

const isTheme = (v: unknown): v is Theme =>
  typeof v === "string" && (THEMES as readonly string[]).includes(v);

function readStored(): Theme {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(v) ? v : "pro-dark";
  } catch {
    return "pro-dark";
  }
}

let current: Theme = "pro-dark";
const listeners = new Set<() => void>();

function snapshot(): Theme {
  return current;
}
function subscribe(cb: () => void): () => void {
  if (listeners.size === 0) current = readStored();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function apply(theme: Theme): void {
  current = theme;
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable — the session-scoped switch still applies.
  }
  for (const cb of listeners) cb();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "pro-dark");

  return (
    <div
      className="theme-toggle"
      role="group"
      aria-label="Appearance"
      data-testid="theme-toggle"
    >
      <button
        type="button"
        className="theme-toggle__button"
        aria-pressed={theme === "pro-dark"}
        aria-label="Dark theme"
        onClick={() => apply("pro-dark")}
      >
        Dark
      </button>
      <button
        type="button"
        className="theme-toggle__button"
        aria-pressed={theme === "pro-white"}
        aria-label="Light theme"
        onClick={() => apply("pro-white")}
      >
        Light
      </button>
    </div>
  );
}
