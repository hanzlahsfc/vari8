import type { SeedContext } from "./index";

/**
 * PR-M2 (D25) — canvas demo appearance and workspace preferences.
 *
 * Writes the canvas demo `preferences` block onto the `canvas-demo`
 * workspace created by `00-workspace.seed.ts`, so the wiring PR's parity
 * run (D32) compares like with like. Every value is copied from the canvas
 * demo state:
 *
 *   - mode/accent/availability/notifications/priorityNotifications:
 *     `frontend/src/components/coach/model.ts` `seedState().preferences`
 *     (mode "dark", accent "#EB91B8", availability "Weekdays · 09:00–18:00",
 *     both toggles true).
 *   - font "sans": `frontend/src/lib/ethereal-appearance.tsx`
 *     `defaultAppearance.font`.
 *   - density "comfortable": the canvas's only density value
 *     (`appearance-views.tsx` `PreviewDensity` default).
 *   - logo: the canvas demo state carries none (`preferences.logo` unset).
 *   - sidebar: the demo state leaves `sidebarCollapsed` unset; the column
 *     default `false` stands.
 *
 * Idempotent update on the workspace row. Per-user client preferences are
 * not seeded: the client settings screen is blocked on design (O3).
 */

const WORKSPACE_SLUG = "canvas-demo";

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  await prisma.workspace.update({
    where: { slug: WORKSPACE_SLUG },
    data: {
      appearanceMode: "DARK",
      appearanceAccent: "#EB91B8",
      appearanceFont: "SANS",
      appearanceDensity: "COMFORTABLE",
      logoMediaId: null,
      availabilityText: "Weekdays · 09:00–18:00",
      notificationsEnabled: true,
      priorityNotificationsEnabled: true,
    },
  });
  console.log(`[seed] workspace ${WORKSPACE_SLUG}: canvas demo appearance`);
}
