export type Vari8Mode = "light" | "dark";

type SurfaceRole =
  | "canvas"
  | "surface-navigation"
  | "surface"
  | "surface-subtle"
  | "surface-raised"
  | "surface-inset"
  | "surface-interactive"
  | "surface-selected"
  | "surface-featured"
  | "surface-overlay"
  | "field"
  | "accent-soft"
  | "accent-spotlight";

type Vari8Role =
  | SurfaceRole
  | "text"
  | "text-secondary"
  | "text-tertiary"
  | "text-muted"
  | "border"
  | "border-control"
  | "action"
  | "action-border"
  | "action-hover"
  | "action-active"
  | "on-action"
  | "accent"
  | "accent-raw"
  | "accent-text"
  | "accent-soft"
  | "on-accent-soft"
  | "accent-primary"
  | "accent-hover"
  | "accent-pressed"
  | "accent-subtle"
  | "accent-surface"
  | "accent-border"
  | "accent-highlight"
  | "accent-glow"
  | "accent-gradient-start"
  | "accent-gradient-end"
  | "accent-chart-line"
  | "accent-chart-fill"
  | "accent-focus"
  | "on-accent"
  | "focus"
  | "chart"
  | "positive"
  | "positive-text"
  | "warning"
  | "warning-text"
  | "danger"
  | "danger-text"
  | "on-danger"
  | "info"
  | "info-text";

export type Vari8Theme = Record<`--v8-${Vari8Role}`, string>;

export const VARI8_SURFACES = [
  "canvas",
  "surface-navigation",
  "surface",
  "surface-subtle",
  "surface-raised",
  "surface-inset",
  "surface-interactive",
  "surface-selected",
  "surface-featured",
  "surface-overlay",
  "field",
  "accent-soft",
  "accent-spotlight",
] as const satisfies readonly SurfaceRole[];

const FALLBACK_ACCENT = "#EB91B8";
const HEX_SHORT = /^[\da-f]{3}$/i;
const HEX_FULL = /^[\da-f]{6}$/i;

export function normalizeAccent(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  if (HEX_SHORT.test(raw))
    return `#${[...raw].map((digit) => digit.repeat(2)).join("")}`.toUpperCase();
  return HEX_FULL.test(raw) ? `#${raw}`.toUpperCase() : null;
}

function channels(hex: string): [number, number, number] {
  const normalized = normalizeAccent(hex) ?? FALLBACK_ACCENT;
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mixHex(first: string, second: string, amount: number): string {
  const a = channels(first);
  const b = channels(second);
  return `#${a
    .map((channel, index) =>
      Math.round(channel + (b[index] - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function contrastSafe(
  color: string,
  backgrounds: readonly string[],
  targetRatio: number,
): string {
  const passes = (candidate: string) =>
    backgrounds.every(
      (background) => contrastRatio(candidate, background) >= targetRatio,
    );
  if (passes(color)) return color;

  const candidates = ["#000000", "#FFFFFF"].flatMap((destination) => {
    for (let step = 1; step <= 512; step += 1) {
      const amount = step / 512;
      const candidate = mixHex(color, destination, amount);
      if (passes(candidate)) return [{ color: candidate, amount }];
    }
    return [];
  });

  const nearestDirectional = candidates.sort((a, b) => a.amount - b.amount)[0];
  if (nearestDirectional) return nearestDirectional.color;

  const source = channels(color);
  const neutralCandidates = Array.from({ length: 256 }, (_, value) => {
    const channel = value.toString(16).padStart(2, "0");
    return `#${channel}${channel}${channel}`.toUpperCase();
  })
    .filter(passes)
    .map((candidate) => ({
      color: candidate,
      distance: channels(candidate).reduce(
        (sum, channel, index) => sum + (channel - source[index]) ** 2,
        0,
      ),
    }))
    .sort((a, b) => a.distance - b.distance);

  return neutralCandidates[0]?.color ?? color;
}

function contrastSafeChart(
  color: string,
  surfaces: readonly string[],
  lightingSurfaces: readonly string[],
): string {
  const passes = (candidate: string) =>
    lightingSurfaces.every(
      (surface) => contrastRatio(candidate, surface) >= 3,
    ) &&
    surfaces.every(
      (surface) =>
        contrastRatio(candidate, mixHex(surface, candidate, 0.2)) >= 3,
    );
  if (passes(color)) return color;

  const candidates = ["#000000", "#FFFFFF"].flatMap((destination) => {
    for (let step = 1; step <= 256; step += 1) {
      const amount = step / 256;
      const candidate = mixHex(color, destination, amount);
      if (passes(candidate)) return [{ color: candidate, amount }];
    }
    return [];
  });
  return candidates.sort((a, b) => a.amount - b.amount)[0]?.color ?? color;
}

