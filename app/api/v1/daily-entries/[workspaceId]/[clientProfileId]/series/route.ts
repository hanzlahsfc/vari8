import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readDailyEntryNumericSeriesFromApi } from "@/lib/daily-entry/boundary";

/**
 * GET /api/v1/daily-entries/:workspaceId/:clientProfileId/series —
 * PR-SV2 typed per-parameter numeric series for the tracker Week and
 * Trends views. `clientData.read` grants staff the workspace scope and the
 * client its own scope; the service enforces both. `from`/`to` are
 * inclusive declared dates; only the current revision's numeric values
 * appear, missing days stay absent.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1).max(128),
  clientProfileId: z.string().min(1).max(128),
});

const querySchema = z.object({
  parameterId: z.string().min(1).max(128),
  from: z.string().min(1).max(16),
  to: z.string().min(1).max(16),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: ({ viewer, workspace, params, query }) =>
    readDailyEntryNumericSeriesFromApi(viewer, workspace, {
      clientProfileId: params.clientProfileId,
      parameterId: query!.parameterId,
      from: query!.from,
      to: query!.to,
    }),
});
