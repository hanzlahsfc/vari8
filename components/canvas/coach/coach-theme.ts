import type { CSSProperties } from "react";
import { themeVariables } from "@/lib/canvas/ethereal-appearance";
import { vari8Theme } from "@/lib/canvas/vari8-theme";
import { accentControlColors } from "./accent-contrast";
import type { CoachState } from "./model";

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