function textOnSurfaces(surfaces: readonly string[]): string {
  return ["#000000", "#FFFFFF"].sort((first, second) => {
    const firstMinimum = Math.min(
      ...surfaces.map((surface) => contrastRatio(first, surface)),
    );
    const secondMinimum = Math.min(
      ...surfaces.map((surface) => contrastRatio(second, surface)),
    );
    return secondMinimum - firstMinimum;
  })[0];
}

function actionForeground(color: string): string {
  // Prefer white for deep chromatic accents near the black/white crossover;
  // the fill can move slightly darker to give it a comfortable text margin.
  return contrastRatio(color, "#FFFFFF") >= 4.3 ? "#FFFFFF" : "#000000";
}

function readableActionFill(color: string): {
  fill: string;
  foreground: string;
} {
  const foreground = actionForeground(color);
  // Keep extra contrast margin for colors interpolated between the primary
  // gradient stops; checks also verify each rendered stop against its label.
  const targetRatio = foreground === "#FFFFFF" ? 6.4 : 5.2;
  if (contrastRatio(color, foreground) >= targetRatio)
    return { fill: color, foreground };

  // Move the fill toward the opposite pole only when the raw accent needs more
  // label contrast. Surface boundaries are handled independently by action-border.
  const destination = foreground === "#000000" ? "#FFFFFF" : "#000000";
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (
      contrastRatio(mixHex(color, destination, middle), foreground) >=
      targetRatio
    )
      high = middle;
    else low = middle;
  }
  return { fill: mixHex(color, destination, high), foreground };
}

