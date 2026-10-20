/**
 * PR-M9 (D31): adapter between the canvas `DashboardDraft` and the
 * persisted `client_dashboard_layout.config` (`DashboardConfig`).
 *
 * The canvas draft (`frontend/src/components/coach/builder/schema.ts`,
 * mirrored for the server in `lib/db-types/dashboard-draft.ts`) is the
 * document the studio builder edits and the template variant carries.
 * The persisted config is the bounded, allowlisted contract of
 * `config-schema.ts`. The semantic gaps the adapter bridges:
 *
 * - visibility: the canvas has no per-widget audience field; the
 *   persisted config requires one. Canvas widgets render on the client
 *   dashboard, so drafts convert with `visibility: "client"` unless the
 *   caller overrides; converting back strips the field (it is
 *   backend-only provenance, so a stored "staff" widget loses its
 *   marking on the way out — canvas drafts only ever carry client-
 *   visible widgets).
 * - labels / historyPeriod: optional on the canvas, preserved verbatim
 *   (absent stays absent) so a draft converts back unchanged.
 * - per-breakpoint rectangles and caps: enforced by the same
 *   `validateDashboardConfig` contract — breakpoint geometry,
 *   catalogue kinds, per-kind allowlists, the 24-widget cap, bounds.
 *
 * Both directions return `{ ok, reason }` — a draft that violates the
 * persisted contract fails conversion instead of degrading silently.
 */
import {
  validateDashboardConfig,
  type ValidationResult,
  type WidgetVisibility,
} from "./config-schema";
import type { DashboardDraft } from "../db-types/dashboard-draft";

export type DraftResult =
  { ok: true; draft: DashboardDraft } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Canvas draft -> persisted config. Injects `visibility` into every
 * widget's settings (default `"client"`: the canvas renders every
 * widget on the client's dashboard), then runs the bounded contract.
 */
export function draftToConfig(
  draft: unknown,
  visibility: WidgetVisibility = "client",
): ValidationResult {
  if (!isObj(draft) || !Array.isArray(draft.widgets))
    return { ok: false, reason: "draft_shape" };
  const candidate = {
    ...draft,
    widgets: draft.widgets.map((w) =>
      isObj(w) && isObj(w.settings)
        ? { ...w, settings: { ...w.settings, visibility } }
        : w,
    ),
  };
  return validateDashboardConfig(candidate);
}

/**
 * Persisted config -> canvas draft. Validates, then drops the
 * backend-only `visibility` key; every other setting survives verbatim.
 */
export function configToDraft(config: unknown): DraftResult {
  const validated = validateDashboardConfig(config);
  if (!validated.ok) return { ok: false, reason: validated.reason };
  const draft: DashboardDraft = {
    version: 1,
    name: validated.config.name,
    widgets: validated.config.widgets.map((w) => {
      const settings = { ...w.settings } as Partial<typeof w.settings>;
      delete settings.visibility;
      return {
        id: w.id,
        kind: w.kind,
        settings: settings as DashboardDraft["widgets"][number]["settings"],
      };
    }),
    layouts: validated.config.layouts,
    widths: validated.config.widths,
  };
  return { ok: true, draft };
}
