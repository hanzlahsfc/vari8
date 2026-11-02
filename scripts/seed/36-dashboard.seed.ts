import { draftToConfig } from "../../lib/dashboard/adapter";
import {
  canonicalizeDashboardConfig,
  validateDashboardConfig,
} from "../../lib/dashboard/config-schema";
import {
  dashboardDraft,
  type DashboardDraft,
} from "../../lib/db-types/dashboard-draft";
import type { SeedContext } from "./index";

/**
 * PR-M9 (D31) — canvas demo dashboard layouts.
 *
 * Two literals copied verbatim from the canvas demo state:
 *
 * - CANVAS_STUDIO_DASHBOARD_DRAFT: the Ethereal studio's initial draft
 *   (`frontend/src/components/ethereal/builder/dashboard-builder.tsx:68-75`,
 *   `emptyDraft()` — the state the studio builder renders before any edit).
 *   Stored on `workspace.studio_dashboard_draft` in the DashboardDraft shape
 *   (PR-M0 `lib/db-types/dashboard-draft.ts`).
 *
 * - CANVAS_CLIENT_DASHBOARD_DRAFT: `createDashboardDraft()`
 *   (`frontend/src/components/coach/builder/schema.ts:124-131`), the
 *   dashboard every demo template variant carries (`model.ts:874
 *   dashboard: createDashboardDraft()`) and every demo client renders
 *   (`coach-dashboard.tsx:252 variant.dashboard ?? createDashboardDraft()`).
 *   Rect values were produced by running the canvas `arrange` on
 *   2026-10-21 (desktop, width 1040). Stored per client as a converted
 *   DashboardConfig in `client_dashboard_layout.config` — the "copied into
 *   the client's setup on assignment" snapshot of D31.
 *
 * Every write is an idempotent upsert so `npm run seed:dev` is safe to
 * re-run; the conversion runs through the real adapter so a drift between
 * the canvas shape and the persisted contract fails loudly here.
 */

const WORKSPACE_SLUG = "canvas-demo";

export const CANVAS_STUDIO_DASHBOARD_DRAFT: DashboardDraft = {
  version: 1,
  name: "Maya’s dashboard",
  widgets: [],
  layouts: { desktop: {} },
  widths: { desktop: 1040 },
};

export const CANVAS_CLIENT_DASHBOARD_DRAFT: DashboardDraft = {
  version: 1,
  name: "Daily overview",
  widgets: [
    {
      id: "seed-BN01",
      kind: "BN01",
      settings: {
        title: "Bodyweight trend",
        source: "bodyweight",
        summary: "daily",
        period: "30d",
        target: false,
        size: "Wide",
        fields: [],
        option: "default",
        unit: "kg",
      },
    },
    {
      id: "seed-BN15",
      kind: "BN15",
      settings: {
        title: "Nutrition today",
        source: "nutrition:active",
        summary: "daily",
        period: "today",
        target: true,
        size: "Wide",
        fields: ["protein", "carbs", "fat"],
        option: "circles",
        unit: "g",
      },
    },
    {
      id: "seed-TL26",
      kind: "TL26",
      settings: {
        title: "Your training",
        source: "workouts",
        summary: "current",
        period: "week",
        target: false,
        size: "Regular",
        fields: ["exercise", "sets", "reps"],
        option: "current",
        unit: "",
      },
    },
    {
      id: "seed-TL11",
      kind: "TL11",
      settings: {
        title: "Sleep duration",
        source: "sleep",
        summary: "average",
        period: "7d",
        target: false,
        size: "Regular",
        fields: [],
        option: "hours",
        unit: "h",
      },
    },
  ],
  layouts: {
    desktop: {
      "seed-BN01": { w: 6, h: 3, size: "Wide", x: 0, y: 0 },
      "seed-BN15": { w: 6, h: 3, size: "Wide", x: 6, y: 0 },
      "seed-TL26": { w: 4, h: 3, size: "Regular", x: 0, y: 3 },
      "seed-TL11": { w: 4, h: 3, size: "Regular", x: 4, y: 3 },
    },
  },
  widths: { desktop: 1040 },
};

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;

  const studioParsed = dashboardDraft.safeParse(CANVAS_STUDIO_DASHBOARD_DRAFT);
  if (!studioParsed.success)
    throw new Error(
      `studio demo draft no longer matches the DashboardDraft shape: ${studioParsed.error.message}`,
    );

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true, studioDashboardDraft: true },
  });
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { studioDashboardDraft: studioParsed.data },
  });

  const converted = draftToConfig(CANVAS_CLIENT_DASHBOARD_DRAFT);
  if (!converted.ok)
    throw new Error(
      `client demo draft fails the persisted config contract: ${converted.reason}`,
    );
  const canonical = canonicalizeDashboardConfig(converted.config);
  const configJson = JSON.parse(canonical);

  const clients = await prisma.clientProfile.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true },
  });
  let written = 0;
  for (const client of clients) {
    const existing = await prisma.clientDashboardLayout.findUnique({
      where: {
        workspaceId_clientProfileId: {
          workspaceId: workspace.id,
          clientProfileId: client.id,
        },
      },
      select: { config: true },
    });
    const current = existing
      ? (() => {
          const validated = validateDashboardConfig(existing.config);
          return validated.ok
            ? canonicalizeDashboardConfig(validated.config)
            : null;
        })()
      : null;
    if (current === canonical) continue;
    await prisma.clientDashboardLayout.upsert({
      where: {
        workspaceId_clientProfileId: {
          workspaceId: workspace.id,
          clientProfileId: client.id,
        },
      },
      update: { config: configJson },
      create: {
        workspaceId: workspace.id,
        clientProfileId: client.id,
        config: configJson,
      },
    });
    written += 1;
  }
  console.log(
    `[seed] dashboard: studio draft + ${clients.length} client layout(s) ` +
      `(${written} written, ${clients.length - written} unchanged)`,
  );
}
