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
import { ThemeScope } from "@/components/canvas/vari8/theme";
import { vari8Theme } from "./vari8-theme";

import {
  loadEtherealAppearance,
  saveEtherealAppearance,
} from "@/components/canvas/data/appearance";
import {
  type Appearance,
  type AppearanceFont,
  type AppearanceMode,
  mergeWorkspaceAppearance,
  normalizeHex,
  type WorkspaceAppearance,
} from "./workspace-appearance";

export { normalizeHex } from "./workspace-appearance";
export type {
  Appearance,
  AppearanceDensity,
  AppearanceFont,
  AppearanceMode,
  WorkspaceAppearance,
} from "./workspace-appearance";

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
  density: "comfortable",
  logoMediaId: null,
};

const fontIds = new Set<AppearanceFont>(fontOptions.map(({ id }) => id));
const modes = new Set<AppearanceMode>(["light", "dark"]);
const densities = new Set(["comfortable", "compact"]);

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
      density: densities.has(record.density as string)
        ? (record.density as Appearance["density"])
        : defaultAppearance.density,
      logoMediaId:
        typeof record.logoMediaId === "string" && record.logoMediaId
          ? record.logoMediaId
          : null,
    };
  } catch {
    return null;
  }
}

export function AppearanceProvider({
  children,
  workspace,
}: {
  children: ReactNode;
  /** Workspace-resolved appearance; each set field wins over the local store. */
  workspace?: WorkspaceAppearance | null;
}) {
  const [stored, setStored] = useState(defaultAppearance);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const local = readStoredAppearance();
    if (local) setStored(local);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      saveEtherealAppearance(stored);
    } catch {
      // Keep appearance usable when browser storage is unavailable.
    }
  }, [stored, hydrated]);

  const appearance = useMemo(
    () => mergeWorkspaceAppearance(stored, workspace),
    [stored, workspace],
  );

  const setMode = useCallback((mode: AppearanceMode) => {
    if (modes.has(mode)) setStored((current) => ({ ...current, mode }));
  }, []);

  const setAccent = useCallback((value: string) => {
    const accent = normalizeHex(value);
    if (accent) setStored((current) => ({ ...current, accent }));
  }, []);

  const setFont = useCallback((font: AppearanceFont) => {
    if (fontIds.has(font)) setStored((current) => ({ ...current, font }));
  }, []);

  const resetAppearance = useCallback(
    () => setStored(defaultAppearance),
    [],
  );

  const value = useMemo(
    () => ({ appearance, setMode, setAccent, setFont, resetAppearance }),
    [appearance, setMode, setAccent, setFont, resetAppearance],
  );

  return (
    <AppearanceContext.Provider value={value}>
      <ThemeScope
        mode={appearance.mode}
        accent={appearance.accent}
        className={`appearance-root eg-root${appearance.density === "compact" ? " eg-density-compact" : ""}`}
        style={themeVariables(appearance)}
      >
        {children}
      </ThemeScope>
    </AppearanceContext.Provider>
  );
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

function colorAtLuminance(color: string, target: number): string {
  const source = normalizeHex(color) ?? defaultAppearance.accent;
  const sourceLuminance = relativeLuminance(source);
  const destination = target > sourceLuminance ? "#FFFFFF" : "#000000";
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    const candidate = mixHex(source, destination, middle);
    const reachedTarget =
      target > sourceLuminance
        ? relativeLuminance(candidate) >= target
        : relativeLuminance(candidate) <= target;
    if (reachedTarget) high = middle;
    else low = middle;
  }
  return mixHex(source, destination, high);
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

/**
 * The fields the theme variables consume; `density` is optional so the coach
 * theme path (which has no density input) keeps its call signature.
 */
export type AppearanceThemeInput = {
  mode: AppearanceMode;
  accent: string;
  font: AppearanceFont;
  density?: Appearance["density"];
};

export function themeVariables(
  appearance: AppearanceThemeInput,
): CSSProperties {
  const compact = appearance.density === "compact";
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
  const effectiveAccent = contrastSafe(accent, backgrounds, 3);
  const actionText = textOn(effectiveAccent);
  const ring = contrastSafe(accent, backgrounds, 3);
  const chartLine = contrastSafe(accent, backgrounds, 3.05);
  const macroLuminanceTargets =
    appearance.mode === "dark" ? [0.14, 0.36, 0.82] : [0.02, 0.1, 0.26];
  const macroColors = macroLuminanceTargets.map((target) =>
    colorAtLuminance(effectiveAccent, target),
  );

  return {
    ...vari8Theme({ mode: appearance.mode, accent: appearance.accent }),
    "--accent": effectiveAccent,
    "--accent-raw": accent,
    "--accent-ink": accentInk,
    "--accent-contrast": actionText,
    "--accent-soft": `color-mix(in srgb, ${accent} 14%, var(--canvas))`,
    "--accent-border": accentBoundary,
    "--accent-action": effectiveAccent,
    "--accent-action-text": actionText,
    "--accent-ring": ring,
    "--font-ui": font.family,
    "--font-tracking": appearance.font === "sans" ? "-0.012em" : "0em",
    "--chart-line": chartLine,
    "--chart-fill": chartLine,
    "--nutrition-macro-protein": macroColors[0],
    "--nutrition-macro-carbs": macroColors[1],
    "--nutrition-macro-fat": macroColors[2],
    "--ring": ring,
    "--eg-density-topbar-block": compact ? "42px" : "52px",
    "--eg-density-gap": compact ? "8px" : "10px",
    "--eg-density-pad-x": compact ? "12px" : "16px",
  } as CSSProperties;
}
