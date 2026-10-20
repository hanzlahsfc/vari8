/**
 * PR-M0 (schema v2, D31) - optional top-level slots on the coaching
 * template definition/draft JSON. Mirrors the canvas template `Variant`
 * in frontend/src/components/coach/model.ts (dashboard via
 * frontend/src/components/coach/builder/schema.ts).
 */
import { z } from "zod";

import { dashboardDraft } from "./dashboard-draft";

export const templateModules = z.object({
  views: z.array(z.string()),
  habits: z.boolean(),
});
export type TemplateModules = z.infer<typeof templateModules>;

export const templateFieldOverride = z.object({
  parameterId: z.string(),
  unit: z.string(),
  options: z.array(z.string()).optional(),
});
export type TemplateFieldOverride = z.infer<typeof templateFieldOverride>;

export const templateRoadmapRow = z.object({
  source: z.string(),
  calculation: z.string(),
  comparison: z.boolean(),
});
export type TemplateRoadmapRow = z.infer<typeof templateRoadmapRow>;

export const templateDefinitionSlots = z.object({
  modules: templateModules.optional(),
  // DB CHECK bound: at most four summary parameters.
  summaryParameterIds: z.array(z.string()).max(4).optional(),
  nutritionMode: z.enum(["MEAL_PLAN", "IIFYM"]).optional(),
  fieldOverrides: z.array(templateFieldOverride).optional(),
  checkInFormId: z.string().optional(),
  dashboard: dashboardDraft.optional(),
  cycleTrackingEnabled: z.boolean().optional(),
  roadmap: z.array(templateRoadmapRow).optional(),
  phaseOptions: z.array(z.string()).optional(),
});
export type TemplateDefinitionSlots = z.infer<typeof templateDefinitionSlots>;