function darken(hex: string, amount: number): string {
  return `#${channels(hex)
    .map((channel) =>
      Math.round(channel * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function makeSurfaceRoles(
  mode: Vari8Mode,
): Record<Exclude<SurfaceRole, "accent-soft" | "accent-spotlight">, string> {
  return mode === "dark"
    ? {
        canvas: "#080808",
        "surface-navigation": "#171717",
        surface: "#101010",
        "surface-subtle": "#171717",
        "surface-raised": "#212121",
        "surface-inset": "#0C0C0C",
        "surface-interactive": "#1D1D1D",
        "surface-selected": "#282828",
        "surface-featured": "#1B1B1B",
        "surface-overlay": "#242424",
        field: "#0C0C0C",
      }
    : {
        canvas: "#F5F5F5",
        "surface-navigation": "#FAFAFA",
        surface: "#FFFFFF",
        "surface-subtle": "#F0F0F0",
        "surface-raised": "#FFFFFF",
        "surface-inset": "#FAFAFA",
        "surface-interactive": "#F6F6F6",
        "surface-selected": "#EAEAEA",
        "surface-featured": "#F1F1F1",
        "surface-overlay": "#FFFFFF",
        field: "#FAFAFA",
      };
}

function makeTextRoles(mode: Vari8Mode, surfaces: readonly string[]) {
  const base =
    mode === "dark"
      ? {
          text: "#F1F1F1",
          secondary: "#B2B2B2",
          tertiary: "#9A9A9A",
        }
      : {
          text: "#212121",
          secondary: "#626262",
          tertiary: "#707070",
        };
  return {
    text: contrastSafe(base.text, surfaces, 4.5),
    secondary: contrastSafe(base.secondary, surfaces, 4.5),
    tertiary: contrastSafe(base.tertiary, surfaces, 4.5),
  };
}

function statusColor(
  mode: Vari8Mode,
  tone: "positive" | "warning" | "danger" | "info",
  surfaces: readonly string[],
): string {
  const palette =
    mode === "dark"
      ? {
          positive: "#8FD3AE",
          warning: "#E9BF78",
          danger: "#F0A09D",
          info: "#AABDF5",
        }
      : {
          positive: "#237247",
          warning: "#865A12",
          danger: "#A43C3D",
          info: "#385EAB",
        };
  return contrastSafe(palette[tone], surfaces, 4.5);
}

function modeAccentSoft(mode: Vari8Mode, accent: string): string {
  const base = mode === "dark" ? "#171717" : "#F0F0F0";
  return mixHex(base, accent, 0.13);
}

function modeAccentSpotlight(
  mode: Vari8Mode,
  accent: string,
  surface: string,
): string {
  return mixHex(surface, accent, mode === "dark" ? 0.28 : 0.1);
}

export function vari8Theme({
  mode,
  accent,
}: {
  mode: Vari8Mode;
  accent: string;
}): Vari8Theme {
  const rawAccent = normalizeAccent(accent) ?? FALLBACK_ACCENT;
  const surfaceRoles = makeSurfaceRoles(mode);
  const accentSoft = modeAccentSoft(mode, rawAccent);
  const accentSpotlight = modeAccentSpotlight(
    mode,
    rawAccent,
    surfaceRoles["surface-subtle"],
  );
  const accentGlow = mixHex(
    surfaceRoles["surface-subtle"],
    rawAccent,
    mode === "dark" ? 0.2 : 0.08,
  );
  const surfaces = VARI8_SURFACES.map((role) =>
    role === "accent-soft"
      ? accentSoft
      : role === "accent-spotlight"
        ? accentSpotlight
        : surfaceRoles[role],
  );
  const readableSurfaces = [...surfaces, accentGlow];
  const text = makeTextRoles(mode, readableSurfaces);
  const { fill: action, foreground: onAction } = readableActionFill(rawAccent);
  const actionBorder = contrastSafe(rawAccent, readableSurfaces, 3);
  const actionContrastPole = onAction === "#000000" ? "#FFFFFF" : "#000000";
  const actionHover = mixHex(action, actionContrastPole, 0.04);
  const actionActive = mixHex(action, actionContrastPole, 0.08);
  const accentText = contrastSafe(rawAccent, readableSurfaces, 4.5);
  const focus = contrastSafe(rawAccent, readableSurfaces, 3);
  // Decorative lighting stays close to neutral so saturated preferences do
  // not turn every highlight into a second accent surface.
  const accentHighlight = mixHex("#FFFFFF", rawAccent, 0.16);
  const chartFill = mixHex(
    mode === "dark" ? surfaceRoles["surface-raised"] : surfaceRoles.surface,
    rawAccent,
    0.12,
  );
  const chart = contrastSafeChart(rawAccent, surfaces, [accentGlow, chartFill]);
  const statusSurfaces = readableSurfaces;
  const border = mode === "dark" ? "#2A2A2A" : "#DDDDDD";
  const borderControl = contrastSafe(
    mode === "dark" ? "#777777" : "#777777",
    surfaces,
    3,
  );
  const positive = statusColor(mode, "positive", statusSurfaces);
  const warning = statusColor(mode, "warning", statusSurfaces);
  const danger = statusColor(mode, "danger", statusSurfaces);
  const onDanger = textOnSurfaces([danger, darken(danger, 0.96)]);
  const info = statusColor(mode, "info", statusSurfaces);

  return {
    "--v8-canvas": surfaceRoles.canvas,
    "--v8-surface": surfaceRoles.surface,
    "--v8-surface-subtle": surfaceRoles["surface-subtle"],
    "--v8-surface-raised": surfaceRoles["surface-raised"],
    "--v8-field": surfaceRoles.field,
    "--v8-surface-navigation": surfaceRoles["surface-navigation"],
    "--v8-surface-inset": surfaceRoles["surface-inset"],
    "--v8-surface-interactive": surfaceRoles["surface-interactive"],
    "--v8-surface-selected": surfaceRoles["surface-selected"],
    "--v8-surface-featured": surfaceRoles["surface-featured"],
    "--v8-surface-overlay": surfaceRoles["surface-overlay"],
    "--v8-text": text.text,
    "--v8-text-secondary": text.secondary,
    "--v8-text-tertiary": text.tertiary,
    "--v8-text-muted": text.secondary,
    "--v8-border": border,
    "--v8-border-control": borderControl,
    "--v8-action": action,
    "--v8-action-border": actionBorder,
    "--v8-action-hover": actionHover,
    "--v8-action-active": actionActive,
    "--v8-on-action": onAction,
    "--v8-accent-primary": action,
    "--v8-accent-hover": actionHover,
    "--v8-accent-pressed": actionActive,
    "--v8-accent-subtle": accentSoft,
    "--v8-accent-surface": accentGlow,
    "--v8-accent-border": actionBorder,
    "--v8-accent-highlight": accentHighlight,
    "--v8-accent-glow": accentGlow,
    "--v8-accent-gradient-start": action,
    "--v8-accent-gradient-end": actionHover,
    "--v8-accent-chart-line": chart,
    "--v8-accent-chart-fill": chartFill,
    "--v8-accent-focus": focus,
    "--v8-on-accent": onAction,
    "--v8-accent": rawAccent,
    "--v8-accent-raw": rawAccent,
    "--v8-accent-text": accentText,
    "--v8-accent-soft": accentSoft,
    "--v8-accent-spotlight": accentSpotlight,
    "--v8-on-accent-soft": accentText,
    "--v8-focus": focus,
    "--v8-chart": chart,
    "--v8-positive": positive,
    "--v8-positive-text": positive,
    "--v8-warning": warning,
    "--v8-warning-text": warning,
    "--v8-danger": danger,
    "--v8-danger-text": danger,
    "--v8-on-danger": onDanger,
    "--v8-info": info,
    "--v8-info-text": info,
  };
}
