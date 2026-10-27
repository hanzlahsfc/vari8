/**
 * Card w2-c2: the workspace appearance read model shared by the server read
 * (`app/(canvas)/me/appearance.ts`), the client-scoped GET
 * (`app/api/v1/workspaces/[workspaceId]/appearance/`) and the
 * AppearanceProvider merge. Pure module: no prisma, no react, no DOM, so it
 * loads on both sides of the server/client boundary. `Appearance` stays
 * re-exported from `lib/canvas/ethereal-appearance` for existing callers.
 */

export type AppearanceMode = "light" | "dark";
export type AppearanceFont =
  | "sans"
  | "serif"
  | "condensed"
  | "mono"
  | "rounded";
export type AppearanceDensity = "comfortable" | "compact";

export type Appearance = {
  mode: AppearanceMode;
  accent: string;
  font: AppearanceFont;
  density: AppearanceDensity;
  logoMediaId: string | null;
};

/**
 * The wire DTO: only fields that carried a valid value are present, so a
 * consumer can fall back per field (`"a field is unset" -> local store`).
 */
export type WorkspaceAppearance = {
  mode?: AppearanceMode;
  accent?: string;
  font?: AppearanceFont;
  density?: AppearanceDensity;
  logoMediaId?: string;
};

/** The shape a `prisma.workspace` select for the appearance columns yields. */
export type WorkspaceAppearanceRow = {
  appearanceMode: unknown;
  appearanceAccent: unknown;
  appearanceFont: unknown;
  appearanceDensity: unknown;
  logoMediaId: unknown;
};

const modes = new Set<AppearanceMode>(["light", "dark"]);
const fonts = new Set<AppearanceFont>([
  "sans",
  "serif",
  "condensed",
  "mono",
  "rounded",
]);
const densities = new Set<AppearanceDensity>(["comfortable", "compact"]);

export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  if (/^[\da-fA-F]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  return /^[\da-fA-F]{6}$/.test(raw) ? `#${raw}` : null;
}

export function toWorkspaceAppearance(
  row: WorkspaceAppearanceRow,
): WorkspaceAppearance {
  const result: WorkspaceAppearance = {};
  const mode = String(row.appearanceMode ?? "").toLowerCase();
  if (modes.has(mode as AppearanceMode)) result.mode = mode as AppearanceMode;
  const accent =
    typeof row.appearanceAccent === "string"
      ? normalizeHex(row.appearanceAccent)
      : null;
  if (accent) result.accent = accent;
  const font = String(row.appearanceFont ?? "").toLowerCase();
  if (fonts.has(font as AppearanceFont)) result.font = font as AppearanceFont;
  const density = String(row.appearanceDensity ?? "").toLowerCase();
  if (densities.has(density as AppearanceDensity))
    result.density = density as AppearanceDensity;
  if (typeof row.logoMediaId === "string" && row.logoMediaId.length > 0)
    result.logoMediaId = row.logoMediaId;
  return result;
}

/**
 * Per-field merge: a workspace field that is set wins, every field it leaves
 * unset keeps the local store value. `null`/`{}` (read failed or nothing
 * configured) returns the local appearance unchanged.
 */
export function mergeWorkspaceAppearance(
  local: Appearance,
  workspace?: WorkspaceAppearance | null,
): Appearance {
  if (!workspace) return local;
  return {
    mode: workspace.mode ?? local.mode,
    accent:
      (workspace.accent ? normalizeHex(workspace.accent) : null) ??
      local.accent,
    font: workspace.font ?? local.font,
    density: workspace.density ?? local.density,
    logoMediaId: workspace.logoMediaId ?? local.logoMediaId,
  };
}
