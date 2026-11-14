import { type CSSProperties, useEffect, useState } from "react";
import { themeVariables } from "@/lib/ethereal-appearance";
import { vari8Theme } from "@/lib/vari8-theme";
import { accentControlColors } from "./accent-contrast";
import type { CoachState } from "./model";

export { DEFAULT_ACCENT } from "./accent-contrast";

/** Live prefers-color-scheme. Starts dark so the server and first client
 * render agree; the real system value applies after hydration and stays
 * live on change. */
export function useSystemMode(): "light" | "dark" {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setDark(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return dark ? "dark" : "light";
}

/** The mode the coach workspace renders: the explicit preference, or the
 * system when the coach chose to match it. */
export function coachMode(
  preferences: CoachState["preferences"],
  systemMode: "light" | "dark",
): "light" | "dark" {
  return preferences.followSystemMode ? systemMode : preferences.mode;
}

/** The mode one athlete's app renders: their own choice, or their phone's
 * setting until they pick one. */
export function athleteMode(
  client: { appMode?: "light" | "dark" },
  systemMode: "light" | "dark",
): "light" | "dark" {
  return client.appMode ?? systemMode;
}

/** The logo variant for a rendered background: the dark-background logo is
 * the default; the light-background logo wins only in light mode. */
export function logoForMode(
  preferences: CoachState["preferences"],
  mode: "light" | "dark",
): { name: string; dataUrl: string } | undefined {
  return mode === "light"
    ? (preferences.brand?.logoLight ?? preferences.logo)
    : preferences.logo;
}

export function coachThemeStyle(
  preferences: CoachState["preferences"],
): CSSProperties {
  const theme = themeVariables({
    mode: preferences.mode,
    accent: preferences.accent,
    font: "sans",
  }) as Record<string, string>;
  const actionSurfaces = [
    theme["--v8-surface-navigation"],
    theme["--v8-surface"],
    theme["--v8-surface-raised"],
    theme["--v8-surface-inset"],
  ];
  const actions = accentControlColors(theme["--accent"], actionSurfaces);
  return {
    ...vari8Theme({
      mode: preferences.mode,
      accent: preferences.accent,
    }),
    "--cd-accent": theme["--accent"],
    "--cd-accent-text": theme["--accent-ink"],
    "--cd-accent-link": theme["--accent-ink"],
    "--cd-accent-contrast": theme["--accent-contrast"],
    "--cd-accent-ring": theme["--accent-ring"],
    "--cd-chart-line": theme["--chart-line"],
    "--nutrition-macro-protein": theme["--nutrition-macro-protein"],
    "--nutrition-macro-carbs": theme["--nutrition-macro-carbs"],
    "--nutrition-macro-fat": theme["--nutrition-macro-fat"],
    "--cd-action-bg": actions.background,
    "--cd-action-hover": actions.hoverBackground,
    "--cd-action-text": actions.foreground,
    "--accent-action": actions.background,
    "--accent-action-hover": actions.hoverBackground,
    "--accent-action-text": actions.foreground,
  } as CSSProperties;
}
