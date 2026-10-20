"use client";

import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  loadEtherealAppearance,
  saveEtherealAppearance,
} from "@/components/canvas/data/appearance";

export type AppearanceMode = "light" | "dark";
export type AppearanceFont =
  | "sans"
  | "serif"
  | "condensed"
  | "mono"
  | "rounded";

export type Appearance = {
  mode: AppearanceMode;
  accent: string;
  font: AppearanceFont;
};

export const fontOptions: {
  id: AppearanceFont;
  label: string;
  name: string;
  family: string;
}[] = [
  {
    id: "sans",
    label: "Geist",
    name: "Geist",
    family: '"Ethereal Geist", system-ui, sans-serif',
  },
  {
    id: "serif",
    label: "Garamond",
    name: "Garamond",
    family: '"Studio Garamond", Georgia, serif',
  },
  {
    id: "condensed",
    label: "Avenir Next Condensed",
    name: "Avenir Next Condensed",
    family: '"Avenir Next Condensed", "Ethereal Geist", sans-serif',
  },
  {
    id: "mono",
    label: "Menlo",
    name: "Menlo",
    family: 'Menlo, "SFMono-Regular", monospace',
  },
  {
    id: "rounded",
    label: "System Rounded",
    name: "System Rounded",
    family: 'ui-rounded, "Ethereal Geist", system-ui, sans-serif',
  },
];

export const defaultAppearance: Appearance = {
  mode: "dark",
  accent: "#EB91B8",
  font: "sans",
};

const fontIds = new Set<AppearanceFont>(fontOptions.map(({ id }) => id));
const modes = new Set<AppearanceMode>(["light", "dark"]);

type AppearanceContextValue = {
  appearance: Appearance;
  setMode: (mode: AppearanceMode) => void;
  setAccent: (accent: string) => void;
  setFont: (font: AppearanceFont) => void;
  resetAppearance: () => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context)
    throw new Error("useAppearance must be used within AppearanceProvider");
  return context;
}

function readStoredAppearance(): Appearance | null {
  try {
    const value = loadEtherealAppearance();
    if (!value || typeof value !== "object") return null;

    const record = value as Record<string, unknown>;
    return {
      mode: modes.has(record.mode as AppearanceMode)
        ? (record.mode as AppearanceMode)
        : defaultAppearance.mode,
      accent:
        normalizeHex(typeof record.accent === "string" ? record.accent : "") ??
        defaultAppearance.accent,
      font: fontIds.has(record.font as AppearanceFont)
        ? (record.font as AppearanceFont)
        : defaultAppearance.font,
    };
  } catch {
    return null;
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredAppearance();
    if (stored) setAppearance(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      saveEtherealAppearance(appearance);
    } catch {
      // Keep appearance usable when browser storage is unavailable.
    }
  }, [appearance, hydrated]);

  const setMode = useCallback((mode: AppearanceMode) => {
    if (modes.has(mode)) setAppearance((current) => ({ ...current, mode }));
  }, []);

  const setAccent = useCallback((value: string) => {
    const accent = normalizeHex(value);
    if (accent) setAppearance((current) => ({ ...current, accent }));
  }, []);

  const setFont = useCallback((font: AppearanceFont) => {
    if (fontIds.has(font)) setAppearance((current) => ({ ...current, font }));
  }, []);

  const resetAppearance = useCallback(
    () => setAppearance(defaultAppearance),
    [],
  );

  const value = useMemo(
    () => ({ appearance, setMode, setAccent, setFont, resetAppearance }),
    [appearance, setMode, setAccent, setFont, resetAppearance],
  );

  return (
    <AppearanceContext.Provider value={value}>
      <div
        className="appearance-root eg-root"
        data-mode={appearance.mode}
        style={themeVariables(appearance)}
      >
        {children}
      </div>
    </AppearanceContext.Provider>
  );
}

export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  if (/^[\da-fA-F]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  return /^[\da-fA-F]{6}$/.test(raw) ? `#${raw}` : null;
}

function relativeLuminance(hex: string): number {
  const normalized = normalizeHex(hex);
  if (!normalized) return 0;
  const channels = [1, 3, 5].map(
    (index) => Number.parseInt(normalized.slice(index, index + 2), 16) / 255,
  );
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function textOn(color: string): string {
  return contrastRatio(color, "#000000") >= contrastRatio(color, "#FFFFFF")
    ? "#000000"
    : "#FFFFFF";
}

function mixHex(color: string, destination: string, amount: number): string {
  const source = normalizeHex(color);
  const target = normalizeHex(destination);
  if (!source || !target) return color;
  const channels = [1, 3, 5].map((index) => {
    const first = Number.parseInt(source.slice(index, index + 2), 16);
    const second = Number.parseInt(target.slice(index, index + 2), 16);
    return Math.round(first + (second - first) * amount)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function contrastSafe(
  color: string,
  backgrounds: string[],
  targetRatio: number,
): string {
  const safeAt = (candidate: string) =>
    backgrounds.every(
      (background) => contrastRatio(candidate, background) >= targetRatio,
    );
  if (safeAt(color)) return color;

  const candidates = ["#000000", "#FFFFFF"].map((destination) => {
    let low = 0;
    let high = 1;
    for (let step = 0; step < 20; step += 1) {
      const middle = (low + high) / 2;
      if (safeAt(mixHex(color, destination, middle))) high = middle;
      else low = middle;
    }
    return { color: mixHex(color, destination, high), amount: high };
  });

  return candidates.sort((first, second) => first.amount - second.amount)[0]
    .color;
}

export function themeVariables(appearance: Appearance): CSSProperties {
  const accent = normalizeHex(appearance.accent) ?? defaultAppearance.accent;
  const font =
    fontOptions.find((option) => option.id === appearance.font) ??
    fontOptions[0];
  const backgrounds =
    appearance.mode === "dark"
      ? ["#050505", "#090909", "#101010", "#141414", "#191919"]
      : ["#F4F4F4", "#FFFFFF", "#E8E8E8", "#E9E9E9"];
  const accentInk = contrastSafe(accent, backgrounds, 4.5);
  const accentBoundary = contrastSafe(accent, backgrounds, 3);
  const ring = contrastSafe(accent, backgrounds, 3);
  const chartLine = contrastSafe(accent, backgrounds, 3.05);

  return {
    "--accent": accent,
    "--accent-ink": accentInk,
    "--accent-contrast": textOn(accent),
    "--accent-soft": `color-mix(in srgb, ${accent} 14%, var(--canvas))`,
    "--accent-border": accentBoundary,
    "--accent-ring": ring,
    "--font-ui": font.family,
    "--font-tracking": appearance.font === "sans" ? "-0.012em" : "0em",
    "--chart-line": chartLine,
    "--chart-fill": accent,
    "--ring": ring,
  } as CSSProperties;
}
