/**
 * PR-M0 (schema v2) - DashboardDraft JSON shape stored in
 * workspace.studio_dashboard_draft and template definition slots.
 * Mirrors the canvas `DashboardDraft` in
 * frontend/src/components/coach/builder/schema.ts (types from
 * ethereal/builder/model.ts + ethereal/builder/grid.ts).
 */
import { z } from "zod";

export const dashboardSizeName = z.enum([
  "Compact",
  "Regular",
  "Wide",
  "Tall",
  "Expanded",
]);
export type DashboardSizeName = z.infer<typeof dashboardSizeName>;

export const dashboardWidgetKind = z.enum([
  "BN21",
  "BN01",
  "BN08",
  "BN15",
  "BN19",
  "TL26",
  "TL28",
  "TL06",
  "TL11",
  "TL14",
  "TL21",
  "TL22",
  "CU01",
  "CU02",
  "CU03",
  "CU04",
  "CU06",
  "CU09",
  "CU10",
  "CU16",
]);
export type DashboardWidgetKind = z.infer<typeof dashboardWidgetKind>;

export const dashboardWidgetSettings = z.object({
  title: z.string(),
  source: z.string(),
  summary: z.string(),
  period: z.string(),
  target: z.boolean(),
  size: dashboardSizeName,
  fields: z.array(z.string()),
  option: z.string(),
  unit: z.string(),
  labels: z.record(z.string(), z.string()).optional(),
  historyPeriod: z.enum(["auto", "3m", "6m", "1y"]).optional(),
});
export type DashboardWidgetSettings = z.infer<typeof dashboardWidgetSettings>;

export const dashboardWidgetInstance = z.object({
  id: z.string(),
  kind: dashboardWidgetKind,
  settings: dashboardWidgetSettings,
});
export type DashboardWidgetInstance = z.infer<typeof dashboardWidgetInstance>;

export const dashboardBreakpoint = z.enum(["desktop", "tablet", "mobile"]);
export type DashboardBreakpoint = z.infer<typeof dashboardBreakpoint>;

export const dashboardRect = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int(),
  h: z.number().int(),
  size: dashboardSizeName,
});
export type DashboardRect = z.infer<typeof dashboardRect>;

export const dashboardLayout = z.record(z.string(), dashboardRect);
export type DashboardLayout = z.infer<typeof dashboardLayout>;

export const dashboardDraft = z.object({
  version: z.literal(1),
  name: z.string().max(80),
  widgets: z.array(dashboardWidgetInstance),
  layouts: z.partialRecord(dashboardBreakpoint, dashboardLayout),
  widths: z.partialRecord(dashboardBreakpoint, z.number()),
});
export type DashboardDraft = z.infer<typeof dashboardDraft>;
